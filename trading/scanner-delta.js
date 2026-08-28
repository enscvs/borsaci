"use strict";

/*
 * Scanner snapshot'lari arasindaki anlamli farklari tek yerde hesaplar.
 * Bu modul bilincli olarak saf tutulur: kalici state, Telegram veya HTTP
 * baglantisi yoktur. Bu sayede scheduler yeniden baslasa bile onceki ve yeni
 * snapshot'lar ayni sekilde karsilastirilabilir.
 */

const DEFAULT_SCORE_DELTA_THRESHOLD = 5;

function asFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function firstArray(...values) {
  return values.find(Array.isArray) || [];
}

function getSnapshotCandidates(snapshot = {}) {
  if (!snapshot || typeof snapshot !== "object") return [];

  return firstArray(
    snapshot.topCandidates,
    snapshot.candidates,
    snapshot.results,
    snapshot.items,
    snapshot.decisions
  );
}

function candidateSymbol(candidate = {}) {
  const raw = candidate.symbol
    ?? candidate.ticker
    ?? candidate.code
    ?? candidate.asset
    ?? candidate.pair
    ?? candidate.market;

  if (raw === undefined || raw === null) return "";
  return String(raw).trim().toUpperCase().replace(/\s+/g, "");
}

function candidateScore(candidate = {}) {
  return asFiniteNumber(
    candidate.score
    ?? candidate.technicalScore
    ?? candidate.technical?.score
    ?? candidate.qualityScore
  );
}

function candidateAction(candidate = {}) {
  const raw = candidate.action
    ?? candidate.decision
    ?? candidate.tradeAction
    ?? candidate.signal?.action
    ?? candidate.status
    ?? candidate.grade;

  if (raw === undefined || raw === null) return "";
  return String(raw).trim().toUpperCase().replace(/\s+/g, " ");
}

function isBuyAction(action) {
  const normalized = String(action || "").trim().toUpperCase();
  return normalized === "BUY"
    || normalized === "BUY SETUP"
    || normalized === "AL"
    || normalized === "AL ADAYI"
    || normalized.includes("BUY SETUP")
    || normalized.includes("AL ADAYI");
}

function normalizeCandidate(candidate = {}, index = 0) {
  const symbol = candidateSymbol(candidate);
  if (!symbol) return null;

  const score = candidateScore(candidate);
  const action = candidateAction(candidate);

  return {
    symbol,
    score,
    action,
    isBuyCandidate: Boolean(candidate.isBuyCandidate || candidate.buyCandidate || isBuyAction(action)),
    candidate,
    index,
  };
}

function candidateIsPreferred(next, existing) {
  if (next.score !== null && existing.score === null) return true;
  if (next.score === null) return false;
  if (existing.score === null) return true;
  if (next.score !== existing.score) return next.score > existing.score;

  // Esit puanda BUY adayi olan kayit tutulur; diger esitliklerde ilk kayit
  // korunur, boylece ayni snapshot deterministik kalir.
  return next.isBuyCandidate && !existing.isBuyCandidate;
}

function indexCandidates(snapshot) {
  const bySymbol = new Map();

  getSnapshotCandidates(snapshot).forEach((candidate, index) => {
    const normalized = normalizeCandidate(candidate, index);
    if (!normalized) return;

    const existing = bySymbol.get(normalized.symbol);
    if (!existing || candidateIsPreferred(normalized, existing)) {
      bySymbol.set(normalized.symbol, normalized);
    }
  });

  return bySymbol;
}

function sortedByAppearance(entries) {
  return [...entries].sort((left, right) => left.index - right.index || left.symbol.localeCompare(right.symbol));
}

function compareScannerSnapshots(previousSnapshot, nextSnapshot, options = {}) {
  const scoreDeltaThreshold = Math.max(
    0,
    asFiniteNumber(options.scoreDeltaThreshold) ?? DEFAULT_SCORE_DELTA_THRESHOLD
  );
  const previous = indexCandidates(previousSnapshot);
  const next = indexCandidates(nextSnapshot);

  const newCandidates = [];
  const removedCandidates = [];
  const actionChanges = [];
  const scoreChanges = [];
  const newBuyCandidates = [];

  for (const current of next.values()) {
    const prior = previous.get(current.symbol);

    if (!prior) {
      newCandidates.push(current);
      if (current.isBuyCandidate) newBuyCandidates.push(current);
      continue;
    }

    if (current.action && prior.action && current.action !== prior.action) {
      actionChanges.push({
        symbol: current.symbol,
        previous: prior,
        current,
      });
    }

    if (
      current.score !== null
      && prior.score !== null
      && Math.abs(current.score - prior.score) >= scoreDeltaThreshold
    ) {
      scoreChanges.push({
        symbol: current.symbol,
        previous: prior,
        current,
        delta: current.score - prior.score,
      });
    }

    if (current.isBuyCandidate && !prior.isBuyCandidate) {
      newBuyCandidates.push(current);
    }
  }

  for (const prior of previous.values()) {
    if (!next.has(prior.symbol)) removedCandidates.push(prior);
  }

  const result = {
    scoreDeltaThreshold,
    previousCount: previous.size,
    nextCount: next.size,
    newCandidates: sortedByAppearance(newCandidates),
    removedCandidates: sortedByAppearance(removedCandidates),
    actionChanges: [...actionChanges].sort((left, right) => left.current.index - right.current.index),
    scoreChanges: [...scoreChanges].sort((left, right) => left.current.index - right.current.index),
    newBuyCandidates: sortedByAppearance(newBuyCandidates),
  };

  result.hasChanges = Boolean(
    result.newCandidates.length
    || result.removedCandidates.length
    || result.actionChanges.length
    || result.scoreChanges.length
    || result.newBuyCandidates.length
  );
  result.hasMeaningfulChanges = result.hasChanges;

  return result;
}

function compactScore(score) {
  if (score === null || score === undefined) return "—";
  return Number.isInteger(score) ? String(score) : String(Math.round(score * 10) / 10);
}

function formatCandidate(candidate) {
  const parts = [candidate.symbol, compactScore(candidate.score)];
  if (candidate.action) parts.push(candidate.action);
  return parts.join(" · ");
}

function formatChange(change) {
  const scoreChanged = change.previous.score !== change.current.score
    && change.previous.score !== null
    && change.current.score !== null;
  const actionChanged = change.previous.action && change.current.action
    && change.previous.action !== change.current.action;

  if (scoreChanged && actionChanged) {
    return `${change.symbol} · ${compactScore(change.previous.score)} → ${compactScore(change.current.score)} · ${change.previous.action} → ${change.current.action}`;
  }
  if (scoreChanged) {
    return `${change.symbol} · ${compactScore(change.previous.score)} → ${compactScore(change.current.score)}`;
  }
  return `${change.symbol} · ${change.previous.action || "—"} → ${change.current.action || "—"}`;
}

function formatTime(timestamp, timeZone = "Europe/Istanbul") {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp || Date.now());
  if (Number.isNaN(date.getTime())) return "--:--";

  try {
    return new Intl.DateTimeFormat("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone,
    }).format(date);
  } catch {
    return date.toISOString().slice(11, 16);
  }
}

function formatScannerDeltaTelegram(delta, options = {}) {
  if (!delta || !delta.hasChanges) return "";

  const market = String(options.market || "MARKET").trim().toUpperCase() || "MARKET";
  const maxItems = Math.max(1, Math.floor(asFiniteNumber(options.maxItems) ?? 5));
  const lines = [`🟣 BORSACI · ${market} SCANNER`, formatTime(options.timestamp, options.timeZone)];

  const addSection = (title, values, formatter, prefix = "") => {
    if (!values.length) return;
    lines.push("", `${title}:`);
    values.slice(0, maxItems).forEach((value) => lines.push(`${prefix}${formatter(value)}`));
    if (values.length > maxItems) lines.push(`+ ${values.length - maxItems} aday daha`);
  };

  addSection("Yeni", delta.newCandidates, formatCandidate, "+ ");

  // Yeni BUY adayi, "Yeni" bolumunde zaten listelenmisse ikinci kez yazilmaz.
  const newlyPromotedBuys = delta.newBuyCandidates.filter((candidate) => !delta.newCandidates.some((item) => item.symbol === candidate.symbol));
  addSection("Yeni işlem adayı", newlyPromotedBuys, formatCandidate, "★ ");

  const allChanges = new Map();
  delta.actionChanges.forEach((change) => allChanges.set(change.symbol, change));
  delta.scoreChanges.forEach((change) => {
    const existing = allChanges.get(change.symbol);
    if (existing) return;
    allChanges.set(change.symbol, change);
  });
  addSection("Değişen", [...allChanges.values()], formatChange);
  addSection("Çıkan", delta.removedCandidates, formatCandidate, "- ");

  return lines.join("\n");
}

module.exports = {
  DEFAULT_SCORE_DELTA_THRESHOLD,
  getSnapshotCandidates,
  indexCandidates,
  isBuyAction,
  compareScannerSnapshots,
  createScannerDelta: compareScannerSnapshots,
  formatScannerDeltaTelegram,
};
