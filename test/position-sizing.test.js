"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {calculateRiskBasedQuantity} = require("../trading/position-sizing");

test("position size is capped by stop-loss risk", () => {
  const quantity = calculateRiskBasedQuantity({capital:10000,maxPositionPercent:20,maxRiskPercent:1,entry:100,stop:90});
  assert.equal(quantity, 10);
  assert.equal(quantity * (100 - 90), 100);
});

test("position size also respects maximum notional allocation", () => {
  const quantity = calculateRiskBasedQuantity({capital:10000,maxPositionPercent:20,maxRiskPercent:1,entry:100,stop:99});
  assert.equal(quantity, 20);
  assert.equal(quantity * 100, 2000);
});

test("fractional crypto sizing is supported and invalid stops fail closed", () => {
  assert.equal(calculateRiskBasedQuantity({capital:10000,maxPositionPercent:20,maxRiskPercent:1,entry:60000,stop:57000,allowFractional:true}), 0.03333333);
  assert.equal(calculateRiskBasedQuantity({capital:10000,maxPositionPercent:20,maxRiskPercent:1,entry:100,stop:100}), 0);
});

