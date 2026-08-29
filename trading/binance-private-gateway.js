"use strict";

function normalizeBinancePrivateGatewayUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    return raw.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function buildBinancePrivateGatewayUrl(gatewayUrl, pathname, query = "") {
  const base = normalizeBinancePrivateGatewayUrl(gatewayUrl);
  const path = String(pathname || "");
  if (!base) throw new Error("Binance private gateway URL geçersiz.");
  if (!/^\/api\/v3\/[A-Za-z0-9/_-]+$/.test(path)) {
    throw new Error("Binance private gateway pathname geçersiz.");
  }
  const suffix = String(query || "");
  // Query string HMAC ile imzalıdır. URLSearchParams üzerinden yeniden
  // oluşturmayıp byte sırasını aynen koruyoruz.
  return `${base}${path}${suffix ? `?${suffix}` : ""}`;
}

function selectBinanceSignedRequestBases({gatewayUrl, activeBaseUrl, fallbackBaseUrls}) {
  const gateway = normalizeBinancePrivateGatewayUrl(gatewayUrl);
  if (gateway) return [gateway];
  const fallback = Array.isArray(fallbackBaseUrls) ? fallbackBaseUrls : [];
  return activeBaseUrl
    ? [activeBaseUrl, ...fallback.filter(baseUrl => baseUrl !== activeBaseUrl)]
    : fallback;
}

module.exports = {
  normalizeBinancePrivateGatewayUrl,
  buildBinancePrivateGatewayUrl,
  selectBinanceSignedRequestBases,
};
