"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isBistEndOfDayDue,
  eodDecision,
  failedEodState,
} = require("../trading/bist-eod-scheduler");
const {createMarketScheduler} = require("../trading/market-scheduler");

const at = (time) => new Date(time);

test("17:00 saatlik BIST taraması normal piyasa seansında çalışır", async () => {
  const calls = [];
  const scheduler = createMarketScheduler({runMarket: async (market) => calls.push(market)});
  const result = await scheduler.runMarketOnce("BIST", {timestamp: at("2026-08-24T14:00:00.000Z")});
  assert.equal(result.skipped, false);
  assert.deepEqual(calls, ["BIST"]);
});

test("18:00 saatlik BIST taraması çalışmaz", async () => {
  const scheduler = createMarketScheduler({runMarket: async () => assert.fail("scanner çağrılmamalı")});
  const result = await scheduler.runMarketOnce("BIST", {timestamp: at("2026-08-24T15:00:00.000Z")});
  assert.equal(result.skipped, true);
  assert.equal(result.reason, "MARKET_CLOSED");
});

test("18:15 hafta içi BIST kapanış taraması uygundur", () => {
  assert.equal(isBistEndOfDayDue(at("2026-08-24T15:14:00.000Z")), false);
  assert.equal(isBistEndOfDayDue(at("2026-08-24T15:15:00.000Z")), true);
  assert.equal(isBistEndOfDayDue(at("2026-08-23T15:15:00.000Z")), false);
});

test("başarılı kapanış scan damgası daily summary aşamasına geçer", () => {
  const result = eodDecision({
    now: at("2026-08-24T15:16:00.000Z"),
    eodState: {sessionKey: "2026-08-24", status: "SUCCESS"},
    dailySummary: {sessionKey: null},
  });
  assert.equal(result.action, "SEND_SUMMARY");
});

test("başarısız kapanış scan'i stale snapshot ile summary göndermez", () => {
  const now = at("2026-08-24T15:16:00.000Z");
  const result = eodDecision({
    now,
    eodState: failedEodState("2026-08-24", "Yahoo timeout", now),
    dailySummary: {sessionKey: null},
  });
  assert.equal(result.action, "RETRY_WAIT");
});

test("aynı seansın summary kaydı ikinci özeti engeller", () => {
  const result = eodDecision({
    now: at("2026-08-24T15:16:00.000Z"),
    eodState: {sessionKey: "2026-08-24", status: "SUCCESS"},
    dailySummary: {sessionKey: "2026-08-24"},
  });
  assert.equal(result.action, "COMPLETE");
});

test("manuel scanner çalışırken kapanış worker'i duplicate scan başlatmaz", () => {
  const result = eodDecision({
    now: at("2026-08-24T15:16:00.000Z"),
    scannerLocked: true,
    dailySummary: {sessionKey: null},
  });
  assert.equal(result.action, "SCANNER_IN_FLIGHT");
});

test("ertesi iş günü yeni kapanış özeti için yeni scan başlatılır", () => {
  const result = eodDecision({
    now: at("2026-08-25T15:16:00.000Z"),
    eodState: {sessionKey: "2026-08-24", status: "SUCCESS"},
    dailySummary: {sessionKey: "2026-08-24"},
  });
  assert.equal(result.action, "RUN_SCAN");
  assert.equal(result.sessionKey, "2026-08-25");
});
