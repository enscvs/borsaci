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
test("risk-off regime rejects new long candidates", () => {
  const index = bars();
  const f = p.featuresAt(index);
  const regime = { regime: "RISK_OFF", allowed: false, reason: "test" };
  const result = p.evaluateSetup({ symbol: "TEST", history: index, features: f }, { regime });
  assert.equal(result.decision, "NO_TRADE");
});
test("risk reward below 1:2 does not pass setup", () => {
  const data = bars();
  const f = p.featuresAt(data);
  const result = p.evaluateSetup({ symbol: "TEST", history: data, features: f, rs20: .1, rs60: .1, relativeStrengthPercentile: .1 }, { regime: { regime: "RISK_ON", allowed: true } });
  assert.notEqual(result.decision, "FILTERS_PASSED");
});
test("uncalibrated models never expose a percentage", () => {
  const data = bars();
  const f = p.featuresAt(data);
  const result = p.evaluateSetup({ symbol: "TEST", history: data, features: f, rs20: .1, rs60: .1, relativeStrengthPercentile: .1 }, { regime: { regime: "RISK_ON", allowed: true }, model: null });
  assert.equal(result.calibration.status, "KALIBRE_EDILMEDI");
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
