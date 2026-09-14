"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fib = require("../trading/fibonacci-engine");

function historyWithTurnover() {
  const start = Date.UTC(2025, 0, 1);
  return Array.from({length:230}, (_, index) => {
    const close = 45 + index * 0.025;
    return {time:(start + index * 86400000) / 1000, open:close - 0.1, high:close + 0.3, low:close - 0.3, close, volume:1000000};
  });
}

test("liquidity score uses market currency thresholds without changing other buckets", () => {
  const baseFib = {valid:false,status:"NO_VALID_STRUCTURE",riskRewardTp2:null,riskRewardTp3:null,volumeConfirmation:"WEAK"};
  const bist = fib.score(historyWithTurnover(), baseFib, {market:"BIST"});
  const nasdaq = fib.score(historyWithTurnover(), baseFib, {market:"NASDAQ"});
  const crypto = fib.score(historyWithTurnover(), baseFib, {market:"CRYPTO"});
  const turnover = result => result.scoreBreakdown.volumeLiquidity.items.find(item => item.id === "turnover");
  assert.equal(turnover(bist).points, 0);
  assert.equal(turnover(nasdaq).points, 5);
  assert.equal(turnover(crypto).points, 5);
  assert.match(turnover(bist).detail, /TL/);
  assert.match(turnover(nasdaq).detail, /USD/);
  assert.match(turnover(crypto).detail, /USDT/);
});

