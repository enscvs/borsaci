"use strict";

const OFFICIAL_BIST_INDEX_CSV_URL = "https://borsaistanbul.com/datum/hisse_endeks_ds.csv";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let cached = null;

function splitCsvLine(line) {
  const cells = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && line[index + 1] === '"' && quoted) { value += '"'; index += 1; continue; }
    if (character === '"') { quoted = !quoted; continue; }
    if (character === ";" && !quoted) { cells.push(value.trim()); value = ""; continue; }
    value += character;
  }
  cells.push(value.trim());
  return cells;
}

function normalizeHeader(value) {
  return String(value || "").replace(/^\uFEFF/, "").trim().toLocaleUpperCase("tr-TR");
}

function parseBistIndexCsv(text, indexCode = "XUTUM") {
  const lines = String(text || "").split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map(normalizeHeader);
  const symbolColumn = headers.indexOf("BİLEŞEN KODU") >= 0 ? headers.indexOf("BİLEŞEN KODU") : headers.indexOf("BILESEN KODU");
  const indexColumn = headers.indexOf("ENDEKS KODU");
  if (symbolColumn < 0 || indexColumn < 0) return [];
  const wanted = String(indexCode || "XUTUM").trim().toUpperCase();
  return [...new Set(lines.slice(1).map(splitCsvLine)
    .filter(cells => String(cells[indexColumn] || "").trim().toUpperCase() === wanted)
    .map(cells => String(cells[symbolColumn] || "").trim().toUpperCase().replace(/\.E$/, ""))
    .filter(symbol => /^[A-Z0-9]{3,10}$/.test(symbol)))]
    .sort((left, right) => left.localeCompare(right, "en"));
}

async function fetchOfficialBistUniverse({fetchImpl = globalThis.fetch, fallback = [], now = Date.now()} = {}) {
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) return {...cached, symbols:[...cached.symbols]};
  try {
    const response = await fetchImpl(OFFICIAL_BIST_INDEX_CSV_URL, {
      headers: {"User-Agent":"Mozilla/5.0 BorsaCI/1.0", "Accept":"text/csv,text/plain,*/*"},
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error(`Borsa İstanbul HTTP ${response.status}`);
    const symbols = parseBistIndexCsv(await response.text(), "XUTUM");
    // XUTUM yüzlerce pay içerir. Çok küçük sonuç, sütun/kaynak değişikliği
    // olarak değerlendirilir ve eksik evrenle sessiz tarama yapılmaz.
    if (symbols.length < 100) throw new Error("Borsa İstanbul XUTUM listesi doğrulanamadı.");
    cached = {symbols, source:"BORSA_ISTANBUL_XUTUM", sourceUrl:OFFICIAL_BIST_INDEX_CSV_URL, fetchedAt:now, fallback:false};
    return {...cached, symbols:[...symbols]};
  } catch (error) {
    const symbols = [...new Set((fallback || []).map(value => String(value).trim().toUpperCase()).filter(value => /^[A-Z0-9]{3,10}$/.test(value)))];
    return {symbols, source:"BUILT_IN_BIST_FALLBACK", sourceUrl:OFFICIAL_BIST_INDEX_CSV_URL, fetchedAt:now, fallback:true, error:error.message};
  }
}

function clearBistUniverseCache() { cached = null; }

module.exports = {OFFICIAL_BIST_INDEX_CSV_URL, parseBistIndexCsv, fetchOfficialBistUniverse, clearBistUniverseCache};

