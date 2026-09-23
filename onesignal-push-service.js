"use strict";

const {
  ALLOWED_TABS,
  eventKeyForNotification,
  notificationCategoryForRoute,
  notificationRouteForMessage,
} = require("./web-push-service");

const DEFAULT_API_URL = "https://api.onesignal.com/notifications";
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_DEDUPE_WINDOW_MS = 10 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeBaseUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:") return "";
    return url.origin;
  } catch {
    return "";
  }
}

function normalizeRoute(route, message) {
  return ALLOWED_TABS.has(route)
    ? route
    : notificationRouteForMessage(message);
}

function uuidFromEventKey(eventKey) {
  const bytes = Buffer.from(String(eventKey || "").slice(0, 32), "hex");
  if (bytes.length !== 16) throw new Error("Geçersiz OneSignal olay anahtarı.");

  // RFC 9562 UUIDv8: deterministic application-specific idempotency key.
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Telegram ve uygulama içi event metinleri aynen kalır. OneSignal'a giderken
// ise bazı kaynakların ürettiği literal "\\n" dizisini gerçek satır sonuna
// dönüştürürüz. iOS bildirim önizlemesi bu gerçek yeni satırları okunaklı
// biçimde gösterir; satır içindeki fazla boşluklar da taşmayı azaltır.
function normalizeOneSignalText(value, maxLength) {
  return String(value || "")
    .replace(/\\r\\n|\\n|\\r/g, "\n")
    .replace(/\r\n?|\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t\f\v ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, maxLength);
}

function createOneSignalPushService(config = {}, dependencies = {}) {
  const fetchImpl = dependencies.fetch || global.fetch;
  const now = dependencies.now || (() => Date.now());
  const logger = dependencies.logger || console;

  const settings = {
    appId: String(config.appId || "").trim(),
    apiKey: String(config.apiKey || "").trim(),
    allowedSubscriptionId: String(config.allowedSubscriptionId || "").trim(),
    publicBaseUrl: normalizeBaseUrl(config.publicBaseUrl),
    apiUrl: String(config.apiUrl || DEFAULT_API_URL).trim(),
    timeoutMs: Math.max(1000, Number(config.timeoutMs) || DEFAULT_TIMEOUT_MS),
    dedupeWindowMs: Math.max(
      60 * 1000,
      Number(config.dedupeWindowMs) || DEFAULT_DEDUPE_WINDOW_MS
    ),
  };

  const sdkConfigured = UUID_PATTERN.test(settings.appId);
  const configured = Boolean(
    sdkConfigured &&
    settings.apiKey &&
    UUID_PATTERN.test(settings.allowedSubscriptionId) &&
    settings.publicBaseUrl &&
    typeof fetchImpl === "function"
  );
  const reservations = new Map();

  function cleanupReservations(timestamp) {
    for (const [key, expiresAt] of reservations) {
      if (expiresAt <= timestamp) reservations.delete(key);
    }
  }

  function publicConfig() {
    return {
      appId: sdkConfigured ? settings.appId : null,
      sdkConfigured,
      deliveryConfigured: configured,
      serviceWorkerPath: "push/onesignal/OneSignalSDKWorker.js",
      serviceWorkerScope: "/push/onesignal/",
    };
  }

  async function send(message, options = {}) {
    if (!configured || !message) {
      return {
        configured,
        delivered: 0,
        failed: 0,
        deduplicated: false,
      };
    }

    const route = normalizeRoute(options.route, message);
    const category = notificationCategoryForRoute(route);
    const eventKey = eventKeyForNotification(message, {
      route,
      eventId: options.eventId,
      now: now(),
      dedupeWindowMs: settings.dedupeWindowMs,
    });
    const idempotencyKey = uuidFromEventKey(eventKey);
    const timestamp = now();
    cleanupReservations(timestamp);

    if (reservations.has(idempotencyKey)) {
      return {
        configured: true,
        delivered: 0,
        failed: 0,
        deduplicated: true,
        eventKey,
        route,
      };
    }
    reservations.set(idempotencyKey, timestamp + settings.dedupeWindowMs);

    const title = normalizeOneSignalText(options.title || "BorsaCI", 80);
    const body = normalizeOneSignalText(message, 240);
    const targetUrl = new URL("/", settings.publicBaseUrl);
    targetUrl.searchParams.set("pushTab", route);
    targetUrl.searchParams.set("pushEvent", eventKey);
    const iconUrl = new URL("/borsaci-crescent-star.png?v=2", settings.publicBaseUrl).href;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), settings.timeoutMs);

    try {
      const response = await fetchImpl(settings.apiUrl, {
        method: "POST",
        headers: {
          "Authorization": `Key ${settings.apiKey}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          app_id: settings.appId,
          target_channel: "push",
          include_subscription_ids: [settings.allowedSubscriptionId],
          headings: { en: title },
          contents: { en: body },
          name: `BorsaCI ${category} ${idempotencyKey}`.slice(0, 128),
          url: targetUrl.href,
          chrome_web_icon: iconUrl,
          firefox_icon: iconUrl,
          data: { route, eventId: eventKey },
          idempotency_key: idempotencyKey,
        }),
        signal: controller.signal,
      });

      const responseText = await response.text();
      let payload = {};
      try {
        payload = responseText ? JSON.parse(responseText) : {};
      } catch {
        payload = {};
      }

      if (!response.ok) {
        throw new Error(`OneSignal HTTP ${response.status}`);
      }

      return {
        configured: true,
        delivered: payload.id ? 1 : 0,
        failed: payload.id ? 0 : 1,
        deduplicated: false,
        eventKey,
        route,
        messageId: payload.id || null,
      };
    } catch (error) {
      reservations.delete(idempotencyKey);
      logger.error(
        "ONESIGNAL DELIVERY ERROR:",
        String(error?.message || error).slice(0, 200)
      );
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    configured: () => configured,
    publicConfig,
    send,
  };
}

module.exports = {
  DEFAULT_API_URL,
  createOneSignalPushService,
  normalizeBaseUrl,
  normalizeOneSignalText,
  uuidFromEventKey,
};

