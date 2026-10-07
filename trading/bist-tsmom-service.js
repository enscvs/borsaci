"use strict";

// BIST 12M TSMOM presentation model.  This module is deliberately pure: it
// does not open orders or persist anything.  The caller supplies completed
// daily bars and the current paper positions for a migration preview only.
const BASE_CAPITAL = 100000;
const MAX_POSITIONS = 30;
const SLOT_CAPITAL = BASE_CAPITAL / MAX_POSITIONS;
const STALE_PRICE_MS = 3 * 24 * 60 * 60 * 1000;

const number = value => value === null || value === undefined || typeof value === "boolean" || String(value).trim() === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const marketDate = value => {
  const numeric = number(value);
  return value === null || value === undefined ? new Date(NaN) : numeric !== null && numeric > 0 && numeric < 100000000000 ? new Date(numeric * 1000) : new Date(value);
};
const symbolKey = value => String(value || "").trim().toUpperCase().replace(/\.IS$/, "");
const monthFormatter = new Intl.DateTimeFormat("en-CA", {timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit"});
const monthKey = value => {
  const parts=Object.fromEntries(monthFormatter.formatToParts(value).map(item=>[item.type,item.value]));
  return `${parts.year}-${parts.month}`;
};
function shiftedMonth(key, offset) {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 7);
}

// Unknown values never become zero prices. Conflicting duplicate timestamps
// are excluded rather than selecting an arbitrary record. No input mutation.
function normalizeBars(bars, now = Date.now()) {
  const byTime = new Map(), conflicts = new Set();
  let rejected = 0;
  for (const item of Array.isArray(bars) ? bars : []) {
    const time = marketDate(item.timestamp ?? item.date ?? item.time).getTime();
    const close = number(item.close), high = number(item.high), low = number(item.low), open = number(item.open ?? item.close);
    if (!Number.isFinite(time) || time > now || [close, high, low, open].some(value => value === null || value <= 0) || high < Math.max(open,close,low) || low > Math.min(open,close,high)) { rejected++; continue; }
    const bar = {timestamp:new Date(time).toISOString(),time:time/1000,open,high,low,close,volume:number(item.volume)};
    const prior = byTime.get(time);
    if (prior && JSON.stringify(prior) !== JSON.stringify(bar)) { conflicts.add(time); rejected++; }
    else byTime.set(time, bar);
  }
  const sorted = [...byTime].filter(([time]) => !conflicts.has(time)).sort(([a],[b]) => a-b).map(([,bar]) => bar);
  const {completedDailyHistory} = require("./fibonacci-engine");
  return {bars:completedDailyHistory(sorted, now, {market:"BIST"}), rejected};
}

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
  return loss === 0 ? gain === 0 ? 50 : 100 : 100 - (100 / (1 + gain / loss));
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
    if (!Number.isFinite(date.getTime()) || number(bar.close) === null || Number(bar.close) <= 0) continue;
    const key = monthKey(date);
    const previous = byMonth.get(key);
    if (!previous || date.getTime() > previous.timestamp) byMonth.set(key, {key, date: date.toISOString().slice(0, 10), timestamp: date.getTime(), close: Number(bar.close)});
  }
  const currentKey = monthKey(new Date(now));
  // A partial current calendar month is never an end-of-month TSMOM input.
  return [...byMonth.values()].filter(item => item.key < currentKey).sort((left, right) => left.timestamp - right.timestamp);
}

function expectedMonthEnd(key) {
  const [year, month] = key.split("-").map(Number);
  const day = new Date(Date.UTC(year, month, 0));
  while ([0,6].includes(day.getUTCDay())) day.setUTCDate(day.getUTCDate()-1);
  return day.toISOString().slice(0,10);
}

function nextRebalanceDate(now = Date.now()) {
  return `${shiftedMonth(monthKey(new Date(now)), 1)}-01`;
}

function technicals(bars) {
  const valid = (bars || []).filter(bar => [bar.close, bar.high, bar.low].every(value => number(value) !== null && Number(value)>0) && Number(bar.high)>=Number(bar.close) && Number(bar.low)<=Number(bar.close));
  const closes = valid.map(bar => Number(bar.close));
  const volumes = valid.map(bar => number(bar.volume));
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
  const volume20 = volumes.length>=20 && volumes.slice(-20).every(value=>value!==null && value>=0) ? sma(volumes,20) : null;
  return {
    sma20:sma(closes,20), sma50:sma(closes,50), sma100:sma(closes,100), sma200:sma(closes,200),
    ema20:ema(closes,20), ema50:ema(closes,50), ema100:ema(closes,100), ema200:ema(closes,200),
    rsi14:rsi(closes), macd, macdSignal, macdHistogram:macd === null || macdSignal === null ? null : macd - macdSignal,
    atr14:atr(valid), atrPercent:current && atr(valid) !== null ? atr(valid) / current * 100 : null,
    volatility20:volatility(20), volatility60:volatility(60), high52, low52,
    distanceHigh52:current && high52 ? (current / high52 - 1) * 100 : null,
    distanceLow52:current && low52 ? (current / low52 - 1) * 100 : null,
    return20:returns(20), return50:returns(50), return100:returns(100), return200:returns(200),
    averageVolume20:volume20, latestVolume:number(latest?.volume),
    volumeRatio:volume20>0 && number(latest?.volume)!==null ? Number(latest.volume) / volume20 : null,
  };
}

function positionBySymbol(positions) {
  const map = new Map();
  for (const item of positions || []) {
    if (String(item.status || "OPEN").toUpperCase() !== "OPEN") continue;
    const symbol = symbolKey(item.symbol);
    if (!symbol) continue;
    const lot = number(item.quantity ?? item.lot);
    if (lot === 0) continue;
    if (lot === null || lot < 0) {
      const prior = map.get(symbol) || {lot:0,costValue:0,markedValue:0,costKnown:false,markKnown:false};
      prior.validLot=false; prior.invalidQuantity=true;
      map.set(symbol,prior);
      continue;
    }
    const cost=number(item.entry ?? item.averageCost), current=number(item.current);
    const prior=map.get(symbol) || {lot:0,costValue:0,markedValue:0,costKnown:true,markKnown:true,validLot:true};
    prior.lot+=lot; prior.costKnown=prior.costKnown && cost!==null && cost>0;
    prior.markKnown=prior.markKnown && current!==null && current>0;
    prior.costValue+=(cost || 0)*lot; prior.markedValue+=(current || 0)*lot;
    prior.validLot=prior.validLot && Number.isInteger(lot);
    prior.averageCost=prior.costKnown ? prior.costValue/prior.lot : null;
    prior.current=prior.markKnown ? prior.markedValue/prior.lot : null;
    map.set(symbol,prior);
  }
  return map;
}

function buildTsmomPortfolio({universe = [], histories = {}, companyNames = {}, positions = [], currentCash = null, realizedPnl = 0, accountCapital = BASE_CAPITAL, expectedMonthEndDates = null, now = Date.now(), source = "UNKNOWN", universeSource = "UNKNOWN"} = {}) {
  const existing = positionBySymbol(positions);
  const universeSet = new Set(universe.map(symbolKey).filter(Boolean));
  const symbols = [...new Set([...universeSet, ...existing.keys()])];
  const signalMonth = shiftedMonth(monthKey(new Date(now)), -1);
  const referenceMonth = shiftedMonth(signalMonth, -12);
  const rows = symbols.map(clean => {
    const normalized = normalizeBars(histories[clean],now), bars=normalized.bars;
    const monthly = monthlyCloses(bars, now);
    const currentMonth = monthly.find(item=>item.key===signalMonth);
    const reference = monthly.find(item=>item.key===referenceMonth);
    const endpointComplete = endpoint => {
      if (!endpoint) return false;
      const expected = expectedMonthEndDates === null ? expectedMonthEnd(endpoint.key) : expectedMonthEndDates[endpoint.key];
      return Boolean(expected) && endpoint.date >= expected;
    };
    const completeEndpoints = endpointComplete(currentMonth) && endpointComplete(reference);
    const tsmom = completeEndpoints && reference.close > 0 ? (currentMonth.close / reference.close - 1) * 100 : null;
    const latest = bars.at(-1) || null;
    const timestamp = marketDate(latest?.timestamp).getTime();
    // Conservative age cap on completed DAILY reference prices, not a live
    // quote guarantee. Both BUY and SELL are blocked beyond 72 hours. Long
    // holiday closures can therefore block previews until fresh data arrives.
    const stale = !Number.isFinite(timestamp) || now-timestamp>STALE_PRICE_MS;
    const flags=[];
    if (!bars.length) flags.push("NO_DATA");
    if (!completeEndpoints) flags.push("INSUFFICIENT_HISTORY");
    if (stale) flags.push("STALE_PRICE");
    if (normalized.rejected) flags.push("INVALID_DATA");
    if (!flags.length) flags.push("PRICE_OK");
    return {symbol:clean,companyName:String(companyNames[clean] || clean),universeStatus:universeSet.has(clean)?"IN_UNIVERSE":"LEGACY_OUTSIDE_UNIVERSE",currentPrice:number(latest?.close),currentPriceTimestamp:latest?.timestamp ?? null,currentMonthEndClose:currentMonth?.close ?? null,currentMonthEndDate:currentMonth?.date ?? null,referenceClose:reference?.close ?? null,referenceDate:reference?.date ?? null,expectedSignalMonth:signalMonth,expectedReferenceMonth:referenceMonth,absolutePriceDifference:currentMonth && reference?currentMonth.close-reference.close:null,tsmom,dataQuality:flags.join(" · "),dataQualityFlags:flags,rejectedBars:normalized.rejected,technical:technicals(bars)};
  });
  const positives = rows.filter(row => row.universeStatus==="IN_UNIVERSE" && row.tsmom !== null && row.tsmom > 0).sort((left,right) => right.tsmom-left.tsmom || left.symbol.localeCompare(right.symbol));
  positives.forEach((row,index) => { row.tsmomRank=index+1; row.selected=index<MAX_POSITIONS; });
  const selected = new Set(positives.slice(0,MAX_POSITIONS).map(row => row.symbol));
  for (const row of rows) {
    const current = existing.get(row.symbol) || {lot:0,averageCost:null,current:null,validLot:true};
    const executable = row.currentPrice>0 && row.dataQuality==="PRICE_OK" && current.validLot;
    // Unknown target is NOT a target of zero: missing/stale data must never
    // turn an existing holding into an implicit liquidation instruction.
    const targetLot = executable ? selected.has(row.symbol) ? Math.floor(SLOT_CAPITAL/row.currentPrice) : 0 : null;
    const targetValue = targetLot===null ? null : targetLot*row.currentPrice;
    const deltaLot = targetLot===null ? null : targetLot-current.lot;
    row.status = row.tsmom === null ? "NO_DATA" : row.tsmom > 0 ? selected.has(row.symbol) ? "SELECTED" : "POSITIVE_NOT_SELECTED" : "NEGATIVE";
    row.selectionReason = row.universeStatus!=="IN_UNIVERSE" ? "Legacy holding outside current universe; excluded from selection" : row.status === "SELECTED" ? `TSMOM > 0; Rank = ${row.tsmomRank}; Rank <= 30 → SELECTED` : row.status === "POSITIVE_NOT_SELECTED" ? "Positive TSMOM but rank > 30" : row.status === "NEGATIVE" ? "TSMOM <= 0" : `Completed month endpoints required: ${signalMonth} / ${referenceMonth}`;
    const mark=row.currentPrice>0 ? row.currentPrice : current.current;
    row.currentLot=current.lot; row.averageCost=current.averageCost;
    row.valuationSource=row.currentPrice>0?"COMPLETED_DAILY":mark>0?"LAST_KNOWN_POSITION_MARK":"UNAVAILABLE";
    row.currentMarketValue=current.invalidQuantity?null:current.lot===0?0:mark>0?mark*current.lot:null;
    row.currentPnl=current.invalidQuantity?null:current.lot===0?0:current.averageCost>0 && mark>0?(mark-current.averageCost)*current.lot:null;
    row.targetSlotCapital=SLOT_CAPITAL; row.targetLot=targetLot; row.targetMarketValue=targetValue; row.deltaLot=deltaLot;
    row.requiredAction=deltaLot===null?"BLOCKED":deltaLot>0?"BUY":deltaLot<0?"SELL":"HOLD";
    row.blockedReason=executable?null:!current.validLot?"INVALID_POSITION_LOT":row.dataQuality;
    row.plannedDeltaLot=executable?deltaLot:0;
    row.residualCashContribution=selected.has(row.symbol)?targetValue===null?null:SLOT_CAPITAL-targetValue:0;
    row.targetPortfolioWeight=targetValue===null?null:targetValue/BASE_CAPITAL*100;
    row.executionReferencePrice=row.currentPrice;
  }
  const currentInvested=rows.some(row=>row.currentMarketValue===null)?null:rows.reduce((sum,row)=>sum+row.currentMarketValue,0);
  const currentPnl=rows.some(row=>row.currentPnl===null)?null:rows.reduce((sum,row)=>sum+row.currentPnl,0);
  // Default new empty account is 100000. Existing holdings with missing cash
  // require reconciliation, not an invented cash balance.
  const cash=number(currentCash) ?? (existing.size===0?BASE_CAPITAL:null);
  const realized=number(realizedPnl);
  const sells=rows.filter(row=>row.requiredAction==="SELL");
  const sellProceeds=sells.reduce((sum,row)=>sum+Math.abs(row.deltaLot)*(row.executionReferencePrice||0),0);
  let budget=cash===null?null:cash+sellProceeds;
  // Fixed targets are never redistributed or shrunk to favor another symbol.
  // A buy is funded in rank order in full or explicitly blocked.
  const candidates=rows.filter(row=>row.requiredAction==="BUY").sort((a,b)=>a.tsmomRank-b.tsmomRank);
  let plannedCount=rows.filter(row=>row.currentLot+(row.requiredAction==="SELL"?row.deltaLot:0)>0).length;
  for (const row of candidates) {
    const cost=row.deltaLot*row.executionReferencePrice;
    const tooMany=row.currentLot===0 && plannedCount>=MAX_POSITIONS;
    if (budget===null || cost>budget || tooMany) {
      row.requiredAction="BLOCKED"; row.plannedDeltaLot=0;
      row.blockedReason=tooMany?"POSITION_LIMIT":budget===null?"CASH_UNKNOWN":"INSUFFICIENT_CASH";
    } else { budget-=cost; if(row.currentLot===0) plannedCount++; }
  }
  const buys=rows.filter(row=>row.requiredAction==="BUY"), holds=rows.filter(row=>row.requiredAction==="HOLD" && (row.currentLot||row.targetLot)), blocked=rows.filter(row=>row.requiredAction==="BLOCKED");
  const buyCost=buys.reduce((sum,row)=>sum+row.deltaLot*(row.executionReferencePrice||0),0);
  const nav=cash===null || currentInvested===null?null:cash+currentInvested;
  const capital = number(accountCapital);
  const validCapital = capital !== null && capital > 0;
  const totalPnl=nav===null || !validCapital?null:nav-capital;
  const reconciliationDifference=totalPnl===null || realized===null || currentPnl===null?null:totalPnl-realized-currentPnl;
  for (const row of rows) row.portfolioWeight=nav>0 && row.currentMarketValue!==null?row.currentMarketValue/nav*100:null;
  const issues=[];
  if (cash===null) issues.push("CASH_UNKNOWN");
  if (!validCapital) issues.push("INVALID_ACCOUNT_CAPITAL");
  if ([...existing.values()].some(item => !item.validLot)) issues.push("INVALID_POSITION_LOT");
  if (cash!==null && cash<0) issues.push("NEGATIVE_STARTING_CASH");
  if (currentInvested===null) issues.push("UNVALUED_POSITION");
  if (reconciliationDifference!==null && Math.abs(reconciliationDifference)>0.01) issues.push("PNL_RECONCILIATION_REQUIRED");
  const listedRows=rows.filter(row=>row.universeStatus==="IN_UNIVERSE");
  return {generatedAt:new Date(now).toISOString(),strategy:{name:"12M TSMOM Top 30",baseCapital:BASE_CAPITAL,accountCapital:validCapital?capital:null,maxPositions:MAX_POSITIONS,slotCapital:SLOT_CAPITAL,execution:"SELL_FIRST_BUY_SECOND",technicalIndicatorsInformationalOnly:true,priceBasis:"COMPLETED_DAILY_REFERENCE_NOT_LIVE",maxPriceAgeMs:STALE_PRICE_MS,costAssumption:"GROSS_PREVIEW_EXCLUDES_FEES_AND_SLIPPAGE",atrMethod:"SIMPLE_MEAN_TRUE_RANGE_14",volatilityMethod:"POPULATION_LOG_RETURN_STDEV_SQRT_252"},source,universeSource,rows:rows.sort((a,b)=>(a.tsmomRank??Infinity)-(b.tsmomRank??Infinity)||a.symbol.localeCompare(b.symbol)),summary:{universeCount:universeSet.size,positiveCount:positives.length,selectedCount:selected.size,positiveNotSelectedCount:Math.max(0,positives.length-MAX_POSITIONS),negativeCount:listedRows.filter(row=>row.status==="NEGATIVE").length,noDataCount:listedRows.filter(row=>row.status==="NO_DATA").length,currentNav:nav,availableCash:cash,investedValue:currentInvested,unrealizedPnl:currentPnl,realizedPnl:realized,totalPnl,returnPercent:totalPnl===null?null:totalPnl/capital*100,reconciliationDifference,accountingIssues:issues,openPositions:existing.size,lastPriceUpdate:rows.map(row=>row.currentPriceTimestamp).filter(Boolean).sort().at(-1)||null,lastSignalDate:listedRows.map(row=>row.currentMonthEndDate).filter(Boolean).sort().at(-1)||null},rebalance:{sells,buys,holds,blocked,sellProceeds,buyCost,cashBefore:cash,cashAfter:budget,estimatedInvestedValue:currentInvested===null?null:currentInvested-sellProceeds+buyCost,estimatedPositionCount:plannedCount}};
}

module.exports={BASE_CAPITAL,MAX_POSITIONS,SLOT_CAPITAL,STALE_PRICE_MS,nextRebalanceDate,monthlyCloses,technicals,buildTsmomPortfolio,normalizeBars,number};

