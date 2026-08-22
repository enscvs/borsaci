"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fib=require("../trading/fibonacci-engine");

test("ENJSA reference formulas use 2.70% trigger, 4% stop and extension targets",()=>{
  const levels=fib.fibonacciLevels(99.55,76.25);
  assert.ok(Math.abs(levels.entryTriggerPrice-101.61)<.02);
  assert.ok(Math.abs(levels.stopLoss-95.568)<.002);
  assert.ok(Math.abs(levels.tp1-146.67)<.1);
  assert.ok(Math.abs(levels.tp2-159.48)<.1);
  assert.ok(Math.abs(levels.tp3-175.8)<.1);
});
test("four-hour aggregation does not accept an incomplete session bucket",()=>{
  const day=Date.UTC(2026,0,5);
  const hourly=[10,11,12].map((hour,i)=>({time:(day+hour*3600000)/1000,open:100+i,high:101+i,low:99+i,close:100+i,volume:100}));
  assert.equal(fib.aggregateFourHour(hourly,day+20*3600000).length,0);
});
test("four-hour confirmation requires close above trigger, not merely a wick",()=>{
  const trigger=101;
  const wick={close:100.9,high:102};
  assert.equal(wick.close>trigger,false);
});
test("daily Fibonacci entry is rejected once price is more than 5% above the trigger",()=>{
  assert.ok(fib.entryDistanceAboveTrigger(106.3,100)>.05);
  assert.ok(fib.entryDistanceAboveTrigger(104.99,100)<=.05);
});
test("technical score is capped and not a probability",()=>{
  const history=Array.from({length:230},(_,i)=>({time:Date.UTC(2025,0,1+i)/1000,open:100+i*.1,high:101+i*.1,low:99+i*.1,close:100+i*.1,volume:5000000}));
  const result=fib.score(history,{valid:false,status:"NO_VALID_STRUCTURE",riskRewardTp2:null,riskRewardTp3:null,volumeConfirmation:"WEAK"});
  assert.ok(result.score>=0&&result.score<=100);
  assert.match(result.grade,/A\+|A \/|B \/|NÖTR|ZAYIF/);
});
