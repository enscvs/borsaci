"use strict";
const test=require("node:test"), assert=require("node:assert/strict"), fs=require("node:fs"), vm=require("node:vm");
const service=require("../trading/bist-tsmom-service");
const source=fs.readFileSync(require("node:path").join(__dirname,"../server.js"),"utf8");
const start=source.indexOf("let bistTsmomCache = null;"), end=source.indexOf("async function handleBistTsmomState",start);
const bars=Array.from({length:14},(_,i)=>{const close=100+i*10;return {timestamp:new Date(Date.UTC(2024,i+1,0)).toISOString(),open:close,high:close+1,low:close-1,close,volume:1000};});
function snapshot(failCalendar=false) {
  const calls=[];
  class FixedDate extends Date { static now(){return Date.UTC(2025,2,1,12);} }
  const context={Date:FixedDate,console:{warn(){}},Promise,Set,Object,Number,String,
    require:()=>service, buildTsmomPortfolio:service.buildTsmomPortfolio,
    BIST_UNIVERSE_FALLBACK_SYMBOLS:[],
    fetchOfficialBistUniverse:async()=>({symbols:["A"],source:"TEST"}),
    getTradingState:async()=>({content:{paper:{cash:200000,initialCapital:200000,pnl:0,positions:[]},activity:[],history:[]}}),
    fetchYahooChart:async symbol=>{calls.push(symbol);if(symbol==="XU100" && failCalendar)throw Error("calendar unavailable");return {history:bars,meta:{longName:"A"}};},
    fibonacciEngine:require("../trading/fibonacci-engine")};
  return {calls,run:vm.runInNewContext(source.slice(start,end)+";buildBistTsmomSnapshot",context)};
}
test("production snapshot passes account capital and benchmark session calendar",async()=>{
  const {run,calls}=snapshot();const payload=await run();
  assert.equal(payload.summary.totalPnl,0);assert.equal(payload.summary.returnPercent,0);
  assert.equal(payload.strategy.accountCapital,200000);assert.equal(payload.rows[0].requiredAction,"BUY");
  assert.ok(calls.includes("XU100"));assert.equal(payload.summary.nextRebalanceDate,"2025-04-01");
});
test("calendar fetch failure never permits unverified monthly trades",async()=>{
  const {run}=snapshot(true);const payload=await run();
  assert.equal(payload.rows[0].tsmom,null);assert.equal(payload.rows[0].requiredAction,"BLOCKED");
  assert.equal(payload.rebalance.buys.length,0);assert.equal(payload.rebalance.sells.length,0);
});
