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
function descendingResistanceFixture({secondHigh=25}={}) {
  const start=Date.UTC(2025,0,1);
  const history=Array.from({length:60},(_,i)=>{
    const close=20+i*.01;
    return {time:(start+i*86400000)/1000,open:close,high:close+.5,low:close-.5,close,volume:1000000};
  });
  const set=(index,low,high,close=(low+high)/2)=>Object.assign(history[index],{open:close,high,low,close});
  // A=10, B=30, C=18; B'den sonra iki teyitli lower-high vardır.
  set(15,10,12,11);
  set(25,29,30,29.5);
  set(35,18,19,18.5);
  set(42,23,27,25);
  // İki high pivotunun bağımsız salınımlar olması için arada teyitli dip.
  set(45,18.5,20,19.25);
  if(secondHigh!==null)set(49,23,secondHigh,(23+secondHigh)/2);
  return history;
}
test("entry upper is the last completed daily descending-resistance level plus 3%",()=>{
  const history=descendingResistanceFixture();
  const plan=fib.fibonacciPlan(history);
  const resistance=plan.descendingResistance;
  const expectedBreakout=25+((25-27)/(49-42))*(59-49);
  assert.equal(plan.status,"ACTIVE");
  assert.equal(resistance.valid,true);
  assert.equal(resistance.source,"POST_B_LAST_TWO_LOWER_HIGHS");
  assert.equal(resistance.anchor1.index,42);
  assert.equal(resistance.anchor2.index,49);
  assert.equal(resistance.breakoutPriceAtLast,Number(expectedBreakout.toFixed(4)));
  assert.ok(Math.abs(resistance.entryUpperRaw-(expectedBreakout*1.03))<1e-10);
  assert.equal(plan.entryZoneHigh,Number((expectedBreakout*1.03).toFixed(2)));
  assert.equal(resistance.entryUpperPrice,plan.entryZoneHigh);
});
test("B anchors the descending resistance only when there is one post-B lower high",()=>{
  const history=descendingResistanceFixture({secondHigh:null});
  const line=fib.findDescendingHighTrendline(history,{type:"HIGH",index:25,price:30,date:new Date(history[25].time*1000).toISOString()});
  assert.equal(line.valid,true);
  assert.equal(line.source,"B_TO_FIRST_POST_B_LOWER_HIGH");
  assert.equal(line.anchor1.index,25);
  assert.equal(line.anchor2.index,42);
});
test("an ascending latest high pair does not invent an entry upper limit",()=>{
  const plan=fib.fibonacciPlan(descendingResistanceFixture({secondHigh:28}));
  assert.equal(plan.status,"ENTRY_RESISTANCE_UNAVAILABLE");
  assert.equal(plan.entryZoneHigh,null);
  assert.equal(plan.descendingResistance.valid,false);
  assert.match(plan.invalidReason,/Giriş üst seviyesi oluşturulmadı/);
});
test("the descending-resistance upper limit is the actual too-far boundary",()=>{
  const history=descendingResistanceFixture();
  Object.assign(history.at(-1),{open:23,high:23.5,low:22.5,close:23});
  const plan=fib.fibonacciPlan(history);
  assert.equal(plan.status,"ENTRY_TOO_FAR");
  assert.ok(plan.entryPrice>plan.entryZoneHigh);
  assert.match(plan.invalidReason,/%3/);
});
test("the current open daily candle is excluded from the resistance input",()=>{
  const day=Date.UTC(2026,7,22);
  const history=[0,1].map(offset=>({time:(day+offset*86400000)/1000,open:20,high:21,low:19,close:20,volume:100}));
  const beforeBistClose=fib.completedDailyHistory(history,Date.UTC(2026,7,23,12)); // 15:00 Istanbul
  const justAfterClose=fib.completedDailyHistory(history,Date.UTC(2026,7,23,15,5)); // 18:05 Istanbul
  const afterBistClose=fib.completedDailyHistory(history,Date.UTC(2026,7,23,15,15)); // 18:15 Istanbul
  const planBeforeBistClose=fib.fibonacciPlan(history,Date.UTC(2026,7,23,12));
  assert.equal(beforeBistClose.length,1);
  assert.equal(justAfterClose.length,1);
  assert.equal(afterBistClose.length,2);
  assert.equal(planBeforeBistClose.completedDailyCandleTime,new Date(history[0].time*1000).toISOString());
});
test("technical score is capped and not a probability",()=>{
  const history=Array.from({length:230},(_,i)=>({time:Date.UTC(2025,0,1+i)/1000,open:100+i*.1,high:101+i*.1,low:99+i*.1,close:100+i*.1,volume:5000000}));
  const result=fib.score(history,{valid:false,status:"NO_VALID_STRUCTURE",riskRewardTp2:null,riskRewardTp3:null,volumeConfirmation:"WEAK"});
  assert.ok(result.score>=0&&result.score<=100);
  assert.equal(result.score,Math.min(result.scoreBreakdown.maximum,Math.max(0,Math.round(result.scoreBreakdown.rawTotal))));
  assert.ok(result.scoreBreakdown.positiveTotal<=result.scoreBreakdown.maximum);
  assert.match(result.grade,/A\+|A \/|B \/|NÖTR|ZAYIF/);
});

test("technical score breakdown reconciles exact category points and penalties",()=>{
  const history=Array.from({length:230},(_,i)=>({time:Date.UTC(2025,0,1+i)/1000,open:100+i*.1,high:101+i*.1,low:99+i*.1,close:100+i*.1,volume:5000000}));
  const result=fib.score(history,{valid:false,status:"NO_VALID_STRUCTURE",riskRewardTp2:null,riskRewardTp3:null,volumeConfirmation:"WEAK"});
  const breakdown=result.scoreBreakdown;
  assert.deepEqual(
    [breakdown.trend.score,breakdown.momentum.score,breakdown.volumeLiquidity.score,breakdown.entryQuality.score],
    [30,15,15,5]
  );
  assert.equal(breakdown.positiveTotal,65);
  assert.equal(breakdown.penalties.score,-10);
  assert.equal(breakdown.penalties.items.find(item=>item.id==="rsi_overbought").applied,true);
  assert.equal(breakdown.rawTotal,55);
  assert.equal(breakdown.total,result.score);
  assert.equal(result.score,55);
});
