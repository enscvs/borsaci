"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createOneSignalPushService,
  normalizeBaseUrl,
  uuidFromEventKey,
} = require("../onesignal-push-service");

const APP_ID = "37d4853e-17da-4ebe-9220-372f2964a8e4";
const SUBSCRIPTION_ID = "123e4567-e89b-42d3-a456-426614174000";

function configuredService(fetchImpl, now = () => 1_000_000) {
  return createOneSignalPushService({
    appId: APP_ID,
    apiKey: "server-only-key",
    allowedSubscriptionId: SUBSCRIPTION_ID,
    publicBaseUrl: "https://gemini-borsaci.onrender.com",
    dedupeWindowMs: 600_000,
  }, { fetch: fetchImpl, now, logger: { error() {} } });
}

test("OneSignal delivery stays off without the server allowlisted subscription", async () => {
  let called = false;
  const service = createOneSignalPushService({
    appId: APP_ID,
    apiKey: "server-only-key",
    publicBaseUrl: "https://gemini-borsaci.onrender.com",
  }, { fetch: async () => { called = true; } });

  assert.equal(service.configured(), false);
  assert.deepEqual(service.publicConfig(), {
    appId: APP_ID,
    sdkConfigured: true,
    deliveryConfigured: false,
    serviceWorkerPath: "push/onesignal/OneSignalSDKWorker.js",
    serviceWorkerScope: "/push/onesignal/",
  });
  assert.equal((await service.send("BIST sinyali")).delivered, 0);
  assert.equal(called, false);
});

test("server targets exactly one allowlisted subscription and never a segment", async () => {
  const calls = [];
  const service = configuredService(async (url, options) => {
    calls.push({ url, options, payload: JSON.parse(options.body) });
    return {
      ok: true,
      status: 200,
      async text() { return JSON.stringify({ id: "message-id" }); },
    };
  });

  const result = await service.send("NASDAQ ALPACA emir uyarısı");
  assert.equal(result.delivered, 1);
  assert.equal(result.route, "nasdaqTab");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].payload.include_subscription_ids, [SUBSCRIPTION_ID]);
  assert.equal(calls[0].payload.target_channel, "push");
  assert.equal("included_segments" in calls[0].payload, false);
  assert.equal("include_aliases" in calls[0].payload, false);
  assert.match(calls[0].payload.url, /pushTab=nasdaqTab/);
  assert.equal(calls[0].options.headers.Authorization, "Key server-only-key");
  assert.equal(JSON.stringify(service.publicConfig()).includes("server-only-key"), false);
  assert.equal(JSON.stringify(service.publicConfig()).includes(SUBSCRIPTION_ID), false);
});

test("duplicate logical events produce a single OneSignal request", async () => {
  let requests = 0;
  const service = configuredService(async () => {
    requests += 1;
    return {
      ok: true,
      status: 200,
      async text() { return JSON.stringify({ id: "message-id" }); },
    };
  });

  const first = await service.send("Kripto BTC stop");
  const duplicate = await service.send("Kripto BTC stop");
  assert.equal(first.delivered, 1);
  assert.equal(duplicate.deduplicated, true);
  assert.equal(requests, 1);
});

test("idempotency key is a deterministic RFC 9562 UUID and URLs require HTTPS", () => {
  const hash = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const first = uuidFromEventKey(hash);
  assert.equal(first, uuidFromEventKey(hash));
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(normalizeBaseUrl("https://example.com/path"), "https://example.com");
  assert.equal(normalizeBaseUrl("http://example.com"), "");
});

