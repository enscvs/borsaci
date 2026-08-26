"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const orders = require("../trading/paper-orders");

test("paper order edits recompute position value and stop risk", () => {
  const original = orders.normalizePaperOrder({
    symbol: "ALARK",
    quantity: 100,
    entryPrice: 106.3,
    orderType: "LIMIT",
    stop: 101.2,
    target1: 120.7,
    target2: 127.2,
  }, {
    requireSymbol: true,
    requireOrderType: true,
  });

  const edited = orders.normalizePaperOrder({
    quantity: 150,
    price: 105.5,
    orderType: "market",
  }, {
    existing: original,
  });

  assert.equal(edited.symbol, "ALARK");
  assert.equal(edited.orderType, "MARKET");
  assert.equal(edited.quantity, 150);
  assert.equal(edited.entryPrice, 105.5);
  assert.equal(edited.positionValue, 15825);
  assert.equal(edited.actualRisk, 645);
  assert.equal(edited.stop, 101.2);
});

test("manual paper order accepts optional stop and targets but remains paper only", () => {
  const order = orders.normalizePaperOrder({
    symbol: "BIST:DOHOL.IS",
    quantity: 25,
    entryPrice: 21.6,
    orderType: "LIMIT",
  }, {
    requireSymbol: true,
    requireOrderType: true,
  });

  assert.equal(order.symbol, "DOHOL");
  assert.equal(order.stop, null);
  assert.equal(order.target1, null);
  assert.equal(order.actualRisk, null);
  assert.equal(order.paperOnly, true);
});

test("paper order rejects invalid long stop, targets, and order type", () => {
  assert.throws(
    () => orders.normalizePaperOrder({
      symbol: "ALARK",
      quantity: 1,
      entryPrice: 100,
      orderType: "LIMIT",
      stop: 100,
    }, { requireOrderType: true }),
    /stop giriş fiyatının altında/
  );

  assert.throws(
    () => orders.normalizePaperOrder({
      symbol: "ALARK",
      quantity: 1,
      entryPrice: 100,
      orderType: "LIMIT",
      target1: 99,
    }, { requireOrderType: true }),
    /TP1 giriş fiyatının üzerinde/
  );

  assert.throws(
    () => orders.normalizePaperOrder({
      symbol: "ALARK",
      quantity: 1,
      entryPrice: 100,
      orderType: "STOP_LIMIT",
    }, { requireOrderType: true }),
    /LIMIT veya MARKET/
  );
});
