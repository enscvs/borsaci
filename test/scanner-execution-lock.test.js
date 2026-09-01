"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {createMarketScheduler} = require("../trading/market-scheduler");
const {ScannerExecutionRegistry, runWithScannerExecution} = require("../trading/scanner-execution-lock");

function bistScheduler(registry, worker) {
  return createMarketScheduler({
    now: () => new Date("2026-08-28T12:00:00.000Z"),
    runMarket: market => runWithScannerExecution(registry, market, worker),
  });
}

test("hourly BIST scan success releases lock so manual scan can start", async () => {
  const registry = new ScannerExecutionRegistry();
  await bistScheduler(registry, async () => "ok").runMarketOnce("BIST", {force:true});
  const manualToken = registry.acquire("BIST");
  assert.ok(manualToken);
  registry.release("BIST", manualToken);
});

test("hourly BIST scan error releases lock so manual scan can start", async () => {
  const registry = new ScannerExecutionRegistry();
  await bistScheduler(registry, async () => { throw new Error("scanner failed"); }).runMarketOnce("BIST", {force:true});
  const manualToken = registry.acquire("BIST");
  assert.ok(manualToken);
  registry.release("BIST", manualToken);
});

test("state save error still releases BIST scanner lock", async () => {
  const registry = new ScannerExecutionRegistry();
  const outcome = await runWithScannerExecution(registry, "BIST", async () => { throw new Error("state save failed"); }).catch(error => error);
  assert.equal(outcome.message, "state save failed");
  const manualToken = registry.acquire("BIST");
  assert.ok(manualToken);
  registry.release("BIST", manualToken);
});

test("real concurrent manual BIST scan blocks the second scan", async () => {
  const registry = new ScannerExecutionRegistry();
  const first = registry.acquire("BIST");
  assert.ok(first);
  assert.equal(registry.acquire("BIST"), null);
  assert.equal(registry.isActive("BIST"), true);
  registry.release("BIST", first);
});

test("stale BIST scanner lock is automatically recovered", () => {
  let now = 1_000_000;
  const registry = new ScannerExecutionRegistry({now:() => now, maxAgeMs:60_000});
  const staleToken = registry.acquire("BIST");
  now += 60_001;
  const recoveredToken = registry.acquire("BIST");
  assert.ok(recoveredToken);
  assert.notEqual(recoveredToken, staleToken);
  assert.equal(registry.release("BIST", staleToken), false);
  assert.equal(registry.isActive("BIST"), true);
  registry.release("BIST", recoveredToken);
});

test("automated scanner invokes handler outside the state mutation queue", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  const start = source.indexOf("async function runAutomatedMarketScanner");
  const end = source.indexOf("const marketScheduler", start);
  const body = source.slice(start, end);
  assert.match(body, /await invokeMarketScanner\(normalized(?:, \{forceRefresh:true\})?\)/);
  assert.match(body, /withTradingStateMutation\(`scanner-result:\$\{normalized\}`/);
  assert.doesNotMatch(body, /withTradingStateMutation\(`scanner:\$\{normalized\}`/);
  assert.match(source, /Object\.assign\(target, status, \{running:false\}\)/);
});

