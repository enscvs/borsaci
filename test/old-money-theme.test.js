const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const css = fs.readFileSync(path.join(root, "public", "style.css"), "utf8");
const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "public", "app.js"), "utf8");

test("old money palette is centralized and terminal scanlines are disabled", () => {
  for (const color of ["#0F1611", "#1C2B22", "#17231B", "#E8E2D0", "#B0B5A3", "#394B3E", "#C9A15A", "#7FA88A", "#BC7974", "#D8BB80"]) {
    assert.match(css, new RegExp(color));
  }
  assert.match(css, /body::before\s*,\s*\.terminal::before\s*\{\s*content:\s*none !important;\s*display:\s*none !important;/);
});

test("theme cache version and canvas palette use the old money colors", () => {
  assert.match(html, /style\.css\?v=20260923-crypto-paper/);
  assert.match(html, /app\.js\?v=20260923-crypto-paper/);
  assert.match(html, /theme-color" content="#0F1611"/);
  assert.match(app, /const OLD_MONEY_CHART = Object\.freeze/);
  assert.match(app, /positive: "#7FA88A"/);
  assert.match(app, /negative: "#BC7974"/);
});
