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

