"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const monitor = require("../trading/position-monitor");

function openPosition(overrides = {}) {
  return {
    id: "position-1",
    market: "BIST",
    symbol: "ALARK",
    status: "OPEN",
    side: "LONG",
    entryPrice: 100,
    quantity: 100,
    remainingQuantity: 100,
    stop: 95,
    target1: 110,
    target2: 120,
    ...overrides,
  };
}

test("TP1 once closes half and moves remaining stop to entry without mutating position", () => {
  const position = Object.freeze(openPosition());
  const event = monitor.evaluateLongPosition(position, 110);

  assert.equal(event.type, "TP1");
  assert.equal(event.closeQuantity, 50);
  assert.equal(event.remainingQuantity, 50);
  assert.equal(event.newStop, 100);
  assert.equal(event.statePatch.stop, 100);
  assert.equal(position.quantity, 100);
  assert.equal(position.stop, 95);

  const afterTp1 = monitor.applyConfirmedMonitorEvent(position, event, {
    timestamp: "2026-08-28T10:00:00.000Z",
  });
  assert.equal(afterTp1.tp1Hit, true);
  assert.equal(afterTp1.quantity, 50);
  assert.equal(afterTp1.remainingQuantity, 50);
  assert.equal(afterTp1.stop, 100);
  assert.ok(afterTp1.monitor.events.TP1);
  assert.equal(monitor.evaluateLongPosition(afterTp1, 110), null);
});

test("TP2 closes the remaining quantity after TP1", () => {
  const afterTp1 = monitor.applyConfirmedMonitorEvent(
    openPosition(),
    monitor.evaluateLongPosition(openPosition(), 111),
  );
  const event = monitor.evaluateLongPosition(afterTp1, 120);

  assert.equal(event.type, "TP2");
  assert.equal(event.closeQuantity, 50);
  assert.equal(event.remainingQuantity, 0);

  const closed = monitor.applyConfirmedMonitorEvent(afterTp1, event);
  assert.equal(closed.status, "CLOSED");
  assert.equal(closed.tp2Hit, true);
  assert.equal(closed.quantity, 0);
  assert.equal(monitor.evaluateLongPosition(closed, 130), null);
});

test("SL closes only the remaining quantity and is idempotent after restart", () => {
  const initial = openPosition();
  const afterTp1 = monitor.applyConfirmedMonitorEvent(
    initial,
    monitor.evaluateLongPosition(initial, 111),
  );

  const event = monitor.evaluateLongPosition(afterTp1, 100);
  assert.equal(event.type, "SL");
  assert.equal(event.closeQuantity, 50);
  assert.equal(event.remainingQuantity, 0);

  const closed = monitor.applyConfirmedMonitorEvent(afterTp1, event, {
    timestamp: "2026-08-28T10:02:00.000Z",
  });
  assert.equal(closed.status, "CLOSED");
  assert.equal(closed.slHit, true);
  assert.equal(monitor.evaluateLongPosition(closed, 90), null);

  const replayed = monitor.applyConfirmedMonitorEvent(closed, event);
  assert.deepEqual(replayed, closed);
});

test("a gap directly above TP2 emits one full TP2 close rather than duplicate exits", () => {
  const event = monitor.evaluateLongPosition(openPosition(), 125);

  assert.equal(event.type, "TP2");
  assert.equal(event.closeQuantity, 100);
  assert.equal(event.remainingQuantity, 0);
});

test("invalid price, closed positions, and already processed events produce no action", () => {
  assert.equal(monitor.evaluateLongPosition(openPosition(), "not-a-price"), null);
  assert.equal(monitor.evaluateLongPosition(openPosition({status: "CLOSED"}), 120), null);
  assert.equal(monitor.evaluateLongPosition(openPosition({tp1Hit: true}), 111), null);
  assert.equal(monitor.evaluateLongPosition(openPosition({monitor: {events: {SL: {}}}}), 90), null);
});
