"use strict";

const DEFAULT_MAX_NEWS_AGE_DAYS = 30;

function normalizeNewsItems(rows, {now = Date.now(), maxAgeDays = DEFAULT_MAX_NEWS_AGE_DAYS, limit = 5} = {}) {
  const oldest = Number(now) - Math.max(1, Number(maxAgeDays) || DEFAULT_MAX_NEWS_AGE_DAYS) * 86400000;
  const newest = Number(now) + 86400000;
  return (Array.isArray(rows) ? rows : [])
    .map(item => {
      const timestamp = Number(item?.providerPublishTime) * 1000;
      return {
        title: String(item?.title || "").trim().slice(0, 240),
        publisher: String(item?.publisher || "").trim().slice(0, 80),
        publishedAt: Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp).toISOString() : null,
        timestamp,
      };
    })
    .filter(item => item.title && item.publishedAt && item.timestamp >= oldest && item.timestamp <= newest)
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, Math.max(1, Number(limit) || 5))
    .map(({timestamp, ...item}) => item);
}

function normalizeAiReviews(parsed, symbols, provider, limits = {}) {
  const requested = new Set((symbols || []).map(symbol => String(symbol || "").trim().toUpperCase()).filter(Boolean));
  const bySymbol = new Map();
  for (const review of Array.isArray(parsed?.reviews) ? parsed.reviews : []) {
    const symbol = String(review?.symbol || "").trim().toUpperCase();
    if (!requested.has(symbol) || bySymbol.has(symbol)) continue;
    const newsComment = String(review?.newsComment || "").trim().slice(0, limits.newsComment || 120);
    const expertComment = String(review?.expertComment || "").trim().slice(0, limits.expertComment || 120);
    const summary = String(review?.summary || "").trim().slice(0, limits.summary || 160);
    bySymbol.set(symbol, {
      available: Boolean(newsComment || expertComment || summary),
      provider,
      score: null,
      verdict: "INFO",
      newsComment,
      expertComment,
      summary,
    });
  }
  return bySymbol;
}

module.exports = {
  DEFAULT_MAX_NEWS_AGE_DAYS,
  normalizeNewsItems,
  normalizeAiReviews,
};

