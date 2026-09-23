"use strict";

const crypto = require("crypto");

const ALLOWED_TABS = new Set([
  "controlTab",
  "tradingTab",
  "cryptoTab",
  "nasdaqTab",
  "terminalTab",
]);

const DEFAULT_DEDUPE_WINDOW_MS = 10 * 60 * 1000;
const MAX_ENDPOINT_LENGTH = 4096;
const MAX_KEY_LENGTH = 512;

function hash(value) {
  return crypto
    .createHash("sha256")
    .update(String(value || ""))
    .digest("hex");
}

function notificationRouteForMessage(message) {
  const normalized = String(message || "").toLocaleUpperCase("tr-TR");

  if (/NASDAQ|ALPACA/.test(normalized)) return "nasdaqTab";
  if (/KRİPTO|KRIPTO|BINANCE|\bBTC\b|\bETH\b|USDT/.test(normalized)) return "cryptoTab";
  if (/BIST|XU100|KÂĞIT|KAĞIT|PAPER|POZİSYON|POZISYON|\bTP[12]?\b|\bSL\b|STOP|TARAMA/.test(normalized)) {
    return "tradingTab";
  }

  return "controlTab";
}

function notificationCategoryForRoute(route) {
  return {
    nasdaqTab: "nasdaq",
    cryptoTab: "crypto",
    tradingTab: "bist",
    terminalTab: "terminal",
    controlTab: "system",
  }[route] || "system";
}

function normalizeRoute(route, message) {
  return ALLOWED_TABS.has(route)
    ? route
    : notificationRouteForMessage(message);
}

function normalizePushSubscription(value) {
  const endpoint = String(value?.endpoint || "").trim();
  const p256dh = String(value?.keys?.p256dh || "").trim();
  const auth = String(value?.keys?.auth || "").trim();

  if (!endpoint || endpoint.length > MAX_ENDPOINT_LENGTH) {
    throw new Error("Geçersiz Web Push endpoint'i.");
  }

  let parsed;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new Error("Geçersiz Web Push endpoint'i.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Web Push endpoint'i HTTPS olmalıdır.");
  }

  if (
    !p256dh ||
    !auth ||
    p256dh.length > MAX_KEY_LENGTH ||
    auth.length > MAX_KEY_LENGTH ||
    !/^[A-Za-z0-9_-]+$/.test(p256dh) ||
    !/^[A-Za-z0-9_-]+$/.test(auth)
  ) {
    throw new Error("Geçersiz Web Push anahtarı.");
  }

  return {
    endpoint,
    expirationTime: Number.isFinite(value?.expirationTime)
      ? Number(value.expirationTime)
      : null,
    keys: { p256dh, auth },
  };
}

function eventKeyForNotification(message, {
  route,
  eventId,
  now = Date.now(),
  dedupeWindowMs = DEFAULT_DEDUPE_WINDOW_MS,
} = {}) {
  if (eventId) return hash(`explicit\0${eventId}`);

  const windowSize = Math.max(60 * 1000, Number(dedupeWindowMs) || DEFAULT_DEDUPE_WINDOW_MS);
  const bucket = Math.floor(Number(now) / windowSize);
  return hash(`${normalizeRoute(route, message)}\0${String(message || "")}\0${bucket}`);
}

function createWebPushService(config = {}, dependencies = {}) {
  const logger = dependencies.logger || console;
  const now = dependencies.now || (() => Date.now());

  const settings = {
    databaseUrl: String(config.databaseUrl || "").trim(),
    vapidPublicKey: String(config.vapidPublicKey || "").trim(),
    vapidPrivateKey: String(config.vapidPrivateKey || "").trim(),
    vapidSubject: String(config.vapidSubject || "").trim(),
    databaseSsl: Boolean(config.databaseSsl),
    dedupeWindowMs: Math.max(
      60 * 1000,
      Number(config.dedupeWindowMs) || DEFAULT_DEDUPE_WINDOW_MS
    ),
  };

  const configured = Boolean(
    settings.databaseUrl &&
    settings.vapidPublicKey &&
    settings.vapidPrivateKey &&
    /^(mailto:|https:\/\/)/i.test(settings.vapidSubject)
  );

  const webPushClient = dependencies.webPush || (configured ? require("web-push") : null);
  const PoolClass = dependencies.Pool || (configured ? require("pg").Pool : null);

  let pool = null;
  let initializePromise = null;

  if (configured) {
    webPushClient.setVapidDetails(
      settings.vapidSubject,
      settings.vapidPublicKey,
      settings.vapidPrivateKey
    );

    pool = new PoolClass({
      connectionString: settings.databaseUrl,
      ...(settings.databaseSsl
        ? { ssl: { rejectUnauthorized: false } }
        : {}),
    });
  }

  async function initialize() {
    if (!configured) return false;
    if (initializePromise) return initializePromise;

    initializePromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS web_push_subscriptions (
          endpoint_hash CHAR(64) PRIMARY KEY,
          endpoint TEXT NOT NULL,
          p256dh TEXT NOT NULL,
          auth TEXT NOT NULL,
          expiration_time BIGINT,
          session_hash CHAR(64) NOT NULL,
          user_agent TEXT,
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS web_push_events (
          event_key CHAR(64) PRIMARY KEY,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS web_push_events_expires_at_idx
        ON web_push_events (expires_at)
      `);

      return true;
    })().catch(error => {
      initializePromise = null;
      throw error;
    });

    return initializePromise;
  }

  function publicConfig() {
    return {
      configured,
      publicKey: configured ? settings.vapidPublicKey : null,
    };
  }

  async function subscribe(subscription, { sessionId, userAgent } = {}) {
    if (!configured) throw new Error("Web Push sunucuda yapılandırılmadı.");
    if (!sessionId) throw new Error("Geçerli oturum gerekli.");

    const normalized = normalizePushSubscription(subscription);
    const endpointHash = hash(normalized.endpoint);
    await initialize();

    await pool.query(
      `
        INSERT INTO web_push_subscriptions (
          endpoint_hash, endpoint, p256dh, auth, expiration_time,
          session_hash, user_agent, enabled, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, NOW())
        ON CONFLICT (endpoint_hash) DO UPDATE SET
          endpoint = EXCLUDED.endpoint,
          p256dh = EXCLUDED.p256dh,
          auth = EXCLUDED.auth,
          expiration_time = EXCLUDED.expiration_time,
          session_hash = EXCLUDED.session_hash,
          user_agent = EXCLUDED.user_agent,
          enabled = TRUE,
          updated_at = NOW()
      `,
      [
        endpointHash,
        normalized.endpoint,
        normalized.keys.p256dh,
        normalized.keys.auth,
        normalized.expirationTime,
        hash(sessionId),
        String(userAgent || "").slice(0, 500),
      ]
    );

    return { enabled: true, endpointHash };
  }

  async function unsubscribe(endpoint) {
    if (!configured) throw new Error("Web Push sunucuda yapılandırılmadı.");

    const value = String(endpoint || "").trim();
    if (!value || value.length > MAX_ENDPOINT_LENGTH) {
      throw new Error("Geçersiz Web Push endpoint'i.");
    }

    await initialize();
    const result = await pool.query(
      "DELETE FROM web_push_subscriptions WHERE endpoint_hash = $1",
      [hash(value)]
    );
    return { enabled: false, removed: result.rowCount > 0 };
  }

  async function send(message, options = {}) {
    if (!configured || !message) {
      return { configured, delivered: 0, failed: 0, deduplicated: false };
    }

    await initialize();

    const route = normalizeRoute(options.route, message);
    const category = notificationCategoryForRoute(route);
    const eventKey = eventKeyForNotification(message, {
      route,
      eventId: options.eventId,
      now: now(),
      dedupeWindowMs: settings.dedupeWindowMs,
    });

    await pool.query("DELETE FROM web_push_events WHERE expires_at <= NOW()");
    const reservation = await pool.query(
      `
        INSERT INTO web_push_events (event_key, expires_at)
        VALUES ($1, NOW() + ($2 * INTERVAL '1 millisecond'))
        ON CONFLICT (event_key) DO NOTHING
        RETURNING event_key
      `,
      [eventKey, settings.dedupeWindowMs]
    );

    if (!reservation.rowCount) {
      return { configured: true, delivered: 0, failed: 0, deduplicated: true };
    }

    const subscriptions = await pool.query(`
      SELECT endpoint_hash, endpoint, p256dh, auth, expiration_time
      FROM web_push_subscriptions
      WHERE enabled = TRUE
      ORDER BY updated_at DESC
    `);

    const title = String(options.title || "BorsaCI").slice(0, 80);
    const body = String(message).replace(/\s+/g, " ").trim().slice(0, 240);
    const targetUrl = `/?pushTab=${encodeURIComponent(route)}&pushEvent=${encodeURIComponent(eventKey)}`;
    const payload = JSON.stringify({
      title,
      body,
      icon: "/borsaci-crescent-star.png?v=2",
      badge: "/borsaci-crescent-star.png?v=2",
      tag: `borsaci-${category}-${eventKey}`,
      renotify: false,
      data: {
        url: targetUrl,
        route,
        eventId: eventKey,
      },
    });

    let delivered = 0;
    let failed = 0;

    await Promise.all(subscriptions.rows.map(async row => {
      const subscription = {
        endpoint: row.endpoint,
        expirationTime: row.expiration_time === null
          ? null
          : Number(row.expiration_time),
        keys: { p256dh: row.p256dh, auth: row.auth },
      };

      try {
        await webPushClient.sendNotification(subscription, payload, {
          TTL: 5 * 60,
          urgency: "high",
          topic: `borsaci-${category}`.slice(0, 32),
        });
        delivered += 1;
      } catch (error) {
        failed += 1;
        const statusCode = Number(error?.statusCode || error?.status || 0);
        if (statusCode === 404 || statusCode === 410) {
          await pool.query(
            "DELETE FROM web_push_subscriptions WHERE endpoint_hash = $1",
            [row.endpoint_hash]
          );
        } else {
          logger.error("WEB PUSH DELIVERY ERROR:", String(error?.message || error).slice(0, 300));
        }
      }
    }));

    return {
      configured: true,
      delivered,
      failed,
      deduplicated: false,
      eventKey,
      route,
    };
  }

  async function close() {
    if (pool && typeof pool.end === "function") await pool.end();
  }

  return {
    configured: () => configured,
    publicConfig,
    initialize,
    subscribe,
    unsubscribe,
    send,
    close,
  };
}

module.exports = {
  ALLOWED_TABS,
  DEFAULT_DEDUPE_WINDOW_MS,
  createWebPushService,
  eventKeyForNotification,
  normalizePushSubscription,
  notificationCategoryForRoute,
  notificationRouteForMessage,
};

