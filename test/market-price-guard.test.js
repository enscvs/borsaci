"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {timestampMs, isFreshMarketQuote, canUseSessionQuote} = require("../trading/market-price-guard");

test("quote zamanı saniye veya milisaniye olarak güvenli biçimde okunur", () => {
  assert.equal(timestampMs(1_700_000_000), 1_700_000_000_000);
  assert.equal(timestampMs(1_700_000_000_000), 1_700_000_000_000);
});

test("eski veya gelecekten gelen seans içi quote kabul edilmez", () => {
  const now = 1_700_000_000_000;
  assert.equal(isFreshMarketQuote(now - 59_000, {now, maxAgeMs:60_000}), true);
  assert.equal(isFreshMarketQuote(now - 61_000, {now, maxAgeMs:60_000}), false);
  assert.equal(isFreshMarketQuote(now + 61_000, {now, maxAgeMs:60_000}), false);
});

test("piyasa kapalıysa güncel görünse bile intraday quote kullanılmaz", () => {
  const now = 1_700_000_000_000;
  assert.equal(canUseSessionQuote({marketOpen:false, timestamp:now, now, maxAgeMs:60_000}), false);
  assert.equal(canUseSessionQuote({marketOpen:true, timestamp:now, now, maxAgeMs:60_000}), true);
});
