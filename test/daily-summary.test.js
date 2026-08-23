"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isDailySummaryDue,
  buildDailySummaryMessage,
} = require("../trading/daily-summary");

test("daily summary is due only after 18:15 on a BIST weekday", () => {
  // Europe/Istanbul is UTC+3 for these dates.
  assert.equal(isDailySummaryDue(new Date("2026-08-24T15:14:00.000Z")), false);
  assert.equal(isDailySummaryDue(new Date("2026-08-24T15:15:00.000Z")), true);
  assert.equal(isDailySummaryDue(new Date("2026-08-23T16:00:00.000Z")), false);
});

test("daily summary only calls a matching scanner snapshot today's first five", () => {
  const state = {
    scannerSnapshot: {
      sessionKey: "2026-08-24",
      results: [{
        symbol: "DOHOL",
        grade: "A+ / GÜÇLÜ ADAY",
        score: 82,
        fibonacci: {status: "ACTIVE"},
      }],
    },
    decisions: [{
      symbol: "DOHOL",
      status: "PENDING_APPROVAL",
      entry: {reference: 21.6},
      stop: 20.06,
      riskPlan: {quantity: 100},
      fibonacci: {
        valid: true,
        status: "ACTIVE",
        pointA: {price: 19.01},
        pointB: {price: 25.3},
        pointC: {price: 20.06},
        entryTriggerPrice: 20.23,
      },
    }],
    paper: {
      positions: [{
        symbol: "ALARK",
        quantity: 50,
        current: 106.3,
        pnl: 125,
        status: "OPEN",
      }],
    },
  };

  const message = buildDailySummaryMessage(state, "2026-08-24");
  assert.match(message, /1\. DOHOL/);
  assert.match(message, /AKTİF FIBONACCI YAPILARI/);
  assert.match(message, /ONAY BEKLEYEN İŞLEMLER/);
  assert.match(message, /AÇIK PAPER POZİSYONLAR/);
  assert.doesNotMatch(message, /Bugün için tamamlanmış scanner kaydı yok/);

  const staleMessage = buildDailySummaryMessage(state, "2026-08-25");
  assert.match(staleMessage, /Bugün için tamamlanmış scanner kaydı yok/);
  assert.doesNotMatch(staleMessage, /1\. DOHOL/);
});
