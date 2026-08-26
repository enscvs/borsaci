"use strict";

/*
 * Paper emirleri için saf doğrulama/hesaplama yardımcıları. Bu modül
 * hiçbir piyasa verisi veya broker çağrısı yapmaz; bütün emirler yalnızca
 * BorsaCI'nin paper trading durumunda kullanılır.
 */

const PAPER_ORDER_TYPES = new Set(["LIMIT", "MARKET"]);
const MAX_PAPER_ORDER_QUANTITY = 10_000_000;
const MAX_PAPER_ORDER_PRICE = 1_000_000_000;

function roundMoney(value) {
  return Number(Number(value).toFixed(2));
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function normalizeSymbol(value) {
  const symbol = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/^BIST:/, "")
    .replace(/\.IS$/, "");

  if (!/^[A-Z0-9]{2,10}$/.test(symbol)) {
    throw new Error("Geçerli bir BIST sembolü gerekli.");
  }

  return symbol;
}

function requiredPositiveNumber(value, label) {
  const number = Number(value);

  if (
    !Number.isFinite(number) ||
    number <= 0 ||
    number > MAX_PAPER_ORDER_PRICE
  ) {
    throw new Error(`${label} geçerli ve pozitif olmalı.`);
  }

  return roundMoney(number);
}

function requiredQuantity(value) {
  const quantity = Number(value);

  if (
    !Number.isSafeInteger(quantity) ||
    quantity <= 0 ||
    quantity > MAX_PAPER_ORDER_QUANTITY
  ) {
    throw new Error("Lot miktarı pozitif tam sayı olmalı.");
  }

  return quantity;
}

function optionalPositiveNumber(value, label) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return requiredPositiveNumber(value, label);
}

function optionalValue(input, existing, key, label) {
  if (hasOwn(input, key)) {
    return optionalPositiveNumber(input[key], label);
  }

  return optionalPositiveNumber(existing?.[key], label);
}

function resolveEntryInput(input, existing) {
  if (hasOwn(input, "entryPrice")) {
    return input.entryPrice;
  }

  if (hasOwn(input, "price")) {
    return input.price;
  }

  return existing?.entryPrice;
}

function resolveOrderType(input, existing, requireOrderType) {
  const raw = hasOwn(input, "orderType")
    ? input.orderType
    : existing?.orderType;

  if ((raw === undefined || raw === null || raw === "") && !requireOrderType) {
    return "LIMIT";
  }

  const orderType = String(raw || "").trim().toUpperCase();

  if (!PAPER_ORDER_TYPES.has(orderType)) {
    throw new Error("Emir türü LIMIT veya MARKET olmalı.");
  }

  return orderType;
}

/*
 * `input` tam manuel emir veya kısmi güncelleme olabilir. Güncellenen
 * emirlerde gönderilmeyen alanlar `existing` değerinden alınır; null/boş
 * isteği ise opsiyonel SL/TP alanını bilinçli olarak temizler.
 */
function normalizePaperOrder(input = {}, {
  existing = null,
  requireSymbol = false,
  requireOrderType = false,
} = {}) {
  const rawSymbol = hasOwn(input, "symbol")
    ? input.symbol
    : existing?.symbol;
  const symbol = normalizeSymbol(rawSymbol);

  const rawQuantity = hasOwn(input, "quantity")
    ? input.quantity
    : existing?.quantity;
  const quantity = requiredQuantity(rawQuantity);

  const entryPrice = requiredPositiveNumber(
    resolveEntryInput(input, existing),
    "Giriş fiyatı"
  );
  const orderType = resolveOrderType(input, existing, requireOrderType);

  const stop = optionalValue(input, existing, "stop", "Stop fiyatı");
  const target1 = optionalValue(input, existing, "target1", "TP1 fiyatı");
  const target2 = optionalValue(input, existing, "target2", "TP2 fiyatı");
  const target3 = optionalValue(input, existing, "target3", "TP3 fiyatı");

  if (stop !== null && stop >= entryPrice) {
    throw new Error("Uzun paper işlemde stop giriş fiyatının altında olmalı.");
  }

  for (const [label, value] of [["TP1", target1], ["TP2", target2], ["TP3", target3]]) {
    if (value !== null && value <= entryPrice) {
      throw new Error(`${label} giriş fiyatının üzerinde olmalı.`);
    }
  }

  if (target1 !== null && target2 !== null && target2 <= target1) {
    throw new Error("TP2, TP1'in üzerinde olmalı.");
  }

  if (target2 !== null && target3 !== null && target3 <= target2) {
    throw new Error("TP3, TP2'nin üzerinde olmalı.");
  }

  const positionValue = roundMoney(quantity * entryPrice);
  const actualRisk = stop === null
    ? null
    : roundMoney((entryPrice - stop) * quantity);

  return {
    symbol,
    quantity,
    entryPrice,
    orderType,
    stop,
    target1,
    target2,
    target3,
    positionValue,
    actualRisk,
    paperOnly: true,
  };
}

module.exports = {
  PAPER_ORDER_TYPES,
  normalizeSymbol,
  normalizePaperOrder,
  roundMoney,
};
