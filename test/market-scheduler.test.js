"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isBistMarketOpen,
  isNasdaqMarketOpen,
  createMarketScheduler,
} = require("../trading/market-scheduler");

test("BIST ve NASDAQ yalnızca kendi seans saatinde saatlik taramaya uygundur", () => {
  // 2026-08-28 10:15 Türkiye = hafta içi BIST seansı.
  assert.equal(isBistMarketOpen(new Date("2026-08-28T07:15:00.000Z")), true);
  assert.equal(isBistMarketOpen(new Date("2026-08-28T04:15:00.000Z")), false);
  // 2026-08-28 10:00 New York = NASDAQ seansı.
  assert.equal(isNasdaqMarketOpen(new Date("2026-08-28T14:00:00.000Z")), true);
  assert.equal(isNasdaqMarketOpen(new Date("2026-08-28T20:30:00.000Z")), false);
});

test("aynı piyasanın saatlik işi üst üste binmez", async () => {
  let release;
  let calls = 0;
  const pending = new Promise((resolve) => { release = resolve; });
  const scheduler = createMarketScheduler({
    now: () => new Date("2026-08-28T12:00:00.000Z"),
    runMarket: async () => {
      calls += 1;
      await pending;
    },
  });

  const first = scheduler.runMarketOnce("CRYPTO");
  const second = await scheduler.runMarketOnce("CRYPTO");
  assert.equal(second.skipped, true);
  assert.equal(second.reason, "IN_FLIGHT");
  release();
  await first;
  assert.equal(calls, 1);
});

test("piyasa kapalıysa NASDAQ taraması çalışmaz, kripto çalışır", async () => {
  const calls = [];
  const now = new Date("2026-08-29T10:00:00.000Z"); // Cumartesi
  const scheduler = createMarketScheduler({
    now: () => now,
    runMarket: async (market) => calls.push(market),
  });
  const results = await scheduler.runHourly({timestamp: now});
  assert.equal(results.find((item) => item.market === "NASDAQ").reason, "MARKET_CLOSED");
  assert.deepEqual(calls, ["CRYPTO"]);
});
