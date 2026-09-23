"use strict";

// Açık pozisyon izleme fiyatı için zaman doğrulaması. Scanner/AI yalnızca
// tamamlanmış günlük mumları kullanmaya devam eder; bu modül o akışı etkilemez.
function timestampMs(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value < 1e11 ? value * 1000 : value;
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function isFreshMarketQuote(timestamp, {now = Date.now(), maxAgeMs = 5 * 60 * 1000, maxFutureSkewMs = 60 * 1000} = {}) {
  const quoteAt = timestampMs(timestamp);
  return quoteAt !== null && quoteAt <= now + maxFutureSkewMs && now - quoteAt <= maxAgeMs;
}

function canUseSessionQuote({marketOpen, timestamp, now = Date.now(), maxAgeMs} = {}) {
  return Boolean(marketOpen) && isFreshMarketQuote(timestamp, {now, maxAgeMs});
}

module.exports = {timestampMs, isFreshMarketQuote, canUseSessionQuote};
