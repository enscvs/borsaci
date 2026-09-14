"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {parseBistIndexCsv, fetchOfficialBistUniverse, clearBistUniverseCache, OFFICIAL_BIST_INDEX_CSV_URL} = require("../trading/bist-universe");

const csv = [
  "BİLEŞEN KODU;BÜLTEN_ADI;ENDEKS KODU;ENDEKS ADI",
  "COMPONENT CODE;NAME;INDEX CODE;INDEX NAME",
  "THYAO.E;TURK HAVA YOLLARI;XUTUM;BIST TUM",
  "THYAO.E;TURK HAVA YOLLARI;XU100;BIST 100",
  "ASELS.E;ASELSAN;XUTUM;BIST TUM",
].join("\n");

test("official BIST CSV parser selects and deduplicates XUTUM components", () => {
  assert.deepEqual(parseBistIndexCsv(csv, "XUTUM"), ["ASELS", "THYAO"]);
});

test("official BIST universe loader falls back instead of returning a partial list", async () => {
  clearBistUniverseCache();
  const result = await fetchOfficialBistUniverse({
    fetchImpl:async url => { assert.equal(url, OFFICIAL_BIST_INDEX_CSV_URL); return {ok:true,text:async()=>csv}; },
    fallback:["THYAO","ASELS"],
  });
  assert.equal(result.fallback, true);
  assert.deepEqual(result.symbols, ["THYAO","ASELS"]);
});

