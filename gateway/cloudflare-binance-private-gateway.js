/**
 * Cloudflare Worker: Binance Global private Spot gateway for BorsaCI.
 *
 * Store BORSACI_GATEWAY_TOKEN as a Worker secret. Do not put Binance API
 * credentials in this Worker: BorsaCI signs requests on Render and forwards
 * the signed request plus X-MBX-APIKEY through this proxy.
 */
const BINANCE_BASE_URL = "https://api.binance.com";
const ALLOWED_METHODS = new Set(["GET", "POST", "DELETE"]);
const PRIVATE_PATH = /^\/api\/v3\/[A-Za-z0-9/_-]+$/;

function errorResponse(status, code, message) {
  return new Response(JSON.stringify({code, msg: message}), {
    status,
    headers: {"content-type": "application/json", "cache-control": "no-store"}
  });
}

export default {
  async fetch(request, env) {
    const source = new URL(request.url);
    if (!ALLOWED_METHODS.has(request.method)) {
      return errorResponse(405, "BINANCE_ACCOUNT_UNAVAILABLE", "Method not allowed.");
    }
    if (!PRIVATE_PATH.test(source.pathname)) {
      return errorResponse(404, "BINANCE_ACCOUNT_UNAVAILABLE", "Path not allowed.");
    }
    const token = request.headers.get("x-borsaci-gateway-token") || "";
    if (!env.BORSACI_GATEWAY_TOKEN || token !== env.BORSACI_GATEWAY_TOKEN) {
      return errorResponse(401, "BINANCE_AUTH_FAILED", "Gateway authorization failed.");
    }

    const apiKey = request.headers.get("x-mbx-apikey");
    if (!apiKey) {
      return errorResponse(401, "BINANCE_AUTH_FAILED", "Binance API key is missing.");
    }

    const upstreamHeaders = new Headers({accept: "application/json", "x-mbx-apikey": apiKey});
    const contentType = request.headers.get("content-type");
    if (contentType) upstreamHeaders.set("content-type", contentType);
    const upstreamUrl = `${BINANCE_BASE_URL}${source.pathname}${source.search}`;

    try {
      const upstream = await fetch(upstreamUrl, {
        method: request.method,
        headers: upstreamHeaders,
        body: request.method === "POST" ? request.body : undefined
      });
      const responseHeaders = new Headers();
      const responseType = upstream.headers.get("content-type");
      if (responseType) responseHeaders.set("content-type", responseType);
      responseHeaders.set("cache-control", "no-store");
      return new Response(upstream.body, {status: upstream.status, headers: responseHeaders});
    } catch {
      return errorResponse(502, "BINANCE_NETWORK_RESTRICTED", "Binance upstream could not be reached.");
    }
  }
};
