"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createWebPushService,
  eventKeyForNotification,
  normalizePushSubscription,
  notificationRouteForMessage,
} = require("../web-push-service");

test("notification routes cover BIST, NASDAQ, crypto and system events", () => {
  assert.equal(notificationRouteForMessage("BIST TP1 hedefine ulaştı"), "tradingTab");
  assert.equal(notificationRouteForMessage("NASDAQ ALPACA emir uyarısı"), "nasdaqTab");
  assert.equal(notificationRouteForMessage("Kripto BTCUSDT stop"), "cryptoTab");
  assert.equal(notificationRouteForMessage("BORSACI bağlantısı aktif"), "controlTab");
});

test("push subscriptions require HTTPS endpoints and both browser keys", () => {
  const subscription = normalizePushSubscription({
    endpoint: "https://push.example.test/device/123",
    expirationTime: null,
    keys: { p256dh: "abc_DEF-123", auth: "xyz_789" },
  });

  assert.equal(subscription.endpoint, "https://push.example.test/device/123");
  assert.throws(
    () => normalizePushSubscription({
      endpoint: "http://push.example.test/device/123",
      keys: { p256dh: "abc", auth: "xyz" },
    }),
    /HTTPS/
  );
  assert.throws(
    () => normalizePushSubscription({ endpoint: "https://push.example.test", keys: {} }),
    /anahtarı/
  );
});

test("dedupe keys are stable inside a window and change in the next window", () => {
  const options = { route: "tradingTab", now: 1_000_000, dedupeWindowMs: 600_000 };
  const first = eventKeyForNotification("Aynı olay", options);
  const repeated = eventKeyForNotification("Aynı olay", { ...options, now: 1_100_000 });
  const later = eventKeyForNotification("Aynı olay", { ...options, now: 1_800_000 });

  assert.equal(first, repeated);
  assert.notEqual(first, later);
});

test("unconfigured service is a safe no-op and exposes no VAPID key", async () => {
  const service = createWebPushService({}, {
    webPush: {},
    Pool: class UnexpectedPool {
      constructor() { throw new Error("Pool should not be created"); }
    },
  });

  assert.deepEqual(service.publicConfig(), { configured: false, publicKey: null });
  assert.deepEqual(
    await service.send("BIST uyarısı"),
    { configured: false, delivered: 0, failed: 0, deduplicated: false }
  );
});

test("duplicate events are not delivered twice", async () => {
  const sent = [];

  class FakePool {
    constructor() {
      this.reserved = new Set();
    }

    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      if (normalized.startsWith("CREATE ")) return { rowCount: 0, rows: [] };
      if (normalized.startsWith("DELETE FROM web_push_events")) return { rowCount: 0, rows: [] };
      if (normalized.startsWith("INSERT INTO web_push_events")) {
        if (this.reserved.has(params[0])) return { rowCount: 0, rows: [] };
        this.reserved.add(params[0]);
        return { rowCount: 1, rows: [{ event_key: params[0] }] };
      }
      if (normalized.startsWith("SELECT endpoint_hash")) {
        return {
          rowCount: 1,
          rows: [{
            endpoint_hash: "hash",
            endpoint: "https://push.example.test/device/123",
            p256dh: "abc",
            auth: "xyz",
            expiration_time: null,
          }],
        };
      }
      throw new Error(`Unexpected SQL: ${normalized}`);
    }
  }

  const fakeWebPush = {
    setVapidDetails() {},
    async sendNotification(subscription, payload) {
      sent.push({ subscription, payload: JSON.parse(payload) });
    },
  };

  const service = createWebPushService({
    databaseUrl: "postgres://example",
    vapidPublicKey: "public",
    vapidPrivateKey: "private",
    vapidSubject: "mailto:borsaci@example.test",
    dedupeWindowMs: 600_000,
  }, {
    webPush: fakeWebPush,
    Pool: FakePool,
    now: () => 1_000_000,
  });

  const first = await service.send("BIST TP1 gerçekleşti");
  const duplicate = await service.send("BIST TP1 gerçekleşti");

  assert.equal(first.delivered, 1);
  assert.equal(first.route, "tradingTab");
  assert.equal(duplicate.deduplicated, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].payload.data.route, "tradingTab");
});

