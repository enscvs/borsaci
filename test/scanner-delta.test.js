"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  compareScannerSnapshots,
  formatScannerDeltaTelegram,
  isBuyAction,
} = require("../trading/scanner-delta");

test("same snapshot produces no delta and no Telegram text", () => {
  const snapshot = {
    topCandidates: [
      { symbol: "BTCUSDT", score: 88, action: "BUY SETUP" },
      { symbol: "ETHUSDT", score: 72, action: "WATCH" },
    ],
  };

  const delta = compareScannerSnapshots(snapshot, snapshot);

  assert.equal(delta.hasChanges, false);
  assert.equal(formatScannerDeltaTelegram(delta, { market: "CRYPTO" }), "");
});

test("dedupes symbols by keeping the highest-scored candidate", () => {
  const delta = compareScannerSnapshots(
    { topCandidates: [] },
    {
      topCandidates: [
        { symbol: " solusdt ", score: 71, action: "WATCH" },
        { symbol: "SOLUSDT", score: 91, action: "BUY SETUP" },
      ],
    }
  );

  assert.equal(delta.nextCount, 1);
  assert.deepEqual(delta.newCandidates.map((item) => [item.symbol, item.score, item.action]), [
    ["SOLUSDT", 91, "BUY SETUP"],
  ]);
  assert.deepEqual(delta.newBuyCandidates.map((item) => item.symbol), ["SOLUSDT"]);
});

test("detects new, removed, decision and significant score changes", () => {
  const previous = {
    topCandidates: [
      { symbol: "BTCUSDT", score: 88, action: "WATCH" },
      { symbol: "ETHUSDT", score: 80, action: "BUY SETUP" },
    ],
  };
  const next = {
    topCandidates: [
      { symbol: "BTCUSDT", score: 94, action: "BUY SETUP" },
      { symbol: "SOLUSDT", score: 91, action: "BUY SETUP" },
    ],
  };

  const delta = compareScannerSnapshots(previous, next);

  assert.deepEqual(delta.newCandidates.map((item) => item.symbol), ["SOLUSDT"]);
  assert.deepEqual(delta.removedCandidates.map((item) => item.symbol), ["ETHUSDT"]);
  assert.deepEqual(delta.actionChanges.map((item) => item.symbol), ["BTCUSDT"]);
  assert.deepEqual(delta.scoreChanges.map((item) => [item.symbol, item.delta]), [["BTCUSDT", 6]]);
  assert.deepEqual(delta.newBuyCandidates.map((item) => item.symbol), ["BTCUSDT", "SOLUSDT"]);
  assert.equal(delta.hasChanges, true);
});

test("score changes smaller than threshold do not notify", () => {
  const delta = compareScannerSnapshots(
    { candidates: [{ symbol: "AAPL", score: 70, action: "WATCH" }] },
    { candidates: [{ symbol: "AAPL", score: 74.9, action: "WATCH" }] },
    { scoreDeltaThreshold: 5 }
  );

  assert.equal(delta.scoreChanges.length, 0);
  assert.equal(delta.hasChanges, false);
});

test("a previously WAIT symbol promoted to BUY is a new trade candidate", () => {
  const delta = compareScannerSnapshots(
    { candidates: [{ symbol: "AAPL", score: 70, action: "WATCH" }] },
    { candidates: [{ symbol: "AAPL", score: 70, action: "AL ADAYI" }] }
  );

  assert.deepEqual(delta.newBuyCandidates.map((item) => item.symbol), ["AAPL"]);
  assert.equal(isBuyAction("AL ADAYI"), true);
});

test("formats a compact Turkish scanner notification without duplicate new BUY row", () => {
  const delta = compareScannerSnapshots(
    {
      candidates: [
        { symbol: "BTCUSDT", score: 88, action: "WATCH" },
        { symbol: "ETHUSDT", score: 76, action: "WATCH" },
      ],
    },
    {
      candidates: [
        { symbol: "BTCUSDT", score: 94, action: "BUY SETUP" },
        { symbol: "SOLUSDT", score: 91, action: "BUY SETUP" },
      ],
    }
  );
  const text = formatScannerDeltaTelegram(delta, {
    market: "crypto",
    timestamp: "2026-08-28T11:00:00.000Z",
    timeZone: "UTC",
  });

  assert.match(text, /BORSACI · CRYPTO SCANNER/);
  assert.match(text, /Yeni:\n\+ SOLUSDT · 91 · BUY SETUP/);
  assert.match(text, /Yeni işlem adayı:\n★ BTCUSDT · 94 · BUY SETUP/);
  assert.match(text, /Değişen:\nBTCUSDT · 88 → 94 · WATCH → BUY SETUP/);
  assert.match(text, /Çıkan:\n- ETHUSDT · 76 · WATCH/);
  assert.equal((text.match(/SOLUSDT/g) || []).length, 1);
});
