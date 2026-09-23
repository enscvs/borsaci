const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const app = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");

test("NASDAQ and crypto decision charts share the BIST overlay renderer", () => {
  assert.match(app, /function renderMarketDecisionOverlay\(/);
  assert.match(app, /title: "ALÇALAN TEPE TRENDİ"/);
  assert.match(app, /title: `\$\{label\} RAY`/);
  assert.match(app, /shape, color, text: `\$\{label\} \$\{formatMarkerPrice\(value\)\}`/);
  assert.match(app, /renderMarketDecisionOverlay\(\{chart:nasdaqMarketChart,candleSeries:candles,history:chartCandles,item,plan:nasdaqPlan\(item\),formatMarkerPrice:formatNasdaqUsd\}\)/);
  assert.match(app, /renderMarketDecisionOverlay\(\{chart:cryptoMarketChart,candleSeries:cryptoCandleSeries,history:candles,item,plan,formatMarkerPrice:formatCryptoUsd\}\)/);
});
