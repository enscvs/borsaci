"use strict";

/**
 * Precision Engine v1
 * Deterministic, fail-closed analysis. No LLM can alter these outputs.
 */
const CONFIG = Object.freeze({
  version: "precision-v1",
  data: { minBars: 252, maxStaleDays: 7, maxGapDays: 8, minAverageVolume: 10000 },
  regime: { breadthRiskOn: 0.55, breadthRiskOff: 0.4, maxAtrPercent: 6, slopeLookback: 10 },
  strategy: {
    rsiMin: 50, rsiMax: 65, rsLookbacks: [20, 60], topRelativeStrengthPercent: 0.25,
    maxDistanceFromEma20Atr: 1.25, maxAtrPercent: 7, pullbackDays: 5,
    volumeConfirmationRatio: 1.05, minRiskReward: 2, maxHoldingDays: 10,
    stopAtrBuffer: 0.35, slippageBps: 10, commissionBps: 10
  },
  validation: { minModelSamples: 300, minCalibrationSamples: 100, minHighConfidenceWins: 0.60 },
  walkForward: { trainBars: 504, calibrationBars: 126, testBars: 126, purgeBars: 10, embargoBars: 5 }
});

function finite(value) { return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)); }
function barTimestamp(bar) {
  const raw = bar?.timestamp ?? bar?.date ?? bar?.time;
  if (raw instanceof Date) return raw.getTime();
  if (typeof raw === "number" && Number.isFinite(raw)) return raw < 100000000000 ? raw * 1000 : raw;
  const parsed = new Date(raw || 0).getTime();
  return Number.isFinite(parsed) ? parsed : NaN;
}
function mean(values) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null; }
function stddev(values) { const m = mean(values); return m === null ? null : Math.sqrt(mean(values.map(v => (v - m) ** 2))); }
function round(value, decimals = 4) { return finite(value) ? Number(Number(value).toFixed(decimals)) : null; }
function pctChange(now, then) { return finite(now) && finite(then) && Number(then) !== 0 ? Number(now) / Number(then) - 1 : null; }

function emaSeries(values, period) {
  if (!Array.isArray(values) || values.length < period) return [];
  const result = new Array(values.length).fill(null);
  let current = mean(values.slice(0, period));
  result[period - 1] = current;
  const multiplier = 2 / (period + 1);
  for (let i = period; i < values.length; i += 1) {
    current = (values[i] - current) * multiplier + current;
    result[i] = current;
  }
  return result;
}
function rsiSeries(values, period = 14) {
  const result = new Array(values.length).fill(null);
  if (values.length <= period) return result;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i += 1) { const d = values[i] - values[i - 1]; gains += Math.max(d, 0); losses += Math.max(-d, 0); }
  let avgGain = gains / period, avgLoss = losses / period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i += 1) {
    const d = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}
function atrSeries(history, period = 14) {
  const tr = history.map((bar, i) => i === 0 ? bar.high - bar.low : Math.max(bar.high - bar.low, Math.abs(bar.high - history[i - 1].close), Math.abs(bar.low - history[i - 1].close)));
  return emaSeries(tr, period);
}
function adxSeries(history, period = 14) {
  const result = new Array(history.length).fill(null);
  const tr = [], plus = [], minus = [];
  for (let i = 0; i < history.length; i += 1) {
    if (i === 0) { tr.push(0); plus.push(0); minus.push(0); continue; }
    const up = history[i].high - history[i - 1].high, down = history[i - 1].low - history[i].low;
    tr.push(Math.max(history[i].high - history[i].low, Math.abs(history[i].high - history[i - 1].close), Math.abs(history[i].low - history[i - 1].close)));
    plus.push(up > down && up > 0 ? up : 0); minus.push(down > up && down > 0 ? down : 0);
  }
  const smoothTr = emaSeries(tr, period), smoothPlus = emaSeries(plus, period), smoothMinus = emaSeries(minus, period);
  const dx = history.map((_, i) => {
    if (!finite(smoothTr[i]) || !smoothTr[i]) return null;
    const p = 100 * smoothPlus[i] / smoothTr[i], m = 100 * smoothMinus[i] / smoothTr[i];
    return p + m ? 100 * Math.abs(p - m) / (p + m) : 0;
  });
  const known = dx.map(v => v === null ? 0 : v);
  const adx = emaSeries(known, period);
  for (let i = period * 2 - 1; i < history.length; i += 1) result[i] = adx[i];
  return result;
}
function macdHistogram(values) {
  const e12 = emaSeries(values, 12), e26 = emaSeries(values, 26);
  const macd = values.map((_, i) => finite(e12[i]) && finite(e26[i]) ? e12[i] - e26[i] : 0);
  const signal = emaSeries(macd, 9);
  return values.map((_, i) => finite(e12[i]) && finite(e26[i]) && finite(signal[i]) ? macd[i] - signal[i] : null);
}
function isDailyCandleComplete(timestamp, now = Date.now()) {
  const d = new Date(timestamp), current = new Date(now);
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false });
  const parts = Object.fromEntries(fmt.formatToParts(d).filter(x => x.type !== "literal").map(x => [x.type, x.value]));
  const nowParts = Object.fromEntries(fmt.formatToParts(current).filter(x => x.type !== "literal").map(x => [x.type, x.value]));
  const day = parts.year + parts.month + parts.day, today = nowParts.year + nowParts.month + nowParts.day;
  return day < today || (day === today && Number(nowParts.hour) >= 18);
}
function validateHistory(history, { now = Date.now(), config = CONFIG, requireComplete = true } = {}) {
  const errors = [];
  if (!Array.isArray(history) || history.length < config.data.minBars) errors.push({ code: "INSUFFICIENT_HISTORY", message: "En az 252 işlem günü doğrulanmış geçmiş veri gerekli." });
  if (!Array.isArray(history) || !history.length) return { ok: false, errors };
  let previous = null;
  for (const bar of history) {
    const timestamp = barTimestamp(bar);
    if (!finite(timestamp) || ![bar.open, bar.high, bar.low, bar.close, bar.volume].every(finite)) { errors.push({ code: "INVALID_OHLC", message: "OHLCV alanlarında geçersiz değer var." }); break; }
    if (bar.open <= 0 || bar.high <= 0 || bar.low <= 0 || bar.close <= 0 || bar.volume < 0 || bar.high < Math.max(bar.open, bar.close, bar.low) || bar.low > Math.min(bar.open, bar.close, bar.high)) { errors.push({ code: "INCONSISTENT_OHLC", message: "OHLC değerleri tutarlı değil." }); break; }
    if (previous && timestamp <= previous) { errors.push({ code: "NON_CHRONOLOGICAL_DATA", message: "Mum zamanları kronolojik değil." }); break; }
    if (previous && timestamp - previous > config.data.maxGapDays * 86400000) { errors.push({ code: "CRITICAL_CANDLE_GAP", message: "Kritik dönemde eksik mum var." }); break; }
    previous = timestamp;
  }
  const last = history[history.length - 1], lastTime = barTimestamp(last);
  if (!finite(lastTime) || now - lastTime > config.data.maxStaleDays * 86400000) errors.push({ code: "STALE_DATA", message: "Son piyasa verisi güncel değil." });
  if (requireComplete && !isDailyCandleComplete(lastTime, now)) errors.push({ code: "INCOMPLETE_LAST_CANDLE", message: "Son günlük mum henüz tamamlanmadı." });
  const avgVolume = mean(history.slice(-20).map(x => Number(x.volume)));
  if (!finite(avgVolume) || avgVolume <= 0) errors.push({ code: "INVALID_VOLUME", message: "Hacim verisi geçerli değil." });
  return { ok: errors.length === 0, errors, lastTimestamp: Number.isFinite(lastTime) ? new Date(lastTime).toISOString() : null, averageVolume: avgVolume };
}
function featuresAt(history, index = history.length - 1) {
  const slice = history.slice(0, index + 1), closes = slice.map(x => Number(x.close)), volumes = slice.map(x => Number(x.volume));
  const e20 = emaSeries(closes, 20), e50 = emaSeries(closes, 50), e200 = emaSeries(closes, 200), rsi = rsiSeries(closes), atr = atrSeries(slice), adx = adxSeries(slice), macd = macdHistogram(closes);
  const vol20 = mean(volumes.slice(-20)), volStd = stddev(volumes.slice(-20)), price = closes.at(-1), last = slice.at(-1);
  const lookback = n => pctChange(price, closes[closes.length - 1 - n]);
  return {
    price, ema20: e20.at(-1), ema50: e50.at(-1), ema200: e200.at(-1), rsi14: rsi.at(-1), atr: atr.at(-1), adx: adx.at(-1), macdHistogram: macd.at(-1),
    atrPercent: finite(atr.at(-1)) ? atr.at(-1) / price * 100 : null, volume: last.volume, averageVolume20: vol20,
    volumeRatio: finite(vol20) && vol20 ? last.volume / vol20 : null, volumeZScore: finite(volStd) && volStd ? (last.volume - vol20) / volStd : null,
    return1: lookback(1), return5: lookback(5), return10: lookback(10), return20: lookback(20), return60: lookback(60),
    ema20Slope: finite(e20.at(-1)) && finite(e20.at(-11)) ? (e20.at(-1) / e20.at(-11) - 1) : null,
    ema50Slope: finite(e50.at(-1)) && finite(e50.at(-11)) ? (e50.at(-1) / e50.at(-11) - 1) : null,
    gap: finite(last.open) && finite(slice.at(-2)?.close) ? last.open / slice.at(-2).close - 1 : null
  };
}
function calculateMarketRegime({ indexHistory, universeFeatures, config = CONFIG, now = Date.now() }) {
  const quality = validateHistory(indexHistory, { config, now });
  if (!quality.ok) return { regime: "UNKNOWN", allowed: false, reason: "XU100 verisi doğrulanamadı.", dataQuality: quality };
  const feature = featuresAt(indexHistory), breadth = (universeFeatures || []).filter(x => finite(x.ema50) && finite(x.price)).filter(x => x.price > x.ema50).length / Math.max(1, (universeFeatures || []).filter(x => finite(x.ema50) && finite(x.price)).length);
  if (![feature.price, feature.ema50, feature.ema200, feature.ema50Slope, feature.atrPercent].every(finite)) return { regime: "UNKNOWN", allowed: false, reason: "Rejim için gerekli endeks göstergeleri eksik.", dataQuality: quality };
  const riskOn = feature.price > feature.ema50 && feature.price > feature.ema200 && feature.ema50 > feature.ema200 && feature.ema50Slope > 0 && breadth >= config.regime.breadthRiskOn && feature.atrPercent <= config.regime.maxAtrPercent;
  const riskOff = feature.price < feature.ema200 || feature.ema50 < feature.ema200 || breadth < config.regime.breadthRiskOff || feature.atrPercent > config.regime.maxAtrPercent * 1.35;
  return { regime: riskOn ? "RISK_ON" : riskOff ? "RISK_OFF" : "NEUTRAL", allowed: true, breadth: round(breadth, 4), index: feature, dataQuality: quality, reason: riskOn ? "Endeks trendi ve piyasa genişliği uygun." : riskOff ? "Endeks zayıf; ancak hisse bazlı filtreler işlem kararını belirler." : "Koşullar karışık; hisse bazlı filtreler işlem kararını belirler." };
}
function rankRelativeStrength(candidates, indexHistory) {
  const index = featuresAt(indexHistory), scored = candidates.map(candidate => {
    const f = candidate.features || featuresAt(candidate.history);
    const rs20 = finite(f.return20) && finite(index.return20) ? f.return20 - index.return20 : null;
    const rs60 = finite(f.return60) && finite(index.return60) ? f.return60 - index.return60 : null;
    return { ...candidate, features: f, rs20, rs60, rsScore: finite(rs20) && finite(rs60) ? rs20 * .45 + rs60 * .55 : null };
  }).filter(x => finite(x.rsScore)).sort((a,b) => b.rsScore - a.rsScore);
  return scored.map((x, i) => ({ ...x, relativeStrengthRank: i + 1, relativeStrengthPercentile: (i + 1) / scored.length }));
}
function buildPlan(history, features, config = CONFIG) {
  const price = features.price, lows = history.slice(-config.strategy.pullbackDays).map(x => x.low), support = Math.min(...lows);
  const rawStop = Math.min(support - features.atr * config.strategy.stopAtrBuffer, price - features.atr);
  const risk = price - rawStop;
  const entryLow = price - features.atr * .15, entryHigh = price + features.atr * .15, target1 = price + risk * 2, target2 = price + risk * 3;
  const resistance = Math.max(...history.slice(-60, -1).map(x => x.high));
  return { entry: { low: round(entryLow,2), high: round(entryHigh,2), reference: round(price,2) }, stop: round(rawStop,2), target1: round(target1,2), target2: round(target2,2), risk: round(risk,4), riskReward: round((target1 - price) / risk,2), resistance: round(resistance,2), resistanceRoomR: round((resistance - price) / risk,2), maxHoldingDays: config.strategy.maxHoldingDays };
}
function evaluateSetup(candidate, { regime, config = CONFIG, model = null } = {}) {
  const quality = validateHistory(candidate.history, { config });
  const f = candidate.features || featuresAt(candidate.history);
  const reasons = [], invalidators = [], missing = quality.errors.map(x => x.code);
  if (!quality.ok) return { symbol: candidate.symbol, decision: "NO_TRADE", dataQuality: "FAILED", validation: quality, reasons, invalidators, missing, calibration: { status: "KALIBRE_EDILMEDI" } };
  if (!regime || !regime.allowed) return { symbol: candidate.symbol, decision: "NO_TRADE", dataQuality: "PASSED", marketRegime: regime?.regime || "UNKNOWN", reasons, invalidators: [regime?.reason || "Piyasa rejimi bilinmiyor."], missing, calibration: { status: "KALIBRE_EDILMEDI" } };
  const plan = buildPlan(candidate.history, f, config);
  const checks = [
    [f.price > f.ema200 && f.ema20 > f.ema50 && f.ema50 > f.ema200 && f.ema20Slope > 0 && f.ema50Slope > 0, "Trend yapısı uygun"],
    [finite(candidate.rs20) && finite(candidate.rs60) && candidate.rs20 > 0 && candidate.rs60 > 0 && candidate.relativeStrengthPercentile <= config.strategy.topRelativeStrengthPercent, "Göreceli güç üst çeyrekte"],
    [f.rsi14 >= config.strategy.rsiMin && f.rsi14 <= config.strategy.rsiMax, "RSI kontrollü momentum aralığında"],
    [Math.abs(f.price - f.ema20) <= f.atr * config.strategy.maxDistanceFromEma20Atr && f.atrPercent <= config.strategy.maxAtrPercent, "Fiyat EMA20'ye ve volatiliteye göre kontrollü"],
    [f.volumeRatio >= config.strategy.volumeConfirmationRatio && f.averageVolume20 >= config.data.minAverageVolume, "Teyit hacmi ve likidite yeterli"],
    [plan.stop > 0 && plan.stop < f.price && plan.riskReward >= config.strategy.minRiskReward && plan.resistanceRoomR >= config.strategy.minRiskReward, "Yapısal stop, direnç alanı ve risk/getiri uygun"]
  ];
  checks.forEach(([ok, text]) => ok ? reasons.push(text) : invalidators.push(text));
  const allFilters = checks.every(x => x[0]);
  const calibrated = Boolean(model?.calibrated && model?.sampleSize >= config.validation.minModelSamples && finite(model?.threshold) && typeof model.predict === "function");
  if (!allFilters) return { symbol: candidate.symbol, decision: "NO_TRADE", dataQuality: "PASSED", marketRegime: regime.regime, features: f, plan, reasons, invalidators, missing, calibration: { status: calibrated ? "AVAILABLE" : "KALIBRE_EDILMEDI", modelVersion: model?.version || null }, disclaimer: "Garanti değildir." };
  /*
   * Historical calibration is intentionally disabled. A setup that passes
   * the deterministic data, regime, strength, liquidity and 1:2 gates is
   * shown as passed; no success probability is inferred or displayed.
   */
  if (!calibrated) return { symbol: candidate.symbol, decision: "FILTERS_PASSED", dataQuality: "PASSED", marketRegime: regime.regime, features: f, plan, reasons, invalidators: [], missing, calibration: { status: "DISABLED", modelVersion: null }, disclaimer: "Geçmiş başarı olasılığı hesaplanmaz; garanti değildir." };
  const probability = model.predict(f), expectedR = (probability * 2) - (1 - probability) - ((config.strategy.commissionBps + config.strategy.slippageBps) / 10000);
  const approved = probability >= model.threshold && expectedR > 0;
  return { symbol: candidate.symbol, decision: approved ? "FILTERS_PASSED" : "NO_TRADE", dataQuality: "PASSED", marketRegime: regime.regime, features: f, plan, reasons, invalidators: approved ? [] : ["Kalibre edilmiş olasılık veya masraf sonrası beklenen değer eşiği geçilmedi."], missing, probability: round(probability,4), expectedR: round(expectedR,4), calibration: { status: "CALIBRATED", modelVersion: model.version }, disclaimer: "Garanti değildir; geçmiş sonuçlar geleceği garanti etmez." };
}
function labelTrade(history, signalIndex, plan, config = CONFIG) {
  const entryBar = history[signalIndex + 1];
  if (!entryBar) return null;
  const entry = entryBar.open * (1 + config.strategy.slippageBps / 10000), stop = plan.stop, target = entry + (entry - stop) * 2;
  for (let i = signalIndex + 1; i <= Math.min(history.length - 1, signalIndex + config.strategy.maxHoldingDays); i += 1) {
    const bar = history[i];
    if (bar.open <= stop) return { outcome: "LOSS", exit: bar.open, holdingDays: i - signalIndex, entry, stop, target, r: round((bar.open - entry) / (entry - stop)) };
    const stopHit = bar.low <= stop, targetHit = bar.high >= target;
    if (stopHit && targetHit) return { outcome: "LOSS", exit: stop, holdingDays: i - signalIndex, entry, stop, target, r: -1, conservativeSameBar: true };
    if (stopHit) return { outcome: "LOSS", exit: stop, holdingDays: i - signalIndex, entry, stop, target, r: -1 };
    if (targetHit) return { outcome: "WIN", exit: target, holdingDays: i - signalIndex, entry, stop, target, r: 2 };
  }
  const exit = history[Math.min(history.length - 1, signalIndex + config.strategy.maxHoldingDays)].close;
  return { outcome: "TIMEOUT", exit, holdingDays: config.strategy.maxHoldingDays, entry, stop, target, r: round((exit - entry) / (entry - stop)) };
}
function summarizeBacktest(trades) {
  const counts = { WIN: 0, LOSS: 0, TIMEOUT: 0 }; trades.forEach(x => { counts[x.outcome] = (counts[x.outcome] || 0) + 1; });
  const wins = trades.filter(x => x.r > 0).reduce((s,x) => s + x.r, 0), losses = Math.abs(trades.filter(x => x.r < 0).reduce((s,x) => s + x.r, 0));
  let equity = 0, peak = 0, maxDrawdown = 0, consecutiveLosses = 0, maxConsecutiveLosses = 0;
  trades.forEach(x => { equity += x.r; peak = Math.max(peak,equity); maxDrawdown = Math.min(maxDrawdown,equity - peak); consecutiveLosses = x.r < 0 ? consecutiveLosses + 1 : 0; maxConsecutiveLosses = Math.max(maxConsecutiveLosses, consecutiveLosses); });
  return { totalSignals: trades.length, ...counts, winRate: trades.length ? counts.WIN / trades.length : null, averageR: mean(trades.map(x=>x.r)), expectancyR: mean(trades.map(x=>x.r)), profitFactor: losses ? wins / losses : null, maxDrawdownR: maxDrawdown, maxConsecutiveLosses, averageReturnR: mean(trades.map(x=>x.r)), trades };
}
function walkForward(samples, config = CONFIG) {
  const { trainBars, calibrationBars, testBars, purgeBars, embargoBars } = config.walkForward;
  const folds = [];
  for (let start = 0; start + trainBars + purgeBars + calibrationBars + embargoBars + testBars <= samples.length; start += testBars) {
    folds.push({ train: samples.slice(start,start+trainBars), calibration: samples.slice(start+trainBars+purgeBars,start+trainBars+purgeBars+calibrationBars), test: samples.slice(start+trainBars+purgeBars+calibrationBars+embargoBars,start+trainBars+purgeBars+calibrationBars+embargoBars+testBars) });
  }
  return { type: "CHRONOLOGICAL_WALK_FORWARD", folds, purgeBars, embargoBars, note: "Rastgele bölme kullanılmaz; son test dönemi parametre seçimi için kullanılmaz." };
}
function attachLlmExplanation(decision, explanation) {
  return { ...decision, llmExplanation: String(explanation || "").slice(0, 500) };
}

function runBacktest(signals, config = CONFIG) {
  const trades = [];
  const openSymbols = new Set();
  const ordered = [...(signals || [])].sort((a, b) => Number(a.signalIndex) - Number(b.signalIndex));
  for (const signal of ordered) {
    if (!signal?.history || openSymbols.has(signal.symbol)) continue;
    const label = labelTrade(signal.history, signal.signalIndex, signal.plan, config);
    if (!label) continue;
    openSymbols.add(signal.symbol);
    trades.push({ ...label, symbol: signal.symbol, sector: signal.sector || "UNKNOWN", regime: signal.regime || "UNKNOWN", signalIndex: signal.signalIndex });
    openSymbols.delete(signal.symbol);
  }
  const summary = summarizeBacktest(trades);
  const group = key => Object.fromEntries([...new Set(trades.map(x => x[key]))].map(value => [value, summarizeBacktest(trades.filter(x => x[key] === value))]));
  return {
    ...summary,
    beforeCosts: { ...summary },
    afterCosts: summary,
    byRegime: group("regime"),
    bySector: group("sector"),
    coverage: { evaluatedSignals: ordered.length, executedSignals: trades.length },
    assumptions: { nextSessionOpen: true, conservativeSameBarLoss: true, maxHoldingDays: config.strategy.maxHoldingDays, commissionBps: config.strategy.commissionBps, slippageBps: config.strategy.slippageBps },
  };
}
function trainLogistic(samples, featureNames, iterations = 300, learningRate = 0.05) {
  const rows = (samples || []).filter(x => featureNames.every(key => finite(x.features?.[key])) && (x.label === 0 || x.label === 1));
  if (rows.length < 20) return null;
  const weights = new Array(featureNames.length + 1).fill(0);
  const sigmoid = z => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
  for (let step = 0; step < iterations; step += 1) {
    const gradient = new Array(weights.length).fill(0);
    for (const row of rows) {
      const x = [1, ...featureNames.map(key => Number(row.features[key]))];
      const error = sigmoid(x.reduce((sum, value, i) => sum + value * weights[i], 0)) - row.label;
      x.forEach((value, i) => { gradient[i] += error * value; });
    }
    weights.forEach((_, i) => { weights[i] -= learningRate * gradient[i] / rows.length; });
  }
  return { type: "LOGISTIC_REGRESSION", featureNames, sampleSize: rows.length, predict(features) { const x = [1, ...featureNames.map(key => Number(features[key] || 0))]; return sigmoid(x.reduce((sum, value, i) => sum + value * weights[i], 0)); } };
}
function brierScore(predictions) {
  const rows = (predictions || []).filter(x => finite(x.probability) && (x.label === 0 || x.label === 1));
  return rows.length ? mean(rows.map(x => (x.probability - x.label) ** 2)) : null;
}

module.exports = { CONFIG, barTimestamp, validateHistory, featuresAt, calculateMarketRegime, rankRelativeStrength, buildPlan, evaluateSetup, labelTrade, summarizeBacktest, walkForward, attachLlmExplanation, runBacktest, trainLogistic, brierScore, emaSeries, rsiSeries, atrSeries };
