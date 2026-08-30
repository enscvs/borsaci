"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {normalizeNewsItems, normalizeAiReviews} = require("../trading/news-review");

test("news normalization keeps only dated recent headlines", () => {
  const now = Date.parse("2026-08-30T12:00:00.000Z");
  const rows = [
    {title:"recent",publisher:"source",providerPublishTime:Math.floor(Date.parse("2026-08-29T12:00:00.000Z")/1000)},
    {title:"old",publisher:"source",providerPublishTime:Math.floor(Date.parse("2026-06-01T12:00:00.000Z")/1000)},
    {title:"undated",publisher:"source"},
  ];
  assert.deepEqual(normalizeNewsItems(rows,{now}).map(item=>item.title),["recent"]);
});

test("AI review normalization ignores unrequested symbols and decision fields", () => {
  const reviews = normalizeAiReviews({reviews:[
    {symbol:"ASELS",score:100,verdict:"APPROVE",newsComment:"haber",summary:"özet"},
    {symbol:"OTHER",newsComment:"ignore"},
  ]},["ASELS"],"TEST");
  assert.equal(reviews.size,1);
  assert.equal(reviews.get("ASELS").score,null);
  assert.equal(reviews.get("ASELS").verdict,"INFO");
});

