"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {createBistBroker} = require("../trading/broker/bist-broker");
const {createBinanceBroker} = require("../trading/broker/binance-broker");
const {createAlpacaBroker} = require("../trading/broker/alpaca-broker");

test("BIST adapter never fabricates a live execution", async () => {
  const result = await createBistBroker().executeExit({symbol:"THYAO", quantity:10});
  assert.equal(result.code, "NOT_CONFIGURED");
  assert.equal(result.confirmed, false);
  assert.equal(result.closed, false);
});

test("Binance exit is not closed when broker status is only NEW", async () => {
  const broker = createBinanceBroker({
    submitOrder: async () => ({orderId:"1", symbol:"BTCUSDT", status:"NEW", origQty:"0.01", executedQty:"0"}),
  });
  const result = await broker.executeExit({symbol:"BTCUSDT", quantity:"0.01"});
  assert.equal(result.ok, false);
  assert.equal(result.closed, false);
  assert.equal(result.code, "BROKER_NOT_FILLED");
});

test("Binance exit confirms only a fully filled requested quantity", async () => {
  const broker = createBinanceBroker({
    submitOrder: async () => ({orderId:"1", symbol:"BTCUSDT", status:"FILLED", origQty:"0.01", executedQty:"0.01", price:"65000"}),
  });
  const result = await broker.executeExit({symbol:"BTCUSDT", quantity:"0.01"});
  assert.equal(result.confirmed, true);
  assert.equal(result.closed, true);
  assert.equal(result.executedQuantity, 0.01);
});

test("Binance stop replacement refuses to add a new stop until old one is cancelled", async () => {
  let placed = false;
  const broker = createBinanceBroker({
    cancelOrder: async () => ({orderId:"7", status:"NEW"}),
    placeOrderList: async () => { placed = true; return {status:"EXECUTING"}; },
  });
  const result = await broker.replaceStop({cancel:{symbol:"BTCUSDT", orderId:"7"}, protection:{}});
  assert.equal(result.code, "OLD_PROTECTION_NOT_CANCELLED");
  assert.equal(placed, false);
});

test("Alpaca accepted exit is not treated as closed", async () => {
  const broker = createAlpacaBroker({
    enabled: true,
    submitOrder: async () => ({id:"abc", symbol:"AAPL", status:"accepted", qty:"2", filled_qty:"0"}),
  });
  const result = await broker.executeExit({symbol:"AAPL", quantity:2});
  assert.equal(result.closed, false);
  assert.equal(result.code, "BROKER_NOT_FILLED");
});

test("Alpaca filled exit confirms the position reduction", async () => {
  const broker = createAlpacaBroker({
    enabled: true,
    submitOrder: async () => ({id:"abc", symbol:"AAPL", status:"filled", qty:"2", filled_qty:"2", filled_avg_price:"210"}),
  });
  const result = await broker.executeExit({symbol:"AAPL", quantity:2});
  assert.equal(result.confirmed, true);
  assert.equal(result.closed, true);
  assert.equal(result.averagePrice, 210);
});

test("Alpaca protective order acceptance is not an execution confirmation", async () => {
  const broker = createAlpacaBroker({
    enabled: true,
    submitOrder: async () => ({id:"protect", status:"accepted", symbol:"AAPL", qty:"1"}),
  });
  const result = await broker.placeProtection({symbol:"AAPL", type:"stop", side:"sell", qty:"1"});
  assert.equal(result.ok, true);
  assert.equal(result.accepted, true);
  assert.equal(result.confirmed, false);
  assert.equal(result.closed, false);
});
