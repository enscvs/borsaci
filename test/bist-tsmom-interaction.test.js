"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { symbolFromTarget, createRowSelectionController } = require("../public/bist-tsmom/bist-tsmom-interaction.js");

function targetInsideRow(symbol) {
  const row = { dataset:{ symbol }, parentElement:null };
  const cell = { dataset:{}, parentElement:row };
  const strong = { dataset:{}, parentElement:cell };
  return { row, strong };
}

test("table text click resolves ASELS row and updates selected symbol", () => {
  const { strong } = targetInsideRow("ASELS");
  let selectedSymbol = null;
  const controller = createRowSelectionController(symbol => { selectedSymbol = symbol; }, () => 1000);
  assert.equal(symbolFromTarget(strong), "ASELS");
  assert.equal(controller.handle({ type:"click", target:strong }), true);
  assert.equal(selectedSymbol, "ASELS");
});

test("second row click replaces selected symbol from ASELS to TUPRS", () => {
  const asels = targetInsideRow("ASELS");
  const tuprs = targetInsideRow("TUPRS");
  let selectedSymbol = null;
  const controller = createRowSelectionController(symbol => { selectedSymbol = symbol; }, () => 1000);
  controller.handle({ type:"click", target:asels.strong });
  assert.equal(selectedSymbol, "ASELS");
  controller.handle({ type:"click", target:tuprs.strong });
  assert.equal(selectedSymbol, "TUPRS");
});

test("mobile touch selects the row once and suppresses synthetic click duplicate", () => {
  const { strong } = targetInsideRow("ASELS");
  let now = 1000;
  let calls = 0;
  let selectedSymbol = null;
  const controller = createRowSelectionController(symbol => { calls += 1; selectedSymbol = symbol; }, () => now);
  assert.equal(controller.handle({ type:"pointerup", pointerType:"touch", target:strong }), true);
  assert.equal(selectedSymbol, "ASELS");
  now = 1100;
  assert.equal(controller.handle({ type:"click", target:strong }), false);
  assert.equal(calls, 1);
});

test("desktop pointerup defers selection to click", () => {
  const { strong } = targetInsideRow("ASELS");
  let calls = 0;
  const controller = createRowSelectionController(() => { calls += 1; }, () => 0);
  assert.equal(controller.handle({ type:"pointerup", pointerType:"mouse", target:strong }), false);
  assert.equal(controller.handle({ type:"click", target:strong }), true);
  assert.equal(calls, 1);
});
