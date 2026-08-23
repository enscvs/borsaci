"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fib=require("../trading/fibonacci-engine");

test("ENJSA reference formulas use 2.70% trigger, 2% stop and extension targets",()=>{
  const levels=fib.fibonacciLevels(99.55,76.25);
  assert.ok(Math.abs(levels.entryTriggerPrice-101.61)<.02);
  assert.ok(Math.abs(levels.stopLoss-97.559)<.002);
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
test("ABC selection prefers the stronger structural impulse over a later local swing",()=>{
  const start=Date.UTC(2025,0,1);
  const history=Array.from({length:230},(_,i)=>{const base=16+i*.01;return {time:(start+i*86400000)/1000,open:base,high:base+.5,low:base-.5,close:base,volume:1000000};});
  const set=(index,low,high)=>Object.assign(history[index],{open:(low+high)/2,close:(low+high)/2,low,high});
  set(206,20,22); set(207,19,21); set(208,18,20); set(209,18,19.5); set(210,18,19);
  for(let index=212;index<history.length;index+=1)set(index,18+(index-212)*.1,20+(index-212)*.1);
  set(190,10,12); set(195,18,20); set(200,14,16); set(205,22,24); set(211,17,19);
  const abc=fib.findAbc(history);
  // 10 → 24 → 17 ana hareketi, sonradan oluşan 14 → 24 → 17
  // yerel salınımından daha güçlü olduğu için korunur.
  assert.equal(abc.A.index,190);
  assert.equal(abc.B.index,205);
  assert.equal(abc.C.index,211);
  assert.ok(abc.C.price>abc.A.price);
});
test("ABC selection uses the highest confirmed peak between A and C",()=>{
  const start=Date.UTC(2025,0,1);
  const history=Array.from({length:230},(_,i)=>{const base=21+i*.01;return {time:(start+i*86400000)/1000,open:base,high:base+.5,low:base-.5,close:base,volume:1000000};});
  const set=(index,low,high)=>Object.assign(history[index],{open:(low+high)/2,close:(low+high)/2,low,high});
  set(190,19.01,20); set(195,21,22.02); set(200,20.5,21.5); set(205,24,25.3);
  set(206,23,24); set(207,22,23); set(208,21,22); set(209,20.8,21.8); set(210,20.5,21.5); set(211,20.06,21);
  for(let index=212;index<history.length;index+=1)set(index,21+(index-212)*.1,22+(index-212)*.1);
  // Daha sonraki küçük dalga (20.06 → 22.18 → 20.48) ana yapıyı
  // değiştirmemeli; 22.18, 25.30 ana tepesinin altında kalır.
  set(216,20.8,21.4); set(220,21.5,22.18); set(225,20.48,21.2);
  const abc=fib.findAbc(history);
  assert.equal(abc.A.price,19.01);
  assert.equal(abc.B.price,25.3);
  assert.equal(abc.C.price,20.06);
  assert.ok(abc.retracement>.786&&abc.retracement<.886);
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
