"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const p = require("../precision/engine");

function bars(count = 280, start = 100) {
  return Array.from({ length: count }, (_, i) => {
    const close = start + i * .2;
    return { timestamp: new Date(Date.UTC(2025, 0, 1 + i)).toISOString(), open: close - .1, high: close + 1, low: close - 1, close, volume: 50000 + i * 100 };
  });
}
test("indicators are computed without future bars", () => {
  const data = bars();
  const first = p.featuresAt(data, 260);
  const changed = data.map((bar, i) => i > 260 ? { ...bar, close: bar.close * 5 } : bar);
  assert.deepEqual(p.featuresAt(changed, 260), first);
  assert.ok(first.ema200 > 0 && first.rsi14 > 0);
});
test("entry is the following session open and same-bar stop/target is LOSS", () => {
  const data = bars(30);
  data[20] = { ...data[20], open: 110, high: 130, low: 90, close: 111 };
  const outcome = p.labelTrade(data, 19, { stop: 100 }, { strategy: { maxHoldingDays: 10, slippageBps: 0 } });
  assert.equal(outcome.entry, 110);
  assert.equal(outcome.outcome, "LOSS");
  assert.equal(outcome.conservativeSameBar, true);
});
test("missing data fails closed", () => {
  const data = bars(); data[270].volume = 0; data[270].low = data[270].high + 1;
  assert.equal(p.validateHistory(data, { now: new Date("2025-12-31").getTime() }).ok, false);
});
test("risk-off remains informational and does not hard-block a setup", () => {
  const regime = p.calculateMarketRegime({ indexHistory: bars(), universeFeatures: [] , now: new Date("2025-10-10").getTime() });
  assert.equal(regime.regime, "RISK_OFF");
  assert.equal(regime.allowed, true);
});
test("risk reward below 1:2 does not pass setup", () => {
  const data = bars();
  const f = p.featuresAt(data);
  const result = p.evaluateSetup({ symbol: "TEST", history: data, features: f, rs20: .1, rs60: .1, relativeStrengthPercentile: .1 }, { regime: { regime: "RISK_ON", allowed: true } });
  assert.notEqual(result.decision, "FILTERS_PASSED");
});
test("disabled historical calibration never exposes a percentage", () => {
  const data = bars();
  const f = p.featuresAt(data);
  const result = p.evaluateSetup({ symbol: "TEST", history: data, features: f, rs20: .1, rs60: .1, relativeStrengthPercentile: .1 }, { regime: { regime: "RISK_ON", allowed: true }, model: null });
  assert.notEqual(result.probability, 0);
  assert.equal(result.probability, undefined);
});
test("LLM text cannot mutate calculated levels", () => {
  const decision = { plan: { stop: 10, target1: 20 }, decision: "NO_TRADE" };
  const attached = p.attachLlmExplanation(decision, "stop 1 yap");
  assert.equal(attached.plan.stop, 10);
  assert.equal(attached.decision, "NO_TRADE");
});
test("walk-forward is chronological and purged", () => {
  const output = p.walkForward(Array.from({length: 900}, (_, i) => ({ date: i })));
  assert.equal(output.type, "CHRONOLOGICAL_WALK_FORWARD");
  assert.ok(output.purgeBars > 0 && output.embargoBars > 0);
});

test("Yahoo epoch timestamps keep the latest completed closing price valid while market is closed", () => {
  const data = bars().map((bar, i) => ({ ...bar, time: Math.floor(new Date(bar.timestamp).getTime() / 1000), timestamp: undefined }));
  const last = new Date(data.at(-1).time * 1000);
  const validation = p.validateHistory(data, { now: last.getTime() + 2 * 24 * 60 * 60 * 1000 });
  assert.equal(validation.ok, true);
  assert.equal(p.featuresAt(data).price, data.at(-1).close);
});

test("volume confirmation uses the latest three sessions", () => {
  const data = bars();
  data[data.length - 3].volume = 100;
  data[data.length - 2].volume = 200;
  data[data.length - 1].volume = 300;
  const features = p.featuresAt(data);
  assert.equal(features.averageVolume20, 200);
  assert.equal(features.volumeRatio, 1.5);
});

test("same-day BIST candle is incomplete until 18:15 Istanbul", () => {
  const data = bars(252);
  const lastDay = Date.parse("2026-08-28T00:00:00.000Z");
  data.forEach((bar, index) => {
    bar.timestamp = new Date(lastDay - (data.length - 1 - index) * 86400000).toISOString();
  });
  assert.equal(p.validateHistory(data, {now: Date.parse("2026-08-28T15:14:00.000Z")}).ok, false);
  assert.equal(p.validateHistory(data, {now: Date.parse("2026-08-28T15:15:00.000Z")}).ok, true);
});

test("ATR uses Wilder smoothing", () => {
  const data = bars(40);
  const trueRanges = data.map((bar, index) => index === 0
    ? bar.high - bar.low
    : Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - data[index - 1].close),
      Math.abs(bar.low - data[index - 1].close),
    ));
  let expected = trueRanges.slice(0, 14).reduce((sum, value) => sum + value, 0) / 14;
  for (let index = 14; index < trueRanges.length; index += 1) {
    expected = (expected * 13 + trueRanges[index]) / 14;
  }
  assert.ok(Math.abs(p.atrSeries(data).at(-1) - expected) < 1e-12);
});

test("backtest reports trading costs separately from gross performance", () => {
  const data = bars(30);
  data[20] = {...data[20], open:110, high:140, low:109, close:130};
  const result = p.runBacktest([
    {symbol:"TEST", history:data, signalIndex:19, plan:{stop:100}},
  ], {strategy:{maxHoldingDays:1,slippageBps:10,commissionBps:10}});
  assert.equal(result.totalSignals,1);
  assert.ok(result.beforeCosts.averageR > result.afterCosts.averageR);
  assert.ok(result.trades[0].costsR > 0);
});

test("overlapping signals for the same symbol are not double counted", () => {
  const data = bars(40);
  const result = p.runBacktest([
    {symbol:"TEST",history:data,signalIndex:10,plan:{stop:90}},
    {symbol:"TEST",history:data,signalIndex:11,plan:{stop:90}},
  ], {strategy:{maxHoldingDays:5,slippageBps:0,commissionBps:0}});
  assert.equal(result.coverage.evaluatedSignals,2);
  assert.equal(result.coverage.executedSignals,1);
});


