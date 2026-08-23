"use strict";

const CONFIG = Object.freeze({
  pivot: {
    left: 3,
    right: 3,
    minImpulseAtr: 3,
    // Küçük 2–3 TL'lik zigzag'ların ana A-B-C yapısını ezmesini önler.
    minImpulsePercent: 0.15,
    // A-B, tek ve anlamlı bir ana hareket olmalı; aylarca sürmüş
    // ilgisiz bir dip-tepe aralığını tek impuls gibi birleştirme.
    maxImpulseBars: 45,
    // B yeni bir ana tepe olmalı. Yakın geçmişte daha yüksek bir tepe
    // varsa, onun altındaki sonraki dalga yeni A-B-C başlatmaz.
    breakoutLookbackBars: 65,
    maxCorrectionBars: 70,
    // Eski, tamamlanmış yapılar yeni planın yerine geçmesin.
    maxStructureAgeBars: 130,
    retracementMin: 0.236,
    retracementMax: 0.886,
  },
  fibonacci: { entryTriggerRatio: 0.027, maxEntryDistanceAboveTrigger: 0.05, tp1Ratio: 0.618, tp2Ratio: 0.786, tp3Ratio: 1, stopLossPercentBelowC: 2 },
  scoring: {
    volumeLookback: 20, volumeStrongRatio: 1.2, volumeNeutralMin: 0.8,
    turnoverStrong: 500000000, turnoverMedium: 200000000, emaDistanceAtr: 1,
    overboughtRsi: 75, extendedEmaAtr: 2, fiveDayRunupPercent: 12
  },
  data: { minDailyBars: 220, minFourHourCandles: 4 }
});

const finite = value => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
const round = (value, decimals = 2) => finite(value) ? Number(Number(value).toFixed(decimals)) : null;
const timeMs = bar => { const raw = bar?.time ?? bar?.timestamp ?? bar?.date; if (typeof raw === "number") return raw < 1e11 ? raw * 1000 : raw; const t = new Date(raw || 0).getTime(); return Number.isFinite(t) ? t : NaN; };
const iso = bar => finite(timeMs(bar)) ? new Date(timeMs(bar)).toISOString() : null;
const average = values => values.length ? values.reduce((a,b) => a+b,0)/values.length : null;

function sma(values, period) { return values.length >= period ? average(values.slice(-period)) : null; }
function emaSeries(values, period) {
  const out = new Array(values.length).fill(null); if (values.length < period) return out;
  let current = average(values.slice(0, period)), k = 2 / (period + 1); out[period - 1] = current;
  for (let i = period; i < values.length; i += 1) { current = values[i] * k + current * (1-k); out[i] = current; }
  return out;
}
function rsiSeries(values, period=14) {
  const out = new Array(values.length).fill(null); if(values.length <= period) return out;
  let gains=0, losses=0; for(let i=1;i<=period;i+=1){const d=values[i]-values[i-1];gains+=Math.max(d,0);losses+=Math.max(-d,0);}
  let g=gains/period,l=losses/period; out[period]=l===0?100:100-100/(1+g/l);
  for(let i=period+1;i<values.length;i+=1){const d=values[i]-values[i-1];g=(g*(period-1)+Math.max(d,0))/period;l=(l*(period-1)+Math.max(-d,0))/period;out[i]=l===0?100:100-100/(1+g/l);}
  return out;
}
function atrSeries(history, period=14) {
  const tr=history.map((bar,i)=>i===0?bar.high-bar.low:Math.max(bar.high-bar.low,Math.abs(bar.high-history[i-1].close),Math.abs(bar.low-history[i-1].close)));
  return emaSeries(tr,period);
}
function macd(values) {
  const e12=emaSeries(values,12),e26=emaSeries(values,26),line=values.map((_,i)=>finite(e12[i])&&finite(e26[i])?e12[i]-e26[i]:null);
  const signal=emaSeries(line.map(v=>v??0),9),hist=line.map((v,i)=>finite(v)&&finite(signal[i])?v-signal[i]:null);
  return { line, signal, hist };
}
function validateDaily(history) {
  if (!Array.isArray(history) || history.length < CONFIG.data.minDailyBars) return { ok:false, code:"INSUFFICIENT_DAILY_DATA", message:"VERİ YETERSİZ: en az 220 tamamlanmış günlük mum gerekli." };
  for(let i=0;i<history.length;i+=1){const b=history[i];if(!finite(timeMs(b))||![b.open,b.high,b.low,b.close,b.volume].every(finite)||b.open<=0||b.low<=0||b.high<Math.max(b.open,b.close,b.low)||b.low>Math.min(b.open,b.close,b.high)){return {ok:false,code:"INVALID_DAILY_OHLCV",message:"VERİ YETERSİZ: günlük OHLCV tutarsız."};}if(i&&timeMs(b)<=timeMs(history[i-1]))return {ok:false,code:"NON_CHRONOLOGICAL_DAILY_DATA",message:"VERİ YETERSİZ: mum sırası geçersiz."};}
  return { ok:true };
}
function features(history) {
  const closes=history.map(b=>Number(b.close)), volumes=history.map(b=>Number(b.volume)), e20=emaSeries(closes,20),e50=emaSeries(closes,50),e200=emaSeries(closes,200),rsi=rsiSeries(closes),atr=atrSeries(history),m=macd(closes), i=history.length-1;
  const vavg=sma(volumes,CONFIG.scoring.volumeLookback), price=closes[i], turn=price*volumes[i];
  return { price, ema20:e20[i],ema50:e50[i],ema200:e200[i],ema20FiveDaysAgo:e20[i-5],rsi:rsi[i],atr:atr[i],macd:m.line[i],macdSignal:m.signal[i],macdHistogram:m.hist[i],previousHistogram:m.hist[i-1],histogramThreeBack:m.hist[i-3],volume:volumes[i],averageVolume:vavg,volumeRatio:finite(vavg)&&vavg>0?volumes[i]/vavg:null,turnover:turn,fiveDayReturn:i>=5?(price/closes[i-5]-1)*100:null };
}
function pivotPoints(history) {
  const {left,right}=CONFIG.pivot, raw=[];
  for(let i=left;i<history.length-right;i+=1){const window=history.slice(i-left,i+right+1), low=history[i].low,high=history[i].high;
    if(window.every(b=>low<=b.low))raw.push({type:"LOW",index:i,price:low,date:iso(history[i])});
    if(window.every(b=>high>=b.high))raw.push({type:"HIGH",index:i,price:high,date:iso(history[i])});
  }
  // Ardışık aynı türdeki küçük/flat pivotları tek bir ZigZag dönüşüne indir.
  // LOW grubunda en düşük, HIGH grubunda en yüksek nokta tutulur.
  const pivots=[];
  for(const point of raw){
    const previous=pivots.at(-1);
    if(!previous||previous.type!==point.type){pivots.push(point);continue;}
    const isMoreExtreme=point.type==="LOW"?point.price<previous.price:point.price>previous.price;
    if(isMoreExtreme)pivots[pivots.length-1]=point;
  }
  return pivots;
}
function aggregateFourHour(hourly, now=Date.now()) {
  const fmt=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"}),groups=new Map();
  for(const bar of hourly||[]){const t=timeMs(bar);if(!finite(t)||t+3600000>now)continue;const p=Object.fromEntries(fmt.formatToParts(new Date(t)).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));const hour=Number(p.hour);if(hour<10||hour>=18)continue;const bucket=hour<14?"10-14":"14-18",key=`${p.year}-${p.month}-${p.day}-${bucket}`;const rows=groups.get(key)||[];rows.push({...bar,_time:t});groups.set(key,rows);}
  return [...groups.values()].filter(rows=>rows.length>=4).map(rows=>{rows.sort((a,b)=>a._time-b._time);return {time:rows.at(-1)._time,open:rows[0].open,high:Math.max(...rows.map(x=>x.high)),low:Math.min(...rows.map(x=>x.low)),close:rows.at(-1).close,volume:rows.reduce((s,x)=>s+(Number(x.volume)||0),0)};}).sort((a,b)=>a.time-b.time);
}
function findAbc(history) {
  const pivots=pivotPoints(history); let best=null;
  const lows=pivots.filter(point=>point.type==="LOW");
  const highs=pivots.filter(point=>point.type==="HIGH");
  /*
   * Trend-temelli Fibonacci uzatmasının üç noktası sırasıyla başlangıç
   * (A), ana hareketin sonu (B) ve düzeltmenin sonudur (C). Bu nedenle
   * B, A ile C arasındaki GÜNLÜK en yüksek high'dır; ilk küçük pivot
   * high'ı değildir. A/B/C dışındaki günler B'yi değiştiremez.
   */
  for(const pivotHigh of highs) {
    const B={...pivotHigh};
    const precedingHighs=history.slice(
      Math.max(0,B.index-CONFIG.pivot.breakoutLookbackBars),
      B.index
    );
    if(precedingHighs.some(bar=>bar.high>B.price)) continue;
    const candidateAs=lows.filter(point=>
      point.index<B.index &&
      point.index>=B.index-CONFIG.pivot.maxImpulseBars
    );
    if(!candidateAs.length) continue;
    // A, ana tepe öncesi hareketin gerçek başlangıç dibi olmalı.
    const A=candidateAs.reduce((lowest,point)=>
      point.price<lowest.price ? point : lowest
    );
    const candidateCs=lows.filter(point=>
      point.index>B.index &&
      point.index<=B.index+CONFIG.pivot.maxCorrectionBars &&
      point.index>=history.length-1-CONFIG.pivot.maxStructureAgeBars &&
      point.price>A.price
    );
    if(!candidateCs.length) continue;
    // C, B'den sonraki teyitli en düşük diptir. Daha sonraki, daha
    // yüksek küçük dipler yeni C olamaz; bununla mevcut ana yapı korunur.
    const C=candidateCs.reduce((lowest,point)=>
      point.price<lowest.price ? point : lowest
    );
    if(!(A.price<B.price&&B.price>C.price)) continue;
    // B mutlaka A-C arasındaki gerçek ana tepe olmalı. B'den sonra daha
    // yüksek bir high oluşmuşsa, bu B ile Fibonacci uzatması çizilmez.
    if(history.slice(A.index+1,C.index).some(bar=>bar.high>B.price)) continue;
    const range=B.price-A.price;
    const atr=features(history.slice(0,C.index+1)).atr;
    const retracement=(B.price-C.price)/range;
    const impulsePercent=range/A.price;
    if(
      !finite(atr) ||
      range<atr*CONFIG.pivot.minImpulseAtr ||
      impulsePercent<CONFIG.pivot.minImpulsePercent ||
      retracement<CONFIG.pivot.retracementMin ||
      retracement>CONFIG.pivot.retracementMax
    ) continue;
    const candidate={A,B,C,range,retracement,impulsePercent};
    // En yeni gerçek ana tepe seçilir. Mikro dalga, kendinden önceki
    // daha yüksek tepeyi geçemediği için bu seçimi ele geçiremez.
    if(
      !best ||
      candidate.B.index>best.B.index ||
      (
        candidate.B.index===best.B.index &&
        candidate.impulsePercent>best.impulsePercent
      )
    ) best=candidate;
  }
  return best;
}
function fibonacciLevels(c, range, entry = c + range * CONFIG.fibonacci.entryTriggerRatio) { const stopLoss=c*(1-CONFIG.fibonacci.stopLossPercentBelowC/100),tp1=c+range*.618,tp2=c+range*.786,tp3=c+range; const risk=entry-stopLoss; return { entryTriggerPrice:c+range*CONFIG.fibonacci.entryTriggerRatio, stopLoss, tp1,tp2,tp3, riskRewardTp1:risk>0?(tp1-entry)/risk:null,riskRewardTp2:risk>0?(tp2-entry)/risk:null,riskRewardTp3:risk>0?(tp3-entry)/risk:null }; }
function entryDistanceAboveTrigger(lastClose, trigger) { return finite(lastClose)&&finite(trigger)&&Number(trigger)>0 ? (Number(lastClose)-Number(trigger))/Number(trigger) : null; }
function fibonacciPlan(daily) {
  const abc=findAbc(daily);
  const base={valid:false,status:"NO_VALID_STRUCTURE",entryTriggerRatio:CONFIG.fibonacci.entryTriggerRatio,maxEntryDistanceAboveTrigger:CONFIG.fibonacci.maxEntryDistanceAboveTrigger,confirmationTimeframe:"1d",stopLossPercentBelowC:CONFIG.fibonacci.stopLossPercentBelowC,pointA:null,pointB:null,pointC:null,range:null,retracementRatio:null,entryTriggerPrice:null,confirmationPassed:false,confirmationCandleTime:null,confirmationCandleClose:null,entryPrice:null,entryZoneLow:null,entryZoneHigh:null,stopLoss:null,tp1:null,tp2:null,tp3:null,riskRewardTp1:null,riskRewardTp2:null,riskRewardTp3:null,invalidReason:"Geçerli Fibonacci A–B–C yapısı bulunamadı."};
  if(!abc)return base;
  let {A,B,C,range,retracement}=abc; let afterC=daily.slice(C.index+1);
  /* Teyit gelmeden yeni düşük dip varsa C dinamik olarak güncellenir. */
  const lowerIndex=afterC.reduce((best,bar,offset)=>bar.low<C.price&&(best===null||bar.low<daily[best].low)?C.index+1+offset:best,null);
  if(lowerIndex!==null){C={type:"LOW",index:lowerIndex,price:daily[lowerIndex].low,date:iso(daily[lowerIndex])};retracement=(B.price-C.price)/range;if(C.price<=A.price||retracement<CONFIG.pivot.retracementMin||retracement>CONFIG.pivot.retracementMax)return {...base,valid:false,status:"INVALID",pointA:A,pointB:B,pointC:C,range:round(range),retracementRatio:round(retracement,4),invalidReason:"Yeni C noktası A–B düzeltme sınırlarını bozdu."};afterC=daily.slice(C.index+1);}
  const broken=afterC.some(x=>x.low<C.price); if(broken)return {...base,valid:false,status:"INVALID",pointA:A,pointB:B,pointC:C,range:round(range),retracementRatio:round(retracement,4),invalidReason:"C noktası günlük yapıda aşağı kırıldı."};
  const trigger=C.price+range*CONFIG.fibonacci.entryTriggerRatio;
  const candlesAfterC=daily.slice(C.index+1); const confirm=candlesAfterC.find(x=>x.close>trigger);
  const last=daily.at(-1), volumeStrong=finite(features(daily).volumeRatio)&&features(daily).volumeRatio>=1;
  const levels=fibonacciLevels(C.price,range);
  const fields={valid:true,status:"WAITING_CONFIRMATION",pointA:A,pointB:B,pointC:C,range:round(range),retracementRatio:round(retracement,4),entryTriggerPrice:round(levels.entryTriggerPrice),entryZoneLow:round(trigger),entryZoneHigh:round(trigger*(1+CONFIG.fibonacci.maxEntryDistanceAboveTrigger)),stopLoss:round(levels.stopLoss),tp1:round(levels.tp1),tp2:round(levels.tp2),tp3:round(levels.tp3),volumeConfirmation:volumeStrong?"STRONG":"WEAK",invalidReason:null};
  if(!confirm)return fields;
  if(!(last.close>trigger))return {...fields,status:"WAITING_CONFIRMATION",invalidReason:"Günlük kapanış Fibonacci tetik seviyesinin üzerinde değil."};
  const distance=entryDistanceAboveTrigger(last.close,trigger);
  if(distance>CONFIG.fibonacci.maxEntryDistanceAboveTrigger)return {...fields,status:"ENTRY_TOO_FAR",confirmationPassed:true,confirmationCandleTime:iso(confirm),confirmationCandleClose:round(confirm.close),entryPrice:round(last.close),invalidReason:"GİRİŞ İÇİN UZAKLAŞTI – fiyat kırılım seviyesinin %5 üzerindedir."};
  const entry=last.close, risk=entry-fields.stopLoss;
  const targetReached=last.high>=fields.tp1;
  if(targetReached)return {...fields,status:"TARGET_REACHED",confirmationPassed:true,confirmationCandleTime:iso(confirm),confirmationCandleClose:round(confirm.close),entryPrice:round(entry),riskRewardTp1:round((fields.tp1-entry)/risk,2),riskRewardTp2:round((fields.tp2-entry)/risk,2),riskRewardTp3:round((fields.tp3-entry)/risk,2),invalidReason:"TP1'e ulaşmış eski yapıdan yeni giriş önerilmez."};
  return {...fields,status:"ACTIVE",confirmationPassed:true,confirmationCandleTime:iso(confirm),confirmationCandleClose:round(confirm.close),entryPrice:round(entry),riskRewardTp1:round((fields.tp1-entry)/risk,2),riskRewardTp2:round((fields.tp2-entry)/risk,2),riskRewardTp3:round((fields.tp3-entry)/risk,2)};
}
function fallbackPlan(history, f) {
  const support=Math.min(...history.slice(-20).map(x=>x.low)), entry=f.price, stop=support-f.atr*.15, risk=entry-stop, resistance=Math.max(...history.slice(-60,-1).map(x=>x.high));
  return { method:"ATR_SUPPORT_RESISTANCE",entryPrice:round(entry),stopLoss:round(stop),tp1:round(entry+risk*2),tp2:round(entry+risk*3),tp3:round(Math.max(resistance,entry+risk*3)),riskRewardTp1:round(2),riskRewardTp2:round(3),riskRewardTp3:round((Math.max(resistance,entry+risk*3)-entry)/risk,2),message:"Geçerli Fibonacci A–B–C yapısı bulunamadı; seviyeler destek/direnç ve ATR ile hesaplandı." };
}
function score(history, fib) {
  const f=features(history), c=CONFIG.scoring; let value=0;const reasons=[],risks=[];
  if(f.price>f.ema20){value+=8;reasons.push("Fiyat EMA20 üzerinde");}if(f.ema20>f.ema50){value+=8;reasons.push("EMA20 EMA50 üzerinde");}if(f.price>f.ema200){value+=7;reasons.push("Fiyat EMA200 üzerinde");}if(f.ema20>f.ema20FiveDaysAgo){value+=7;reasons.push("EMA20 son 5 günde yükseliyor");}
  if(f.rsi>=52&&f.rsi<=65)value+=10;else if((f.rsi>=45&&f.rsi<52)||(f.rsi>65&&f.rsi<=70))value+=5;
  if(f.macd>f.macdSignal)value+=8;if(f.macdHistogram>0&&f.macdHistogram>f.previousHistogram)value+=7;
  if(f.volumeRatio>=c.volumeStrongRatio)value+=10;else if(f.volumeRatio>=c.volumeNeutralMin&&f.volumeRatio<c.volumeStrongRatio)value+=5;
  if(f.turnover>=c.turnoverStrong)value+=10;else if(f.turnover>=c.turnoverMedium)value+=5;
  if(Math.abs(f.price-f.ema20)<=f.atr*c.emaDistanceAtr)value+=5;
  if(fib.valid)value+=5;if(fib.confirmationPassed)value+=5;if(fib.volumeConfirmation==="STRONG")value+=3;
  const bestR=Math.max(fib.riskRewardTp2||0,fib.riskRewardTp3||0);if(bestR>=2)value+=7;
  if(f.rsi>c.overboughtRsi){value-=10;risks.push("RSI aşırı yüksek");}if(f.price-f.ema20>f.atr*c.extendedEmaAtr){value-=10;risks.push("Fiyat EMA20'den aşırı uzak");}if(f.fiveDayReturn>c.fiveDayRunupPercent){value-=5;risks.push("Son 5 günde aşırı yükseliş");}if(f.volumeRatio<.5){value-=10;risks.push("Hacim çok düşük");}if(f.macdHistogram<f.previousHistogram&&f.previousHistogram<f.histogramThreeBack){value-=5;risks.push("MACD histogramı zayıflıyor");}
  value=Math.max(0,Math.min(100,Math.round(value)));const grade=value>=80?"A+ / GÜÇLÜ ADAY":value>=70?"A / AL ADAYI":value>=60?"B / İZLE":value>=50?"NÖTR":"ZAYIF";
  return {score:value,grade,features:f,reasons,risks};
}
function xu100Info(history) { const f=features(history); const status=f.price>f.ema20&&f.ema20>f.ema50?"POZİTİF":f.price<f.ema50?"NEGATİF":"NÖTR"; return {status,description:"XU100 görünümü bilgilendirme amaçlıdır; hisselerin teknik kalite skorunu ve sıralamasını engellemez."}; }
module.exports={CONFIG,validateDaily,features,aggregateFourHour,findAbc,fibonacciLevels,fibonacciPlan,entryDistanceAboveTrigger,fallbackPlan,score,xu100Info,emaSeries,rsiSeries,atrSeries,macd};
