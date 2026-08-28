"use strict";

/*
 * Saf uzun pozisyon takip yardımcıları.
 *
 * Beklenen normalize pozisyon alanları:
 * - id veya brokerPositionId (idempotency anahtarı için önerilir)
 * - symbol, market (isteğe bağlı)
 * - status: "OPEN" (diğer durumlar izlenmez)
 * - entryPrice veya entry
 * - quantity veya remainingQuantity
 * - stop veya stopLoss
 * - target1 / tp1, target2 / tp2
 * - tp1Hit, tp2Hit, slHit (veya `monitor.events`) önceki olayları gösterir
 *
 * `evaluateLongPosition` pozisyonu değiştirmez. Dönen event, broker tarafında
 * gerçekten onaylandıktan sonra `applyConfirmedMonitorEvent` ile state'e
 * işlenmelidir. Bu ayrım, broker hatasında yerel state'in yanlışlıkla kapalı
 * görünmesini engeller.
 */

const EVENT_TYPES = Object.freeze({
  TP1: "TP1",
  TP2: "TP2",
  SL: "SL",
});

const TERMINAL_STATUSES = new Set([
  "CLOSED",
  "CANCELLED",
  "REJECTED",
  "EXPIRED",
]);

function positiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizedStatus(position) {
  return String(position?.status || "OPEN").trim().toUpperCase();
}

function isOpenLongPosition(position) {
  const status = normalizedStatus(position);
  if (TERMINAL_STATUSES.has(status)) return false;

  const side = String(position?.side || position?.direction || "LONG")
    .trim()
    .toUpperCase();
  return side === "LONG" || side === "BUY" || side === "AL";
}

function eventFlagNames(type) {
  if (type === EVENT_TYPES.TP1) return ["tp1Hit", "tp1Done", "tp1Executed"];
  if (type === EVENT_TYPES.TP2) return ["tp2Hit", "tp2Done", "tp2Executed"];
  return ["slHit", "stopHit", "slDone", "stopDone", "slExecuted"];
}

function eventAlreadyProcessed(position, type) {
  if (!position) return false;
  if (eventFlagNames(type).some((name) => Boolean(position[name]))) return true;

  const monitor = position.monitor || position.positionMonitor || {};
  if (eventFlagNames(type).some((name) => Boolean(monitor[name]))) return true;

  const events = monitor.events || position.monitorEvents || position.executionEvents;
  if (Array.isArray(events)) {
    return events.some((entry) => String(entry?.type || entry?.event || "").toUpperCase() === type);
  }

  if (events && typeof events === "object") {
    return Boolean(events[type] || events[type.toLowerCase()]);
  }

  return false;
}

function readRemainingQuantity(position) {
  return positiveNumber(
    position?.remainingQuantity
    ?? position?.quantityRemaining
    ?? position?.remaining
    ?? position?.quantity
  );
}

function readEntryPrice(position) {
  return positiveNumber(position?.entryPrice ?? position?.entry);
}

function readStopPrice(position) {
  return positiveNumber(position?.stop ?? position?.stopLoss ?? position?.sl);
}

function readTarget(position, targetNumber) {
  return positiveNumber(
    targetNumber === 1
      ? (position?.target1 ?? position?.tp1)
      : (position?.target2 ?? position?.tp2)
  );
}

function roundQuantity(value, precision = 8) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const factor = 10 ** Math.min(Math.max(Number(precision) || 8, 0), 12);
  return Math.round(parsed * factor) / factor;
}

function stablePositionKey(position) {
  if (position?.id !== undefined && position.id !== null && position.id !== "") {
    return String(position.id);
  }
  if (position?.brokerPositionId) return String(position.brokerPositionId);
  if (position?.clientOrderId) return String(position.clientOrderId);

  return [
    position?.market || "MARKET",
    position?.symbol || "UNKNOWN",
    position?.openedAt || position?.createdAt || position?.entryDate || "OPEN",
    position?.originalQuantity || position?.initialQuantity || position?.quantity || "QTY",
  ].join(":");
}

function buildIdempotencyKey(position, type) {
  return `${stablePositionKey(position)}:POSITION_MONITOR:${type}`;
}

function buildEvent(position, type, price, options = {}) {
  const remainingQuantity = readRemainingQuantity(position);
  const entryPrice = readEntryPrice(position);
  const precision = options.quantityPrecision ?? position?.quantityPrecision ?? 8;

  if (!remainingQuantity) return null;

  if (type === EVENT_TYPES.TP1) {
    const closeQuantity = roundQuantity(remainingQuantity / 2, precision);
    const quantityAfter = roundQuantity(remainingQuantity - closeQuantity, precision);

    // Birim miktar, bu modülün dışındaki broker/lot adımı kuralıdır. Yine de
    // takipçinin sıfır miktarlı bir exit üretmesini engelliyoruz.
    if (!closeQuantity || !quantityAfter) return null;

    return {
      type,
      event: type,
      executionPrice: price,
      closeQuantity,
      remainingQuantity: quantityAfter,
      newStop: entryPrice,
      idempotencyKey: buildIdempotencyKey(position, type),
      statePatch: {
        status: "OPEN",
        tp1Hit: true,
        quantity: quantityAfter,
        remainingQuantity: quantityAfter,
        stop: entryPrice,
        stopLoss: entryPrice,
      },
    };
  }

  const terminalFlag = type === EVENT_TYPES.TP2 ? "tp2Hit" : "slHit";
  return {
    type,
    event: type,
    executionPrice: price,
    closeQuantity: remainingQuantity,
    remainingQuantity: 0,
    newStop: null,
    idempotencyKey: buildIdempotencyKey(position, type),
    statePatch: {
      status: "CLOSED",
      [terminalFlag]: true,
      quantity: 0,
      remainingQuantity: 0,
    },
  };
}

/*
 * Açık bir LONG pozisyon için tek bir sonraki aksiyonu döndürür veya null
 * döndürür. TP2'ye TP1 işlenmeden doğrudan ulaşılmışsa pozisyonun tamamı TP2
 * olarak kapatılır: 60 sn polling aralığında geçmiş fiyat sırası bilinmediği
 * için riskin açıkta kalmasını önleyen muhafazakâr davranış budur.
 */
function evaluateLongPosition(position, currentPrice, options = {}) {
  const price = positiveNumber(currentPrice);
  if (!isOpenLongPosition(position) || !price) return null;

  const tp1Done = eventAlreadyProcessed(position, EVENT_TYPES.TP1);
  const tp2Done = eventAlreadyProcessed(position, EVENT_TYPES.TP2);
  const slDone = eventAlreadyProcessed(position, EVENT_TYPES.SL);
  if (tp2Done || slDone) return null;

  const target1 = readTarget(position, 1);
  const target2 = readTarget(position, 2);
  const stop = readStopPrice(position);

  // TP2 prioritesi, fiyat iki hedefin üzerine gap yaptığında tek seferde tam
  // kapanış üretir. Böylece TP1 ve TP2 için iki ayrı satış gönderilmez.
  if (target2 && price >= target2) {
    return buildEvent(position, EVENT_TYPES.TP2, price, options);
  }

  if (!tp1Done && target1 && price >= target1) {
    return buildEvent(position, EVENT_TYPES.TP1, price, options);
  }

  if (stop && price <= stop) {
    return buildEvent(position, EVENT_TYPES.SL, price, options);
  }

  return null;
}

function cloneEvents(events) {
  if (Array.isArray(events)) return events.map((entry) => ({...entry}));
  if (events && typeof events === "object") return {...events};
  return {};
}

/*
 * Bu fonksiyon yalnızca broker exit emri başarıyla/fill olarak doğrulandıktan
 * sonra çağrılmalıdır. Aynı olay tekrar gelirse pozisyonu değiştirmeden geri
 * döner; bu da restart sonrası idempotentliği sağlar.
 */
function applyConfirmedMonitorEvent(position, monitorEvent, {timestamp = null} = {}) {
  if (!position || !monitorEvent?.type || !monitorEvent?.statePatch) {
    throw new Error("Doğrulanmış pozisyon takip olayı gerekli.");
  }

  const type = String(monitorEvent.type).toUpperCase();
  if (!Object.values(EVENT_TYPES).includes(type)) {
    throw new Error("Bilinmeyen pozisyon takip olayı.");
  }

  if (eventAlreadyProcessed(position, type)) {
    return {...position};
  }

  const priorMonitor = position.monitor || position.positionMonitor || {};
  const priorEvents = cloneEvents(priorMonitor.events);
  const recordedEvent = {
    type,
    idempotencyKey: monitorEvent.idempotencyKey,
    price: monitorEvent.executionPrice,
    closeQuantity: monitorEvent.closeQuantity,
    remainingQuantity: monitorEvent.remainingQuantity,
    confirmedAt: timestamp || null,
  };

  const events = Array.isArray(priorEvents)
    ? [...priorEvents, recordedEvent]
    : {...priorEvents, [type]: recordedEvent};

  const nextMonitor = {
    ...priorMonitor,
    events,
    lastEvent: type,
    lastEventAt: timestamp || priorMonitor.lastEventAt || null,
  };

  return {
    ...position,
    ...monitorEvent.statePatch,
    monitor: nextMonitor,
  };
}

module.exports = {
  EVENT_TYPES,
  isOpenLongPosition,
  eventAlreadyProcessed,
  evaluateLongPosition,
  applyConfirmedMonitorEvent,
  buildIdempotencyKey,
};
