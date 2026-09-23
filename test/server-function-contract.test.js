const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const appSource = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
const htmlSource = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

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

test("Precision insights stay informational and NASDAQ requires complete long history", () => {
  assert.match(source, /affectsScore:false/);
  assert.match(source, /attachPrecisionInsights\(shortlist\.sort\(compareNasdaqCandidate\),await benchmarkPromise,"NASDAQ"\)/);
  assert.match(source, /minDailyBars:252/);
  assert.doesNotMatch(source, /minDailyBars:40/);
});

test("BIST scanner uses the official dynamic XUTUM universe", () => {
  assert.match(source, /fetchOfficialBistUniverse\(\{fallback:BIST_UNIVERSE_FALLBACK_SYMBOLS\}\)/);
  assert.match(source, /bistUniverse\.symbols/);
  assert.doesNotMatch(source, /const BIST100_SYMBOLS/);
});

test("NASDAQ broker approvals are serialized and broker limit orders are submitted", () => {
  assert.match(source, /nasdaq-paper-approve/);
  assert.match(source, /!ALPACA_TRADING_ENABLED && order\.orderType === "LIMIT"/);
  assert.match(source, /clientOrderId = order\.clientOrderId \|\| `bci-entry-/);
  assert.match(source, /if \(!brokerOrderId\) throw new Error/);
  assert.match(source, /occupiedSlots >= maxPositions/);
  assert.match(source, /reservedCash/);
});

test("crypto trading is paper-only while public Binance market data remains available", () => {
  assert.match(source, /function handleCryptoPaperOnly\(/);
  assert.match(source, /code: "CRYPTO_PAPER_ONLY"/);
  assert.match(source, /pathname === "\/api\/crypto\/quotes"\) return handleCryptoQuotes/);
  assert.match(source, /pathname === "\/api\/trading\/crypto\/order"\) return handleCryptoPaperOnly/);
  assert.doesNotMatch(source, /const cryptoLiveChanged = await monitorCryptoLiveTrading/);
  assert.doesNotMatch(appSource, /void loadCryptoSpotAccount\(\)/);
  assert.doesNotMatch(appSource, /bindCryptoLiveTrading\(\);/);
  assert.match(htmlSource, /<div id="cryptoPaperWorkspace">/);
  assert.match(htmlSource, /id="cryptoLiveOrderPanel"[^>]*hidden/);
  assert.match(htmlSource, /id="cryptoSpotAccountPanel"[^>]*hidden/);
  assert.match(appSource, /KÂĞIT EMİR PLANI OLUŞTUR/);
  assert.doesNotMatch(appSource, /CANLI EMİR FORMUNA AKTAR/);
});

test("NASDAQ scanner decisions are deduplicated and Alpaca entries receive emergency stops", () => {
  assert.match(source, /function mergeNasdaqScannerDecisions/);
  assert.match(source, /paper\.decisions=mergeNasdaqScannerDecisions\(decisions,paper\.decisions\.filter\(item=>!activePositionSymbols\.has\(item\.symbol\)\),timestamp\)/);
  assert.match(source, /async function placeNasdaqEmergencyStop/);
  assert.match(source, /async function reconcileNasdaqEmergencyStop/);
  assert.match(source, /time_in_force:"gtc"/);
  assert.match(source, /await cancelNasdaqEmergencyStop\(position, timestamp\)/);
  assert.match(source, /position\?\.broker\?\.protectionSuppressed/);
  assert.match(source, /const manuallyCancelled = status === "canceled"/);
  assert.match(source, /otomatik yeniden kurulum durduruldu/);
});

test("NASDAQ analysis snapshot stays separate from mutable order state", () => {
  assert.match(source, /const order = normalizeNasdaqPaperOrder\(\s*\{\.\.\.decision\.pendingOrder, symbol:decision\.symbol\}/);
  assert.match(appSource, /const snapshots = Array\.isArray\(records\) \? records\.filter\(Boolean\)\.slice\(0, 3\) : \[\]/);
  assert.doesNotMatch(appSource, /\{\.\.\.\(bySymbol\.get\(decision\.symbol\) \|\| \{\}\), \.\.\.decision/);
  assert.match(appSource, /async function loadNasdaqPaperState\(\{loadAnalysis = false\} = \{\}\)/);
  assert.match(appSource, /void loadNasdaqPaperState\(\{loadAnalysis:true\}\)/);
});

test("broker partial fills remain tracked and NASDAQ controls stay recoverable", () => {
  assert.match(source, /CRYPTO_LIVE_ENTRY_PARTIAL/);
  assert.match(source, /NASDAQ_BROKER_ENTRY_PARTIAL/);
  assert.match(source, /accountedCost:cumulativeCost/);
  assert.match(source, /executedQuantity:executed/);
  assert.match(source, /brokerPendingEntries:/);
  assert.match(source, /handleNasdaqBrokerEntryCancel/);
  assert.match(source, /handleNasdaqProtectionEnable/);
  assert.match(source, /fetchAlpacaTradingAccount/);
  assert.match(appSource, /data-nasdaq-broker-cancel/);
  assert.match(appSource, /data-nasdaq-protection-enable/);
});

test("NASDAQ broker reconciliation discovers only BorsaCI Alpaca orders", () => {
  assert.match(source, /async function reconcileNasdaqBrokerState/);
  assert.match(source, /\^bci-\(\?:entry\|stop\|nasd\)-/);
  assert.match(source, /nasdaq-startup-reconcile/);
  assert.match(source, /\/api\/nasdaq\/broker\/reconcile/);
  assert.match(source, /brokerReconciliation = \{timestamp, reason, discovered, linked, updated, managedOrders:orders\.length\}/);
  assert.match(appSource, /BROKER İLE UZLAŞTIR/);
  assert.match(appSource, /data-nasdaq-broker-reconcile-status/);
});

