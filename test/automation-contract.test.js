"use strict";

/*
 * Otomatik is akisi sozlesmesi.
 *
 * Bu test, HTTP/server bagimliligi olmadan iki kritik siniri korur:
 * - scanner sadece tamamlanmis gunluk mumlari gorur;
 * - 60 sn pozisyon izleyicisi ise anlik fiyatla ayri calisabilir.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {completedDailyBars} = require("../trading/alpaca-provider");
const fibonacci = require("../trading/fibonacci-engine");
const {createMarketScheduler} = require("../trading/market-scheduler");
const {evaluateLongPosition, applyConfirmedMonitorEvent} = require("../trading/position-monitor");
const {compareScannerSnapshots} = require("../trading/scanner-delta");

function dailyBar(time, close) {
  return {
    time: Math.floor(new Date(time).getTime() / 1000),
    open: close - 1,
    high: close + 1,
    low: close - 2,
    close,
    volume: 1_000,
  };
}

test("scanner veri kapisi tamamlanmamis gunluk mumu tum piyasalarda disarida birakir", () => {
  const nasdaqNow = Date.parse("2026-08-28T15:00:00.000Z"); // 11:00 New York, seans acik
  const alpacaBars = completedDailyBars([
    {t: "2026-08-27T04:00:00.000Z", o: 100, h: 103, l: 99, c: 102, v: 1_000},
    {t: "2026-08-28T04:00:00.000Z", o: 102, h: 106, l: 101, c: 105, v: 1_100},
  ], nasdaqNow);
  assert.deepEqual(alpacaBars.map((bar) => bar.close), [102]);

  const bistHistory = [
    // 21:00Z Istanbul'da bir sonraki gun 00:00'a denk gelir. Onceki
    // tamamlanmis BIST gununu temsil etmesi icin bir gun geri aliyoruz.
    dailyBar("2026-08-26T21:00:00.000Z", 100),
    dailyBar("2026-08-28T21:00:00.000Z", 105),
  ];
  const beforeBistClose = Date.parse("2026-08-28T12:00:00.000Z"); // 15:00 Istanbul
  assert.deepEqual(
    fibonacci.completedDailyHistory(bistHistory, beforeBistClose).map((bar) => bar.close),
    [100],
  );

  const cryptoHistory = [
    dailyBar("2026-08-27T23:59:59.000Z", 100), // tamamlanmis Binance gunlugu
    dailyBar("2026-08-29T23:59:59.000Z", 105), // gelecekte / tamamlanmamis
  ];
  assert.deepEqual(
    fibonacci.completedDailyHistory(cryptoHistory, nasdaqNow, {market: "CRYPTO"}).map((bar) => bar.close),
    [100],
  );
});

test("saatlik scanner gunluk snapshot uretirken pozisyon izleyicisi anlik TP1 ve TP2yi ayri uygular", async () => {
  const schedulerTime = new Date("2026-08-29T10:00:00.000Z"); // Cumartesi: CRYPTO force ile deterministik
  const dailyHistory = [
    dailyBar("2026-08-27T23:59:59.000Z", 100),
    dailyBar("2026-08-30T23:59:59.000Z", 999), // scanner'a asla girmemeli
  ];
  const snapshots = [];
  const scheduler = createMarketScheduler({
    now: () => schedulerTime,
    runMarket: async (market, context) => {
      assert.equal(market, "CRYPTO");
      const completed = fibonacci.completedDailyHistory(dailyHistory, context.timestamp.getTime(), {market});
      const snapshot = {
        timestamp: context.timestamp.toISOString(),
        topCandidates: [{symbol: "BTCUSDT", score: completed.at(-1).close, action: "WAIT"}],
      };
      snapshots.push(snapshot);
      return snapshot;
    },
  });

  const firstRun = await scheduler.runMarketOnce("CRYPTO", {force: true, timestamp: schedulerTime});
  assert.equal(firstRun.skipped, false);
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].topCandidates[0].score, 100);

  const position = {
    id: "crypto-open-1",
    market: "CRYPTO",
    symbol: "BTCUSDT",
    status: "OPEN",
    side: "LONG",
    entryPrice: 100,
    quantity: 2,
    remainingQuantity: 2,
    stop: 95,
    target1: 110,
    target2: 120,
  };

  // 60 saniyelik takipte anlik fiyat kullanmak scanner'in gunluk mum
  // kontratini ihlal etmez: bu sadece acik pozisyonun cikis olayi.
  const tp1 = evaluateLongPosition(position, 111);
  assert.equal(tp1.type, "TP1");
  const afterTp1 = applyConfirmedMonitorEvent(position, tp1, {timestamp: "2026-08-29T10:00:30.000Z"});
  assert.equal(afterTp1.remainingQuantity, 1);
  assert.equal(afterTp1.stop, 100);

  const tp2 = evaluateLongPosition(afterTp1, 121);
  assert.equal(tp2.type, "TP2");
  const closed = applyConfirmedMonitorEvent(afterTp1, tp2, {timestamp: "2026-08-29T10:01:30.000Z"});
  assert.equal(closed.status, "CLOSED");
  assert.equal(closed.remainingQuantity, 0);
});

test("ayni tamamlanmis gunluk snapshot telegram farki uretmez ve yeniden calismada TP1 tekrar etmez", async () => {
  const previous = {
    topCandidates: [{symbol: "SOLUSDT", score: 76, action: "BUY SETUP"}],
  };
  const next = {
    topCandidates: [{symbol: "SOLUSDT", score: 76, action: "BUY SETUP"}],
  };
  const delta = compareScannerSnapshots(previous, next);
  assert.equal(delta.hasMeaningfulChanges, false);

  const position = {
    id: "restart-safe-tp1",
    status: "OPEN",
    side: "LONG",
    entryPrice: 50,
    quantity: 4,
    remainingQuantity: 4,
    stop: 45,
    target1: 55,
    target2: 60,
  };
  const firstEvent = evaluateLongPosition(position, 56);
  const afterConfirmedTp1 = applyConfirmedMonitorEvent(position, firstEvent);
  assert.equal(afterConfirmedTp1.tp1Hit, true);
  assert.equal(evaluateLongPosition(afterConfirmedTp1, 56), null);
});
