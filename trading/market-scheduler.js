"use strict";

/*
 * Ortak piyasa zamanlayıcısı.
 *
 * Bu modül yalnızca iş planlamasını yapar; HTTP, GitHub state veya broker
 * çağrılarını bilmez. Böylece BIST, NASDAQ veya kripto tarafındaki tekil bir
 * hata diğer piyasanın saatlik çalışmasını durdurmaz.
 */

const MARKETS = Object.freeze(["BIST", "CRYPTO", "NASDAQ"]);

function zonedParts(value, timeZone) {
  const date = value instanceof Date ? value : new Date(value);
  const result = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const byType = Object.fromEntries(result.map((item) => [item.type, item.value]));
  return {
    weekday: byType.weekday,
    hour: Number(byType.hour),
    minute: Number(byType.minute),
  };
}

function isWeekday(weekday) {
  return weekday !== "Sat" && weekday !== "Sun";
}

function isBistMarketOpen(value = new Date()) {
  const {weekday, hour, minute} = zonedParts(value, "Europe/Istanbul");
  if (!isWeekday(weekday)) return false;
  const clock = hour * 60 + minute;
  return clock >= 10 * 60 && clock < 18 * 60;
}

function isNasdaqMarketOpen(value = new Date()) {
  const {weekday, hour, minute} = zonedParts(value, "America/New_York");
  if (!isWeekday(weekday)) return false;
  const clock = hour * 60 + minute;
  return clock >= 9 * 60 + 30 && clock < 16 * 60;
}

function marketIsEligibleNow(market, value = new Date()) {
  switch (String(market || "").toUpperCase()) {
    case "CRYPTO":
      return true;
    case "BIST":
      return isBistMarketOpen(value);
    case "NASDAQ":
      return isNasdaqMarketOpen(value);
    default:
      return false;
  }
}

function nextTopOfHour(value = new Date()) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + 1);
  return date;
}

function hourKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}T${String(date.getUTCHours()).padStart(2, "0")}`;
}

class MarketScheduler {
  constructor({runMarket, onResult = null, now = () => new Date(), logger = console} = {}) {
    if (typeof runMarket !== "function") throw new Error("MarketScheduler için runMarket fonksiyonu gerekli.");
    this.runMarket = runMarket;
    this.onResult = typeof onResult === "function" ? onResult : null;
    this.now = now;
    this.logger = logger || console;
    this.inFlight = new Set();
    this.status = Object.fromEntries(MARKETS.map((market) => [market, {
      market,
      running: false,
      lastRunAt: null,
      lastSuccessAt: null,
      lastError: null,
      lastErrorAt: null,
      lastSkippedAt: null,
      nextRunAt: nextTopOfHour(this.now()).toISOString(),
    }]));
    this.timer = null;
  }

  getStatus() {
    return JSON.parse(JSON.stringify(this.status));
  }

  async runMarketOnce(market, {force = false, timestamp = this.now()} = {}) {
    const normalized = String(market || "").toUpperCase();
    if (!MARKETS.includes(normalized)) throw new Error("Bilinmeyen piyasa zamanlayıcısı.");
    const state = this.status[normalized];
    state.nextRunAt = nextTopOfHour(timestamp).toISOString();

    if (this.inFlight.has(normalized)) {
      return {market: normalized, skipped: true, reason: "IN_FLIGHT"};
    }
    if (!force && !marketIsEligibleNow(normalized, timestamp)) {
      state.lastSkippedAt = timestamp.toISOString();
      return {market: normalized, skipped: true, reason: "MARKET_CLOSED"};
    }

    this.inFlight.add(normalized);
    state.running = true;
    state.lastRunAt = timestamp.toISOString();
    try {
      const result = await this.runMarket(normalized, {timestamp, hourKey: hourKey(timestamp)});
      state.lastSuccessAt = new Date(this.now()).toISOString();
      state.lastError = null;
      state.lastErrorAt = null;
      const response = {market: normalized, skipped: false, result};
      if (this.onResult) await this.onResult(response);
      return response;
    } catch (error) {
      state.lastError = String(error?.message || "Piyasa taraması başarısız.").slice(0, 500);
      state.lastErrorAt = new Date(this.now()).toISOString();
      const response = {market: normalized, skipped: false, error};
      if (this.onResult) await this.onResult(response);
      return response;
    } finally {
      state.running = false;
      this.inFlight.delete(normalized);
    }
  }

  async runHourly({timestamp = this.now()} = {}) {
    // Sıralı çalışma Render'ın küçük instance'ında API ve bellek baskısını
    // azaltır; her piyasanın hatası kendi sonucu olarak yutulur.
    const results = [];
    for (const market of MARKETS) {
      results.push(await this.runMarketOnce(market, {timestamp}));
    }
    return results;
  }

  scheduleNext() {
    if (this.timer) clearTimeout(this.timer);
    const now = this.now();
    const next = nextTopOfHour(now);
    const delay = Math.max(1000, next.getTime() - now.getTime() + 250);
    for (const state of Object.values(this.status)) state.nextRunAt = next.toISOString();
    this.timer = setTimeout(async () => {
      try {
        await this.runHourly({timestamp: this.now()});
      } finally {
        this.scheduleNext();
      }
    }, delay);
    return next;
  }

  start() {
    return this.scheduleNext();
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

function createMarketScheduler(options) {
  return new MarketScheduler(options);
}

module.exports = {
  MARKETS,
  zonedParts,
  isBistMarketOpen,
  isNasdaqMarketOpen,
  marketIsEligibleNow,
  nextTopOfHour,
  hourKey,
  MarketScheduler,
  createMarketScheduler,
};
