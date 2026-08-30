"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const app = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");

test("running position monitor is healthy rather than an attention state", () => {
  assert.match(server, /status: unifiedPositionMonitorRunning \|\| marketPaperMonitorRunning \? "RUNNING"/);
  assert.match(server, /item\.status === "READY" \|\| item\.status === "RUNNING"/);
  assert.match(app, /running \? "ÇALIŞIYOR"/);
});

test("control center reports partial API refresh failures", () => {
  assert.match(app, /failedReads/);
  assert.match(app, /KISMİ GÜNCELLEME/);
});

test("external readiness uses verified successes and scanner freshness", () => {
  assert.match(server, /integrationHealth\.telegram\.webhookConfiguredAt/);
  assert.match(server, /integrationHealth\.binance\.lastSuccessAt/);
  assert.match(server, /integrationHealth\.alpaca\.lastSuccessAt/);
  assert.match(server, /const cryptoFresh = recent\([^,]+, 2 \* 60 \* 60 \* 1000\)/);
});

test("direct Telegram failures enter the persistent outbox", () => {
  assert.match(server, /async function enqueueTelegramOutbox/);
  assert.match(server, /async function flushTelegramOutbox/);
  assert.match(server, /telegramOutbox: \[\]/);
});

