"use strict";
const test=require("node:test"), assert=require("node:assert/strict");
const {resetBistPaper}=require("../trading/bist-tsmom-reset");
const {buildTsmomPortfolio}=require("../trading/bist-tsmom-service");
const fixture=()=>({symbols:["MPARK"],trading:{paper:{initialCapital:100000,cash:127083.36,equity:134652.36,pnl:35624.52,positions:[{symbol:"MPARK",quantity:18,entry:437.75,current:420.5,status:"OPEN"}]},decisions:[{symbol:"MPARK",status:"OPEN"}],history:[{symbol:"OTHER",status:"CLOSED"}],activity:[],cryptoPaper:{cash:123,positions:[{symbol:"BTCUSDT"}]},nasdaqPaper:{cash:456,positions:[{symbol:"AAPL"}]},cryptoLive:{positions:[]},automation:{monitor:{events:[]}},risk:{maxPositions:3}}});
const options={timestamp:"2026-09-29T09:00:00Z",confirmation:"RESET_BIST_PAPER_100000"};
test("BIST reset clears MPARK and pending decisions, archives original and leaves other state untouched",()=>{
  const input=fixture(), before=structuredClone(input), output=resetBistPaper(input,options);
  assert.deepEqual(input,before);assert.deepEqual(output.trading.paper.positions,[]);assert.deepEqual(output.trading.decisions,[]);
  for(const k of ["initialCapital","cash","equity"])assert.equal(output.trading.paper[k],100000);
  assert.equal(output.trading.paper.pnl,0);assert.deepEqual(output.trading.bistPaperResetArchives[0].paper,input.trading.paper);
  for(const key of Object.keys(input.trading).filter(k=>!["paper","decisions","activity"].includes(k)))assert.deepEqual(output.trading[key],input.trading[key],key);
  assert.deepEqual(output.symbols,input.symbols);
});
test("reset cannot execute without explicit confirmation and valid paper state",()=>{
  assert.throws(()=>resetBistPaper(fixture(),{timestamp:options.timestamp}));assert.throws(()=>resetBistPaper({},options));
});
test("reset paper model is 100000 NAV, zero PNL, zero positions",()=>{
  const state=resetBistPaper(fixture(),options).trading;
  const r=buildTsmomPortfolio({positions:state.paper.positions,currentCash:state.paper.cash,realizedPnl:state.paper.pnl});
  assert.equal(r.summary.currentNav,100000);assert.equal(r.summary.totalPnl,0);assert.equal(r.summary.openPositions,0);assert.deepEqual(r.summary.accountingIssues,[]);
});
