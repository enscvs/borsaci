"use strict";

function finitePositive(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function calculateRiskBasedQuantity({
  capital,
  maxPositionPercent,
  maxRiskPercent = 1,
  entry,
  stop,
  allowFractional = false,
  fractionalDecimals = 8,
} = {}) {
  const accountCapital = Number(capital);
  const entryPrice = Number(entry);
  const stopPrice = Number(stop);
  if (![accountCapital, entryPrice, stopPrice].every(finitePositive) || stopPrice >= entryPrice) return 0;

  const allocationPercent = Math.max(0, Math.min(100, Number(maxPositionPercent) || 0));
  const riskPercent = Math.max(0, Math.min(5, Number(maxRiskPercent) || 0));
  if (!allocationPercent || !riskPercent) return 0;

  const allocationQuantity = accountCapital * allocationPercent / 100 / entryPrice;
  const riskQuantity = accountCapital * riskPercent / 100 / (entryPrice - stopPrice);
  const rawQuantity = Math.min(allocationQuantity, riskQuantity);
  if (!Number.isFinite(rawQuantity) || rawQuantity <= 0) return 0;

  if (!allowFractional) return Math.max(0, Math.floor(rawQuantity));
  const scale = 10 ** Math.max(0, Math.min(12, Math.floor(fractionalDecimals)));
  return Math.max(0, Math.floor(rawQuantity * scale) / scale);
}

module.exports = {calculateRiskBasedQuantity};

