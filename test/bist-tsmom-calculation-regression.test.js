"use strict";
const test=require("node:test"), assert=require("node:assert/strict");
const {buildTsmomPortfolio:build,technicals,normalizeBars,SLOT_CAPITAL}=require("../trading/bist-tsmom-service");
const now=Date.UTC(2025,2,1,12);
const bars=Array.from({length:14},(_,i)=>{const p=100+i*10;return {timestamp:new Date(Date.UTC(2024,i+1,0)).toISOString(),open:p,high:p+1,low:p-1,close:p,volume:1000};});
const run=(extra={})=>build({universe:["A"],histories:{A:bars},now,currentCash:100000,...extra});
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);

test("missing intermediate month does not change the 12-calendar-month anchor",()=>{
  const r=run({histories:{A:bars.filter((_,i)=>i!==7)}}).rows[0];
  assert.equal(r.referenceDate,"2024-02-29"); near(r.tsmom,(230/110-1)*100);
});
test("missing exact reference month yields NO_DATA rather than a 13-month return",()=>{
  const r=run({histories:{A:bars.filter((_,i)=>i!==1)}}).rows[0];
  assert.equal(r.tsmom,null);assert.equal(r.status,"NO_DATA");assert.equal(r.requiredAction,"BLOCKED");
});
test("missing most recent completed month cannot use an older signal",()=>{
  const r=run({histories:{A:bars.slice(0,-1)}}).rows[0];assert.equal(r.tsmom,null);assert.equal(r.currentMonthEndDate,null);
});
test("Istanbul calendar boundary determines the completed month",()=>{
  const r=run({now:Date.UTC(2025,1,28,21,5)}).rows[0];assert.equal(r.expectedSignalMonth,"2025-02");
});
test("incomplete daily and monthly bars and future prices cannot leak into selection",()=>{
  const extra={timestamp:"2025-03-01T09:00:00Z",open:999,close:999,high:1000,low:998,volume:100};
  const r=run({histories:{A:[...bars,extra]},now:Date.UTC(2025,2,1,10)}).rows[0];
  assert.equal(r.currentPrice,230);assert.equal(r.currentMonthEndDate,"2025-02-28");
});
test("stale held position is blocked, never converted to SELL zero",()=>{
  const r=run({now:Date.UTC(2025,2,10),positions:[{symbol:"A",quantity:5,entry:200}]}).rows[0];
  assert.equal(r.status,"SELECTED");assert.equal(r.currentLot,5);assert.equal(r.targetLot,null);assert.equal(r.deltaLot,null);assert.equal(r.requiredAction,"BLOCKED");assert.equal(r.plannedDeltaLot,0);
});
test("missing prices preserve held shares and report unknown NAV",()=>{
  const r=run({histories:{},positions:[{symbol:"A",quantity:5,entry:100}]});
  assert.equal(r.summary.openPositions,1);assert.equal(r.summary.currentNav,null);assert.equal(r.rebalance.sells.length,0);
});
test("insufficient cash blocks full buy without reallocating or altering target slot",()=>{
  const r=run({currentCash:1000});assert.equal(r.rows[0].targetLot,14);assert.equal(r.rows[0].deltaLot,14);
  assert.equal(r.rows[0].requiredAction,"BLOCKED");assert.equal(r.rows[0].blockedReason,"INSUFFICIENT_CASH");
  assert.equal(r.rebalance.buyCost,0);assert.equal(r.rebalance.cashAfter,1000);assert.equal(r.rebalance.estimatedPositionCount,0);
});
test("sales finance buys but never exceed available shares",()=>{
  const negative=bars.map((b,i)=>({...b,open:300-i*10,close:300-i*10,high:301-i*10,low:299-i*10}));
  const r=run({universe:["A","B"],histories:{A:bars,B:negative},positions:[{symbol:"B",quantity:20,entry:200}],currentCash:0});
  assert.equal(r.rebalance.sells[0].deltaLot,-20);assert.equal(r.rebalance.buys[0].symbol,"A");near(r.rebalance.cashAfter,180);
});
test("empty account defaults to 100000 while known zero cash stays zero",()=>{
  const empty=run({currentCash:null});assert.equal(empty.summary.availableCash,100000);assert.equal(empty.summary.currentNav,100000);
  assert.equal(run({currentCash:0}).summary.availableCash,0);
  assert.equal(run({currentCash:null,positions:[{symbol:"A",quantity:1,entry:100}]}).summary.availableCash,null);
});
test("expensive selected share with zero target lot is not a projected position",()=>{
  const r=run({histories:{A:bars.map(b=>({...b,open:b.open*100,close:b.close*100,high:b.high*100,low:b.low*100}))}});
  assert.equal(r.summary.selectedCount,1);assert.equal(r.rows[0].targetLot,0);assert.equal(r.rebalance.estimatedPositionCount,0);
});
test("same-symbol holdings aggregate lots and weighted cost",()=>{
  const r=run({positions:[{symbol:"a.is",quantity:2,entry:100},{symbol:"A",quantity:3,entry:150}]}).rows[0];
  assert.equal(r.currentLot,5);assert.equal(r.averageCost,130);assert.equal(r.currentMarketValue,1150);assert.equal(r.currentPnl,500);
});
test("outside-universe holdings remain valued without changing the universe or Top30",()=>{
  const r=run({positions:[{symbol:"LEGACY",quantity:5,entry:100,current:120}]});
  assert.equal(r.summary.universeCount,1);assert.equal(r.summary.openPositions,1);assert.equal(r.summary.investedValue,600);
  const p=r.rows.find(row=>row.symbol==="LEGACY");assert.equal(p.universeStatus,"LEGACY_OUTSIDE_UNIVERSE");assert.equal(p.selected,undefined);assert.equal(p.requiredAction,"BLOCKED");
});
test("unknown data is never converted to zero-price technical indicators",()=>{
  const t=technicals(Array.from({length:220},()=>({close:null,high:null,low:null,volume:null})));
  for(const key of ["sma20","ema20","rsi14","macd","atr14","averageVolume20","volumeRatio"])assert.equal(t[key],null,key);
});
test("SMA EMA RSI MACD ATR volume and annualized volatility have known values",()=>{
  const flat=Array.from({length:260},()=>({close:100,high:101,low:99,volume:1000}));
  const t=technicals(flat);for(const p of [20,50,100,200]){assert.equal(t[`sma${p}`],100);assert.equal(t[`ema${p}`],100);}
  assert.equal(t.rsi14,50);assert.equal(t.macd,0);assert.equal(t.macdSignal,0);assert.equal(t.macdHistogram,0);assert.equal(t.atr14,2);assert.equal(t.atrPercent,2);assert.equal(t.volatility20,0);assert.equal(t.volatility60,0);assert.equal(t.volumeRatio,1);
  const up=technicals(flat.map((b,i)=>({...b,close:100+i,high:101+i,low:99+i})));assert.equal(up.rsi14,100);near(up.sma20,349.5);near(up.return20,(359/339-1)*100);
});
test("no-volume observation is unknown; genuine zero volume stays zero",()=>{
  const series=Array.from({length:25},()=>({close:10,high:11,low:9,volume:100}));series.at(-1).volume=0;
  assert.equal(technicals(series).latestVolume,0);assert.equal(technicals(series).volumeRatio,0);
  series.at(-1).volume=null;assert.equal(technicals(series).averageVolume20,null);assert.equal(technicals(series).volumeRatio,null);
});
test("duplicates sorted deterministically, conflicts and invalid OHLC are flagged",()=>{
  const shuffled=[...bars].reverse();shuffled.push(bars[0]);assert.equal(normalizeBars(shuffled,now).bars.length,14);
  const r=run({histories:{A:[...bars,{...bars[0],close:101}]}}).rows[0];assert.ok(r.dataQualityFlags.includes("INVALID_DATA"));assert.equal(r.requiredAction,"BLOCKED");
});
test("NAV and total return reconcile and legacy PNL mismatch is visible",()=>{
  const r=run({currentCash:90000,positions:[{symbol:"A",quantity:10,entry:200}],realizedPnl:12});
  assert.equal(r.summary.currentNav,92300);assert.equal(r.summary.totalPnl,-7700);assert.equal(r.summary.returnPercent,-7.7);
  assert.ok(r.summary.accountingIssues.includes("PNL_RECONCILIATION_REQUIRED"));near(r.rows[0].portfolioWeight,2300/92300*100);
});
test("unresolved legacy holdings cannot allow projected positions above 30",()=>{
  const positions=Array.from({length:30},(_,i)=>({symbol:`OLD${i}`,quantity:1,entry:100,current:100}));
  const r=run({positions});assert.equal(r.rows.find(row=>row.symbol==="A").blockedReason,"POSITION_LIMIT");assert.equal(r.rebalance.estimatedPositionCount,30);
});
test("full lots, residuals, cash and projected NAV reconcile over varied portfolios",()=>{
  for(let n=1;n<=40;n++){
    const universe=Array.from({length:n},(_,i)=>`S${i}`), histories=Object.fromEntries(universe.map((s,i)=>[s,bars.map((b,j)=>{const p=10+i+j;return {...b,open:p,close:p,high:p+1,low:p-1};})]));
    const args={universe,histories,currentCash:n*1000,now};const r=build(args);
    assert.ok(r.summary.selectedCount<=30);assert.ok(r.rebalance.cashAfter>=0);assert.ok(r.rebalance.estimatedPositionCount<=30);
    for(const row of r.rows){assert.ok(Number.isInteger(row.targetLot));if(row.selected)near(row.residualCashContribution,SLOT_CAPITAL-row.targetMarketValue);}
    near(r.rebalance.cashAfter+r.rebalance.estimatedInvestedValue,r.summary.currentNav);
    assert.deepEqual(build(args),r);
  }
});



test("capital changes are not trading profit and slot budget stays fixed",()=>{
  const result=build({currentCash:200000,accountCapital:200000,realizedPnl:0});
  assert.equal(result.summary.totalPnl,0);assert.equal(result.summary.returnPercent,0);
  assert.equal(result.summary.reconciliationDifference,0);
  assert.equal(result.strategy.slotCapital,SLOT_CAPITAL);
  assert.equal(result.strategy.accountCapital,200000);
});
test("invalid account capital cannot generate a return",()=>{
  for (const accountCapital of [null,0,-1,"invalid"]) {
    const result=run({accountCapital});assert.equal(result.summary.totalPnl,null);
    assert.equal(result.summary.returnPercent,null);
    assert.ok(result.summary.accountingIssues.includes("INVALID_ACCOUNT_CAPITAL"));
  }
});
test("early reference-month quote cannot masquerade as month-end",()=>{
  const early=bars.map((bar,i)=>i===1?{...bar,timestamp:"2024-02-01T09:00:00Z"}:bar);
  const result=run({histories:{A:early}}).rows[0];
  assert.equal(result.tsmom,null);assert.equal(result.requiredAction,"BLOCKED");
  assert.ok(result.dataQualityFlags.includes("INSUFFICIENT_HISTORY"));
});
test("missing signal-month final session is also blocked despite a fresh current quote",()=>{
  const history=bars.map((bar,i)=>i===13?{...bar,timestamp:"2025-02-03T09:00:00Z"}:bar);
  history.push({...bars.at(-1),timestamp:"2025-03-03T09:00:00Z"});
  const result=run({histories:{A:history},now:Date.UTC(2025,2,3,20)}).rows[0];
  assert.equal(result.tsmom,null);assert.equal(result.requiredAction,"BLOCKED");
});
test("verified benchmark calendar handles holiday month-end and missing calendar",()=>{
  const histories={A:bars.map((bar,i)=>i===13?{...bar,timestamp:"2025-02-27T09:00:00Z"}:bar)};
  const calendar={"2024-02":"2024-02-29","2025-02":"2025-02-27"};
  assert.ok(run({histories,expectedMonthEndDates:calendar}).rows[0].tsmom>0);
  assert.equal(run({histories,expectedMonthEndDates:{}}).rows[0].requiredAction,"BLOCKED");
});
test("invalid open lots remain visible and cannot invent cash or NAV",()=>{
  for (const quantity of [-5,null,"invalid"]) {
    const result=run({positions:[{symbol:"A",quantity,entry:100,current:100}],currentCash:null});
    assert.equal(result.summary.openPositions,1);assert.equal(result.summary.availableCash,null);
    assert.equal(result.summary.currentNav,null);assert.equal(result.rows[0].requiredAction,"BLOCKED");
    assert.ok(result.summary.accountingIssues.includes("INVALID_POSITION_LOT"));
  }
});
test("invalid lot mixed with valid same-symbol lot still blocks valuation",()=>{
  const result=run({positions:[{symbol:"A",quantity:2,entry:100},{symbol:"A",quantity:-1,entry:100}]});
  assert.equal(result.summary.currentNav,null);assert.equal(result.rows[0].requiredAction,"BLOCKED");
});
test("next monthly date follows Istanbul across UTC month boundary",()=>{
  const {nextRebalanceDate}=require("../trading/bist-tsmom-service");
  assert.equal(nextRebalanceDate(Date.parse("2025-02-28T21:05:00Z")),"2025-04-01");
  assert.equal(nextRebalanceDate(Date.parse("2025-02-28T20:55:00Z")),"2025-03-01");
  assert.equal(nextRebalanceDate(Date.parse("2025-12-31T21:05:00Z")),"2026-02-01");
});
