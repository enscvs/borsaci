"use strict";

/*
 * Alpaca ile ilgili saf yardımcılar burada tutulur. Ağ çağrıları server.js
 * içinde kalır; böylece sağlayıcı seçimi ve emir güvenlik kuralları test
 * edilebilir, BIST scanner mantığına dokunmaz.
 */

function isNasdaqTradableAsset(asset) {
  return Boolean(
    asset &&
    String(asset.status || "").toLowerCase() === "active" &&
    asset.tradable === true &&
    String(asset.asset_class || "").toLowerCase() === "us_equity" &&
    String(asset.exchange || "").toUpperCase() === "NASDAQ" &&
    /^[A-Z]{1,8}$/.test(String(asset.symbol || "").toUpperCase())
  );
}

function completedDailyBars(rows, now = Date.now()) {
  const dateOptions = {timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit"};
  const currentDay = new Intl.DateTimeFormat("en-CA", dateOptions).format(new Date(now));
  const nowParts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    ...dateOptions, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(now)).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  const currentSessionStillOpen = Number(nowParts.hour) * 60 + Number(nowParts.minute) < 16 * 60 + 15;
  return (Array.isArray(rows) ? rows : [])
    .map(row => ({
      time: Math.floor(new Date(row.t).getTime() / 1000),
      timestamp: row.t,
      open: Number(row.o), high: Number(row.h), low: Number(row.l),
      close: Number(row.c), volume: Number(row.v),
    }))
    .filter(candle => Number.isFinite(candle.time) &&
      [candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite) &&
      candle.high >= Math.max(candle.open, candle.close, candle.low) &&
      candle.low <= Math.min(candle.open, candle.close, candle.high))
    .filter(candle => !currentSessionStillOpen || new Intl.DateTimeFormat("en-CA", dateOptions).format(new Date(candle.timestamp)) !== currentDay)
    .map(({timestamp, ...candle}) => candle);
}

function alpacaTradingBase(mode) {
  return String(mode || "paper").toLowerCase() === "live"
    ? "https://api.alpaca.markets"
    : "https://paper-api.alpaca.markets";
}

function buildAlpacaOrderPayload(order = {}) {
  const symbol = String(order.symbol || "").trim().toUpperCase();
  const quantity = Number(order.quantity);
  const type = String(order.orderType || "MARKET").toLowerCase();
  if (!/^[A-Z]{1,8}$/.test(symbol)) throw new Error("Geçerli NASDAQ sembolü gerekli.");
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Emir miktarı pozitif olmalı.");
  if (!['market', 'limit'].includes(type)) throw new Error("Emir türü MARKET veya LIMIT olmalı.");
  const payload = {symbol, qty: String(quantity), side: "buy", type, time_in_force: "day"};
  if (type === "limit") {
    const price = Number(order.entryPrice);
    if (!Number.isFinite(price) || price <= 0) throw new Error("LIMIT emir için fiyat gerekli.");
    payload.limit_price = String(price);
  }
  return payload;
}

module.exports = {
  isNasdaqTradableAsset,
  completedDailyBars,
  alpacaTradingBase,
  buildAlpacaOrderPayload,
};
