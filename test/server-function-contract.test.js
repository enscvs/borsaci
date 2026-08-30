const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const appSource = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");

test("BIST and quantity-based paper close implementations cannot shadow each other", () => {
  assert.equal((source.match(/function closeBistPaperPosition\s*\(/g) || []).length, 1);
  assert.equal((source.match(/function closeMonitoredPaperPosition\s*\(/g) || []).length, 1);
  assert.match(source, /closeBistPaperPosition\(\s*state,\s*position,/);
});

test("optional AI providers do not construct clients without credentials", () => {
  assert.match(source, /function createOptionalAiClient\(apiKey, baseURL\)/);
  assert.match(source, /return apiKey \? new OpenAI\(\{apiKey, baseURL\}\) : null/);
});

test("Telegram delivery is recorded only after successful sends", () => {
  assert.match(source, /status: "FAILED_RETRYABLE"/);
  assert.match(source, /if \(await sendTelegramNotification\(monitoringTelegramMessage\(event\), null, \{queueOnFailure:false\}\)\) deliveredEvents\.push\(event\)/);
  assert.match(source, /for \(const notification of openingNotifications\)/);
});

test("live BIST scan exposes precision data-quality validation", () => {
  assert.match(source, /precisionEngine\.validateHistory\(history, \{requireComplete:false\}\)/);
  assert.match(source, /status:"VALIDATED", dataQuality:"PASSED", calibration:"KALIBRE_EDILMEDI"/);
});

test("NASDAQ broker approvals are serialized and broker limit orders are submitted", () => {
  assert.match(source, /nasdaq-paper-approve/);
  assert.match(source, /!ALPACA_TRADING_ENABLED && order\.orderType === "LIMIT"/);
  assert.match(source, /clientOrderId = order\.clientOrderId \|\| `bci-entry-/);
  assert.match(source, /if \(!brokerOrderId\) throw new Error/);
  assert.match(source, /occupiedSlots >= maxPositions/);
  assert.match(source, /reservedCash/);
});

test("crypto safety readiness requires a real Binance account response", () => {
  assert.match(source, /async function handleCryptoSpotSafety/);
  assert.match(source, /const account = await fetchBinanceSpotAccount\(\)/);
  assert.doesNotMatch(source, /connected: Boolean\(BINANCE_API_KEY && BINANCE_API_SECRET\)/);
});

test("NASDAQ scanner decisions are deduplicated and Alpaca entries receive emergency stops", () => {
  assert.match(source, /function mergeNasdaqScannerDecisions/);
  assert.match(source, /paper\.decisions=mergeNasdaqScannerDecisions\(decisions,paper\.decisions\.filter\(item=>!activePositionSymbols\.has\(item\.symbol\)\),timestamp\)/);
  assert.match(source, /async function placeNasdaqEmergencyStop/);
  assert.match(source, /async function reconcileNasdaqEmergencyStop/);
  assert.match(source, /time_in_force:"gtc"/);
  assert.match(source, /await cancelNasdaqEmergencyStop\(position, timestamp\)/);
});

test("NASDAQ analysis snapshot stays separate from mutable order state", () => {
  assert.match(source, /const order = normalizeNasdaqPaperOrder\(\s*\{\.\.\.decision\.pendingOrder, symbol:decision\.symbol\}/);
  assert.match(appSource, /const snapshots = Array\.isArray\(records\) \? records\.filter\(Boolean\)\.slice\(0, 3\) : \[\]/);
  assert.doesNotMatch(appSource, /\{\.\.\.\(bySymbol\.get\(decision\.symbol\) \|\| \{\}\), \.\.\.decision/);
  assert.match(appSource, /async function loadNasdaqPaperState\(\{loadAnalysis = false\} = \{\}\)/);
  assert.match(appSource, /void loadNasdaqPaperState\(\{loadAnalysis:true\}\)/);
});

