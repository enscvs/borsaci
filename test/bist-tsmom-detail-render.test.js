"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const assert = require("node:assert/strict");

function element() {
  return { dataset:{}, listeners:{}, innerHTML:"", textContent:"", className:"", disabled:false,
    addEventListener(type, handler) { this.listeners[type] = handler; },
    setAttribute() {}, querySelectorAll() { return []; }
  };
}

function row(symbol, rank) {
  return { symbol, companyName:`${symbol} A.Ş.`, tsmomRank:rank, status:"SELECTED", selectionReason:"TSMOM > 0; Rank <= 30", currentPrice:95.4, currentPriceTimestamp:"2026-09-24T18:15:00.000Z", currentMonthEndClose:95.4, currentMonthEndDate:"2026-08-31", referenceClose:52.1, referenceDate:"2025-08-31", absolutePriceDifference:43.3, tsmom:83.109, dataQuality:"PRICE_OK · REFERENCE_OK · TECHNICAL_DATA_OK", executionReferencePrice:95.4, targetLot:34, currentLot:10, deltaLot:24, requiredAction:"BUY", currentMarketValue:954, targetMarketValue:3243.6, residualCashContribution:89.733333333, technical:{sma20:90,sma50:85,sma100:80,sma200:70,ema20:91,ema50:86,ema100:81,ema200:71,rsi14:55,macd:2,macdSignal:1,macdHistogram:1,atr14:3,atrPercent:3.1,volatility20:20,volatility60:25,high52:100,low52:50,distanceHigh52:-4.6,distanceLow52:90.8,return20:5,return50:7,return100:10,return200:20,averageVolume20:1000,latestVolume:1200,volumeRatio:1.2} };
}

test("BIST table click renders ASELS detail then replaces it with TUPRS", async () => {
  const ids = ["bistTsmomStatus","bistTsmomSummary","bistTsmomFilter","bistTsmomSearch","bistTsmomRefresh","bistTsmomRows","bistTsmomHead","bistTsmomBody","bistTsmomDetailSymbol","bistTsmomDetail","bistTsmomRebalance","bistTsmomHistory"];
  const elements = Object.fromEntries(ids.map(id => [id, element()]));
  const root = element();
  const document = { getElementById(id) { return id === "tradingTab" ? root : elements[id]; } };
  const payload = { strategy:{name:"12M TSMOM Top 30",baseCapital:100000,maxPositions:30,slotCapital:3333.333333}, source:"TEST", universeSource:"TEST", rows:[row("ASELS",1), row("TUPRS",2)], summary:{currentNav:100000,availableCash:0,investedValue:0,unrealizedPnl:0,realizedPnl:0,totalPnl:0,returnPercent:0,openPositions:0,universeCount:2,positiveCount:2,selectedCount:2,positiveNotSelectedCount:0,negativeCount:0,noDataCount:0,lastPriceUpdate:"2026-09-24T18:15:00.000Z",lastSignalDate:"2026-08-31",nextRebalanceDate:"2026-09-30",portfolioStatus:"READY"}, rebalance:{sells:[],buys:[],holds:[],sellProceeds:0,buyCost:0,cashAfter:0,estimatedPositionCount:2}, history:{} };
  let authReady;
  let fetchCalls = 0;
  const context = vm.createContext({ document, window:{ borsaciAuth:{authenticated:false}, addEventListener(type, callback) { if (type === "borsaci:auth-ready") authReady = callback; } }, fetch:async () => { fetchCalls += 1; return { ok:true, json:async () => payload }; }, Intl, Date, Number, String, Math, Promise, console });
  // Load the real browser scripts in HTML order; do not inject the dependency.
  const html = fs.readFileSync(path.join(__dirname,"../public/index.html"),"utf8");
  const scripts = [...html.matchAll(/<script src="(\/bist-tsmom\/[^"?]+)(?:\?[^\"]*)?"[^>]*><\/script>/g)];
  assert.equal(scripts.length, 2);
  for (const [, script] of scripts) {
    vm.runInContext(fs.readFileSync(path.join(__dirname,"../public",script),"utf8"), context);
  }
  assert.equal(fetchCalls,0,"TSMOM request waits for authenticated session");
  authReady();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fetchCalls,1);

  const aselsRow = { dataset:{symbol:"ASELS"}, parentElement:null };
  const aselsText = { dataset:{}, parentElement:aselsRow, closest:() => aselsRow };
  elements.bistTsmomBody.listeners.click({ type:"click", target:aselsText });
  assert.equal(elements.bistTsmomDetailSymbol.textContent,"ASELS");
  assert.match(elements.bistTsmomDetail.innerHTML,/TSMOM HESABI/);
  assert.match(elements.bistTsmomDetail.innerHTML,/MOVING AVERAGES/);
  assert.match(elements.bistTsmomDetail.innerHTML,/LOT HESABI/);
  assert.match(elements.bistTsmomDetail.innerHTML,/95,4/);

  const tuprsRow = { dataset:{symbol:"TUPRS"}, parentElement:null };
  const tuprsText = { dataset:{}, parentElement:tuprsRow, closest:() => tuprsRow };
  elements.bistTsmomBody.listeners.pointerup({ type:"pointerup", pointerType:"touch", target:tuprsText });
  assert.equal(elements.bistTsmomDetailSymbol.textContent,"TUPRS");
  assert.match(elements.bistTsmomDetail.innerHTML,/TUPRS/);
});
