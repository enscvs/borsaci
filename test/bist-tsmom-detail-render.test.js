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
  const historyButton = element(); historyButton.dataset.bistView = "snapshots";
  root.querySelectorAll = () => [historyButton];
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
  assert.match(root.innerHTML, /value="BUY">Alış/);
  assert.match(elements.bistTsmomSummary.innerHTML, /NET PORTFÖY DEĞERİ/);
  assert.match(elements.bistTsmomBody.innerHTML, /Fiyat verisi uygun/);
  assert.doesNotMatch(elements.bistTsmomBody.innerHTML, />SELECTED<|>BUY<|PRICE_OK/);
  payload.history.monthlyTsmomSnapshots=[{timestamp:"2026-09-24T18:15:00.000Z",selectedCount:2,positiveCount:2,universeCount:2}];
  historyButton.listeners.click();
  assert.match(elements.bistTsmomHistory.innerHTML, /Seçilen hisse: 2/);
  assert.doesNotMatch(elements.bistTsmomHistory.innerHTML, /selectedCount|SNAPSHOT|\{"/);

  const aselsRow = { dataset:{symbol:"ASELS"}, parentElement:null };
  const aselsText = { dataset:{}, parentElement:aselsRow, closest:() => aselsRow };
  elements.bistTsmomBody.listeners.click({ type:"click", target:aselsText });
  assert.equal(elements.bistTsmomDetailSymbol.textContent,"ASELS");
  assert.match(elements.bistTsmomDetail.innerHTML,/TSMOM HESABI/);
  assert.match(elements.bistTsmomDetail.innerHTML,/HAREKETLİ ORTALAMALAR/);
  assert.match(elements.bistTsmomDetail.innerHTML,/LOT HESABI/);
  assert.match(elements.bistTsmomDetail.innerHTML,/Seçilme nedeni: 12 aylık momentum/);
  assert.doesNotMatch(elements.bistTsmomDetail.innerHTML,/Current month-end|Selection reason|OVERSOLD|IDENTIFICATION/);
  assert.match(elements.bistTsmomDetail.innerHTML,/95,4/);
  assert.match(elements.bistTsmomBody.innerHTML,/aria-selected="true"/);

  elements.bistTsmomSearch.listeners.input({target:{value:"no-matching-company"}});
  assert.match(elements.bistTsmomBody.innerHTML,/Kayıt bulunamadı/);
  elements.bistTsmomSearch.listeners.input({target:{value:""}});
  payload.rows[1].requiredAction="BLOCKED";
  elements.bistTsmomFilter.listeners.change({target:{value:"BLOCKED"}});
  assert.match(elements.bistTsmomBody.innerHTML,/TUPRS/);
  assert.doesNotMatch(elements.bistTsmomBody.innerHTML,/ASELS/);
  elements.bistTsmomFilter.listeners.change({target:{value:"ALL"}});

  payload.rows[0].deltaLot=0; payload.rows[1].deltaLot=10;
  elements.bistTsmomHead.listeners.click({target:{closest:()=>({dataset:{sort:"deltaLot"}})}});
  assert.ok(elements.bistTsmomBody.innerHTML.indexOf('data-symbol="ASELS"')<elements.bistTsmomBody.innerHTML.indexOf('data-symbol="TUPRS"'));

  const tuprsRow = { dataset:{symbol:"TUPRS"}, parentElement:null };
  const tuprsText = { dataset:{}, parentElement:tuprsRow, closest:() => tuprsRow };
  elements.bistTsmomBody.listeners.pointerup({ type:"pointerup", pointerType:"touch", target:tuprsText });
  assert.equal(elements.bistTsmomDetailSymbol.textContent,"TUPRS");
  assert.match(elements.bistTsmomDetail.innerHTML,/TUPRS/);

  payload.rows[1].technical={rsi14:null,sma20:null,ema20:null};
  payload.rows[1].tsmom=null;payload.rows[1].referenceClose=null;
  elements.bistTsmomBody.listeners.pointerup({type:"pointerup",pointerType:"touch",target:tuprsText});
  assert.match(elements.bistTsmomDetail.innerHTML,/Dönem = 14 · Veri yok/);
  assert.doesNotMatch(elements.bistTsmomDetail.innerHTML,/PRICE ABOVE|Infinity|NaN|= 0<br>=/);
});

