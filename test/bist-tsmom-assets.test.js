"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "server.js"), "utf8");
const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
// Execute the actual production asset branches and serveFile, without importing
// server.js (which would start trading workers and external integrations).
const routeStart = source.indexOf("// Feature-local BIST TSMOM assets.");
assert.ok(routeStart >= 0);
const routeEnd = source.indexOf("/*", routeStart);
assert.ok(routeEnd > routeStart);
const fileStart = source.indexOf("function serveFile(");
const fileEnd = source.indexOf("/*", fileStart);
assert.ok(fileStart >= 0 && fileEnd > fileStart);
const serveFile = vm.runInNewContext(
  `${source.slice(fileStart, fileEnd)}; serveFile`,
  {fs, console, sendText(res, status, body) { res.writeHead(status); res.end(body); }}
);
const route = new Function("req", "res", "pathname", "serveFile", "path", "__dirname",
  `${source.slice(routeStart, routeEnd)}\nres.writeHead(404); res.end("Not Found");`);
const assets = [...html.matchAll(/(?:src|href)="(\/bist-tsmom\/[^" ]+)"/g)].map(match => match[1]);
let server, origin;

test.before(async () => {
  server = http.createServer((req, res) => route(req, res,
    new URL(req.url, "http://localhost").pathname, serveFile, path, root));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { await new Promise(resolve => server.close(resolve)); });

test("every BIST asset referenced by the HTML is served with correct MIME and cache headers", async () => {
  assert.equal(assets.length, 3);
  for (const asset of assets) {
    const response = await fetch(origin + asset);
    assert.equal(response.status, 200, `${asset} must not return 404`);
    const pathname = new URL(asset, origin).pathname;
    assert.match(response.headers.get("content-type"), pathname.endsWith(".css") ? /^text\/css/ : /^application\/javascript/);
    assert.equal(response.headers.get("cache-control"), "no-cache");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(await response.text(), fs.readFileSync(path.join(root, "public", pathname), "utf8"));
  }
});

test("HTTP-loaded interaction helper defines the browser API before BIST boot", async () => {
  const helper = assets.find(asset => asset.includes("bist-tsmom-interaction.js"));
  const main = assets.find(asset => asset.includes("/bist-tsmom.js"));
  assert.ok(helper && main);
  assert.ok(html.indexOf(helper) < html.indexOf(main));
  const response = await fetch(origin + helper);
  assert.equal(response.status, 200);
  const browser = {window:{}};
  vm.runInNewContext(await response.text(), browser);
  assert.equal(typeof browser.window.BistTsmomInteraction.createRowSelectionController, "function");
});

test("BIST asset routing does not serve unknown files or POST requests", async () => {
  assert.equal((await fetch(origin + "/bist-tsmom/not-a-public-file.js")).status, 404);
  assert.equal((await fetch(origin + "/bist-tsmom/bist-tsmom-interaction.js", {method:"POST"})).status, 404);
});
