const test = require("node:test");
const assert = require("node:assert/strict");
const {
  liveSpotSafetyPolicy,
  validateLiveSpotOrderSafety,
  liveSpotOrderFingerprint
} = require("../trading/live-spot-safety");

test("live Spot policy has bounded server-side defaults", () => {
  assert.deepEqual(liveSpotSafetyPolicy({}), {
    maxOrderNotionalUsdt: 250,
    maxLimitDeviationPercent: 10,
    duplicateWindowMs: 45000
  });
  assert.equal(liveSpotSafetyPolicy({BINANCE_MAX_ORDER_NOTIONAL_USDT: "99999999"}).maxOrderNotionalUsdt, 1_000_000);
});

test("live Spot guard rejects excessive notional and distant limit prices", () => {
  const policy = liveSpotSafetyPolicy({});
  assert.throws(() => validateLiveSpotOrderSafety({orderType: "MARKET", quantity: "3", referencePrice: 100, policy}), /güvenlik sınırı/);
  assert.throws(() => validateLiveSpotOrderSafety({orderType: "LIMIT", quantity: "1", limitPrice: "120", referencePrice: 100, policy}), /fazla uzak/);
});

test("live Spot guard accepts a bounded order and fingerprints it deterministically", () => {
  const policy = liveSpotSafetyPolicy({});
  const result = validateLiveSpotOrderSafety({orderType: "LIMIT", quantity: "1", limitPrice: "105", referencePrice: 100, policy});
  assert.equal(result.notional, 105);
  assert.equal(result.deviationPercent, 5);
  assert.equal(liveSpotOrderFingerprint({symbol: "BTCUSDT", side: "BUY", orderType: "LIMIT", quantity: "1", price: "105"}), "BTCUSDT:BUY:LIMIT:1:105");
});
