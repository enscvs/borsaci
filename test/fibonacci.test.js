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
test("a previous higher peak does not invalidate a later independent A-B-C structure",()=>{
  const start=Date.UTC(2025,0,1);
  const history=Array.from({length:230},(_,i)=>{const base=270+i*.01;return {time:(start+i*86400000)/1000,open:base,high:base+2,low:base-2,close:base,volume:1000000};});
  const set=(index,low,high)=>Object.assign(history[index],{open:(low+high)/2,close:(low+high)/2,low,high});
  // Önceki 360 tepesinden sonra bağımsız 240 → 310 → 254 yapısı.
  set(170,330,360); set(185,240,245); set(202,305,310); set(220,254,258);
  for(let i=221;i<history.length;i+=1)set(i,260+(i-221)*.2,266+(i-221)*.2);
  const abc=fib.findAbc(history);
  assert.equal(abc.A.index,185);
  assert.equal(abc.B.index,202);
  assert.equal(abc.C.index,220);
  assert.ok(abc.B.price>abc.A.price&&abc.C.price>abc.A.price);
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
test("completed Binance daily candle is retained even when UTC close maps to current Istanbul day",()=>{
  const now=Date.UTC(2026,7,27,12); // 15:00 Istanbul
  // Binance 26 Ağustos UTC gününün kapanışı İstanbul'da 27 Ağustos 02:59'dur.
  const completedCryptoCandle={time:Math.floor(Date.UTC(2026,7,26,23,59,59)/1000),open:20,high:21,low:19,close:20,volume:100};
  assert.equal(fib.completedDailyHistory([completedCryptoCandle],now).length,0);
  assert.equal(fib.completedDailyHistory([completedCryptoCandle],now,{market:"CRYPTO"}).length,1);
});
test("crypto uses the identical A-B-C levels when all daily candles are completed",()=>{
  const history=descendingResistanceFixture();
  const now=Date.UTC(2026,7,27,20);
  const bist=fib.fibonacciPlan(history,now);
  const crypto=fib.fibonacciPlan(history,now,{market:"CRYPTO"});
  assert.deepEqual(
    [crypto.pointA?.price,crypto.pointB?.price,crypto.pointC?.price,crypto.entryTriggerPrice,crypto.stopLoss,crypto.tp1,crypto.tp2,crypto.tp3],
    [bist.pointA?.price,bist.pointB?.price,bist.pointC?.price,bist.entryTriggerPrice,bist.stopLoss,bist.tp1,bist.tp2,bist.tp3]
  );
});
test("crypto applies the same rules with a 7/24 calendar window, not a coin-specific exception",()=>{
  const start=Date.UTC(2025,0,1);
  const history=Array.from({length:310},(_,i)=>{const base=.31+i*.00001;return {time:(start+i*86400000)/1000,open:base,high:base+.01,low:base-.01,close:base,volume:1000000};});
  const set=(index,low,high)=>Object.assign(history[index],{open:(low+high)/2,close:(low+high)/2,low,high});
  // 74 günlük impuls ve 93 günlük düzeltme, 7/24 kripto mumlarında aynı
  // takvimsel yapıdır; BIST'in işlem günü penceresiyle erken elenmez.
  set(130,.15,.17); set(204,.58,.61); set(297,.252,.27);
  const crypto=fib.findAbc(history,{market:"CRYPTO"});
  assert.equal(crypto.A.index,130);
  assert.equal(crypto.B.index,204);
  assert.equal(crypto.C.index,297);
  assert.equal(crypto.B.price,.61);
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

test("technical grade uses the same 60 point candidate threshold as decision policy",()=>{
  assert.equal(fib.technicalGrade(59),"NÖTR");
  assert.equal(fib.technicalGrade(60),"A / AL ADAYI");
  assert.equal(fib.technicalGrade(80),"A+ / GÜÇLÜ ADAY");
});

test("candidate ranking is recomputed after Fibonacci analysis",()=>{
  const history=descendingResistanceFixture();
  const ranked=fib.rankCandidatesWithFibonacci([
    {symbol:"ZZZ",score:100,history,validation:{ok:true}},
    {symbol:"AAA",score:1,history,validation:{ok:true}},
  ],Date.UTC(2026,7,27,20),{market:"BIST"},{limit:2,shortlistLimit:2});
  assert.deepEqual(ranked.map(item=>item.symbol),["AAA","ZZZ"]);
  assert.equal(ranked[0].score,ranked[1].score);
});

test("MACD signal starts after nine valid MACD values",()=>{
  const values=Array.from({length:40},(_,index)=>100+index);
  const result=fib.macd(values);
  assert.equal(result.line[25]!==null,true);
  assert.equal(result.signal[32],null);
  assert.equal(result.hist[32],null);
  assert.equal(result.signal[33]!==null,true);
  assert.equal(result.hist[33]!==null,true);
});

test("daily validation rejects negative volume",()=>{
  const history=Array.from({length:220},(_,index)=>({
    time:Date.UTC(2025,0,1+index)/1000,
    open:100,
    high:101,
    low:99,
    close:100,
    volume:index===100?-1:1000,
  }));
  assert.equal(fib.validateDaily(history).ok,false);
});

test("Fibonacci ATR uses Wilder smoothing",()=>{
  const history=Array.from({length:40},(_,index)=>{
    const close=100+index+(index%5===0?8:0);
    return {time:Date.UTC(2025,0,1+index)/1000,open:close-1,high:close+(index%3+1),low:close-(index%4+1),close,volume:1000};
  });
  const trueRanges=history.map((bar,index)=>index===0
    ? bar.high-bar.low
    : Math.max(bar.high-bar.low,Math.abs(bar.high-history[index-1].close),Math.abs(bar.low-history[index-1].close)));
  let expected=trueRanges.slice(0,14).reduce((sum,value)=>sum+value,0)/14;
  for(let index=14;index<trueRanges.length;index+=1)expected=(expected*13+trueRanges[index])/14;
  assert.ok(Math.abs(fib.atrSeries(history).at(-1)-expected)<1e-12);
});

