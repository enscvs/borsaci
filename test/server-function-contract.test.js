const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");

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

