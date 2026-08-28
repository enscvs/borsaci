"use strict";

function boundedNumber(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function liveSpotSafetyPolicy(environment = process.env) {
  return {
    // Varsayılanlar kasıtlı olarak muhafazakârdır; kullanıcı bunları yalnızca
    // Render ortam değişkenleriyle değiştirebilir, istemci değiştiremez.
    maxOrderNotionalUsdt: boundedNumber(environment.BINANCE_MAX_ORDER_NOTIONAL_USDT, 250, 10, 1_000_000),
    maxLimitDeviationPercent: boundedNumber(environment.BINANCE_MAX_LIMIT_DEVIATION_PERCENT, 10, 0.1, 50),
    duplicateWindowMs: boundedNumber(environment.BINANCE_DUPLICATE_ORDER_WINDOW_MS, 45_000, 5_000, 300_000)
  };
}

function validateLiveSpotOrderSafety({orderType, quantity, limitPrice, referencePrice, policy}) {
  const quantityNumber = Number(quantity);
  const marketPrice = Number(referencePrice);
  const requestedPrice = orderType === "LIMIT" ? Number(limitPrice) : marketPrice;
  if (!Number.isFinite(quantityNumber) || quantityNumber <= 0 || !Number.isFinite(marketPrice) || marketPrice <= 0 || !Number.isFinite(requestedPrice) || requestedPrice <= 0) {
    throw new Error("Canlı emir güvenlik kontrolü için geçerli miktar ve piyasa fiyatı gerekli.");
  }

  const notional = quantityNumber * requestedPrice;
  if (notional > policy.maxOrderNotionalUsdt) {
    throw new Error(`Emir tutarı güvenlik sınırı olan ${policy.maxOrderNotionalUsdt.toFixed(2)} USDT değerini aşıyor.`);
  }

  const deviationPercent = orderType === "LIMIT"
    ? (Math.abs(requestedPrice - marketPrice) / marketPrice) * 100
    : 0;
  if (orderType === "LIMIT" && deviationPercent > policy.maxLimitDeviationPercent) {
    throw new Error(`Limit fiyatı doğrulanmış piyasa fiyatından %${policy.maxLimitDeviationPercent} değerinden fazla uzak.`);
  }

  return {notional, deviationPercent, marketPrice, requestedPrice};
}

function liveSpotOrderFingerprint({symbol, side, orderType, quantity, price}) {
  return [symbol, side, orderType, String(quantity), orderType === "LIMIT" ? String(price) : "MARKET"].join(":");
}

module.exports = {
  liveSpotSafetyPolicy,
  validateLiveSpotOrderSafety,
  liveSpotOrderFingerprint
};
