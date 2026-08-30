"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isNasdaqTradableAsset, completedDailyBars, alpacaTradingBase, buildAlpacaOrderPayload,
} = require("../trading/alpaca-provider");

test("only active tradable Nasdaq common stock assets enter the universe", () => {
  assert.equal(isNasdaqTradableAsset({symbol:"AAPL", status:"active", tradable:true, asset_class:"us_equity", exchange:"NASDAQ"}), true);
  assert.equal(isNasdaqTradableAsset({symbol:"OTC", status:"active", tradable:true, asset_class:"us_equity", exchange:"OTC"}), false);
});

test("Alpaca asset class aliases and string tradable flags remain compatible", () => {
  assert.equal(isNasdaqTradableAsset({
    class: "us_equity", exchange: "NASDAQ", status: "active", tradable: "true", symbol: "MSFT",
  }), true);
});

test("in-progress New York daily bar is excluded", () => {
  const now = Date.parse("2026-08-27T16:00:00Z");
  const bars = completedDailyBars([
    {t:"2026-08-26T04:00:00Z", o:10, h:12, l:9, c:11, v:100},
    {t:"2026-08-27T04:00:00Z", o:11, h:13, l:10, c:12, v:100},
  ], now);
  assert.deepEqual(bars.map(bar => bar.close), [11]);
});

test("Alpaca daily bars are normalized oldest to newest before validation", () => {
  const bars = completedDailyBars([
    {t:"2026-08-26T04:00:00Z", o:11, h:13, l:10, c:12, v:100},
    {t:"2026-08-25T04:00:00Z", o:10, h:12, l:9, c:11, v:100},
  ], Date.parse("2026-08-27T16:00:00Z"));
  assert.deepEqual(bars.map(bar => bar.close), [11, 12]);
});

test("paper and live bases plus market and limit payloads are explicit", () => {
  assert.equal(alpacaTradingBase("paper"), "https://paper-api.alpaca.markets");
  assert.equal(alpacaTradingBase("live"), "https://api.alpaca.markets");
  assert.deepEqual(buildAlpacaOrderPayload({symbol:"MSFT", quantity:2, orderType:"MARKET"}), {symbol:"MSFT", qty:"2", side:"buy", type:"market", time_in_force:"day"});
  assert.equal(buildAlpacaOrderPayload({symbol:"MSFT", quantity:2, orderType:"LIMIT", entryPrice:420}).limit_price, "420");
});

test("Alpaca entry payload carries a stable client order id", () => {
  const payload = buildAlpacaOrderPayload({symbol:"AAPL", quantity:2, orderType:"LIMIT", entryPrice:210, clientOrderId:"bci-entry-abc123"});
  assert.equal(payload.client_order_id, "bci-entry-abc123");
  assert.equal(payload.limit_price, "210");
});

