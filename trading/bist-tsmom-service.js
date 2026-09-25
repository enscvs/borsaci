"use strict";

// BIST 12M TSMOM presentation model.  This module is deliberately pure: it
// does not open orders or persist anything.  The caller supplies completed
// daily bars and the current paper positions for a migration preview only.
const BASE_CAPITAL = 100000;
const MAX_POSITIONS = 30;
const SLOT_CAPITAL = BASE_CAPITAL / MAX_POSITIONS;
const STALE_PRICE_MS = 3 * 24 * 60 * 60 * 1000;

const number = value => Number.isFinite(Number(value)) ? Number(value) : null;
const round = (value, digits = 4) => Number.isFinite(Number(value)) ? Number(Number(value).toFixed(digits)) : null;
const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const marketDate = value => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 && numeric < 100000000000 ? new Date(numeric * 1000) : new Date(value || 0);
};

function sma(values, period) {
  if (!Array.isArray(values) || values.length < period) return null;
  return average(values.slice(-period));
}

function ema(values, period) {
  if (!Array.isArray(values) || values.length < period) return null;
  const multiplier = 2 / (period + 1);
  let result = average(values.slice(0, period));
  for (let index = period; index < values.length; index += 1) result = (values[index] - result) * multiplier + result;
  return result;
}

function rsi(values, period = 14) {
  if (!Array.isArray(values) || values.length <= period) return null;
  let gains = 0, losses = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = values[index] - values[index - 1];
    gains += Math.max(0, change); losses += Math.max(0, -change);
  }
  let gain = gains / period, loss = losses / period;
  for (let index = period + 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    gain = (gain * (period - 1) + Math.max(0, change)) / period;
    loss = (loss * (period - 1) + Math.max(0, -change)) / period;
  }
  return loss === 0 ? 100 : 100 - (100 / (1 + gain / loss));
}

function atr(bars, period = 14) {
  if (!Array.isArray(bars) || bars.length <= period) return null;
  const ranges = [];
  for (let index = 1; index < bars.length; index += 1) {
    const bar = bars[index], previous = bars[index - 1];
    ranges.push(Math.max(bar.high - bar.low, Math.abs(bar.high - previous.close), Math.abs(bar.low - previous.close)));
  }
  return sma(ranges, period);
}

function standardDeviation(values) {
  const mean = average(values);
  if (mean === null) return null;
  return Math.sqrt(average(values.map(value => (value - mean) ** 2)));
}

function monthlyCloses(bars, now = Date.now()) {
  const byMonth = new Map();
  for (const bar of bars || []) {
    const date = marketDate(bar.timestamp || bar.date || bar.time || 0);
    if (!Number.isFinite(date.getTime()) || !Number.isFinite(Number(bar.close)) || Number(bar.close) <= 0) continue;
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    const previous = byMonth.get(key);
    if (!previous || date.getTime() > previous.timestamp) byMonth.set(key, {key, date: date.toISOString().slice(0, 10), timestamp: date.getTime(), close: Number(bar.close)});
  }
  const current = new Date(now);
  const currentKey = `${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, "0")}`;
  // A partial current calendar month is never an end-of-month TSMOM input.
  return [...byMonth.values()].filter(item => item.key < currentKey).sort((left, right) => left.timestamp - right.timestamp);
}

function technicals(bars) {
  const valid = (bars || []).filter(bar => [bar.close, bar.high, bar.low].every(value => Number.isFinite(Number(value))));
  const closes = valid.map(bar => Number(bar.close));
  const volumes = valid.map(bar => Number(bar.volume) || 0);
  const latest = valid.at(-1) || null;
  const macd = ema(closes, 12) === null || ema(closes, 26) === null ? null : ema(closes, 12) - ema(closes, 26);
  const macdSeries = closes.map((_, index) => {
    const partial = closes.slice(0, index + 1);
    return ema(partial, 12) === null || ema(partial, 26) === null ? null : ema(partial, 12) - ema(partial, 26);
  }).filter(value => value !== null);
  const macdSignal = ema(macdSeries, 9);
  const returns = period => closes.length > period && closes.at(-period - 1) > 0 ? ((closes.at(-1) / closes.at(-period - 1)) - 1) * 100 : null;
  const volatility = period => {
    if (closes.length <= period) return null;
    const changes = closes.slice(-period - 1).slice(1).map((close, index) => Math.log(close / closes.slice(-period - 1)[index]));
    const deviation = standardDeviation(changes);
    return deviation === null ? null : deviation * Math.sqrt(252) * 100;
  };
  const trailing = valid.slice(-252);
  const high52 = trailing.length ? Math.max(...trailing.map(bar => Number(bar.high))) : null;
  const low52 = trailing.length ? Math.min(...trailing.map(bar => Number(bar.low))) : null;
  const current = closes.at(-1) ?? null;
  const volume20 = sma(volumes, 20);
  return {
    sma20:sma(closes,20), sma50:sma(closes,50), sma100:sma(closes,100), sma200:sma(closes,200),
    ema20:ema(closes,20), ema50:ema(closes,50), ema100:ema(closes,100), ema200:ema(closes,200),
    rsi14:rsi(closes), macd, macdSignal, macdHistogram:macd === null || macdSignal === null ? null : macd - macdSignal,
    atr14:atr(valid), atrPercent:current && atr(valid) !== null ? atr(valid) / current * 100 : null,
    volatility20:volatility(20), volatility60:volatility(60), high52, low52,
    distanceHigh52:current && high52 ? (current / high52 - 1) * 100 : null,
    distanceLow52:current && low52 ? (current / low52 - 1) * 100 : null,
    return20:returns(20), return50:returns(50), return100:returns(100), return200:returns(200),
    averageVolume20:volume20, latestVolume:Number(latest?.volume) || null,
    volumeRatio:volume20 && latest ? (Number(latest.volume) || 0) / volume20 : null,
  };
}

function positionBySymbol(positions) {
  const map = new Map();
  for (const item of positions || []) {
    if (String(item.status || "OPEN").toUpperCase() !== "OPEN") continue;
    const symbol = String(item.symbol || "").toUpperCase().replace(/\.IS$/, "");
    if (!symbol) continue;
    map.set(symbol, {lot:Number(item.quantity ?? item.lot) || 0, averageCost:number(item.entry ?? item.averageCost), current:number(item.current)});
  }
  return map;
}

function buildTsmomPortfolio({universe = [], histories = {}, companyNames = {}, positions = [], currentCash = null, realizedPnl = 0, now = Date.now(), source = "UNKNOWN", universeSource = "UNKNOWN"} = {}) {
  const existing = positionBySymbol(positions);
  const rows = universe.map(symbol => {
    const clean = String(symbol).toUpperCase().replace(/\.IS$/, "");
    const bars = Array.isArray(histories[clean]) ? histories[clean] : [];
    const monthly = monthlyCloses(bars, now);
    const currentMonth = monthly.at(-1);
    const reference = monthly.length >= 13 ? monthly.at(-13) : null;
    const tsmom = currentMonth && reference && reference.close > 0 ? (currentMonth.close / reference.close - 1) * 100 : null;
    const latest = bars.at(-1) || null;
    const timestamp = marketDate(latest?.timestamp || latest?.date || latest?.time || 0).getTime();
    const stale = !timestamp || now - timestamp > STALE_PRICE_MS;
    const quality = !bars.length ? "NO_DATA" : !reference ? "INSUFFICIENT_HISTORY" : stale ? "STALE_PRICE" : "PRICE_OK";
    return {symbol:clean, companyName:String(companyNames[clean] || clean), bars, currentPrice:number(latest?.close), currentPriceTimestamp:latest?.timestamp || latest?.date || latest?.time || null, currentMonthEndClose:currentMonth?.close ?? null, currentMonthEndDate:currentMonth?.date ?? null, referenceClose:reference?.close ?? null, referenceDate:reference?.date ?? null, absolutePriceDifference:currentMonth && reference ? currentMonth.close-reference.close : null, tsmom, dataQuality:quality, technical:technicals(bars)};
  });
  const positives = rows.filter(row => row.tsmom !== null && row.tsmom > 0).sort((left,right) => right.tsmom-left.tsmom || left.symbol.localeCompare(right.symbol));
  positives.forEach((row,index) => { row.tsmomRank=index+1; row.selected=index<MAX_POSITIONS; });
  const selected = new Set(positives.slice(0,MAX_POSITIONS).map(row => row.symbol));
  for (const row of rows) {
    const current = existing.get(row.symbol) || {lot:0,averageCost:null,current:null};
    const executable = row.currentPrice && row.dataQuality === "PRICE_OK";
    const targetLot = selected.has(row.symbol) && executable ? Math.floor(SLOT_CAPITAL / row.currentPrice) : 0;
    const targetValue = targetLot * (row.currentPrice || 0);
    const deltaLot = targetLot - current.lot;
    row.status = row.tsmom === null ? "NO_DATA" : row.tsmom > 0 ? selected.has(row.symbol) ? "SELECTED" : "POSITIVE_NOT_SELECTED" : "NEGATIVE";
    row.selectionReason = row.status === "SELECTED" ? "Positive TSMOM and rank <= 30" : row.status === "POSITIVE_NOT_SELECTED" ? "Positive TSMOM but rank > 30" : row.status === "NEGATIVE" ? "TSMOM <= 0" : "Completed 12 calendar month reference unavailable";
    row.currentLot=current.lot; row.averageCost=current.averageCost; row.currentMarketValue=(row.currentPrice || current.current || 0)*current.lot;
    row.currentPnl=current.averageCost && row.currentPrice ? (row.currentPrice-current.averageCost)*current.lot : null;
    row.targetSlotCapital=SLOT_CAPITAL; row.targetLot=targetLot; row.targetMarketValue=targetValue; row.deltaLot=deltaLot;
    row.requiredAction=deltaLot>0 ? "BUY" : deltaLot<0 ? "SELL" : "HOLD";
    row.residualCashContribution=selected.has(row.symbol) ? SLOT_CAPITAL-targetValue : 0;
    row.portfolioWeight=BASE_CAPITAL ? row.currentMarketValue/BASE_CAPITAL*100 : 0;
    row.targetPortfolioWeight=targetValue/BASE_CAPITAL*100;
    row.executionReferencePrice=row.currentPrice;
  }
  const sells=rows.filter(row=>row.requiredAction==="SELL"), buys=rows.filter(row=>row.requiredAction==="BUY"), holds=rows.filter(row=>row.requiredAction==="HOLD" && (row.currentLot||row.targetLot));
  const sellProceeds=sells.reduce((sum,row)=>sum+Math.abs(row.deltaLot)*(row.executionReferencePrice||0),0);
  const buyCost=buys.reduce((sum,row)=>sum+row.deltaLot*(row.executionReferencePrice||0),0);
  const invested=rows.reduce((sum,row)=>sum+row.targetMarketValue,0);
  const currentInvested=rows.reduce((sum,row)=>sum+row.currentMarketValue,0);
  const currentPnl=rows.reduce((sum,row)=>sum+(row.currentPnl||0),0);
  const cash = Number.isFinite(Number(currentCash)) ? Number(currentCash) : Math.max(0, BASE_CAPITAL-currentInvested);
  const realized = Number.isFinite(Number(realizedPnl)) ? Number(realizedPnl) : 0;
  return {generatedAt:new Date(now).toISOString(), strategy:{name:"12M TSMOM Top 30",baseCapital:BASE_CAPITAL,maxPositions:MAX_POSITIONS,slotCapital:SLOT_CAPITAL,execution:"SELL_FIRST_BUY_SECOND",technicalIndicatorsInformationalOnly:true}, source, universeSource, rows:rows.sort((left,right)=>(left.tsmomRank||999999)-(right.tsmomRank||999999)||left.symbol.localeCompare(right.symbol)), summary:{universeCount:rows.length,positiveCount:positives.length,selectedCount:selected.size,positiveNotSelectedCount:Math.max(0,positives.length-MAX_POSITIONS),negativeCount:rows.filter(row=>row.status==="NEGATIVE").length,noDataCount:rows.filter(row=>row.status==="NO_DATA").length,currentNav:cash+currentInvested,availableCash:cash,investedValue:currentInvested,unrealizedPnl:currentPnl,realizedPnl:realized,totalPnl:currentPnl+realized,returnPercent:(currentPnl+realized)/BASE_CAPITAL*100,openPositions:rows.filter(row=>row.currentLot>0).length,lastPriceUpdate:rows.map(row=>row.currentPriceTimestamp).filter(Boolean).sort().at(-1)||null,lastSignalDate:positives[0]?.currentMonthEndDate||null}, rebalance:{sells,buys,holds,sellProceeds,buyCost,cashBefore:cash,cashAfter:cash+sellProceeds-buyCost,estimatedInvestedValue:invested,estimatedPositionCount:selected.size}};
}

module.exports={BASE_CAPITAL,MAX_POSITIONS,SLOT_CAPITAL,STALE_PRICE_MS,monthlyCloses,technicals,buildTsmomPortfolio};
