"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  BUY_SETUP_MIN_TECHNICAL_SCORE,
  scannerAction,
} = require("../trading/decision-policy");

test("an active Fibonacci plan becomes BUY SETUP from 60 technical points", () => {
  assert.equal(BUY_SETUP_MIN_TECHNICAL_SCORE, 60);
  assert.equal(
    scannerAction({ active: true, score: 60 }),
    "BUY SETUP"
  );
  assert.equal(
    scannerAction({ active: true, score: 59.99 }),
    "NO TRADE"
  );
});

test("an inactive plan remains WATCH without becoming a BUY SETUP", () => {
  assert.equal(
    scannerAction({ active: false, score: 100 }),
    "WATCH"
  );
  assert.equal(
    scannerAction({ active: false, score: 59 }),
    "NO TRADE"
  );
});
