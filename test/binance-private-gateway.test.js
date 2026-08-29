const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeBinancePrivateGatewayUrl,
  buildBinancePrivateGatewayUrl,
  selectBinanceSignedRequestBases,
} = require("../trading/binance-private-gateway");

test("private gateway normalizes an HTTPS base URL", () => {
  assert.equal(normalizeBinancePrivateGatewayUrl(" https://gateway.example.com/binance/ "), "https://gateway.example.com/binance");
  assert.equal(normalizeBinancePrivateGatewayUrl("ftp://gateway.example.com"), "");
});

test("private gateway preserves the signed Binance pathname and query exactly", () => {
  const url = buildBinancePrivateGatewayUrl(
    "https://gateway.example.com/binance",
    "/api/v3/account",
    "recvWindow=10000&timestamp=123&signature=a%2Bb%3D"
  );
  assert.equal(url, "https://gateway.example.com/binance/api/v3/account?recvWindow=10000&timestamp=123&signature=a%2Bb%3D");
});

test("configured gateway replaces direct private endpoint attempts", () => {
  assert.deepEqual(selectBinanceSignedRequestBases({
    gatewayUrl: "https://gateway.example.com",
    activeBaseUrl: "https://api1.binance.com",
    fallbackBaseUrls: ["https://api.binance.com", "https://api1.binance.com"],
  }), ["https://gateway.example.com"]);
});

test("without a gateway direct private fallback order remains backward compatible", () => {
  assert.deepEqual(selectBinanceSignedRequestBases({
    gatewayUrl: "",
    activeBaseUrl: "https://api1.binance.com",
    fallbackBaseUrls: ["https://api.binance.com", "https://api1.binance.com"],
  }), ["https://api1.binance.com", "https://api.binance.com"]);
});
