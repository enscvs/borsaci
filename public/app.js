"use strict";
(function () {
  function isLegacy() {
    try {
      new Function("var x={a:{b:1}}; return x?.a?.b ?? 0;");
      return false;
    } catch (error) {
      return true;
    }
  }

  if (!isLegacy()) return;

  if (window.Element && !Element.prototype.append) {
    Element.prototype.append = function () {
      for (var i = 0; i < arguments.length; i += 1) {
        var node = arguments[i];
        if (!(node && node.nodeType)) node = document.createTextNode(String(node));
        this.appendChild(node);
      }
    };
  }

  if (window.Element && !Element.prototype.remove) {
    Element.prototype.remove = function () {
      if (this.parentNode) this.parentNode.removeChild(this);
    };
  }

  if (window.Node && !Node.prototype.closest) {
    Node.prototype.closest = function (selector) {
      var node = this;
      if (node.nodeType !== 1) node = node.parentElement || node.parentNode;
      while (node && node.nodeType === 1) {
        if (node.matches && node.matches(selector)) return node;
        node = node.parentElement || node.parentNode;
      }
      return null;
    };
  }

  function debug(message) {
    if (typeof window.borsaciLegacyDebug === "function") {
      window.borsaciLegacyDebug(message);
    }
  }

  function replaceWithCleanClone(element) {
    if (!element || !element.parentNode) return element;
    var clone = element.cloneNode(true);
    clone.removeAttribute("data-inline-legacy-bound");
    clone.removeAttribute("data-scanner-bound");
    clone.removeAttribute("data-crypto-bound");
    clone.removeAttribute("data-nasdaq-bound");
    element.parentNode.replaceChild(clone, element);
    return clone;
  }

  var selectors = [
    "#startScannerBtn",
    "#stopScannerBtn",
    "#startCryptoScannerBtn",
    "#stopCryptoScannerBtn"
  ];

  var i;
  var j;
  for (i = 0; i < selectors.length; i += 1) {
    var nodes = document.querySelectorAll(selectors[i]);
    for (j = nodes.length - 1; j >= 0; j -= 1) {
      replaceWithCleanClone(nodes[j]);
    }
  }

  debug("CACHED FALLBACK HANDLERS: REMOVED");
})();
"use strict";
(function () {
  if (!Array.prototype.includes) {
    Array.prototype.includes = function (value, fromIndex) {
      return this.indexOf(value, fromIndex || 0) !== -1;
    };
  }
  if (!Array.prototype.flat) {
    Array.prototype.flat = function (depth) {
      var input = this;
      var maxDepth = depth === undefined ? 1 : Number(depth) || 0;
      var output = [];
      function flatten(array, level) {
        for (var i = 0; i < array.length; i += 1) {
          if (!(i in array)) continue;
          var value = array[i];
          if (Array.isArray(value) && level > 0) flatten(value, level - 1);
          else output.push(value);
        }
      }
      flatten(input, maxDepth);
      return output;
    };
  }
  if (!Array.prototype.flatMap) {
    Array.prototype.flatMap = function (callback, thisArg) {
      return Array.prototype.map.call(this, callback, thisArg).flat(1);
    };
  }
  if (!String.prototype.includes) {
    String.prototype.includes = function (value, start) {
      return this.indexOf(value, start || 0) !== -1;
    };
  }
  if (!String.prototype.startsWith) {
    String.prototype.startsWith = function (value, start) {
      start = start || 0;
      return this.substr(start, value.length) === value;
    };
  }
  if (!String.prototype.endsWith) {
    String.prototype.endsWith = function (value) {
      return this.slice(-value.length) === value;
    };
  }
  if (!String.prototype.replaceAll) {
    String.prototype.replaceAll = function (searchValue, replaceValue) {
      var source = String(this);
      if (searchValue instanceof RegExp) {
        if (!searchValue.global) throw new TypeError("replaceAll requires a global RegExp");
        return source.replace(searchValue, replaceValue);
      }
      var search = String(searchValue);
      if (search === "") {
        var parts = source.split("");
        var replacement = typeof replaceValue === "function" ? replaceValue("") : String(replaceValue);
        return replacement + parts.join(replacement) + replacement;
      }
      if (typeof replaceValue === "function") {
        var result = "";
        var index = 0;
        var found;
        while ((found = source.indexOf(search, index)) !== -1) {
          result += source.slice(index, found) + replaceValue(search, found, source);
          index = found + search.length;
        }
        return result + source.slice(index);
      }
      return source.split(search).join(String(replaceValue));
    };
  }
  if (!String.prototype.padStart) {
    String.prototype.padStart = function (targetLength, padString) {
      var source = String(this);
      var length = targetLength >> 0;
      var pad = padString === undefined ? " " : String(padString);
      if (source.length >= length || pad === "") return source;
      var needed = length - source.length;
      while (pad.length < needed) pad += pad;
      return pad.slice(0, needed) + source;
    };
  }
  if (!String.prototype.padEnd) {
    String.prototype.padEnd = function (targetLength, padString) {
      var source = String(this);
      var length = targetLength >> 0;
      var pad = padString === undefined ? " " : String(padString);
      if (source.length >= length || pad === "") return source;
      var needed = length - source.length;
      while (pad.length < needed) pad += pad;
      return source + pad.slice(0, needed);
    };
  }
  if (!Object.entries) {
    Object.entries = function (object) {
      return Object.keys(object).map(function (key) { return [key, object[key]]; });
    };
  }
  if (!Object.values) {
    Object.values = function (object) {
      return Object.keys(object).map(function (key) { return object[key]; });
    };
  }
  if (!Object.fromEntries) {
    Object.fromEntries = function (entries) {
      var output = {};
      Array.prototype.forEach.call(entries || [], function (entry) {
        output[entry[0]] = entry[1];
      });
      return output;
    };
  }
  if (!Object.getOwnPropertyDescriptors) {
    Object.getOwnPropertyDescriptors = function (object) {
      var output = {};
      Object.getOwnPropertyNames(object).forEach(function (key) {
        output[key] = Object.getOwnPropertyDescriptor(object, key);
      });
      if (Object.getOwnPropertySymbols) {
        Object.getOwnPropertySymbols(object).forEach(function (key) {
          output[key] = Object.getOwnPropertyDescriptor(object, key);
        });
      }
      return output;
    };
  }
  if (!Number.isFinite) {
    Number.isFinite = function (value) {
      return typeof value === "number" && isFinite(value);
    };
  }
  if (!Number.isNaN) {
    Number.isNaN = function (value) { return value !== value; };
  }
  if (window.Promise && !Promise.prototype.finally) {
    Promise.prototype.finally = function (callback) {
      var P = this.constructor || Promise;
      return this.then(
        function (value) { return P.resolve(callback()).then(function () { return value; }); },
        function (reason) { return P.resolve(callback()).then(function () { throw reason; }); }
      );
    };
  }
  if (window.Promise && !Promise.allSettled) {
    Promise.allSettled = function (items) {
      return Promise.all(Array.prototype.map.call(items || [], function (item) {
        return Promise.resolve(item).then(
          function (value) { return { status: "fulfilled", value: value }; },
          function (reason) { return { status: "rejected", reason: reason }; }
        );
      }));
    };
  }
  if (!window.ResizeObserver) {
    window.ResizeObserver = function () {};
    window.ResizeObserver.prototype.observe = function () {};
    window.ResizeObserver.prototype.unobserve = function () {};
    window.ResizeObserver.prototype.disconnect = function () {};
  }
  if (!window.AbortController) {
    window.AbortController = function () { this.signal = undefined; };
    window.AbortController.prototype.abort = function () {};
  }
  if (!window.structuredClone) {
    window.structuredClone = function (value) {
      return JSON.parse(JSON.stringify(value));
    };
  }
  if (window.Element && !Element.prototype.matches) {
    Element.prototype.matches = Element.prototype.msMatchesSelector || Element.prototype.webkitMatchesSelector;
  }
  if (window.Element && !Element.prototype.closest) {
    Element.prototype.closest = function (selector) {
      var element = this;
      while (element && element.nodeType === 1) {
        if (element.matches && element.matches(selector)) return element;
        element = element.parentElement || element.parentNode;
      }
      return null;
    };
  }
  if (!window.Headers) {
    window.Headers = function (initial) {
      this.map = {};
      var self = this;
      if (initial) {
        if (typeof initial.forEach === "function") {
          initial.forEach(function (value, key) { self.set(key, value); });
        } else {
          Object.keys(initial).forEach(function (key) { self.set(key, initial[key]); });
        }
      }
    };
    window.Headers.prototype.set = function (key, value) {
      this.map[String(key).toLowerCase()] = String(value);
    };
    window.Headers.prototype.get = function (key) {
      return this.map[String(key).toLowerCase()] || null;
    };
    window.Headers.prototype.forEach = function (callback) {
      var self = this;
      Object.keys(this.map).forEach(function (key) { callback(self.map[key], key); });
    };
  }
  if (!window.fetch) {
    window.fetch = function (input, init) {
      init = init || {};
      return new Promise(function (resolve, reject) {
        var url = typeof input === "string" ? input : input.url;
        var method = String(init.method || "GET").toUpperCase();
        var xhr = new XMLHttpRequest();
        xhr.open(method, url, true);
        xhr.withCredentials = init.credentials !== "omit";
        var headers = new Headers(init.headers || {});
        headers.forEach(function (value, key) {
          try { xhr.setRequestHeader(key, value); } catch (error) {}
        });
        xhr.onreadystatechange = function () {
          if (xhr.readyState !== 4) return;
          var response = {
            ok: xhr.status >= 200 && xhr.status < 300,
            status: xhr.status,
            statusText: xhr.statusText,
            url: url,
            text: function () { return Promise.resolve(xhr.responseText || ""); },
            json: function () {
              try {
                return Promise.resolve(xhr.responseText ? JSON.parse(xhr.responseText) : {});
              } catch (error) {
                return Promise.reject(error);
              }
            }
          };
          resolve(response);
        };
        xhr.onerror = function () { reject(new TypeError("Network request failed")); };
        xhr.send(init.body !== undefined ? init.body : null);
      });
    };
  }
})();
(function () {
  function debug(message) {
    try {
      if (typeof window.__borsaciLegacyDebug === "function") {
        window.__borsaciLegacyDebug(message);
      }
    } catch (error) {}
  }

  function installV3Adapter() {
    var original = window.LightweightCharts;
    if (!original || typeof original.createChart !== "function") return false;
    if (original.CandlestickSeries && typeof original.createSeriesMarkers === "function") return true;

    var facade = {};
    var key;
    for (key in original) {
      try { facade[key] = original[key]; } catch (error) {}
    }

    var types = {
      CandlestickSeries: "candlestick",
      HistogramSeries: "histogram",
      LineSeries: "line",
      AreaSeries: "area",
      BarSeries: "bar",
      BaselineSeries: "area"
    };
    Object.keys(types).forEach(function (seriesKey) {
      facade[seriesKey] = { __borsaciLegacySeriesType: types[seriesKey] };
    });

    var originalCreateChart = original.createChart;
    facade.createChart = function (container, options) {
      var chart = originalCreateChart(container, options);
      if (!chart.addSeries) {
        chart.addSeries = function (seriesType, seriesOptions) {
          var type = seriesType && seriesType.__borsaciLegacySeriesType;
          if (type === "candlestick" && chart.addCandlestickSeries) return chart.addCandlestickSeries(seriesOptions || {});
          if (type === "histogram" && chart.addHistogramSeries) return chart.addHistogramSeries(seriesOptions || {});
          if (type === "line" && chart.addLineSeries) return chart.addLineSeries(seriesOptions || {});
          if (type === "area" && chart.addAreaSeries) return chart.addAreaSeries(seriesOptions || {});
          if (type === "bar" && chart.addBarSeries) return chart.addBarSeries(seriesOptions || {});
          throw new Error("Unsupported legacy chart series: " + String(type || "unknown"));
        };
      }
      return chart;
    };

    facade.createSeriesMarkers = function (series, markers) {
      var current = markers || [];
      if (series && typeof series.setMarkers === "function") series.setMarkers(current);
      return {
        setMarkers: function (nextMarkers) {
          current = nextMarkers || [];
          if (series && typeof series.setMarkers === "function") series.setMarkers(current);
        }
      };
    };

    try {
      window.LightweightCharts = facade;
    } catch (error) {
      debug("LEGACY CHART ADAPTER: GLOBAL REPLACE FAILED");
      return false;
    }

    debug("LEGACY CHART ADAPTER: V3 READY");
    return true;
  }

  window.__borsaciBootLegacyChart = function (startApp) {
    if (window.LightweightCharts && typeof window.LightweightCharts.createChart === "function") {
      installV3Adapter();
      debug("CHART LIBRARY: EXISTING READY");
      startApp();
      return;
    }

    debug("CHART LIBRARY: LOADING V3");
    var script = document.createElement("script");
    script.src = "https://unpkg.com/lightweight-charts@3.8.0/dist/lightweight-charts.standalone.production.js";
    script.async = false;
    script.onload = function () {
      if (installV3Adapter()) {
        debug("CHART LIBRARY: V3 LOADED");
      } else {
        debug("CHART LIBRARY: V3 ADAPTER FAILED");
      }
      startApp();
    };
    script.onerror = function () {
      debug("CHART LIBRARY: V3 LOAD ERROR");
      startApp();
    };
    (document.head || document.documentElement).appendChild(script);
  };
})();

window.__borsaciStartLegacyApp = function () {
(function () {
/*
========================================================
BORSACI // AI TRADING TERMINAL
APP.JS
========================================================

API ENDPOINTS

1. GET  /market?symbol=ASELS
2. GET  /chart?symbol=ASELS&range=1y&interval=1d
3. POST /ask

WATCHLIST:
localStorage

========================================================
*/

"use strict";

/* ======================================================
   GLOBAL STATE
====================================================== */
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
function asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function _asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
let symbols = [];
let selectedSymbol = null;
let marketCache = {};
let chartCache = {};
let marketChart = null;
let candleSeries = null;
let volumeSeries = null;
let chartResizeObserver = null;
let chartInitialized = false;
let chartRange = "1y";
let chartInterval = "1d";
let chartHistory = [];

/* AI Decision kartından açılan, grafik üzerinde geçici işlem planı katmanı. */
let activeDecisionOverlay = null;
let decisionOverlayPriceLines = [];
let decisionOverlayRaySeries = [];
let decisionOverlayMarkers = null;
let decisionOverlayUsesSeriesMarkers = false;
let decisionOverlayRequestId = 0;
let symbolSelectionRequestId = 0;
let analysisRunning = false;
let performanceState = null;
let performanceRange = "ALL";

/* Ortak kontrol merkezi yalnızca mevcut üç çalışma alanının durumlarını
   bir araya getirir; piyasa state'lerini birbirine yazmaz. */
let controlCenterRefreshInFlight = false;

/* Binance Spot açık emir alanı için son doğrulanmış sunucu cevabı. */
let latestCryptoSpotOpenOrders = [];

/* BUY SETUP eşiği backend karar politikasındaki eşikle aynı tutulur. */
const BUY_SETUP_SCORE_THRESHOLD = 60;

/* Bekleyen emir kartları için son sunucu durumu. */
let latestPaperOrderState = null;
const WATCHLIST_STORAGE_KEY = "borsaci_watchlist_v1";

/* ======================================================
   DOM ELEMENTS
====================================================== */

let questionInput = null;
let analyzeBtn = null;
let responseBox = null;
let addSymbolBtn = null;
let watchlist = null;
let chartSymbol = null;
let chartEmpty = null;
let chartContainer = null;

/* ---- Attach-image elements ---- */
let attachImageBtn = null;
let imageInput = null;
let imagePreview = null;
let previewImage = null;
let removeImageBtn = null;

/* selectedImageBase64: /ask isteğine eklenecek görsel verisi */
let selectedImageBase64 = null;

/* ======================================================
   CLOCK
====================================================== */

function updateClock() {
  const clock = document.getElementById("clock");
  if (!clock) return;
  clock.innerText = new Date().toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

/* ======================================================
   ELEMENT INITIALIZATION
====================================================== */

function initializeElements() {
  questionInput = document.getElementById("question");
  analyzeBtn = document.getElementById("analyzeBtn");
  responseBox = document.getElementById("response");
  addSymbolBtn = document.getElementById("addSymbolBtn");
  watchlist = document.getElementById("watchlist");
  chartSymbol = document.getElementById("chartSymbol");
  chartEmpty = document.getElementById("chartEmpty");
  chartContainer = document.getElementById("market_chart");
}

/* ======================================================
   ATTACH-IMAGE ELEMENT INITIALIZATION
====================================================== */

function initializeImageElements() {
  attachImageBtn = document.getElementById("attachImageBtn");
  imageInput = document.getElementById("imageInput");
  imagePreview = document.getElementById("imagePreview");
  previewImage = document.getElementById("previewImage");
  removeImageBtn = document.getElementById("removeImageBtn");
  if (!attachImageBtn) {
    console.error("BORSACI: #attachImageBtn bulunamadı.");
  }
  if (!imageInput) {
    console.error("BORSACI: #imageInput bulunamadı.");
  }
}

/* ======================================================
   ATTACH-IMAGE: SEÇME / ÖNİZLEME / KALDIRMA
====================================================== */

function handleImageSelected(file) {
  if (!file) return;
  const allowed = ["image/png", "image/jpeg", "image/webp"];
  if (!allowed.includes(file.type)) {
    alert("Sadece PNG, JPEG veya WEBP dosyası seçilebilir.");
    return;
  }
  const reader = new FileReader();
  reader.onload = event => {
    selectedImageBase64 = event.target.result; // data:image/...;base64,....

    if (previewImage) {
      previewImage.src = selectedImageBase64;
    }
    if (imagePreview) {
      imagePreview.style.display = "flex";
    }
  };
  reader.onerror = () => {
    console.error("BORSACI: Görsel okunamadı.");
    alert("Görsel okunurken bir hata oluştu.");
  };
  reader.readAsDataURL(file);
}
function clearSelectedImage() {
  selectedImageBase64 = null;
  if (imageInput) {
    imageInput.value = "";
  }
  if (previewImage) {
    previewImage.src = "";
  }
  if (imagePreview) {
    imagePreview.style.display = "none";
  }
}

/* ======================================================
   ATTACH-IMAGE: EVENT BINDING
====================================================== */

function bindImageEvents() {
  if (attachImageBtn && imageInput) {
    attachImageBtn.addEventListener("click", () => {
      imageInput.click();
    });
  } else {
    console.error("BORSACI: #attachImageBtn veya #imageInput bulunamadı, click bağlanamadı.");
  }
  if (imageInput) {
    imageInput.addEventListener("change", event => {
      const file = event.target.files && event.target.files[0];
      handleImageSelected(file);
    });
  }
  if (removeImageBtn) {
    removeImageBtn.addEventListener("click", () => {
      clearSelectedImage();
    });
  }
}

/* ======================================================
   FORMAT
====================================================== */

function formatNumber(value, decimals = 2) {
  const number = Number(value);
  if (value === null || value === undefined || !Number.isFinite(number)) {
    return "--";
  }
  return number.toLocaleString("tr-TR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}
function formatCompact(value) {
  const number = Number(value);
  if (value === null || value === undefined || !Number.isFinite(number)) {
    return "--";
  }
  if (number >= 1000000000) {
    return (number / 1000000000).toFixed(2) + "B";
  }
  if (number >= 1000000) {
    return (number / 1000000).toFixed(2) + "M";
  }
  if (number >= 1000) {
    return (number / 1000).toFixed(2) + "K";
  }
  return formatNumber(number, 0);
}
function setText(id, value) {
  const element = document.getElementById(id);
  if (!element) return;
  element.innerText = value;
}

/* ======================================================
   ESCAPE
====================================================== */

function escapeHtml(value) {
  return String(value !== null && value !== void 0 ? value : "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

/* ======================================================
   SYMBOL
====================================================== */

function normalizeSymbol(symbol) {
  if (!symbol) return null;
  return String(symbol).trim().toUpperCase().replace(/^BIST:/, "").replace(/\.IS$/, "");
}
function toYahooSymbol(symbol) {
  const clean = normalizeSymbol(symbol);
  if (!clean) return null;
  if (clean === "XU100") {
    return "XU100.IS";
  }
  if (clean.endsWith(".IS")) {
    return clean;
  }
  return `${clean}.IS`;
}

/* ======================================================
   WATCHLIST STORAGE
====================================================== */

function saveWatchlist() {
  try {
    const cleanSymbols = [...new Set(symbols.map(normalizeSymbol).filter(Boolean))];
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(cleanSymbols));
  } catch (error) {
    console.error("BORSACI WATCHLIST SAVE ERROR:", error);
  }
}
function loadWatchlist() {
  try {
    const raw = localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (!raw) {
      symbols = [];
      return;
    }
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) {
      symbols = [];
      return;
    }
    symbols = [...new Set(data.map(normalizeSymbol).filter(Boolean))];
    console.log("BORSACI WATCHLIST LOADED:", symbols);
  } catch (error) {
    console.error("BORSACI WATCHLIST LOAD ERROR:", error);
    symbols = [];
  }
}

/* ======================================================
   WATCHLIST RENDER
====================================================== */

function renderWatchlist() {
  if (!watchlist) return;
  if (symbols.length === 0) {
    watchlist.innerHTML = `
      <div class="watchlist-empty">

        <div class="empty-icon">
          +
        </div>

        <span>
          NO SYMBOLS LOADED
        </span>

        <small>
          Add a symbol to begin.
        </small>

      </div>
    `;
    return;
  }
  watchlist.innerHTML = "";
  symbols.forEach((symbol, index) => {
    var _ref, _cached$quote$price, _cached$quote, _ref2, _cached$quote$changeP, _cached$quote2;
    const cached = marketCache[symbol];
    const price = (_ref = (_cached$quote$price = cached === null || cached === void 0 || (_cached$quote = cached.quote) === null || _cached$quote === void 0 ? void 0 : _cached$quote.price) !== null && _cached$quote$price !== void 0 ? _cached$quote$price : cached === null || cached === void 0 ? void 0 : cached.price) !== null && _ref !== void 0 ? _ref : cached === null || cached === void 0 ? void 0 : cached.lastPrice;
    const change = (_ref2 = (_cached$quote$changeP = cached === null || cached === void 0 || (_cached$quote2 = cached.quote) === null || _cached$quote2 === void 0 ? void 0 : _cached$quote2.changePercent) !== null && _cached$quote$changeP !== void 0 ? _cached$quote$changeP : cached === null || cached === void 0 ? void 0 : cached.changePercent) !== null && _ref2 !== void 0 ? _ref2 : cached === null || cached === void 0 ? void 0 : cached.change;
    const row = document.createElement("div");
    row.className = "watch-row";
    row.innerHTML = `

        <button
          type="button"
          class="symbol-button ${selectedSymbol === symbol ? "active" : ""}"
          data-index="${index}"
        >

          <span>
            ${escapeHtml(symbol)}
          </span>

          <span class="watch-price">

            <strong>
              ${price !== undefined && price !== null ? formatNumber(price, 2) : "--"}
            </strong>

            <small
              class="${Number(change) > 0 ? "positive" : Number(change) < 0 ? "negative" : ""}"
            >

              ${change !== undefined && change !== null && Number.isFinite(Number(change)) ? (Number(change) > 0 ? "+" : "") + formatNumber(change, 2) + "%" : "--"}

            </small>

          </span>

        </button>

        <button
          type="button"
          class="remove-symbol"
          data-index="${index}"
        >
          ×
        </button>

      `;
    watchlist.appendChild(row);
  });
  watchlist.querySelectorAll(".symbol-button").forEach(button => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.index);
      const symbol = symbols[index];
      if (symbol) {
        selectSymbol(symbol);
      }
    });
  });
  watchlist.querySelectorAll(".remove-symbol").forEach(button => {
    button.addEventListener("click", event => {
      event.stopPropagation();
      const index = Number(button.dataset.index);
      const removed = symbols[index];
      if (!removed) return;
      symbols.splice(index, 1);
      delete marketCache[removed];
      Object.keys(chartCache).forEach(key => {
        if (key === removed || key.startsWith(`${removed}_`)) {
          delete chartCache[key];
        }
      });
      if (selectedSymbol === removed) {
        selectedSymbol = symbols[0] || null;
        if (selectedSymbol) {
          selectSymbol(selectedSymbol);
        } else {
          clearDashboard();
        }
      }
      saveWatchlist();
      renderWatchlist();
    });
  });
}

/* ======================================================
   ADD SYMBOL
====================================================== */

function addSymbol() {
  const input = prompt("BIST sembolünü gir:\n\nÖrnek: ASELS");
  if (!input) return;
  const symbol = normalizeSymbol(input);
  if (!symbol) return;
  if (!symbols.includes(symbol)) {
    symbols.push(symbol);
  }
  saveWatchlist();
  renderWatchlist();
  selectSymbol(symbol);
}

/* ======================================================
   SELECT SYMBOL
====================================================== */
function selectSymbol(_x) {
  return _selectSymbol.apply(this, arguments);
}
/* ======================================================
   MARKET DATA
====================================================== */
function _selectSymbol() {
  _selectSymbol = _asyncToGenerator(function* (symbol, {
    persistInWatchlist = true
  } = {}) {
    const clean = normalizeSymbol(symbol);
    if (!clean) return;
    const requestId = ++symbolSelectionRequestId;
    selectedSymbol = clean;
    if (chartSymbol) {
      chartSymbol.innerText = clean;
    }
    if (persistInWatchlist && !symbols.includes(clean)) {
      symbols.push(clean);
    }
    if (persistInWatchlist) {
      saveWatchlist();
    }
    renderWatchlist();
    clearChartOnly();
    yield loadMarketData(clean, requestId, persistInWatchlist);
    if (requestId !== symbolSelectionRequestId || selectedSymbol !== clean) {
      return;
    }
    yield loadChartData(clean, chartRange, chartInterval, requestId);
  });
  return _selectSymbol.apply(this, arguments);
}
function isCurrentSymbolRequest(symbol, requestId) {
  return requestId === null || requestId === undefined || requestId === symbolSelectionRequestId && selectedSymbol === symbol;
}
function loadMarketData(_x2) {
  return _loadMarketData.apply(this, arguments);
}
/* ======================================================
   DASHBOARD
====================================================== */
function _loadMarketData() {
  _loadMarketData = _asyncToGenerator(function* (symbol, requestId = null, persistInWatchlist = true) {
    const clean = normalizeSymbol(symbol);
    if (!clean) return;
    try {
      const cached = marketCache[clean];
      if (cached !== null && cached !== void 0 && cached.timestamp) {
        const timestamp = new Date(cached.timestamp).getTime();
        const age = Date.now() - timestamp;
        if (Number.isFinite(age) && age >= 0 && age < 20000) {
          if (!isCurrentSymbolRequest(clean, requestId)) {
            return;
          }
          updateDashboard(cached, false, persistInWatchlist);
          return;
        }
      }
      const url = `/market?symbol=${encodeURIComponent(clean)}`;
      console.log("BORSACI MARKET REQUEST:", url);
      const response = yield fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json"
        },
        cache: "no-store"
      });
      const text = yield response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (_unused23) {
        throw new Error(`Market endpoint JSON döndürmedi. HTTP ${response.status}`);
      }
      if (!response.ok) {
        var _data;
        throw new Error(((_data = data) === null || _data === void 0 ? void 0 : _data.error) || `Market endpoint HTTP ${response.status}`);
      }
      if (!data) {
        throw new Error("Market endpoint boş cevap döndürdü.");
      }
      if (!data.timestamp) {
        data.timestamp = new Date().toISOString();
      }
      marketCache[clean] = data;
      if (!isCurrentSymbolRequest(clean, requestId)) {
        return;
      }
      updateDashboard(data, false, persistInWatchlist);
    } catch (error) {
      if (!isCurrentSymbolRequest(clean, requestId)) {
        return;
      }
      console.error("BORSACI MARKET ERROR:", error);
      showDashboardError(error.message);
    }
  });
  return _loadMarketData.apply(this, arguments);
}
function updateDashboard(data, updateChart = false, persistInWatchlist = true) {
  if (!data) return;
  const backendSymbol = normalizeSymbol(data.symbol);
  if (backendSymbol) {
    selectedSymbol = backendSymbol;
    if (chartSymbol) {
      chartSymbol.innerText = backendSymbol;
    }
    if (persistInWatchlist && !symbols.includes(backendSymbol)) {
      symbols.push(backendSymbol);
      saveWatchlist();
    }
  }
  updateWatchlistData(data);
  updateTechnical(data.technical);
  if (updateChart) {
    const history = extractHistory(data);
    updateChartData(history);
  }
  renderWatchlist();
}

/* ======================================================
   HISTORY
====================================================== */

function extractHistory(data) {
  var _data$data, _data$market, _data$data2;
  if (!data) return [];
  if (Array.isArray(data.history)) {
    return data.history;
  }
  if (Array.isArray((_data$data = data.data) === null || _data$data === void 0 ? void 0 : _data$data.history)) {
    return data.data.history;
  }
  if (Array.isArray((_data$market = data.market) === null || _data$market === void 0 ? void 0 : _data$market.history)) {
    return data.market.history;
  }
  if (Array.isArray(data.chart)) {
    return data.chart;
  }
  if (Array.isArray(data.candles)) {
    return data.candles;
  }
  if (Array.isArray((_data$data2 = data.data) === null || _data$data2 === void 0 ? void 0 : _data$data2.candles)) {
    return data.data.candles;
  }
  return [];
}

/* ======================================================
   WATCHLIST DATA
====================================================== */

function updateWatchlistData(data) {
  if (!data) return;
  const symbol = normalizeSymbol(data.symbol) || selectedSymbol;
  if (!symbol) return;
  marketCache[symbol] = _objectSpread(_objectSpread({}, marketCache[symbol]), data);
}

/* ======================================================
   TECHNICAL
====================================================== */

function updateTechnical(technical) {
  var _ref3, _marketCache$selected, _marketCache$selected2, _marketCache$selected3;
  if (!technical) {
    ["rsi", "macd", "ema20", "ema50", "volume", "atr"].forEach(id => {
      setText(id, "--");
    });
    return;
  }
  setText("rsi", formatNumber(technical.rsi));
  setText("macd", formatNumber(technical.macd));
  setText("ema20", formatNumber(technical.ema20));
  setText("ema50", formatNumber(technical.ema50));
  setText("atr", formatNumber(technical.atr));
  const volume = (_ref3 = (_marketCache$selected = (_marketCache$selected2 = marketCache[selectedSymbol]) === null || _marketCache$selected2 === void 0 || (_marketCache$selected2 = _marketCache$selected2.quote) === null || _marketCache$selected2 === void 0 ? void 0 : _marketCache$selected2.volume) !== null && _marketCache$selected !== void 0 ? _marketCache$selected : (_marketCache$selected3 = marketCache[selectedSymbol]) === null || _marketCache$selected3 === void 0 ? void 0 : _marketCache$selected3.volume) !== null && _ref3 !== void 0 ? _ref3 : technical.volume;
  setText("volume", formatCompact(volume));
}

/* ======================================================
   CHART INIT
====================================================== */

function initMarketChart() {
  var _chartContainer$paren2;
  if (chartInitialized && marketChart) {
    return;
  }
  if (!chartContainer) {
    console.error("BORSACI: #market_chart bulunamadı.");
    return;
  }
  if (typeof LightweightCharts === "undefined") {
    console.error("BORSACI: LightweightCharts yüklenmedi.");
    return;
  }
  let width = chartContainer.clientWidth;
  let height = chartContainer.clientHeight;
  if (width <= 0) {
    var _chartContainer$paren;
    width = ((_chartContainer$paren = chartContainer.parentElement) === null || _chartContainer$paren === void 0 ? void 0 : _chartContainer$paren.clientWidth) || 600;
  }
  if (height <= 0) {
    height = 420;
  }
  if (marketChart) {
    try {
      clearDecisionChartOverlay();
      marketChart.remove();
    } catch (_unused) {}
  }
  marketChart = null;
  candleSeries = null;
  volumeSeries = null;
  chartContainer.innerHTML = "";
  marketChart = LightweightCharts.createChart(chartContainer, {
    width,
    height,
    layout: {
      background: {
        type: "solid",
        color: "#0b0f14"
      },
      textColor: "#9aa4b2"
    },
    grid: {
      vertLines: {
        color: "#151b23"
      },
      horzLines: {
        color: "#151b23"
      }
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal
    },
    rightPriceScale: {
      borderColor: "#252c36"
    },
    timeScale: {
      borderColor: "#252c36",
      timeVisible: false,
      secondsVisible: false
    },
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true
    },
    handleScale: {
      axisPressedMouseMove: true,
      mouseWheel: true,
      pinch: true
    }
  });
  (_chartContainer$paren2 = chartContainer.parentElement) === null || _chartContainer$paren2 === void 0 || _chartContainer$paren2.classList.add("has-borsaci-chart");
  candleSeries = marketChart.addSeries(LightweightCharts.CandlestickSeries, {
    upColor: "#26a69a",
    downColor: "#ef5350",
    borderUpColor: "#26a69a",
    borderDownColor: "#ef5350",
    wickUpColor: "#26a69a",
    wickDownColor: "#ef5350"
  });
  volumeSeries = marketChart.addSeries(LightweightCharts.HistogramSeries, {
    priceFormat: {
      type: "volume"
    },
    priceScaleId: "volume"
  });
  marketChart.priceScale("volume").applyOptions({
    scaleMargins: {
      top: 0.80,
      bottom: 0
    }
  });
  if (chartResizeObserver) {
    try {
      chartResizeObserver.disconnect();
    } catch (_unused2) {}
  }
  if (typeof ResizeObserver !== "undefined") {
    chartResizeObserver = new ResizeObserver(entries => {
      if (!marketChart) return;
      const entry = entries[0];
      if (!entry) return;
      const rect = entry.contentRect;
      const newWidth = Math.floor(rect.width);
      const newHeight = Math.floor(rect.height);
      if (newWidth <= 0 || newHeight <= 0) {
        return;
      }
      try {
        marketChart.applyOptions({
          width: newWidth,
          height: newHeight
        });
      } catch (_unused3) {}
    });
    chartResizeObserver.observe(chartContainer);
  }
  chartInitialized = true;
  console.log("BORSACI: Market chart initialized.");
}

/* ======================================================
   CHART TIME
====================================================== */

function normalizeChartTime(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "number" || /^\d+$/.test(String(value))) {
    let number = Number(value);
    if (!Number.isFinite(number)) {
      return null;
    }
    if (number > 10000000000) {
      number = Math.floor(number / 1000);
    }
    return number;
  }
  const stringValue = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
    return stringValue;
  }
  const date = new Date(stringValue);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

/* ======================================================
   HISTORY VALUE
====================================================== */

function getHistoryValue(item, names) {
  if (!item) return null;
  for (const name of names) {
    if (item[name] !== undefined && item[name] !== null) {
      return item[name];
    }
  }
  return null;
}

/* ======================================================
   CHART HISTORY EXTRACT
====================================================== */

function extractChartHistory(data) {
  var _data$data3, _data$chart, _result$indicators;
  if (!data) {
    return [];
  }
  if (Array.isArray(data.history)) {
    return data.history;
  }
  if (Array.isArray((_data$data3 = data.data) === null || _data$data3 === void 0 ? void 0 : _data$data3.history)) {
    return data.data.history;
  }
  const result = (_data$chart = data.chart) === null || _data$chart === void 0 || (_data$chart = _data$chart.result) === null || _data$chart === void 0 ? void 0 : _data$chart[0];
  if (!result) {
    return [];
  }
  const timestamps = result.timestamp || [];
  const quote = (_result$indicators = result.indicators) === null || _result$indicators === void 0 || (_result$indicators = _result$indicators.quote) === null || _result$indicators === void 0 ? void 0 : _result$indicators[0];
  if (!quote || !Array.isArray(timestamps)) {
    return [];
  }
  const history = [];
  for (let i = 0; i < timestamps.length; i++) {
    var _quote$open, _quote$high, _quote$low, _quote$close, _quote$volume;
    const time = timestamps[i];
    const open = (_quote$open = quote.open) === null || _quote$open === void 0 ? void 0 : _quote$open[i];
    const high = (_quote$high = quote.high) === null || _quote$high === void 0 ? void 0 : _quote$high[i];
    const low = (_quote$low = quote.low) === null || _quote$low === void 0 ? void 0 : _quote$low[i];
    const close = (_quote$close = quote.close) === null || _quote$close === void 0 ? void 0 : _quote$close[i];
    const volume = (_quote$volume = quote.volume) === null || _quote$volume === void 0 ? void 0 : _quote$volume[i];
    if (!Number.isFinite(Number(close))) {
      continue;
    }
    history.push({
      time,
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: Number(volume) || 0
    });
  }
  return history;
}

/* ======================================================
   LOAD CHART DATA
====================================================== */
function loadChartData(_x3) {
  return _loadChartData.apply(this, arguments);
}
/* ======================================================
   UPDATE CHART
====================================================== */
function _loadChartData() {
  _loadChartData = _asyncToGenerator(function* (symbol, range = chartRange, interval = chartInterval, requestId = null) {
    const clean = normalizeSymbol(symbol);
    if (!clean) return;
    const cacheKey = `${clean}_${range}_${interval}`;
    const cached = chartCache[cacheKey];
    if (cached !== null && cached !== void 0 && cached.timestamp && Array.isArray(cached.history)) {
      const age = Date.now() - cached.timestamp;
      if (age >= 0 && age < 60000 && cached.history.length > 0) {
        if (!isCurrentSymbolRequest(clean, requestId)) {
          return;
        }
        updateChartData(cached.history);
        return;
      }
    }
    if (isCurrentSymbolRequest(clean, requestId)) {
      showEmptyChart("GRAFİK YÜKLENİYOR", `${range.toUpperCase()} / ${interval.toUpperCase()}`);
    }
    try {
      const url = `/chart?symbol=${encodeURIComponent(clean)}` + `&range=${encodeURIComponent(range)}` + `&interval=${encodeURIComponent(interval)}`;
      console.log("BORSACI CHART REQUEST:", url);
      const response = yield fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json"
        },
        cache: "no-store"
      });
      const text = yield response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (_unused24) {
        throw new Error(`Chart endpoint JSON döndürmedi. HTTP ${response.status}`);
      }
      if (!response.ok) {
        var _data2;
        throw new Error(((_data2 = data) === null || _data2 === void 0 ? void 0 : _data2.error) || `Chart endpoint HTTP ${response.status}`);
      }
      const history = extractChartHistory(data);
      if (!Array.isArray(history) || history.length === 0) {
        throw new Error("Yahoo Finance chart verisi boş.");
      }
      chartCache[cacheKey] = {
        timestamp: Date.now(),
        history
      };
      if (!isCurrentSymbolRequest(clean, requestId)) {
        return;
      }
      chartHistory = history;
      updateChartData(history);
    } catch (error) {
      if (!isCurrentSymbolRequest(clean, requestId)) {
        return;
      }
      console.error("BORSACI CHART ERROR:", error);
      const marketHistory = extractHistory(marketCache[clean]);
      if (marketHistory.length > 0) {
        console.warn("BORSACI: /chart başarısız. /market history fallback.");
        chartHistory = marketHistory;
        updateChartData(marketHistory);
        return;
      }
      showEmptyChart("GRAFİK VERİ HATASI", error.message);
    }
  });
  return _loadChartData.apply(this, arguments);
}
function updateChartData(history) {
  chartHistory = Array.isArray(history) ? history : [];
  if (!marketChart || !candleSeries) {
    console.warn("BORSACI: Chart hazır değil.");
    return;
  }
  if (!Array.isArray(history) || history.length === 0) {
    showEmptyChart("GRAFİK VERİSİ YOK", "Chart provider history döndürmedi.");
    return;
  }
  const candles = [];
  for (const item of history) {
    const rawTime = getHistoryValue(item, ["time", "date", "timestamp", "datetime", "t"]);
    const time = normalizeChartTime(rawTime);
    if (!time) {
      continue;
    }
    let open = Number(getHistoryValue(item, ["open", "o"]));
    let high = Number(getHistoryValue(item, ["high", "h"]));
    let low = Number(getHistoryValue(item, ["low", "l"]));
    let close = Number(getHistoryValue(item, ["close", "c", "price", "p"]));
    if (!Number.isFinite(close)) {
      continue;
    }
    if (!Number.isFinite(open)) {
      open = close;
    }
    if (!Number.isFinite(high)) {
      high = Math.max(open, close);
    }
    if (!Number.isFinite(low)) {
      low = Math.min(open, close);
    }
    high = Math.max(high, open, close);
    low = Math.min(low, open, close);
    candles.push({
      time,
      open,
      high,
      low,
      close
    });
  }
  candles.sort((a, b) => {
    const ta = typeof a.time === "number" ? a.time : Date.parse(a.time);
    const tb = typeof b.time === "number" ? b.time : Date.parse(b.time);
    return ta - tb;
  });
  const uniqueCandles = [];
  const seen = new Set();
  for (const candle of candles) {
    const key = String(candle.time);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    uniqueCandles.push(candle);
  }
  if (uniqueCandles.length === 0) {
    showEmptyChart("GRAFİK VERİ HATASI", "OHLC verisi okunamadı.");
    return;
  }
  try {
    candleSeries.setData(uniqueCandles);
  } catch (error) {
    console.error("BORSACI CANDLE ERROR:", error);
    showEmptyChart("GRAFİK HATASI", error.message);
    return;
  }
  if (volumeSeries) {
    const volumes = [];
    for (const item of history) {
      const rawTime = getHistoryValue(item, ["time", "date", "timestamp", "datetime", "t"]);
      const time = normalizeChartTime(rawTime);
      const volume = Number(getHistoryValue(item, ["volume", "vol", "v"]));
      if (time && Number.isFinite(volume)) {
        volumes.push({
          time,
          value: volume
        });
      }
    }
    volumes.sort((a, b) => {
      const ta = typeof a.time === "number" ? a.time : Date.parse(a.time);
      const tb = typeof b.time === "number" ? b.time : Date.parse(b.time);
      return ta - tb;
    });
    const uniqueVolumes = [];
    const volumeSeen = new Set();
    for (const item of volumes) {
      const key = String(item.time);
      if (volumeSeen.has(key)) {
        continue;
      }
      volumeSeen.add(key);
      uniqueVolumes.push(item);
    }
    if (uniqueVolumes.length > 0) {
      try {
        volumeSeries.setData(uniqueVolumes);
      } catch (error) {
        console.warn("BORSACI VOLUME ERROR:", error);
      }
    }
  }
  try {
    marketChart.timeScale().fitContent();
  } catch (error) {
    console.warn("BORSACI FIT ERROR:", error);
  }
  if (chartEmpty) {
    chartEmpty.style.display = "none";
  }
  console.log(`BORSACI: ${uniqueCandles.length} candle çizildi.`);

  /* Yeni mum geldiğinde A/B/C ışınları son grafik mumuna kadar uzatılır. */
  if (activeDecisionOverlay && normalizeSymbol(activeDecisionOverlay.symbol) === selectedSymbol) {
    renderDecisionChartOverlay(activeDecisionOverlay);
  }
}

/* ======================================================
   CLEAR CHART
====================================================== */

function decisionPrice(value) {
  if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) {
    return null;
  }
  const price = Number(value);
  return price > 0 ? price : null;
}
function chartDateKey(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  let timestamp = Number(value);
  if (!Number.isFinite(timestamp)) {
    timestamp = new Date(value).getTime();
  } else if (timestamp < 10000000000) {
    timestamp *= 1000;
  }
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  return new Date(timestamp).toISOString().slice(0, 10);
}
function decisionMarkerTime(value) {
  const wantedDate = chartDateKey(value);
  if (!wantedDate) {
    return null;
  }
  const candle = chartHistory.find(item => chartDateKey(getHistoryValue(item, ["time", "date", "timestamp", "datetime", "t"])) === wantedDate);
  if (!candle) {
    return null;
  }
  return normalizeChartTime(getHistoryValue(candle, ["time", "date", "timestamp", "datetime", "t"]));
}
function clearDecisionChartOverlay() {
  if (candleSeries && Array.isArray(decisionOverlayPriceLines)) {
    decisionOverlayPriceLines.forEach(line => {
      try {
        candleSeries.removePriceLine(line);
      } catch (_unused4) {}
    });
  }
  decisionOverlayPriceLines = [];
  if (marketChart && Array.isArray(decisionOverlayRaySeries)) {
    decisionOverlayRaySeries.forEach(series => {
      try {
        marketChart.removeSeries(series);
      } catch (_unused5) {}
    });
  }
  decisionOverlayRaySeries = [];
  if (decisionOverlayMarkers && typeof decisionOverlayMarkers.setMarkers === "function") {
    try {
      decisionOverlayMarkers.setMarkers([]);
    } catch (_unused6) {}
  } else if (decisionOverlayUsesSeriesMarkers && candleSeries && typeof candleSeries.setMarkers === "function") {
    try {
      candleSeries.setMarkers([]);
    } catch (_unused7) {}
  }
  decisionOverlayMarkers = null;
  decisionOverlayUsesSeriesMarkers = false;
  activeDecisionOverlay = null;
}
function addDecisionPriceLine(price, title, color, lineStyle) {
  const safePrice = decisionPrice(price);
  if (!candleSeries || safePrice === null) {
    return;
  }
  try {
    const line = candleSeries.createPriceLine({
      price: safePrice,
      color,
      lineWidth: 1,
      lineStyle,
      axisLabelVisible: true,
      title
    });
    decisionOverlayPriceLines.push(line);
  } catch (error) {
    console.warn("BORSACI: işlem planı çizgisi eklenemedi.", error);
  }
}
function chartTimeOrder(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
}
function latestDecisionChartTime() {
  let latest = null;
  (chartHistory || []).forEach(item => {
    const time = normalizeChartTime(getHistoryValue(item, ["time", "date", "timestamp", "datetime", "t"]));
    if (time === null || chartTimeOrder(time) === null || latest !== null && chartTimeOrder(time) <= chartTimeOrder(latest)) {
      return;
    }
    latest = time;
  });
  return latest;
}
function addDecisionPivotRay(point, label, color, lineStyle) {
  if (!marketChart || typeof LightweightCharts === "undefined" || !LightweightCharts.LineSeries) {
    return;
  }
  const price = decisionPrice(point === null || point === void 0 ? void 0 : point.price);
  const startTime = decisionMarkerTime(point === null || point === void 0 ? void 0 : point.date);
  const endTime = latestDecisionChartTime();
  if (price === null || startTime === null || endTime === null || chartTimeOrder(startTime) === null || chartTimeOrder(endTime) === null || chartTimeOrder(startTime) >= chartTimeOrder(endTime)) {
    return;
  }
  try {
    const series = marketChart.addSeries(LightweightCharts.LineSeries, {
      color,
      lineWidth: 1,
      lineStyle,
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
      title: `${label} RAY`
    });
    series.setData([{
      time: startTime,
      value: price
    }, {
      time: endTime,
      value: price
    }]);
    decisionOverlayRaySeries.push(series);
  } catch (error) {
    console.warn("BORSACI: A/B/C yatay ışını eklenemedi.", error);
  }
}
function addDecisionDescendingResistanceTrendline(resistance, lineStyle) {
  var _resistance$valid, _projectedPoint$date, _ref4, _projectedPoint$price;
  if (!marketChart || typeof LightweightCharts === "undefined" || !LightweightCharts.LineSeries || !((_resistance$valid = resistance === null || resistance === void 0 ? void 0 : resistance.valid) !== null && _resistance$valid !== void 0 ? _resistance$valid : resistance === null || resistance === void 0 ? void 0 : resistance.available)) {
    return;
  }
  const anchor1 = resistance.anchor1;
  const anchor2 = resistance.anchor2;
  const projectedPoint = resistance.projectedPoint;
  const startTime = decisionMarkerTime(anchor1 === null || anchor1 === void 0 ? void 0 : anchor1.date);
  const anchor2Time = decisionMarkerTime(anchor2 === null || anchor2 === void 0 ? void 0 : anchor2.date);
  const endTime = decisionMarkerTime((_projectedPoint$date = projectedPoint === null || projectedPoint === void 0 ? void 0 : projectedPoint.date) !== null && _projectedPoint$date !== void 0 ? _projectedPoint$date : resistance.lastCompletedCandleTime);
  const startPrice = decisionPrice(anchor1 === null || anchor1 === void 0 ? void 0 : anchor1.price);
  const anchor2Price = decisionPrice(anchor2 === null || anchor2 === void 0 ? void 0 : anchor2.price);
  const endPrice = decisionPrice((_ref4 = (_projectedPoint$price = projectedPoint === null || projectedPoint === void 0 ? void 0 : projectedPoint.price) !== null && _projectedPoint$price !== void 0 ? _projectedPoint$price : resistance.breakoutPrice) !== null && _ref4 !== void 0 ? _ref4 : resistance.breakoutPriceAtLast);
  if (startTime === null || anchor2Time === null || endTime === null || startPrice === null || anchor2Price === null || endPrice === null || chartTimeOrder(startTime) === null || chartTimeOrder(anchor2Time) === null || chartTimeOrder(endTime) === null || chartTimeOrder(startTime) >= chartTimeOrder(anchor2Time) || chartTimeOrder(anchor2Time) > chartTimeOrder(endTime)) {
    return;
  }
  try {
    const series = marketChart.addSeries(LightweightCharts.LineSeries, {
      color: "#ff5d5d",
      lineWidth: 2,
      lineStyle,
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
      title: "ALÇALAN TEPE TRENDİ"
    });
    const data = [{
      time: startTime,
      value: startPrice
    }, {
      time: anchor2Time,
      value: anchor2Price
    }];
    if (chartTimeOrder(anchor2Time) < chartTimeOrder(endTime)) {
      data.push({
        time: endTime,
        value: endPrice
      });
    }
    series.setData(data);
    decisionOverlayRaySeries.push(series);
  } catch (error) {
    console.warn("BORSACI: alçalan tepe trend çizgisi eklenemedi.", error);
  }
}
function renderDecisionChartOverlay(decision) {
  var _lineStyle$Dotted, _lineStyle$Dashed, _lineStyle$Solid, _ref5, _decision$entry$low, _decision$entry, _decision$entry$high, _decision$entry2, _fib$stopLoss, _fib$tp, _fib$tp2, _fib$tp3;
  clearDecisionChartOverlay();
  if (!decision || !candleSeries || !marketChart) {
    return;
  }
  const fib = decision.fibonacci || {};
  const lineStyle = typeof LightweightCharts !== "undefined" ? LightweightCharts.LineStyle || {} : {};
  const dotted = (_lineStyle$Dotted = lineStyle.Dotted) !== null && _lineStyle$Dotted !== void 0 ? _lineStyle$Dotted : 1;
  const dashed = (_lineStyle$Dashed = lineStyle.Dashed) !== null && _lineStyle$Dashed !== void 0 ? _lineStyle$Dashed : 2;
  const solid = (_lineStyle$Solid = lineStyle.Solid) !== null && _lineStyle$Solid !== void 0 ? _lineStyle$Solid : 0;
  const levels = [{
    price: fib.entryTriggerPrice,
    title: "FIB TETİK",
    color: "#76a9ff",
    style: dashed
  }, {
    price: (_ref5 = (_decision$entry$low = (_decision$entry = decision.entry) === null || _decision$entry === void 0 ? void 0 : _decision$entry.low) !== null && _decision$entry$low !== void 0 ? _decision$entry$low : fib.entryZoneLow) !== null && _ref5 !== void 0 ? _ref5 : fib.entryPrice,
    title: "GİRİŞ ALT",
    color: "#72dddd",
    style: dotted
  }, {
    price: (_decision$entry$high = (_decision$entry2 = decision.entry) === null || _decision$entry2 === void 0 ? void 0 : _decision$entry2.high) !== null && _decision$entry$high !== void 0 ? _decision$entry$high : fib.entryZoneHigh,
    title: "GİRİŞ ÜST",
    color: "#72dddd",
    style: dotted
  }, {
    price: (_fib$stopLoss = fib.stopLoss) !== null && _fib$stopLoss !== void 0 ? _fib$stopLoss : decision.stop,
    title: "SL",
    color: "#ff6b6b",
    style: solid
  }, {
    price: (_fib$tp = fib.tp1) !== null && _fib$tp !== void 0 ? _fib$tp : decision.target1,
    title: "TP1",
    color: "#78e58b",
    style: solid
  }, {
    price: (_fib$tp2 = fib.tp2) !== null && _fib$tp2 !== void 0 ? _fib$tp2 : decision.target2,
    title: "TP2",
    color: "#78e58b",
    style: solid
  }, {
    price: (_fib$tp3 = fib.tp3) !== null && _fib$tp3 !== void 0 ? _fib$tp3 : decision.target3,
    title: "TP3",
    color: "#78e58b",
    style: solid
  }];
  const drawnPrices = new Set();
  levels.forEach(level => {
    const price = decisionPrice(level.price);
    if (price === null || drawnPrices.has(price.toFixed(6))) {
      return;
    }
    drawnPrices.add(price.toFixed(6));
    addDecisionPriceLine(price, level.title, level.color, level.style);
  });
  addDecisionDescendingResistanceTrendline(fib.descendingResistance, solid);
  const pivotOverlays = [{
    point: fib.pointA,
    label: "A",
    position: "belowBar",
    shape: "arrowUp",
    color: "#f5c15d",
    lineStyle: dotted
  }, {
    point: fib.pointB,
    label: "B",
    position: "aboveBar",
    shape: "arrowDown",
    color: "#78e58b",
    lineStyle: dashed
  }, {
    point: fib.pointC,
    label: "C",
    position: "belowBar",
    shape: "arrowUp",
    color: "#76a9ff",
    lineStyle: solid
  }];
  pivotOverlays.forEach(pivot => addDecisionPivotRay(pivot.point, pivot.label, pivot.color, pivot.lineStyle));
  const markers = pivotOverlays.map(marker => {
    var _marker$point, _marker$point2;
    const time = decisionMarkerTime((_marker$point = marker.point) === null || _marker$point === void 0 ? void 0 : _marker$point.date);
    const price = decisionPrice((_marker$point2 = marker.point) === null || _marker$point2 === void 0 ? void 0 : _marker$point2.price);
    if (time === null || price === null) {
      return null;
    }
    return {
      time,
      position: marker.position,
      color: marker.color,
      shape: marker.shape,
      text: `${marker.label} ₺${formatPrice(price)}`
    };
  }).filter(Boolean);
  if (markers.length > 0) {
    try {
      if (typeof LightweightCharts !== "undefined" && typeof LightweightCharts.createSeriesMarkers === "function") {
        decisionOverlayMarkers = LightweightCharts.createSeriesMarkers(candleSeries, markers);
      } else if (typeof candleSeries.setMarkers === "function") {
        candleSeries.setMarkers(markers);
        decisionOverlayUsesSeriesMarkers = true;
      }
    } catch (error) {
      console.warn("BORSACI: A/B/C grafikte işaretlenemedi.", error);
    }
  }
  activeDecisionOverlay = decision;
}
function focusDecisionOnChart(_x4) {
  return _focusDecisionOnChart.apply(this, arguments);
}
function _focusDecisionOnChart() {
  _focusDecisionOnChart = _asyncToGenerator(function* (decision) {
    const symbol = normalizeSymbol(decision === null || decision === void 0 ? void 0 : decision.symbol);
    if (!symbol) {
      return;
    }
    const requestId = ++decisionOverlayRequestId;

    /* Fibonacci noktaları günlük olduğundan aynı zaman diliminde çizilir. */
    chartRange = "1y";
    chartInterval = "1d";
    try {
      yield selectSymbol(symbol, {
        /* Karar grafiğini açmak watchlist'i veya GitHub'daki listeyi değiştirmez. */
        persistInWatchlist: false
      });
      if (requestId !== decisionOverlayRequestId || selectedSymbol !== symbol) {
        return;
      }
      renderDecisionChartOverlay(decision);
    } catch (error) {
      console.warn("BORSACI: işlem planı grafiği yüklenemedi.", error);
    }
  });
  return _focusDecisionOnChart.apply(this, arguments);
}
function clearChartOnly() {
  clearDecisionChartOverlay();
  if (candleSeries) {
    try {
      candleSeries.setData([]);
    } catch (_unused8) {}
  }
  if (volumeSeries) {
    try {
      volumeSeries.setData([]);
    } catch (_unused9) {}
  }
  chartHistory = [];
}

/* ======================================================
   EMPTY CHART
====================================================== */

function showEmptyChart(title, message) {
  if (!chartEmpty) return;
  chartEmpty.style.display = "flex";
  chartEmpty.innerHTML = `

    <span>
      ${escapeHtml(title)}
    </span>

    <small>
      ${escapeHtml(message)}
    </small>

  `;
}

/* ======================================================
   DASHBOARD ERROR
====================================================== */

function showDashboardError(message) {
  showEmptyChart("PİYASA VERİ HATASI", message);
}

/* ======================================================
   CLEAR DASHBOARD
====================================================== */

function clearDashboard() {
  selectedSymbol = null;
  if (chartSymbol) {
    chartSymbol.innerText = "SEMBOL YOK";
  }
  clearChartOnly();
  ["rsi", "macd", "ema20", "ema50", "volume", "atr"].forEach(id => {
    setText(id, "--");
  });
  showEmptyChart("PİYASA VERİSİ YOK", "Select a symbol to display the chart.");
  renderWatchlist();
}

/* ======================================================
   AI RESPONSE
====================================================== */

function renderAIResponse(text) {
  if (!responseBox) return;
  if (text === null || text === undefined || String(text).trim() === "") {
    responseBox.innerHTML = `
      <div class="empty-state">

        <span>
          NO ANALYSIS
        </span>

        <small>
          AI analiz sonucu alınamadı.
        </small>

      </div>
    `;
    return;
  }
  let html = escapeHtml(String(text));
  html = html.replace(/^### (.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^## (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^# (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/^[-•] (.+)$/gm, '<div class="ai-bullet">• $1</div>');
  html = html.replace(/\n/g, "<br>");
  responseBox.innerHTML = `
    <div class="ai-response-content">
      ${html}
    </div>
  `;
}

/* ======================================================
   AI LOADING
====================================================== */

function showAnalysisLoading() {
  if (!responseBox) return;
  responseBox.innerHTML = `

    <div class="ai-loading">

      <div class="ai-loading-title">
        ANALYZING
      </div>

      <div class="ai-loading-text">
        MCP market data is being analyzed...
      </div>

      <div class="ai-loading-subtext">
        Waiting for AI server response...
      </div>

    </div>

  `;
}

/* ======================================================
   AI ERROR
====================================================== */

function showAnalysisError(message) {
  if (!responseBox) return;
  responseBox.innerHTML = `

    <div class="ai-error">

      <strong>
        ANALYSIS ERROR
      </strong>

      <small>
        ${escapeHtml(message || "Analiz sırasında bilinmeyen bir hata oluştu.")}
      </small>

    </div>

  `;
}

/* ======================================================
   ANALYZE BUTTON STATE
====================================================== */

function setAnalyzeButtonState(loading) {
  if (!analyzeBtn) return;
  analyzeBtn.disabled = loading;
  if (loading) {
    if (!analyzeBtn.dataset.originalText) {
      analyzeBtn.dataset.originalText = analyzeBtn.innerText;
    }
    analyzeBtn.innerText = "ANALYZING...";
    analyzeBtn.classList.add("loading");
  } else {
    analyzeBtn.innerText = analyzeBtn.dataset.originalText || "ANALYZE";
    analyzeBtn.classList.remove("loading");
  }
}

/* ======================================================
   FETCH TIMEOUT
====================================================== */
function fetchWithTimeout(_x5) {
  return _fetchWithTimeout.apply(this, arguments);
}
/* ======================================================
   ANALYZE
====================================================== */
function _fetchWithTimeout() {
  _fetchWithTimeout = _asyncToGenerator(function* (url, options = {}, timeout = 4500000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeout);
    try {
      return yield fetch(url, _objectSpread(_objectSpread({}, options), {}, {
        signal: controller.signal
      }));
    } catch (error) {
      if ((error === null || error === void 0 ? void 0 : error.name) === "AbortError") {
        throw new Error("Render /ask 45 saniye içinde cevap vermedi.");
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  });
  return _fetchWithTimeout.apply(this, arguments);
}
function analyzeQuestion() {
  return _analyzeQuestion.apply(this, arguments);
}
/* ======================================================
   EVENT BINDING
====================================================== */
function _analyzeQuestion() {
  _analyzeQuestion = _asyncToGenerator(function* () {
    if (analysisRunning) {
      return;
    }
    if (!questionInput) {
      console.error("BORSACI: #question bulunamadı.");
      return;
    }
    const question = questionInput.value.trim();
    if (!question) {
      questionInput.focus();
      return;
    }
    analysisRunning = true;
    setAnalyzeButtonState(true);
    showAnalysisLoading();
    console.log("========================================");
    console.log("BORSACI AI REQUEST START");
    console.log("Endpoint:", "/ask");
    console.log("Question:", question);
    console.log("Image attached:", Boolean(selectedImageBase64));
    try {
      var _ref43, _ref44, _ref45, _data$answer, _data6, _data7, _data8, _data9, _data0;
      const response = yield fetchWithTimeout("/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          question,
          image: selectedImageBase64 || null
        }),
        cache: "no-store"
      }, 4500000);
      const text = yield response.text();
      console.log("BORSACI AI HTTP STATUS:", response.status);
      console.log("BORSACI AI RAW RESPONSE:", text);
      if (!text || !text.trim()) {
        throw new Error(`Render /ask boş cevap döndürdü. HTTP ${response.status}`);
      }
      let data;
      try {
        data = JSON.parse(text);
      } catch (_unused25) {
        throw new Error(`Render /ask JSON döndürmedi. HTTP ${response.status}. Cevap: ${text.slice(0, 300)}`);
      }
      if (!response.ok) {
        var _data3, _data4, _data5;
        throw new Error(((_data3 = data) === null || _data3 === void 0 ? void 0 : _data3.error) || ((_data4 = data) === null || _data4 === void 0 ? void 0 : _data4.message) || ((_data5 = data) === null || _data5 === void 0 ? void 0 : _data5.details) || `AI endpoint HTTP ${response.status}`);
      }
      const answer = (_ref43 = (_ref44 = (_ref45 = (_data$answer = (_data6 = data) === null || _data6 === void 0 ? void 0 : _data6.answer) !== null && _data$answer !== void 0 ? _data$answer : (_data7 = data) === null || _data7 === void 0 ? void 0 : _data7.response) !== null && _ref45 !== void 0 ? _ref45 : (_data8 = data) === null || _data8 === void 0 ? void 0 : _data8.result) !== null && _ref44 !== void 0 ? _ref44 : (_data9 = data) === null || _data9 === void 0 ? void 0 : _data9.text) !== null && _ref43 !== void 0 ? _ref43 : (_data0 = data) === null || _data0 === void 0 ? void 0 : _data0.message;
      if (answer === null || answer === undefined || String(answer).trim() === "") {
        throw new Error("AI sunucusu başarılı HTTP cevabı verdi ancak analiz metni bulunamadı.");
      }
      renderAIResponse(answer);
      clearSelectedImage();
    } catch (error) {
      console.error("BORSACI AI ERROR:", error);
      showAnalysisError((error === null || error === void 0 ? void 0 : error.message) || "Analiz sırasında bilinmeyen bir hata oluştu.");
    } finally {
      analysisRunning = false;
      setAnalyzeButtonState(false);
    }
  });
  return _analyzeQuestion.apply(this, arguments);
}
function bindEvents() {
  /*
   * EKLE
   */

  if (addSymbolBtn) {
    addSymbolBtn.addEventListener("click", addSymbol);
  } else {
    console.error("BORSACI: #addSymbolBtn bulunamadı.");
  }

  /*
   * ANALYZE
   */

  if (analyzeBtn) {
    analyzeBtn.addEventListener("click", analyzeQuestion);
  } else {
    console.error("BORSACI: #analyzeBtn bulunamadı.");
  }

  /*
   * ENTER
   */

  if (questionInput) {
    questionInput.addEventListener("keydown", event => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        analyzeQuestion();
      }
    });
  }

  /*
   * ATTACH IMAGE
   */

  bindImageEvents();
}

/* ======================================================
   CHART CONTROL BRIDGE
====================================================== */

window.BORSACI_CHART = {
  getSelectedSymbol() {
    return selectedSymbol;
  },
  loadChart() {
    return _asyncToGenerator(function* (range = "1y", interval = "1d") {
      const symbol = selectedSymbol;
      if (!symbol) {
        console.warn("BORSACI CHART: Seçili sembol yok.");
        return;
      }
      chartRange = range;
      chartInterval = interval;
      const cacheKey = `${symbol}_${range}_${interval}`;
      delete chartCache[cacheKey];
      yield loadChartData(symbol, range, interval);
    }).apply(this, arguments);
  },
  getHistory() {
    var _chartCache$cacheKey;
    const cacheKey = `${selectedSymbol}_${chartRange}_${chartInterval}`;
    return ((_chartCache$cacheKey = chartCache[cacheKey]) === null || _chartCache$cacheKey === void 0 ? void 0 : _chartCache$cacheKey.history) || chartHistory || [];
  }
};

/* ======================================================
   CHART CONTROL EVENT
====================================================== */

window.addEventListener("borsaci", /*#__PURE__*/function () {
  var _ref6 = _asyncToGenerator(function* (event) {
    const detail = event.detail || {};
    const range = detail.range || "1y";
    const interval = detail.interval || "1d";
    chartRange = range;
    chartInterval = interval;
    if (!selectedSymbol) {
      console.warn("BORSACI: Chart change geldi ama seçili sembol yok.");
      return;
    }
    const cacheKey = `${selectedSymbol}_${range}_${interval}`;
    delete chartCache[cacheKey];
    yield loadChartData(selectedSymbol, range, interval);
  });
  return function (_x6) {
    return _ref6.apply(this, arguments);
  };
}());

/* ======================================================
   INITIALIZATION
====================================================== */
function initializeBorsaCI() {
  return _initializeBorsaCI.apply(this, arguments);
}
/* ======================================================
   START
====================================================== */
function _initializeBorsaCI() {
  _initializeBorsaCI = _asyncToGenerator(function* () {
    console.log("BORSACI: Initialization started.");

    /*
     * ÖNEMLİ:
     * Elementler burada alınıyor.
     * Böylece script head'de olsa bile
     * butonlar null kalmıyor.
     */

    initializeElements();

    /*
     * Attach-image elementleri
     */

    initializeImageElements();

    /*
     * Saat
     */

    updateClock();
    setInterval(updateClock, 1000);

    /*
     * Watchlist
     */

    loadWatchlist();

    /*
     * Eventler
     */

    bindEvents();

    /*
     * Chart
     */

    initMarketChart();

    /*
     * Watchlist render
     */

    renderWatchlist();

    /*
     * Kayıtlı ilk sembol
     */

    if (symbols.length > 0) {
      yield selectSymbol(symbols[0]);
    } else {
      clearDashboard();
    }
    console.log("BORSACI: Application initialized.");
  });
  return _initializeBorsaCI.apply(this, arguments);
}
function startBorsaCIWhenAuthenticated() {
  return _startBorsaCIWhenAuthenticated.apply(this, arguments);
}
function _startBorsaCIWhenAuthenticated() {
  _startBorsaCIWhenAuthenticated = _asyncToGenerator(function* () {
    var _window$borsaciAuth2;
    if (!((_window$borsaciAuth2 = window.borsaciAuth) !== null && _window$borsaciAuth2 !== void 0 && _window$borsaciAuth2.authenticated)) {
      yield new Promise(resolve => window.addEventListener("borsaci:auth-ready", resolve, {
        once: true
      }));
    }
    initializeBorsaCI();
  });
  return _startBorsaCIWhenAuthenticated.apply(this, arguments);
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startBorsaCIWhenAuthenticated, {
    once: true
  });
} else {
  startBorsaCIWhenAuthenticated();
}
console.log("BORSACI: APP.JS loaded.");
/* =========================================================
   BORSACI UI ENHANCEMENT
   SADECE GÖRSEL / UX
   Mevcut trading ve API mantığına dokunmaz.
========================================================= */

(() => {
  "use strict";

  /* =======================================================
     UI STYLE
  ======================================================= */
  const style = document.createElement("style");
  style.textContent = `

    /* -----------------------------------------------------
       GLOBAL
    ----------------------------------------------------- */

    :root {
      --borsaci-orange: #ff9f1c;
      --borsaci-green: #20c997;
      --borsaci-red: #ff4d4d;
      --borsaci-blue: #4da3ff;
      --borsaci-bg: #080808;
      --borsaci-panel: #101010;
      --borsaci-border: #242424;
      --borsaci-text: #e8e8e8;
      --borsaci-muted: #777;
    }

    * {
      scrollbar-width: thin;
      scrollbar-color: #333 #090909;
    }

    ::selection {
      background: rgba(255,159,28,.25);
      color: #fff;
    }


    /* -----------------------------------------------------
       TERMINAL
    ----------------------------------------------------- */

    .terminal {
      position: relative;
    }

    .terminal::before {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 9999;

      background:
        linear-gradient(
          rgba(255,255,255,.012) 50%,
          transparent 50%
        );

      background-size: 100% 4px;

      opacity: .18;
    }


    /* -----------------------------------------------------
       TOP BAR
    ----------------------------------------------------- */

    .topbar {
      border-bottom: 1px solid #292929 !important;
      box-shadow:
        0 1px 0 rgba(255,159,28,.05),
        0 8px 30px rgba(0,0,0,.25);
    }

    .brand {
      letter-spacing: 2px;
      font-weight: 800;
    }

    .brand span {
      color: var(--borsaci-orange) !important;
      opacity: .8;
    }

    .system-status {
      display: flex;
      align-items: center;
      gap: 8px;
      letter-spacing: 1px;
    }

    .status-dot {
      width: 7px !important;
      height: 7px !important;
      border-radius: 50%;
      background: var(--borsaci-green) !important;

      box-shadow:
        0 0 6px rgba(32,201,151,.9),
        0 0 14px rgba(32,201,151,.35);

      animation: borsaciPulse 2s infinite;
    }

    @keyframes borsaciPulse {
      0%,100% {
        opacity: 1;
        transform: scale(1);
      }

      50% {
        opacity: .45;
        transform: scale(.75);
      }
    }


    /* -----------------------------------------------------
       MARKET BAR
    ----------------------------------------------------- */

    .market-bar {
      border-top: 1px solid #181818;
      border-bottom: 1px solid #292929;
      background:
        linear-gradient(
          90deg,
          rgba(255,159,28,.025),
          transparent 30%,
          transparent 70%,
          rgba(32,201,151,.02)
        );
    }

    .market-bar strong {
      margin-left: 6px;
      font-family: monospace;
    }

    .market-bar .online {
      color: var(--borsaci-green) !important;
      text-shadow: 0 0 8px rgba(32,201,151,.25);
    }


    /* -----------------------------------------------------
       ALL PANELS
    ----------------------------------------------------- */

    .panel {
      position: relative;
      border: 1px solid var(--borsaci-border) !important;

      background:
        linear-gradient(
          145deg,
          rgba(255,255,255,.018),
          rgba(0,0,0,.12)
        ) !important;

      box-shadow:
        0 8px 30px rgba(0,0,0,.18);

      transition:
        border-color .2s ease,
        box-shadow .2s ease,
        transform .2s ease;
    }

    .panel:hover {
      border-color: #343434 !important;

      box-shadow:
        0 10px 35px rgba(0,0,0,.25);
    }


    /* -----------------------------------------------------
       PANEL TITLES
    ----------------------------------------------------- */

    .panel-title {
      position: relative;

      border-bottom: 1px solid #252525 !important;

      letter-spacing: 1.2px;
      font-size: 11px;

      background:
        linear-gradient(
          90deg,
          rgba(255,159,28,.045),
          transparent 35%
        );
    }

    .panel-title::before {
      content: "";
      width: 3px;
      height: 12px;

      display: inline-block;

      margin-right: 8px;

      vertical-align: -2px;

      background: var(--borsaci-orange);

      box-shadow:
        0 0 8px rgba(255,159,28,.3);
    }

    .panel-status {
      color: #888;
      font-family: monospace;
    }


    /* -----------------------------------------------------
       WATCHLIST
    ----------------------------------------------------- */

    .watchlist-body {
      background:
        repeating-linear-gradient(
          0deg,
          transparent,
          transparent 34px,
          rgba(255,255,255,.015) 35px
        );
    }

    .watchlist-empty {
      opacity: .55;
    }

    .empty-icon {
      border-color: #333 !important;
      color: var(--borsaci-orange) !important;
      transition: all .2s ease;
    }

    .watchlist-empty:hover .empty-icon {
      border-color: var(--borsaci-orange) !important;
      box-shadow: 0 0 15px rgba(255,159,28,.15);
    }

    .mini-button {
      transition: all .2s ease !important;
    }

    .mini-button:hover {
      border-color: var(--borsaci-orange) !important;
      color: var(--borsaci-orange) !important;
      box-shadow: 0 0 12px rgba(255,159,28,.12);
    }


    /* -----------------------------------------------------
       CHART
    ----------------------------------------------------- */

    .chart-area {
      position: relative;
      overflow: hidden;

      background:
        radial-gradient(
          circle at 50% 45%,
          rgba(255,159,28,.025),
          transparent 55%
        ),
        #090909 !important;
    }

    .chart-area::after {
      content: "BORSACI // MARKET DATA";

      position: absolute;
      right: 12px;
      bottom: 8px;

      font-family: monospace;
      font-size: 8px;

      letter-spacing: 1px;

      color: rgba(255,255,255,.15);

      pointer-events: none;
    }


    /* -----------------------------------------------------
       NEWS
    ----------------------------------------------------- */

    .news-feed {
      background:
        linear-gradient(
          180deg,
          rgba(255,159,28,.015),
          transparent
        );
    }

    .news-item {
      position: relative;

      border-bottom: 1px solid #1d1d1d !important;

      transition:
        background .15s ease,
        padding-left .15s ease;
    }

    .news-item:hover {
      background: rgba(255,159,28,.035) !important;
      padding-left: 7px !important;
    }

    .news-item:hover .news-item-title {
      color: #fff;
    }

    .news-item-title {
      transition: color .15s ease;
    }

    .news-source {
      font-family: monospace;
      letter-spacing: .8px;
    }

    .kap-source {
      color: var(--borsaci-orange) !important;

      text-shadow:
        0 0 8px rgba(255,159,28,.2);
    }


    /* -----------------------------------------------------
       TECHNICAL
    ----------------------------------------------------- */

    .technical {
      overflow: hidden;
    }


    /* -----------------------------------------------------
       COMMAND TERMINAL
    ----------------------------------------------------- */

    .command-panel {
      position: relative;

      border: 1px solid #2a2a2a;

      background:
        radial-gradient(
          circle at 10% 0%,
          rgba(255,159,28,.035),
          transparent 40%
        ),
        #0a0a0a;

      box-shadow:
        0 10px 40px rgba(0,0,0,.3);
    }

    .command-panel::before {
      content: "AI COMMAND INTERFACE";

      position: absolute;

      top: 8px;
      right: 12px;

      font-family: monospace;
      font-size: 8px;

      letter-spacing: 1.5px;

      color: #444;

      pointer-events: none;
    }

    .command-header {
      border-bottom: 1px solid #262626 !important;
    }

    .command-title {
      letter-spacing: 1.5px;
      font-weight: 700;
    }

    .command-title > span {
      color: var(--borsaci-orange);
      text-shadow:
        0 0 10px rgba(255,159,28,.4);
    }

    .command-status {
      color: var(--borsaci-green) !important;
      font-family: monospace;
      font-size: 10px;
    }

    #question {
      background:
        linear-gradient(
          90deg,
          rgba(255,159,28,.018),
          transparent
        ) !important;

      border-color: #252525 !important;

      font-family:
        "JetBrains Mono",
        "Cascadia Code",
        monospace;

      transition:
        border-color .2s ease,
        box-shadow .2s ease;
    }

    #question:focus {
      border-color: rgba(255,159,28,.55) !important;

      box-shadow:
        0 0 0 1px rgba(255,159,28,.08),
        0 0 25px rgba(255,159,28,.06);
    }

    #question::placeholder {
      color: #555;
    }

    #analyzeBtn {
      position: relative;
      overflow: hidden;

      border: 1px solid #bd7110 !important;

      background:
        linear-gradient(
          180deg,
          #ffad32,
          #d77f08
        ) !important;

      color: #080808 !important;

      font-weight: 800;
      letter-spacing: 1px;

      box-shadow:
        0 0 15px rgba(255,159,28,.08);

      transition:
        transform .15s ease,
        box-shadow .15s ease;
    }

    #analyzeBtn:hover {
      transform: translateY(-1px);

      box-shadow:
        0 5px 25px rgba(255,159,28,.18);
    }

    #analyzeBtn:active {
      transform: translateY(0);
    }


    /* -----------------------------------------------------
       AI RESPONSE
    ----------------------------------------------------- */

    .response-panel {
      overflow: hidden;
    }

    #response {
      position: relative;

      min-height: 120px;

      font-family:
        "JetBrains Mono",
        "Cascadia Code",
        monospace;

      line-height: 1.65;

      color: #d8d8d8;

      background:
        radial-gradient(
          circle at 0% 0%,
          rgba(77,163,255,.025),
          transparent 40%
        );
    }


    /* -----------------------------------------------------
       NEWS IMPACT
    ----------------------------------------------------- */

    .news-impact {
      overflow: hidden;
    }


    /* -----------------------------------------------------
       FOOTER
    ----------------------------------------------------- */

    .footer {
      border-top: 1px solid #242424 !important;

      color: #555;

      letter-spacing: 1px;
      font-family: monospace;
      font-size: 9px;
    }

    .footer span {
      color: #333;
    }


    /* -----------------------------------------------------
       RESPONSIVE
    ----------------------------------------------------- */

    @media (max-width: 900px) {

      .terminal {
        width: 100%;
      }

      .market-bar {
        overflow-x: auto;
      }

      .command-panel::before {
        display: none;
      }

    }

  `;
  document.head.appendChild(style);

  /* =======================================================
     LIVE CLOCK
  ======================================================= */

  function updateClock() {
    const clock = document.getElementById("clock");
    if (!clock) return;
    const now = new Date();
    clock.textContent = now.toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }
  updateClock();
  setInterval(updateClock, 1000);

  /* =======================================================
     PANEL LOAD EFFECT
  ======================================================= */

  function animatePanels() {
    const panels = document.querySelectorAll(".panel, .command-panel");
    panels.forEach((panel, index) => {
      panel.style.opacity = "0";
      panel.style.transform = "translateY(5px)";
      setTimeout(() => {
        panel.style.transition = "opacity .35s ease, transform .35s ease";
        panel.style.opacity = "1";
        panel.style.transform = "translateY(0)";
      }, index * 45);
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", animatePanels);
  } else {
    animatePanels();
  }

  /* =======================================================
     COMMAND SHORTCUTS
  ======================================================= */

  const question = document.getElementById("question");
  if (question) {
    question.addEventListener("keydown", event => {
      /* ESC = CLEAR */

      if (event.key === "Escape") {
        question.value = "";
        question.focus();
      }
    });
  }

  /* =======================================================
     NEWS HOVER SOURCE EFFECT
  ======================================================= */

  document.addEventListener("mouseover", event => {
    const item = event.target.closest(".news-item");
    if (!item) return;
    const source = item.querySelector(".news-source");
    if (!source) return;
    source.style.transition = "text-shadow .2s ease";
    source.style.textShadow = "0 0 10px rgba(255,159,28,.35)";
  });
  document.addEventListener("mouseout", event => {
    const item = event.target.closest(".news-item");
    if (!item) return;
    const source = item.querySelector(".news-source");
    if (!source) return;
    source.style.textShadow = "";
  });

  /* =======================================================
     COMMAND INPUT CHARACTER COUNTER
  ======================================================= */

  if (question) {
    const footer = document.querySelector(".command-footer");
    if (footer) {
      const counter = document.createElement("span");
      counter.id = "commandCounter";
      counter.style.cssText = `
        margin-left: auto;
        margin-right: 12px;
        color: #444;
        font-family: monospace;
        font-size: 9px;
      `;

      /*
       * #analyzeBtn, .command-actions içinde yer alır.
       * Sayaç doğrudan command-footer'a eklenirken
       * geçerli bir doğrudan çocuk referansı kullanılır.
       */
      footer.insertBefore(counter, footer.querySelector(".command-actions"));
      function updateCounter() {
        counter.textContent = `${question.value.length} CHARS`;
      }
      question.addEventListener("input", updateCounter);
      updateCounter();
    }
  }

  /* =======================================================
     AI RESPONSE AUTO SCROLL
  ======================================================= */

  const response = document.getElementById("response");
  if (response) {
    const observer = new MutationObserver(() => {
      response.scrollTop = response.scrollHeight;
    });
    observer.observe(response, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  /* =======================================================
     TERMINAL READY
  ======================================================= */

  console.log("%c BORSACI UI READY ", `
      background:#ff9f1c;
      color:#080808;
      font-weight:bold;
      padding:4px 8px;
    `);
  /*
  ========================================================
  AI TRADING SCANNER
  ========================================================
  */

  const scannerStartButton = document.getElementById("startScannerBtn");
  const scannerStopButton = document.getElementById("stopScannerBtn");
  const scannerResults = document.getElementById("scannerResults");
  const scannerStatus = document.getElementById("scannerStatus");
  const tradingEngineStatus = document.getElementById("tradingEngineStatus");
  const lastScanTime = document.getElementById("lastScanTime");
  let scannerRunning = false;
  let scannerAbortController = null;
  let scannerRequestId = 0;
  let scannerProgressTimer = null;
  // Bir progress isteği ağda beklerken tarama tamamlanabilir. Sadece
  // requestId kontrolü yeterli değildir; aynı tarama için bekleyen eski poll
  // dönüşü sonuç kartlarını tekrar ezebilir. Bu sayaç her durdurmada o eski
  // dönüşleri geçersiz kılar.
  let scannerProgressGeneration = 0;
  let paperMonitorUiState = null;
  let paperMonitorRefreshTimer = null;
  let paperMonitorCountdownTimer = null;
  let paperMonitorRefreshInFlight = false;
  function renderScannerProgress(progress, message, status = "RUNNING") {
    if (!scannerResults) return;
    const percent = Math.max(0, Math.min(100, Number(progress) || 0));
    scannerResults.innerHTML = `<div class="trading-empty scanner-progress"><strong>${status === "ERROR" ? "TARAMA HATASI" : status === "COMPLETE" ? "TARAMA TAMAMLANDI" : "TARAMA ÇALIŞIYOR"}</strong><br><small>${escapeHtml(String(message || "Hazırlanıyor"))}</small><div style="height:8px;border:1px solid #2f6;background:#071008;margin:12px auto;max-width:480px"><div style="height:100%;width:${percent}%;background:#34ff75;transition:width .3s ease"></div></div><small>${percent}%</small></div>`;
  }
  function translateTradingStatus(value) {
    const labels = {
      "BUY SETUP": "AL ADAYI",
      WATCH: "İZLE",
      NO_TRADE: "İŞLEM YOK",
      PENDING: "BEKLİYOR",
      PENDING_APPROVAL: "ONAY BEKLİYOR",
      PENDING_LIMIT: "LİMİT BEKLİYOR",
      OPEN: "AÇIK",
      CLOSED: "KAPALI",
      STOPPED: "STOPLANDI",
      REJECTED: "REDDEDİLDİ",
      EXPIRED: "SÜRESİ DOLDU",
      ACTIVE: "AKTİF",
      FIBONACCI_A_B_C_DAILY: "FIBONACCI A-B-C (GÜNLÜK)",
      ENTRY_TOO_FAR: "GİRİŞ İÇİN UZAK",
      NO_VALID_STRUCTURE: "GEÇERLİ YAPI YOK",
      WAITING_CONFIRMATION: "TEYİT BEKLİYOR",
      INVALID: "GEÇERSİZ",
      MARKET: "PİYASA",
      LIMIT: "LİMİT",
      MANUAL: "MANUEL",
      "AI PLAN": "YZ PLANI"
    };
    return labels[String(value || "").toUpperCase()] || String(value || "--");
  }
  function stopScannerProgress() {
    scannerProgressGeneration += 1;
    if (scannerProgressTimer) clearInterval(scannerProgressTimer);
    scannerProgressTimer = null;
  }
  function startScannerProgress(jobId, requestId) {
    stopScannerProgress();
    const generation = ++scannerProgressGeneration;
    const poll = /*#__PURE__*/function () {
      var _ref7 = _asyncToGenerator(function* () {
        try {
          const response = yield fetch(`/api/trading/scanner/status?jobId=${encodeURIComponent(jobId)}`, {
            cache: "no-store"
          });
          const job = yield response.json();
          // Tarama sonucu ekrana basıldıktan veya kullanıcı durdurduktan sonra
          // geç gelen poll, eski progress/snapshot görünümünü geri getiremez.
          if (requestId !== scannerRequestId || generation !== scannerProgressGeneration) return;
          renderScannerProgress(job.progress, job.message, job.status);
          if (job.status === "COMPLETE" || job.status === "ERROR") stopScannerProgress();
        } catch (_unused0) {/* Ana scanner isteği sonucu hatayı gösterecek. */}
      });
      return function poll() {
        return _ref7.apply(this, arguments);
      };
    }();
    void poll();
    scannerProgressTimer = setInterval(poll, 700);
  }

  /*
  --------------------------------------------------------
  FORMAT
  --------------------------------------------------------
  */

  function formatPrice(value) {
    if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) {
      return "--";
    }
    return Number(value).toFixed(2);
  }
  function formatPercent(value) {
    if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) {
      return "--";
    }
    return Number(value).toFixed(1) + "%";
  }

  /*
  --------------------------------------------------------
  RENDER
  --------------------------------------------------------
  */

  function renderScannerResults(results) {
    if (!scannerResults) return;
    if (!Array.isArray(results) || !results.length) {
      scannerResults.innerHTML = '<div class="trading-empty">VERİ YETERSİZ veya tarama sonucu yok.</div>';
      return;
    }
    scannerResults.innerHTML = results.map((item, index) => {
      var _item$score;
      const fib = item.fibonacci || {};
      return `<div class="scanner-card scanner-compact" data-symbol="${item.symbol}">
      <div class="scanner-head"><strong>#${index + 1} · ${item.symbol}</strong><strong>₺${formatPrice(item.price)}</strong><span class="scanner-score">TEKNİK ${(_item$score = item.score) !== null && _item$score !== void 0 ? _item$score : "--"}/100</span><span>${item.grade || item.decision}</span></div>
      <div class="scanner-metrics">RSI ${formatPrice(item.rsi)} · EMA20 ₺${formatPrice(item.ema20)} · EMA50 ₺${formatPrice(item.ema50)} · EMA200 ₺${formatPrice(item.ema200)} · MACD ${formatPrice(item.macd)} · ATR ₺${formatPrice(item.atr)}</div>
      <div class="scanner-metrics">Hacim oranı ${formatPrice(item.volumeRatio)} · Fibonacci ${fib.status || "YAPI YOK"} · Günlük teyit ${fib.confirmationPassed ? "GEÇTİ" : "BEKLİYOR"}</div>
      <small>${Array.isArray(item.reasons) && item.reasons.length ? item.reasons.join(" · ") : item.dataStatus || "VERİ YETERSİZ"}</small>
    </div>`;
    }).join("");
  }

  /*
  --------------------------------------------------------
  SCAN
  --------------------------------------------------------
  */

  const aiDecisionFeed = document.getElementById("aiDecisionFeed");
  const TRADING_STATE_STORAGE_KEY = "borsaci_trading_state_v1";
  function saveLocalTradingState(state) {
    try {
      localStorage.setItem(TRADING_STATE_STORAGE_KEY, JSON.stringify({
        decisions: Array.isArray(state === null || state === void 0 ? void 0 : state.decisions) ? state.decisions : [],
        paper: (state === null || state === void 0 ? void 0 : state.paper) || null,
        activity: Array.isArray(state === null || state === void 0 ? void 0 : state.activity) ? state.activity : [],
        history: Array.isArray(state === null || state === void 0 ? void 0 : state.history) ? state.history : [],
        lastScanAt: (state === null || state === void 0 ? void 0 : state.lastScanAt) || null,
        risk: (state === null || state === void 0 ? void 0 : state.risk) || null
      }));
    } catch (error) {
      console.error("Trading state yerel kaydedilemedi:", error);
    }
  }
  function loadLocalTradingState() {
    try {
      const raw = localStorage.getItem(TRADING_STATE_STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const state = JSON.parse(raw);
      if (!state || typeof state !== "object") {
        return null;
      }
      return state;
    } catch (error) {
      console.error("Trading state yerel yüklenemedi:", error);
      return null;
    }
  }
  function formatCurrency(value) {
    if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) {
      return "--";
    }
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number(value));
  }
  let renderedDecisionRecords = [];
  function scoreValue(value, fallback = 0) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  }
  function renderScoreFactors(bucket, type, decision) {
    var _decision$scoreBreakd;
    const items = Array.isArray(bucket === null || bucket === void 0 ? void 0 : bucket.items) ? bucket.items : [];
    if (!items.length) {
      return '<span class="score-factor score-factor-muted">Kalem verisi yok</span>';
    }
    const isInitialTechnicalScreen = (decision === null || decision === void 0 || (_decision$scoreBreakd = decision.scoreBreakdown) === null || _decision$scoreBreakd === void 0 ? void 0 : _decision$scoreBreakd.calculationStage) === "INITIAL_TECHNICAL_SCREEN";
    return items.map(item => {
      var _decision$fibonacci;
      const points = scoreValue(item === null || item === void 0 ? void 0 : item.points);
      const maxPoints = Math.abs(scoreValue(item === null || item === void 0 ? void 0 : item.maxPoints));
      const fibonacciAddedLater = isInitialTechnicalScreen && (decision === null || decision === void 0 || (_decision$fibonacci = decision.fibonacci) === null || _decision$fibonacci === void 0 ? void 0 : _decision$fibonacci.valid) && ["valid_fibonacci", "fibonacci_confirmation", "volume_confirmation", "risk_reward"].includes(item === null || item === void 0 ? void 0 : item.id);
      if (type === "penalty") {
        if (!(item !== null && item !== void 0 && item.applied)) {
          return '';
        }
        return `<span class="score-factor score-factor-penalty">${escapeHtml(`−${Math.abs(points)} ${item.label}`)}</span>`;
      }
      const stateClass = item !== null && item !== void 0 && item.passed ? "score-factor-pass" : fibonacciAddedLater ? "score-factor-info" : "score-factor-miss";
      const prefix = item !== null && item !== void 0 && item.passed ? `+${points}${item !== null && item !== void 0 && item.partial ? `/${maxPoints}` : ""}` : fibonacciAddedLater ? "PLAN" : `+0/${maxPoints}`;
      const message = fibonacciAddedLater ? `${item.label}: Fibonacci planında ayrı doğrulandı` : `${prefix} ${item.label}${item !== null && item !== void 0 && item.detail ? ` — ${item.detail}` : ""}`;
      return `<span class="score-factor ${stateClass}">${escapeHtml(message)}</span>`;
    }).join("");
  }
  function renderDecisionScoreBreakdown(item) {
    var _item$indicators, _breakdown$penalties;
    const content = document.getElementById("decisionScoreContent");
    const symbol = document.getElementById("decisionScoreSymbol");
    if (!content || !symbol) return;
    if (!item) {
      symbol.textContent = "KARAR YOK";
      content.innerHTML = "Bir AI kararına tıklayarak puanın nedenlerini burada gör.";
      return;
    }
    symbol.textContent = item.symbol || "SEMBOL YOK";
    const breakdown = item.scoreBreakdown;
    const validBreakdown = breakdown && typeof breakdown === "object" && ["trend", "momentum", "volumeLiquidity", "entryQuality"].every(key => breakdown[key] && Array.isArray(breakdown[key].items));
    if (!validBreakdown) {
      content.innerHTML = `<div class="decision-score-empty"><strong>${escapeHtml(item.symbol || "BU KARAR")}</strong> için puan kalemleri eski tarama formatında kayıtlı. Scanner'ı yeniden çalıştırdığında Trend, Momentum, Hacim/Likidite, Giriş Kalitesi ve cezalar burada ayrı ayrı görünür.</div>`;
      return;
    }
    const total = scoreValue((_item$indicators = item.indicators) === null || _item$indicators === void 0 ? void 0 : _item$indicators.score, scoreValue(breakdown.total));
    const grade = item.grade || item.action || "KARAR";
    const missingForBuy = Math.max(0, BUY_SETUP_SCORE_THRESHOLD - total);
    const fib = item.fibonacci || {};
    const rows = [["Trend", breakdown.trend], ["Momentum", breakdown.momentum], ["Hacim & likidite", breakdown.volumeLiquidity], ["Giriş kalitesi", breakdown.entryQuality]];
    const rowMarkup = rows.map(([label, bucket]) => {
      const points = scoreValue(bucket === null || bucket === void 0 ? void 0 : bucket.score);
      const maximum = scoreValue(bucket === null || bucket === void 0 ? void 0 : bucket.max);
      return `<tr><th scope="row">${escapeHtml(label)}</th><td><strong>${points}/${maximum}</strong></td><td>${renderScoreFactors(bucket, "positive", item)}</td></tr>`;
    }).join("");
    const penaltyPoints = scoreValue((_breakdown$penalties = breakdown.penalties) === null || _breakdown$penalties === void 0 ? void 0 : _breakdown$penalties.score);
    const penaltyFactors = renderScoreFactors(breakdown.penalties, "penalty", item) || '<span class="score-factor score-factor-pass">Ceza yok</span>';
    const fibStatus = fib.status || "FIBONACCI YOK";
    const fibNote = fib.valid ? `Fibonacci ${fibStatus}: işlem planı kapısı ayrı izlenir; ilk teknik puana geriye dönük eklenmez.` : `Fibonacci ${fibStatus}: teknik puan tablosundan ayrı değerlendirilir.`;
    const threshold = total >= BUY_SETUP_SCORE_THRESHOLD ? `AL eşiği (${BUY_SETUP_SCORE_THRESHOLD}) teknik olarak geçildi.` : `AL eşiğine ${missingForBuy} puan kaldı.`;
    content.innerHTML = `
    <div class="decision-score-summary">
      <strong>TEKNİK ${total}/100 · ${escapeHtml(grade)}</strong>
      <span>${escapeHtml(threshold)}</span>
      <small>${escapeHtml(fibNote)}</small>
    </div>
    <div class="decision-score-table-wrap">
      <table class="decision-score-table">
        <thead><tr><th>BAŞLIK</th><th>PUAN</th><th>GEÇEN / EKSİK KANITLAR</th></tr></thead>
        <tbody>
          ${rowMarkup}
          <tr class="decision-score-penalty-row"><th scope="row">Cezalar</th><td><strong>${penaltyPoints}</strong></td><td>${penaltyFactors}</td></tr>
        </tbody>
        <tfoot><tr><th>Toplam teknik kalite</th><td><strong>${total}/100</strong></td><td>${escapeHtml(grade)} · başarı olasılığı değildir.</td></tr></tfoot>
      </table>
    </div>
  `;
  }
  function renderAiDecisionDetail(item) {
    var _fib$stopLoss2, _fib$tp4, _fib$tp5, _fib$tp6, _item$entry, _item$entry2, _fib$pointA, _fib$pointA2, _fib$pointB, _fib$pointB2, _fib$pointC, _fib$pointC2, _ref8, _fib$riskRewardTp, _item$riskReward, _ref9, _fib$riskRewardTp2, _item$riskReward2, _ref0, _fib$riskRewardTp3, _item$riskReward3, _item$aiReview, _item$aiReview2, _item$aiReview3;
    const element = document.getElementById("aiDecisionDetail");
    if (!element || !item) return;
    renderDecisionScoreBreakdown(item);
    const position = currentPaperState().positions.find(value => value.status === "OPEN" && (value.decisionId === item.id || (value.decisionIds || []).includes(item.id) || value.symbol === item.symbol));
    const fib = item.fibonacci || {};
    const fibAvailable = Boolean(fib.pointA && fib.pointB && fib.pointC);
    const stop = (_fib$stopLoss2 = fib.stopLoss) !== null && _fib$stopLoss2 !== void 0 ? _fib$stopLoss2 : item.stop;
    const tp1 = (_fib$tp4 = fib.tp1) !== null && _fib$tp4 !== void 0 ? _fib$tp4 : item.target1;
    const tp2 = (_fib$tp5 = fib.tp2) !== null && _fib$tp5 !== void 0 ? _fib$tp5 : item.target2;
    const tp3 = (_fib$tp6 = fib.tp3) !== null && _fib$tp6 !== void 0 ? _fib$tp6 : item.target3;
    const chartStatus = fibAvailable ? `<div class="decision-chart-status"><strong>GRAFİK KATMANI</strong><span>A/B/C işaretleri ve sağa uzanan seviyeleri ile tetik, giriş, SL, hedefler ve varsa alçalan tepe trendi KARAR GRAFİĞİ üzerinde çizildi.</span><span class="decision-chart-key trigger">TETİK</span><span class="decision-chart-key entry">GİRİŞ</span><span class="decision-chart-key resistance">DİRENÇ TRENDİ</span><span class="decision-chart-key stop">SL</span><span class="decision-chart-key target">TP1–3</span></div>` : `<div class="decision-chart-status"><strong>GRAFİK KATMANI</strong><span>Geçerli A/B/C noktası olmadığı için grafiğe Fibonacci çizgisi eklenmedi.</span></div>`;
    const pendingOrderButton = item.status === "PENDING_APPROVAL" ? `<button type="button" class="trading-button" data-paper-order-focus="${escapeHtml(item.id)}">BEKLEYEN KÂĞIT EMRİNİ AÇ</button>` : !position && !isManualPaperOrder(null, item) ? `<button type="button" class="trading-button" data-paper-action="queue" data-decision-id="${escapeHtml(item.id)}">BEKLEYEN EMİR OLUŞTUR</button>` : "";
    element.innerHTML = `<strong>${escapeHtml(item.symbol)} · ${escapeHtml(item.grade || translateTradingStatus(item.action) || "KARAR")} · ${escapeHtml(translateTradingStatus(fib.status || "FIBONACCI YOK"))}</strong><div class="decision-detail-grid"><span>Giriş: ${formatCurrency((_item$entry = item.entry) === null || _item$entry === void 0 ? void 0 : _item$entry.low)}–${formatCurrency((_item$entry2 = item.entry) === null || _item$entry2 === void 0 ? void 0 : _item$entry2.high)}</span><span>A: ${formatCurrency((_fib$pointA = fib.pointA) === null || _fib$pointA === void 0 ? void 0 : _fib$pointA.price)} · ${chartDateKey((_fib$pointA2 = fib.pointA) === null || _fib$pointA2 === void 0 ? void 0 : _fib$pointA2.date) || "--"}</span><span>B: ${formatCurrency((_fib$pointB = fib.pointB) === null || _fib$pointB === void 0 ? void 0 : _fib$pointB.price)} · ${chartDateKey((_fib$pointB2 = fib.pointB) === null || _fib$pointB2 === void 0 ? void 0 : _fib$pointB2.date) || "--"}</span><span>C: ${formatCurrency((_fib$pointC = fib.pointC) === null || _fib$pointC === void 0 ? void 0 : _fib$pointC.price)} · ${chartDateKey((_fib$pointC2 = fib.pointC) === null || _fib$pointC2 === void 0 ? void 0 : _fib$pointC2.date) || "--"}</span><span>Tetik: ${formatCurrency(fib.entryTriggerPrice)}</span><span>Stop: ${formatCurrency(stop)}</span><span>TP1: ${formatCurrency(tp1)} · R/R ${(_ref8 = (_fib$riskRewardTp = fib.riskRewardTp1) !== null && _fib$riskRewardTp !== void 0 ? _fib$riskRewardTp : (_item$riskReward = item.riskReward) === null || _item$riskReward === void 0 ? void 0 : _item$riskReward.tp1) !== null && _ref8 !== void 0 ? _ref8 : "--"}</span><span>TP2: ${formatCurrency(tp2)} · R/R ${(_ref9 = (_fib$riskRewardTp2 = fib.riskRewardTp2) !== null && _fib$riskRewardTp2 !== void 0 ? _fib$riskRewardTp2 : (_item$riskReward2 = item.riskReward) === null || _item$riskReward2 === void 0 ? void 0 : _item$riskReward2.tp2) !== null && _ref9 !== void 0 ? _ref9 : "--"}</span><span>TP3: ${formatCurrency(tp3)} · R/R ${(_ref0 = (_fib$riskRewardTp3 = fib.riskRewardTp3) !== null && _fib$riskRewardTp3 !== void 0 ? _fib$riskRewardTp3 : (_item$riskReward3 = item.riskReward) === null || _item$riskReward3 === void 0 ? void 0 : _item$riskReward3.tp3) !== null && _ref0 !== void 0 ? _ref0 : "--"}</span><span>Günlük teyit: ${fib.confirmationPassed ? "GEÇTİ" : "BEKLİYOR"} · ${escapeHtml(fib.confirmationCandleTime || fib.invalidReason || "VERİ YOK")}</span></div>${chartStatus}${(_item$aiReview = item.aiReview) !== null && _item$aiReview !== void 0 && _item$aiReview.newsComment ? `<div class="ai-review-comment"><strong>HABER YORUMU</strong><br>${escapeHtml(item.aiReview.newsComment)}</div>` : ""}${(_item$aiReview2 = item.aiReview) !== null && _item$aiReview2 !== void 0 && _item$aiReview2.expertComment ? `<div class="ai-review-comment"><strong>UZMAN YORUMU · YZ</strong><br>${escapeHtml(item.aiReview.expertComment)}</div>` : ""}${(_item$aiReview3 = item.aiReview) !== null && _item$aiReview3 !== void 0 && _item$aiReview3.summary ? `<div class="ai-review-comment"><strong>ÖZET</strong><br>${escapeHtml(item.aiReview.summary)}</div>` : ""}<small>${escapeHtml(item.reason || "")}</small><br>${position ? `<button type="button" class="trading-button" data-paper-action="close" data-position-id="${escapeHtml(position.id)}">KÂĞIT POZİSYONU KAPAT</button>` : pendingOrderButton}`;
  }
  function renderAiDecisions(decisions) {
    if (!aiDecisionFeed) return;
    renderDecisionScoreBreakdown(null);
    const allRecords = uniqueDecisions(decisions);
    // Manuel emirler AI tarafından değerlendirilmiş bir karar değildir.
    // Onları yalnızca Pending Paper Orders kuyruğunda göster; aksi halde
    // boş Fibonacci/grafik alanlarıyla AI Decisions ekranını karıştırırlar.
    // AI karar ekranı sadece son taramanın teknik ilk üç adayını gösterir.
    // Önceki taramadan açık kalan pozisyonlar Open Positions bölümünde
    // izlenir; burada yeni seçilmiş gibi ikinci kez görünmez.
    const records = allRecords.filter(item => !isManualPaperOrder(null, item) && item.currentScan !== false);
    renderedDecisionRecords = records;
    const pendingState = _objectSpread(_objectSpread({}, loadLocalTradingState() || latestPaperOrderState || {}), {}, {
      decisions: allRecords
    });
    if (!records.length) {
      aiDecisionFeed.innerHTML = '<div class="trading-empty">Detaylı teknik aday bulunamadı.</div>';
      renderPendingPaperOrders(pendingState);
      renderManualPendingOrders(pendingState);
      return;
    }
    aiDecisionFeed.innerHTML = records.map((item, index) => {
      var _item$indicators$scor, _item$indicators2, _item$entry3, _item$entry4, _item$riskReward$tp, _item$riskReward4;
      return `<article class="decision-item decision-card" data-decision-index="${index}"><header><strong>${item.symbol}</strong><span>${item.grade || translateTradingStatus(item.action)}</span><span>${translateTradingStatus(item.status)}</span><span class="ai-score-pill">TEKNİK ${(_item$indicators$scor = (_item$indicators2 = item.indicators) === null || _item$indicators2 === void 0 ? void 0 : _item$indicators2.score) !== null && _item$indicators$scor !== void 0 ? _item$indicators$scor : "--"}/100</span></header><div class="decision-price-grid"><span><small>GİRİŞ</small>${formatCurrency((_item$entry3 = item.entry) === null || _item$entry3 === void 0 ? void 0 : _item$entry3.low)} – ${formatCurrency((_item$entry4 = item.entry) === null || _item$entry4 === void 0 ? void 0 : _item$entry4.high)}</span><span><small>STOP</small>${formatCurrency(item.stop)}</span><span><small>TP1 / TP2 / TP3</small>${formatCurrency(item.target1)} / ${formatCurrency(item.target2)} / ${formatCurrency(item.target3)}</span></div><div class="decision-summary">${item.planMethod || "DESTEK / DİRENÇ + ATR"} · R/R TP2: ${(_item$riskReward$tp = (_item$riskReward4 = item.riskReward) === null || _item$riskReward4 === void 0 ? void 0 : _item$riskReward4.tp2) !== null && _item$riskReward$tp !== void 0 ? _item$riskReward$tp : "--"} · Garanti değildir.</div></article>`;
    }).join("");
    renderPendingPaperOrders(pendingState);
    renderManualPendingOrders(pendingState);
  }
  function formatMonitorCountdown(target) {
    const milliseconds = new Date(target || 0).getTime() - Date.now();
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "ŞİMDİ";
    const totalSeconds = Math.ceil(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  function renderPaperMonitorStatus(monitor = paperMonitorUiState, prices = {}) {
    const status = document.getElementById("paperMonitorStatus");
    if (status) {
      if (!monitor) {
        status.textContent = "BAĞLANIYOR";
      } else if (monitor.running) {
        status.textContent = "FİYATLAR KONTROL EDİLİYOR";
      } else if (monitor.lastError) {
        status.textContent = "GEÇİCİ VERİ HATASI";
      } else if (monitor.nextCheckAt) {
        status.textContent = `CANLI · ${formatMonitorCountdown(monitor.nextCheckAt)}`;
      } else {
        status.textContent = "CANLI · İLK KONTROL HAZIR";
      }
    }
    document.querySelectorAll("[data-order-market-price]").forEach(element => {
      const symbol = String(element.dataset.symbol || "").toUpperCase();
      const quote = prices[symbol];
      if (!quote || !Number.isFinite(Number(quote.price))) return;
      const time = quote.asOf ? new Date(quote.asOf).toLocaleTimeString("tr-TR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      }) : "--";
      element.textContent = `SON DOĞRULANMIŞ FİYAT: ${formatCurrency(quote.price)} · ${time}`;
      element.title = "Sunucunun aldığı son tamamlanmış fiyat verisi";
    });
  }
  function refreshPaperMonitorStatus() {
    return _refreshPaperMonitorStatus.apply(this, arguments);
  }
  function _refreshPaperMonitorStatus() {
    _refreshPaperMonitorStatus = _asyncToGenerator(function* () {
      if (paperMonitorRefreshInFlight) return;
      paperMonitorRefreshInFlight = true;
      try {
        const symbols = [...new Set([...document.querySelectorAll("[data-order-market-price]")].map(element => String(element.dataset.symbol || "").toUpperCase()).filter(Boolean))];
        const response = yield fetch(`/api/trading/paper/monitor-status?symbols=${encodeURIComponent(symbols.join(","))}`, {
          cache: "no-store"
        });
        if (!response.ok) return;
        const payload = yield response.json();
        paperMonitorUiState = (payload === null || payload === void 0 ? void 0 : payload.monitor) || paperMonitorUiState;
        renderPaperMonitorStatus(paperMonitorUiState, (payload === null || payload === void 0 ? void 0 : payload.prices) || {});
        ((payload === null || payload === void 0 ? void 0 : payload.unavailable) || []).forEach(symbol => {
          document.querySelectorAll(`[data-order-market-price][data-symbol="${String(symbol).replace(/"/g, "\\\"")}"]`).forEach(element => {
            element.textContent = "SON DOĞRULANMIŞ FİYAT: GEÇİCİ OLARAK ALINAMADI";
          });
        });
      } catch (_unused11) {
        // Ana emir kartını bozma; bir sonraki kısa yenilemede tekrar denenir.
      } finally {
        paperMonitorRefreshInFlight = false;
      }
    });
    return _refreshPaperMonitorStatus.apply(this, arguments);
  }
  function startPaperMonitorUi() {
    if (paperMonitorRefreshTimer) return;
    void refreshPaperMonitorStatus();
    paperMonitorRefreshTimer = window.setInterval(() => {
      void refreshPaperMonitorStatus();
    }, 15000);
    paperMonitorCountdownTimer = window.setInterval(() => {
      renderPaperMonitorStatus();
    }, 1000);
  }
  function currentPaperState() {
    const local = loadLocalTradingState() || {};
    const paper = local.paper || {};
    return {
      initialCapital: Number(paper.initialCapital) || 100000,
      cash: Number(paper.cash) || 100000,
      equity: Number(paper.equity) || 100000,
      pnl: Number(paper.pnl) || 0,
      pnlPercent: Number(paper.pnlPercent) || 0,
      positions: Array.isArray(paper.positions) ? paper.positions : []
    };
  }
  function paperOrderNumber(value, fallback = null) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
  }
  function firstPaperOrderNumber(...values) {
    for (const value of values) {
      const number = paperOrderNumber(value);
      if (number !== null) return number;
    }
    return null;
  }
  function paperOrderInputValue(value, decimals = 2) {
    const number = paperOrderNumber(value);
    return number === null ? "" : number.toFixed(decimals);
  }
  function normalizePaperOrderType(value) {
    return String(value || "LIMIT").toUpperCase() === "LIMIT" ? "LIMIT" : "MARKET";
  }
  function isManualPaperOrder(order, decision) {
    return [order === null || order === void 0 ? void 0 : order.source, order === null || order === void 0 ? void 0 : order.origin, order === null || order === void 0 ? void 0 : order.type, decision === null || decision === void 0 ? void 0 : decision.source, decision === null || decision === void 0 ? void 0 : decision.origin, decision === null || decision === void 0 ? void 0 : decision.action].some(value => String(value || "").toUpperCase().includes("MANUAL"));
  }
  function buildPendingPaperOrder(rawOrder, linkedDecision) {
    var _ref1, _ref10, _order$orderType, _decision$lifecycle;
    const order = rawOrder || {};
    const decision = linkedDecision || order.decision || {};
    const decisionId = String(order.decisionId || decision.id || "").trim();
    const orderId = String(order.id || order.orderId || decision.pendingOrderId || decisionId || "").trim();
    const entry = decision.entry || {};
    const riskPlan = decision.riskPlan || {};
    const pendingOrder = order.pendingOrder || decision.pendingOrder || {};
    const orderType = normalizePaperOrderType((_ref1 = (_ref10 = (_order$orderType = order.orderType) !== null && _order$orderType !== void 0 ? _order$orderType : order.type) !== null && _ref10 !== void 0 ? _ref10 : pendingOrder.orderType) !== null && _ref1 !== void 0 ? _ref1 : decision.orderType);
    return {
      orderId,
      decisionId,
      status: String(order.status || pendingOrder.status || decision.status || "PENDING_APPROVAL").toUpperCase(),
      symbol: String(order.symbol || decision.symbol || "").trim().toUpperCase(),
      quantity: firstPaperOrderNumber(order.quantity, order.lot, pendingOrder.quantity, pendingOrder.lot, riskPlan.quantity, decision.quantity),
      entryPrice: orderType === "MARKET" ? null : firstPaperOrderNumber(order.entryPrice, order.limitPrice, order.entry, pendingOrder.entryPrice, pendingOrder.limitPrice, pendingOrder.entry, entry.reference, entry.low),
      orderType,
      stop: firstPaperOrderNumber(order.stop, pendingOrder.stop, decision.stop),
      target1: firstPaperOrderNumber(order.target1, order.tp1, pendingOrder.target1, pendingOrder.tp1, decision.target1),
      target2: firstPaperOrderNumber(order.target2, order.tp2, pendingOrder.target2, pendingOrder.tp2, decision.target2),
      target3: firstPaperOrderNumber(order.target3, order.tp3, pendingOrder.target3, pendingOrder.tp3, decision.target3),
      createdAt: order.createdAt || pendingOrder.createdAt || decision.timestamp || ((_decision$lifecycle = decision.lifecycle) === null || _decision$lifecycle === void 0 ? void 0 : _decision$lifecycle.createdAt) || "",
      source: isManualPaperOrder(order, decision) ? "MANUAL" : "AI PLAN"
    };
  }
  function pendingPaperOrdersFromState(state, sourceFilter = "ALL") {
    var _source$paper;
    const source = state && typeof state === "object" ? state : {};
    const decisions = Array.isArray(source.decisions) ? source.decisions : [];
    const byDecisionId = new Map(decisions.filter(item => item === null || item === void 0 ? void 0 : item.id).map(item => [String(item.id), item]));
    const orders = [];
    const seen = new Set();
    const append = (rawOrder, linkedDecision) => {
      const order = buildPendingPaperOrder(rawOrder, linkedDecision);
      if (!order.symbol) return;
      const key = order.decisionId ? `decision:${order.decisionId}` : `order:${order.orderId}:${order.symbol}`;
      if (seen.has(key)) return;
      seen.add(key);
      orders.push(order);
    };
    const explicitOrders = [...(Array.isArray((_source$paper = source.paper) === null || _source$paper === void 0 ? void 0 : _source$paper.pendingOrders) ? source.paper.pendingOrders : []), ...(Array.isArray(source.pendingOrders) ? source.pendingOrders : [])];
    explicitOrders.filter(order => {
      const status = String((order === null || order === void 0 ? void 0 : order.status) || "PENDING_APPROVAL").toUpperCase();
      return status === "PENDING" || status === "PENDING_APPROVAL" || status === "PENDING_LIMIT";
    }).forEach(order => {
      append(order, byDecisionId.get(String((order === null || order === void 0 ? void 0 : order.decisionId) || "")));
    });
    decisions.filter(item => ["PENDING_APPROVAL", "PENDING_LIMIT"].includes(item === null || item === void 0 ? void 0 : item.status)).forEach(item => append(item, item));
    const filtered = orders.filter(order => sourceFilter === "ALL" || order.source === sourceFilter);
    // Manuel tarafta aynı sembol için tek taslak tutulur. Eski istemci
    // sürümlerinin aynı kaydı birden çok kez yansıtması, ekranda boş kartlar
    // oluşturmamalı; en güncel taslak kazanır.
    if (sourceFilter !== "MANUAL") return filtered;
    const latestBySymbol = new Map();
    for (const order of filtered) {
      const previous = latestBySymbol.get(order.symbol);
      const orderTime = Date.parse(order.updatedAt || order.createdAt || "") || 0;
      const previousTime = Date.parse((previous === null || previous === void 0 ? void 0 : previous.updatedAt) || (previous === null || previous === void 0 ? void 0 : previous.createdAt) || "") || 0;
      if (!previous || orderTime >= previousTime) latestBySymbol.set(order.symbol, order);
    }
    return [...latestBySymbol.values()];
  }
  function renderPendingPaperOrders(state, options = {}) {
    var _source$paper2;
    const container = document.getElementById(options.containerId || "pendingPaperOrders");
    const status = document.getElementById(options.statusId || "pendingPaperOrderStatus");
    const source = state && typeof state === "object" ? state : latestPaperOrderState || loadLocalTradingState() || {};
    if (state && typeof state === "object") {
      latestPaperOrderState = state;
    }
    const orders = pendingPaperOrdersFromState(source, options.sourceFilter || "AI PLAN");
    if (status) {
      status.textContent = `${orders.length} ${orders.length === 1 ? "EMİR" : "EMİR"}`;
    }
    if (!container) return;
    if (!orders.length) {
      container.innerHTML = `<div class="trading-empty">${escapeHtml(options.emptyMessage || "Bekleyen AI emri yok.")}</div>`;
      return;
    }
    container.innerHTML = orders.map(order => {
      const manual = order.source === "MANUAL";
      const created = order.createdAt ? new Date(order.createdAt).toLocaleString("tr-TR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }) : "ONAY BEKLİYOR";
      const orderId = escapeHtml(order.orderId);
      const decisionId = escapeHtml(order.decisionId);
      const gross = Number(order.quantity) * Number(order.entryPrice);
      const commission = Number.isFinite(gross) ? gross * 0.001 : null;
      const lower = Number.isFinite(Number(order.entryPrice)) ? Number(order.entryPrice) * 0.9 : null;
      const upper = Number.isFinite(Number(order.entryPrice)) ? Number(order.entryPrice) * 1.1 : null;
      return `
      <article
        class="pending-paper-order-card${manual ? " is-manual" : ""}"
        data-pending-paper-order-card
        data-order-id="${orderId}"
        data-decision-id="${decisionId}"
        data-symbol="${escapeHtml(order.symbol)}"
      >
        <div class="pending-paper-order-head">
          <strong>${escapeHtml(order.symbol)} · ${manual ? "MANUEL" : "YZ PLANI"}</strong>
          <span class="pending-paper-order-badge">${escapeHtml(translateTradingStatus(order.status || "PENDING APPROVAL"))}</span>
          <small>${escapeHtml(created)}</small>
        </div>
        ${orderFillProgressMarkup(order.quantity, order.filledQuantity || 0, {
        digits: 0
      })}
        <div class="paper-order-live-price" data-order-market-price data-symbol="${escapeHtml(order.symbol)}">
          SON DOĞRULANMIŞ FİYAT: YÜKLENİYOR…
        </div>
        <form class="paper-order-form" data-pending-paper-order-form novalidate>
          <label>LOT
            <input name="quantity" type="number" min="1" step="1" inputmode="numeric" value="${paperOrderInputValue(order.quantity, 0)}" required>
          </label>
          <label data-order-price-label>GİRİŞ FİYATI (₺)
            <input data-order-price-field name="entryPrice" type="number" min="0.01" step="0.01" inputmode="decimal" value="${paperOrderInputValue(order.entryPrice)}"${order.orderType === "MARKET" ? " disabled" : " required"}>
          </label>
          <label>EMİR TÜRÜ
            <select name="orderType">
              <option value="MARKET"${order.orderType === "MARKET" ? " selected" : ""}>PİYASA</option>
              <option value="LIMIT"${order.orderType === "LIMIT" ? " selected" : ""}>LİMİT</option>
            </select>
          </label>
          <label>STOP (İSTEĞE BAĞLI)
            <input name="stop" type="number" min="0.01" step="0.01" inputmode="decimal" value="${paperOrderInputValue(order.stop)}">
          </label>
          <label>TP1 (İSTEĞE BAĞLI)
            <input name="target1" type="number" min="0.01" step="0.01" inputmode="decimal" value="${paperOrderInputValue(order.target1)}">
          </label>
          <label>TP2 (İSTEĞE BAĞLI)
            <input name="target2" type="number" min="0.01" step="0.01" inputmode="decimal" value="${paperOrderInputValue(order.target2)}">
          </label>
          <label>TP3 (İSTEĞE BAĞLI)
            <input name="target3" type="number" min="0.01" step="0.01" inputmode="decimal" value="${paperOrderInputValue(order.target3)}">
          </label>
          <div class="paper-order-form-actions">
            <button type="submit" class="trading-button">AYARLARI KAYDET</button>
            <button type="button" class="trading-button" data-paper-order-action="approve">${order.status === "PENDING_LIMIT" ? "LİMİT EMRİNİ KONTROL ET" : "KÂĞIT EMRİNİ ONAYLA"}</button>
            <button type="button" class="trading-button danger" data-paper-order-action="reject">REDDET</button>
            <small>YALNIZCA KÂĞIT · Fiyat, lot ve emir türü onaydan önce düzenlenebilir.</small>
            <small>KOMİSYON ‰1: ${formatCurrency(commission)} · TAVAN/TABAN: ${formatCurrency(lower)} / ${formatCurrency(upper)}</small>
          </div>
        </form>
      </article>
    `;
    }).join("");
    container.querySelectorAll("[data-pending-paper-order-form]").forEach(syncOrderPriceField);
    renderPaperMonitorStatus(((_source$paper2 = source.paper) === null || _source$paper2 === void 0 ? void 0 : _source$paper2.monitor) || paperMonitorUiState);
    void refreshPaperMonitorStatus();
  }
  function readPaperOrderForm(form, options = {}) {
    var _field2, _field3;
    const manual = Boolean(options.manual);
    const field = name => form.elements.namedItem(name);
    const readNumber = (name, label, required) => {
      var _field;
      const raw = String(((_field = field(name)) === null || _field === void 0 ? void 0 : _field.value) || "").trim().replace(",", ".");
      if (!raw) {
        if (required) throw new Error(`${label} gerekli.`);
        return null;
      }
      const value = Number(raw);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${label} geçerli ve sıfırdan büyük olmalı.`);
      }
      return value;
    };
    const card = form.closest("[data-pending-paper-order-card]");
    const symbol = manual ? String(((_field2 = field("symbol")) === null || _field2 === void 0 ? void 0 : _field2.value) || "").trim().toUpperCase() : String((card === null || card === void 0 ? void 0 : card.dataset.symbol) || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{1,12}$/.test(symbol)) {
      throw new Error("Geçerli bir BIST sembolü girin.");
    }
    const quantity = readNumber("quantity", "Lot", true);
    if (!Number.isInteger(quantity)) {
      throw new Error("Lot tam sayı olmalı.");
    }
    const orderType = normalizePaperOrderType((_field3 = field("orderType")) === null || _field3 === void 0 ? void 0 : _field3.value);
    const payload = {
      symbol,
      quantity,
      entryPrice: orderType === "MARKET" ? null : readNumber("entryPrice", "Giriş fiyatı", true),
      orderType,
      stop: readNumber("stop", "Stop", false),
      target1: readNumber("target1", "TP1", false),
      target2: readNumber("target2", "TP2", false),
      target3: readNumber("target3", "TP3", false)
    };
    if (!manual) {
      payload.orderId = String((card === null || card === void 0 ? void 0 : card.dataset.orderId) || "").trim();
      payload.decisionId = String((card === null || card === void 0 ? void 0 : card.dataset.decisionId) || "").trim();
      if (!payload.orderId && !payload.decisionId) {
        throw new Error("Bekleyen emir kimliği bulunamadı.");
      }
    } else {
      payload.source = "MANUAL";
    }
    return payload;
  }
  function renderManualPendingOrders(state) {
    renderPendingPaperOrders(state, {
      containerId: "manualPendingOrders",
      statusId: "manualOrderStatus",
      sourceFilter: "MANUAL",
      emptyMessage: "Onay bekleyen manuel emir yok. Aşağıdaki formdan emir oluşturabilirsin."
    });
  }
  function syncOrderPriceField(form) {
    var _form$elements$namedI;
    const orderType = normalizePaperOrderType((_form$elements$namedI = form.elements.namedItem("orderType")) === null || _form$elements$namedI === void 0 ? void 0 : _form$elements$namedI.value);
    const price = form.elements.namedItem("entryPrice");
    const label = form.querySelector("[data-order-price-label]") || (price === null || price === void 0 ? void 0 : price.closest("label"));
    if (!price) return;
    const market = orderType === "MARKET";
    price.disabled = market;
    price.required = !market;
    if (market) {
      price.value = "";
      price.placeholder = "PİYASA GERÇEKLEŞME FİYATI";
      if (label) label.firstChild.textContent = "PİYASA FİYATI (SUNUCU) ";
    } else {
      price.placeholder = "0.00";
      if (label) label.firstChild.textContent = "GİRİŞ FİYATI (₺) ";
    }
  }
  function readPaperOrderResponse(_x7, _x8) {
    return _readPaperOrderResponse.apply(this, arguments);
  }
  function _readPaperOrderResponse() {
    _readPaperOrderResponse = _asyncToGenerator(function* (response, fallbackMessage) {
      const body = yield response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((body === null || body === void 0 ? void 0 : body.error) || fallbackMessage);
      }
      const state = body !== null && body !== void 0 && body.state && typeof body.state === "object" ? body.state : body;
      if (!state || typeof state !== "object" || !Array.isArray(state.decisions)) {
        throw new Error("Sunucudan güncel paper işlem durumu alınamadı.");
      }
      return state;
    });
    return _readPaperOrderResponse.apply(this, arguments);
  }
  function renderPaperOrderState(state, selectedDecisionId = "") {
    var _state$paper, _state$paper2;
    latestPaperOrderState = state;
    saveLocalTradingState(state);
    renderAiDecisions(state.decisions || []);
    renderPaperPortfolio(state.paper);
    renderOpenPositions(((_state$paper = state.paper) === null || _state$paper === void 0 ? void 0 : _state$paper.positions) || []);
    renderPerformance(state);
    renderPendingPaperOrders(state);
    renderManualPendingOrders(state);
    renderPaperMonitorStatus(((_state$paper2 = state.paper) === null || _state$paper2 === void 0 ? void 0 : _state$paper2.monitor) || paperMonitorUiState);
    if (state.risk) {
      renderRiskSettings(state.risk);
    }
    const selected = (state.decisions || []).find(item => item.id === selectedDecisionId);
    if (selected) {
      renderAiDecisionDetail(selected);
    }
  }
  function setPaperOrderFormBusy(form, busy) {
    form.querySelectorAll("input, select, button").forEach(element => {
      element.disabled = busy;
    });
  }
  function savePendingPaperOrder(_x9) {
    return _savePendingPaperOrder.apply(this, arguments);
  }
  function _savePendingPaperOrder() {
    _savePendingPaperOrder = _asyncToGenerator(function* (form) {
      const payload = readPaperOrderForm(form);
      const response = yield fetch("/api/trading/paper/order/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const state = yield readPaperOrderResponse(response, "Paper emir ayarları kaydedilemedi.");
      renderPaperOrderState(state, payload.decisionId);
      return {
        state,
        payload
      };
    });
    return _savePendingPaperOrder.apply(this, arguments);
  }
  function approvePendingPaperOrder(_x0) {
    return _approvePendingPaperOrder.apply(this, arguments);
  }
  function _approvePendingPaperOrder() {
    _approvePendingPaperOrder = _asyncToGenerator(function* (form) {
      var _saved$state;
      const payload = readPaperOrderForm(form);
      const saved = yield savePendingPaperOrder(form);
      const updatedDecision = (((_saved$state = saved.state) === null || _saved$state === void 0 ? void 0 : _saved$state.decisions) || []).find(item => item.symbol === payload.symbol && ["PENDING_APPROVAL", "PENDING_LIMIT"].includes(item.status));
      const decisionId = (updatedDecision === null || updatedDecision === void 0 ? void 0 : updatedDecision.id) || payload.decisionId;
      if (!decisionId && !payload.symbol) {
        throw new Error("Onay için karar kimliği bulunamadı.");
      }
      const response = yield fetch("/api/trading/paper/approve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          decisionId,
          orderId: payload.orderId,
          symbol: payload.symbol
        })
      });
      const nextState = yield readPaperOrderResponse(response, "Paper emir onaylanamadı.");
      renderPaperOrderState(nextState, decisionId);
    });
    return _approvePendingPaperOrder.apply(this, arguments);
  }
  function rejectPendingPaperOrder(_x1) {
    return _rejectPendingPaperOrder.apply(this, arguments);
  }
  function _rejectPendingPaperOrder() {
    _rejectPendingPaperOrder = _asyncToGenerator(function* (form) {
      const card = form.closest("[data-pending-paper-order-card]");
      const decisionId = String((card === null || card === void 0 ? void 0 : card.dataset.decisionId) || "").trim();
      const orderId = String((card === null || card === void 0 ? void 0 : card.dataset.orderId) || "").trim();
      if (!decisionId && !orderId) {
        throw new Error("Reddedilecek emir kimliği bulunamadı.");
      }
      const response = yield fetch("/api/trading/paper/reject", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          decisionId,
          orderId,
          symbol: String((card === null || card === void 0 ? void 0 : card.dataset.symbol) || "").trim().toUpperCase()
        })
      });
      const state = yield readPaperOrderResponse(response, "Paper emir reddedilemedi.");
      renderPaperOrderState(state, decisionId);
    });
    return _rejectPendingPaperOrder.apply(this, arguments);
  }
  function createManualPaperOrder(_x10) {
    return _createManualPaperOrder.apply(this, arguments);
  }
  function _createManualPaperOrder() {
    _createManualPaperOrder = _asyncToGenerator(function* (form) {
      const payload = readPaperOrderForm(form, {
        manual: true
      });
      const response = yield fetch("/api/trading/paper/order/manual", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const state = yield readPaperOrderResponse(response, "Manuel paper emir oluşturulamadı.");
      renderPaperOrderState(state);
      form.reset();
    });
    return _createManualPaperOrder.apply(this, arguments);
  }
  function focusPendingPaperOrder(decisionId) {
    var _card$querySelector;
    const container = document.getElementById("pendingPaperOrders");
    const panel = document.querySelector(".pending-paper-orders-panel");
    const card = container === null || container === void 0 ? void 0 : container.querySelector(`[data-decision-id="${String(decisionId || "").replace(/"/g, "\\\"")}"]`);
    panel === null || panel === void 0 || panel.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
    if (!card) return;
    card.classList.add("is-focused");
    (_card$querySelector = card.querySelector("input")) === null || _card$querySelector === void 0 || _card$querySelector.focus({
      preventScroll: true
    });
    window.setTimeout(() => card.classList.remove("is-focused"), 1600);
  }
  function bindPaperOrderControls() {
    const pendingContainer = document.getElementById("pendingPaperOrders");
    const manualPendingContainer = document.getElementById("manualPendingOrders");
    const manualForm = document.getElementById("manualPaperOrderForm");
    const manualMount = document.getElementById("manualOrderMount");
    const manualWrap = document.querySelector(".manual-paper-order-wrap");

    // Manuel emir oluşturma alanı, bekleyen onay kuyruğundan ayrıdır ve
    // açık pozisyonların hemen altında kendi panelinde gösterilir.
    if (manualMount && manualWrap && manualWrap.parentElement !== manualMount) {
      manualMount.appendChild(manualWrap);
    }
    [pendingContainer, manualPendingContainer].filter(Boolean).forEach(orderContainer => {
      if (orderContainer.dataset.paperOrdersBound === "true") return;
      orderContainer.dataset.paperOrdersBound = "true";
      orderContainer.addEventListener("submit", /*#__PURE__*/function () {
        var _ref11 = _asyncToGenerator(function* (event) {
          const form = event.target.closest("[data-pending-paper-order-form]");
          if (!form) return;
          event.preventDefault();
          setPaperOrderFormBusy(form, true);
          try {
            yield savePendingPaperOrder(form);
          } catch (error) {
            alert(`Paper emir ayarları kaydedilemedi: ${error.message}`);
          } finally {
            setPaperOrderFormBusy(form, false);
          }
        });
        return function (_x11) {
          return _ref11.apply(this, arguments);
        };
      }());
      orderContainer.addEventListener("click", /*#__PURE__*/function () {
        var _ref12 = _asyncToGenerator(function* (event) {
          const button = event.target.closest("[data-paper-order-action]");
          if (!button) return;
          const form = button.closest("[data-pending-paper-order-form]");
          if (!form) return;
          const action = button.dataset.paperOrderAction;
          setPaperOrderFormBusy(form, true);
          try {
            if (action === "approve") {
              yield approvePendingPaperOrder(form);
            } else if (action === "reject") {
              yield rejectPendingPaperOrder(form);
            }
          } catch (error) {
            const message = action === "approve" ? "Paper emir onaylanamadı" : "Paper emir reddedilemedi";
            alert(`${message}: ${error.message}`);
          } finally {
            setPaperOrderFormBusy(form, false);
          }
        });
        return function (_x12) {
          return _ref12.apply(this, arguments);
        };
      }());
      orderContainer.addEventListener("change", event => {
        if (event.target.matches('select[name="orderType"]')) {
          syncOrderPriceField(event.target.closest("form"));
        }
      });
    });
    if (manualForm && manualForm.dataset.paperOrdersBound !== "true") {
      manualForm.dataset.paperOrdersBound = "true";
      manualForm.addEventListener("submit", /*#__PURE__*/function () {
        var _ref13 = _asyncToGenerator(function* (event) {
          event.preventDefault();
          setPaperOrderFormBusy(manualForm, true);
          try {
            yield createManualPaperOrder(manualForm);
          } catch (error) {
            alert(`Manuel paper emir oluşturulamadı: ${error.message}`);
          } finally {
            setPaperOrderFormBusy(manualForm, false);
          }
        });
        return function (_x13) {
          return _ref13.apply(this, arguments);
        };
      }());
      manualForm.addEventListener("change", event => {
        if (event.target.matches('select[name="orderType"]')) {
          syncOrderPriceField(manualForm);
        }
      });
      syncOrderPriceField(manualForm);
    }
    if (document.body.dataset.paperOrderFocusBound !== "true") {
      document.body.dataset.paperOrderFocusBound = "true";
      document.addEventListener("click", event => {
        const button = event.target.closest("[data-paper-order-focus]");
        if (!button) return;
        focusPendingPaperOrder(button.dataset.paperOrderFocus);
      });
    }
  }
  function savePaperState(nextPaper, message) {
    const state = loadLocalTradingState() || {};
    const activity = [{
      timestamp: new Date().toISOString(),
      type: "PAPER",
      message
    }, ...(Array.isArray(state.activity) ? state.activity : [])].slice(0, 100);
    const nextState = _objectSpread(_objectSpread({}, state), {}, {
      paper: nextPaper,
      activity
    });
    saveLocalTradingState(nextState);
    renderPaperPortfolio(nextPaper);
    renderOpenPositions(nextPaper.positions);
    renderPerformance(nextState);
    return nextState;
  }
  function approvePaperPosition(_x14) {
    return _approvePaperPosition.apply(this, arguments);
  }
  function _approvePaperPosition() {
    _approvePaperPosition = _asyncToGenerator(function* (decision) {
      if (!(decision !== null && decision !== void 0 && decision.id)) return;
      try {
        var _state$paper3;
        const response = yield fetch("/api/trading/paper/approve", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            decisionId: decision.id
          })
        });
        const state = yield response.json();
        if (!response.ok) throw new Error(state.error || "Paper işlem onaylanamadı.");
        saveLocalTradingState(state);
        renderAiDecisions(state.decisions || []);
        renderPaperPortfolio(state.paper);
        renderOpenPositions(((_state$paper3 = state.paper) === null || _state$paper3 === void 0 ? void 0 : _state$paper3.positions) || []);
        renderPerformance(state);
        renderAiDecisionDetail((state.decisions || []).find(item => item.id === decision.id) || decision);
      } catch (error) {
        alert(`Paper işlem onaylanamadı: ${error.message}`);
      }
    });
    return _approvePaperPosition.apply(this, arguments);
  }
  function rejectPaperPosition(_x15) {
    return _rejectPaperPosition.apply(this, arguments);
  }
  function _rejectPaperPosition() {
    _rejectPaperPosition = _asyncToGenerator(function* (decision) {
      if (!(decision !== null && decision !== void 0 && decision.id)) return;
      try {
        var _state$paper4;
        const response = yield fetch("/api/trading/paper/reject", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            decisionId: decision.id
          })
        });
        const state = yield response.json();
        if (!response.ok) throw new Error(state.error || "Paper işlem reddedilemedi.");
        saveLocalTradingState(state);
        renderAiDecisions(state.decisions || []);
        renderPaperPortfolio(state.paper);
        renderOpenPositions(((_state$paper4 = state.paper) === null || _state$paper4 === void 0 ? void 0 : _state$paper4.positions) || []);
        renderPerformance(state);
        renderAiDecisionDetail((state.decisions || []).find(item => item.id === decision.id) || decision);
      } catch (error) {
        alert(`Paper işlem reddedilemedi: ${error.message}`);
      }
    });
    return _rejectPaperPosition.apply(this, arguments);
  }
  function takePaperProfit1(decisionId) {
    const paper = currentPaperState();
    const position = paper.positions.find(item => item.decisionId === decisionId && item.status === "OPEN");
    if (!position || position.tp1Hit) return;
    const current = Number(position.current) || Number(position.entry);
    const closeQuantity = Math.floor(Number(position.quantity) / 2);
    const realizedPnl = closeQuantity > 0 ? (current - Number(position.entry)) * closeQuantity : 0;
    const remainingQuantity = Number(position.quantity) - closeQuantity;
    const nextPaper = _objectSpread(_objectSpread({}, paper), {}, {
      cash: paper.cash + current * closeQuantity,
      pnl: paper.pnl + realizedPnl,
      positions: paper.positions.map(item => item.id === position.id ? _objectSpread(_objectSpread({}, item), {}, {
        quantity: remainingQuantity,
        current,
        stop: Number(position.entry),
        tp1Hit: true,
        realizedPnl: Number(position.realizedPnl || 0) + realizedPnl,
        pnl: (current - Number(position.entry)) * remainingQuantity
      }) : item)
    });
    nextPaper.equity = nextPaper.cash + nextPaper.positions.filter(item => item.status === "OPEN").reduce((sum, item) => sum + Number(item.current) * Number(item.quantity), 0);
    nextPaper.pnlPercent = nextPaper.pnl / nextPaper.initialCapital * 100;
    savePaperState(nextPaper, `${position.symbol} TP1: ${closeQuantity} lot kapatıldı, SL maliyete çekildi.`);
  }
  function closePaperPosition(_x16) {
    return _closePaperPosition.apply(this, arguments);
  }
  function _closePaperPosition() {
    _closePaperPosition = _asyncToGenerator(function* (payload) {
      const positionId = typeof payload === "string" ? payload : payload === null || payload === void 0 ? void 0 : payload.positionId;
      if (!positionId) return;
      try {
        var _state$paper5;
        const response = yield fetch("/api/trading/paper/close", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(typeof payload === "string" ? {
            positionId
          } : payload)
        });
        const state = yield response.json();
        if (!response.ok) throw new Error(state.error || "Paper pozisyon kapatılamadı.");
        saveLocalTradingState(state);
        renderAiDecisions(state.decisions || []);
        renderPaperPortfolio(state.paper);
        renderOpenPositions(((_state$paper5 = state.paper) === null || _state$paper5 === void 0 ? void 0 : _state$paper5.positions) || []);
        renderPerformance(state.history || []);
      } catch (error) {
        alert(`Paper pozisyon kapatılamadı: ${error.message}`);
        throw error;
      }
    });
    return _closePaperPosition.apply(this, arguments);
  }
  function refreshTradingState() {
    return _refreshTradingState.apply(this, arguments);
  }
  function _refreshTradingState() {
    _refreshTradingState = _asyncToGenerator(function* () {
      const response = yield fetch("/api/trading/state");
      const state = yield readPaperOrderResponse(response, "Güncel işlem durumu alınamadı.");
      renderPaperOrderState(state);
      return state;
    });
    return _refreshTradingState.apply(this, arguments);
  }
  function openCloseOrderDialog(_x17) {
    return _openCloseOrderDialog.apply(this, arguments);
  }
  function _openCloseOrderDialog() {
    _openCloseOrderDialog = _asyncToGenerator(function* (positionId) {
      var _currentPaperState$po, _state$paper6, _document$getElementB18;
      const hintedSymbol = (_currentPaperState$po = currentPaperState().positions.find(item => item.id === positionId)) === null || _currentPaperState$po === void 0 ? void 0 : _currentPaperState$po.symbol;
      let state;
      try {
        state = yield refreshTradingState();
      } catch (error) {
        alert(`Güncel açık pozisyon alınamadı: ${error.message}`);
        return;
      }
      const position = (((_state$paper6 = state.paper) === null || _state$paper6 === void 0 ? void 0 : _state$paper6.positions) || []).find(item => item.status === "OPEN" && (item.id === positionId || item.symbol === hintedSymbol));
      if (!position) return alert("Bu pozisyon artık açık değil. Ekran güncel sunucu durumuyla yenilendi.");
      (_document$getElementB18 = document.getElementById("paperCloseDialog")) === null || _document$getElementB18 === void 0 || _document$getElementB18.remove();
      const dialog = document.createElement("div");
      dialog.id = "paperCloseDialog";
      dialog.className = "paper-order-dialog-backdrop";
      dialog.innerHTML = `<section class="paper-order-dialog" role="dialog" aria-modal="true" aria-label="Pozisyon kapatma emri">
    <header><strong>${escapeHtml(position.symbol)} · SATIŞ EMRİ</strong><button type="button" class="trading-button danger" data-close-dialog>×</button></header>
    <p>Varsayılan değerler açık pozisyondan gelir. PİYASA, sunucunun doğruladığı son fiyatla; LİMİT ise fiyat limitine ulaştığında gerçekleşir.</p>
    <form class="paper-order-form" data-close-order-form>
      <label>AÇIK LOT<input name="openQuantity" value="${Number(position.quantity)}" disabled></label>
      <label>SATILACAK LOT<input name="quantity" type="number" min="1" max="${Number(position.quantity)}" step="1" value="${Number(position.quantity)}" required></label>
      <label>GÜNCEL FİYAT<input name="currentPrice" value="${paperOrderInputValue(position.current || position.entry)}" disabled></label>
      <label>EMİR TÜRÜ<select name="orderType"><option value="MARKET">PİYASA</option><option value="LIMIT">LİMİT</option></select></label>
      <label data-close-limit-label>LİMİT FİYATI (₺)<input name="limitPrice" type="number" min="0.01" step="0.01" value="${paperOrderInputValue(position.current || position.entry)}" disabled></label>
      <div class="paper-order-form-actions"><button type="submit" class="trading-button danger">KÂĞIT POZİSYONU SAT</button><button type="button" class="trading-button" data-close-dialog>İPTAL</button></div>
    </form>
  </section>`;
      const sync = () => {
        const type = dialog.querySelector('[name="orderType"]').value;
        const limit = dialog.querySelector('[name="limitPrice"]');
        limit.disabled = type !== "LIMIT";
        limit.required = type === "LIMIT";
      };
      dialog.querySelector('[name="orderType"]').addEventListener("change", sync);
      dialog.addEventListener("click", event => {
        if (event.target.closest("[data-close-dialog]") || event.target === dialog) dialog.remove();
      });
      dialog.querySelector("form").addEventListener("submit", /*#__PURE__*/function () {
        var _ref39 = _asyncToGenerator(function* (event) {
          event.preventDefault();
          const form = event.currentTarget;
          const orderType = form.elements.orderType.value;
          try {
            yield closePaperPosition({
              positionId,
              symbol: position.symbol,
              quantity: Number(form.elements.quantity.value),
              orderType,
              limitPrice: orderType === "LIMIT" ? Number(form.elements.limitPrice.value) : null
            });
            dialog.remove();
          } catch (_unused12) {/* closePaperPosition already reports the error */}
        });
        return function (_x37) {
          return _ref39.apply(this, arguments);
        };
      }());
      document.body.appendChild(dialog);
    });
    return _openCloseOrderDialog.apply(this, arguments);
  }
  function queueAiDecision(_x18) {
    return _queueAiDecision.apply(this, arguments);
  }
  function _queueAiDecision() {
    _queueAiDecision = _asyncToGenerator(function* (decision) {
      try {
        const response = yield fetch("/api/trading/paper/decision/pending", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            decisionId: decision.id,
            symbol: decision.symbol
          })
        });
        const state = yield readPaperOrderResponse(response, "AI kararı bekleyen emre eklenemedi.");
        renderPaperOrderState(state, decision.id);
        focusPendingPaperOrder(decision.id);
      } catch (error) {
        alert(`AI kararı bekleyen emre eklenemedi: ${error.message}`);
      }
    });
    return _queueAiDecision.apply(this, arguments);
  }
  function renderOpenPositions(positions) {
    const element = document.getElementById("openPositions");
    const status = document.getElementById("openPositionStatus");
    const open = (Array.isArray(positions) ? positions : []).filter(item => item.status === "OPEN");
    if (status) {
      status.textContent = `${open.length} POZİSYON`;
    }
    if (!element) return;
    if (open.length === 0) {
      element.innerHTML = '<tr><td colspan="12" class="table-empty">No open positions</td></tr>';
      return;
    }
    element.innerHTML = open.map(item => `
        <tr>
          <td>${item.symbol}</td>
          <td>LONG</td>
          <td>${formatCurrency(item.entry)}</td>
          <td>${formatCurrency(item.current)}</td>
          <td>${item.quantity} LOT</td>
          <td>${formatCurrency(Number(item.quantity) * Number(item.entry))}</td>
          <td>${formatCurrency(item.stop)}</td>
          <td>${formatCurrency(item.target1)}</td>
          <td>${formatCurrency(item.target2)}</td>
          <td>${formatCurrency(item.pnl)}</td>
          <td>${item.tp1Hit ? "TP1 ✓ · AÇIK" : "AÇIK"}</td>
          <td>
            <button
              type="button"
              class="trading-button danger position-close-button"
              data-position-close="${item.id}"
            >CLOSE</button>
          </td>
        </tr>
      `).join("");
  }
  function updatePaperPricesFromScan(results) {
    /*
     * Paper pozisyonlarının kapatılması ve TP yönetimi
     * sunucu tarafındaki monitörün yetkisindedir. Tarayıcı
     * yalnızca son scan fiyatını ekranda gösterir.
     */
    const prices = new Map((Array.isArray(results) ? results : []).map(item => [item.symbol, Number(item.price)]));
    const paper = currentPaperState();
    const positions = paper.positions.map(position => {
      const current = prices.get(position.symbol);
      if (!Number.isFinite(current) || position.status !== "OPEN") {
        return position;
      }
      return _objectSpread(_objectSpread({}, position), {}, {
        current,
        pnl: (current - Number(position.entry)) * Number(position.quantity)
      });
    });
    if (positions.some((item, index) => {
      var _paper$positions$inde;
      return item.current !== ((_paper$positions$inde = paper.positions[index]) === null || _paper$positions$inde === void 0 ? void 0 : _paper$positions$inde.current);
    })) {
      savePaperState(_objectSpread(_objectSpread({}, paper), {}, {
        positions
      }), "Açık paper pozisyonları ekranda güncel fiyatla yenilendi.");
    }
  }
  function bindDecisionBoard() {
    if (!aiDecisionFeed || aiDecisionFeed.dataset.boardBound === "true") {
      return;
    }
    aiDecisionFeed.dataset.boardBound = "true";
    aiDecisionFeed.addEventListener("click", event => {
      const card = event.target.closest("[data-decision-index]");
      if (!card) return;
      const item = renderedDecisionRecords[Number(card.dataset.decisionIndex)];
      if (item) {
        renderAiDecisionDetail(item);
        void focusDecisionOnChart(item);
      }
    });
    document.addEventListener("click", event => {
      const action = event.target.closest("[data-paper-action]");
      if (action) {
        if (action.dataset.paperAction === "close") {
          openCloseOrderDialog(action.dataset.positionId);
          return;
        }
        const decision = renderedDecisionRecords.find(item => item.id === action.dataset.decisionId);
        if (!decision) return;
        if (action.dataset.paperAction === "approve") {
          approvePaperPosition(decision);
        }
        if (action.dataset.paperAction === "reject") {
          rejectPaperPosition(decision);
        }
        if (action.dataset.paperAction === "queue") {
          queueAiDecision(decision);
        }
        return;
      }
      const closeButton = event.target.closest("[data-position-close]");
      if (closeButton) {
        openCloseOrderDialog(closeButton.dataset.positionClose);
      }
    });
  }
  function decisionSignature(item) {
    var _item$entry5;
    return [item === null || item === void 0 ? void 0 : item.symbol, item === null || item === void 0 ? void 0 : item.action, Number((item === null || item === void 0 || (_item$entry5 = item.entry) === null || _item$entry5 === void 0 ? void 0 : _item$entry5.reference) || 0).toFixed(2), Number((item === null || item === void 0 ? void 0 : item.stop) || 0).toFixed(2), Number((item === null || item === void 0 ? void 0 : item.target1) || 0).toFixed(2), Number((item === null || item === void 0 ? void 0 : item.target2) || 0).toFixed(2)].join("|");
  }
  function uniqueDecisions(records) {
    const seen = new Set();
    return (Array.isArray(records) ? records : []).filter(item => {
      const signature = decisionSignature(item);
      if (seen.has(signature)) {
        return false;
      }
      seen.add(signature);
      return true;
    });
  }
  function performanceRecordDate(item) {
    var _item$lifecycle, _item$lifecycle2;
    const value = (item === null || item === void 0 ? void 0 : item.closedAt) || (item === null || item === void 0 || (_item$lifecycle = item.lifecycle) === null || _item$lifecycle === void 0 ? void 0 : _item$lifecycle.closedAt) || (item === null || item === void 0 ? void 0 : item.openedAt) || (item === null || item === void 0 || (_item$lifecycle2 = item.lifecycle) === null || _item$lifecycle2 === void 0 ? void 0 : _item$lifecycle2.openedAt) || (item === null || item === void 0 ? void 0 : item.timestamp);
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  function matchesPerformanceRange(item, start, end) {
    const date = performanceRecordDate(item);
    return Boolean(date) && (!start || date >= start) && (!end || date <= end);
  }
  function performanceRangeBounds() {
    var _document$getElementB, _document$getElementB2;
    const customStart = (_document$getElementB = document.getElementById("performanceStartDate")) === null || _document$getElementB === void 0 ? void 0 : _document$getElementB.value;
    const customEnd = (_document$getElementB2 = document.getElementById("performanceEndDate")) === null || _document$getElementB2 === void 0 ? void 0 : _document$getElementB2.value;
    if (performanceRange === "CUSTOM" && (customStart || customEnd)) {
      return {
        start: customStart ? new Date(`${customStart}T00:00:00`) : null,
        end: customEnd ? new Date(`${customEnd}T23:59:59.999`) : null,
        label: "ÖZEL TARİH ARALIĞI"
      };
    }
    const months = {
      "1M": 1,
      "3M": 3,
      "6M": 6
    }[performanceRange];
    if (!months) {
      return {
        start: null,
        end: null,
        label: "TÜM ZAMANLAR"
      };
    }
    const start = new Date();
    start.setMonth(start.getMonth() - months);
    return {
      start,
      end: null,
      label: `LAST ${months} MONTH${months > 1 ? "S" : ""}`
    };
  }
  function renderPerformance(state) {
    var _source$paper3;
    if (state && !Array.isArray(state)) {
      performanceState = state;
    }
    const source = performanceState || {};
    const bounds = performanceRangeBounds();
    const active = (Array.isArray(source.decisions) ? source.decisions : []).filter(item => matchesPerformanceRange(item, bounds.start, bounds.end));
    const history = (Array.isArray(source.history) ? source.history : []).filter(item => matchesPerformanceRange(item, bounds.start, bounds.end));
    const allSignals = uniqueDecisions([...active, ...history]);
    const closedPositions = (Array.isArray((_source$paper3 = source.paper) === null || _source$paper3 === void 0 ? void 0 : _source$paper3.positions) ? source.paper.positions : []).filter(item => (item.status === "CLOSED" || item.status === "STOPPED") && matchesPerformanceRange(item, bounds.start, bounds.end));
    const averageConfidence = allSignals.length ? Math.round(allSignals.reduce((sum, item) => sum + Number(item.confidence || 0), 0) / allSignals.length) : null;
    const realizedPnl = closedPositions.reduce((sum, item) => sum + Number(item.pnl || 0), 0);
    const wins = closedPositions.filter(item => Number(item.pnl || 0) > 0).length;
    const fields = {
      performanceTotalSignals: allSignals.length,
      performanceActiveSignals: active.filter(item => item.status === "PENDING" || item.status === "OPEN").length,
      performanceAvgConfidence: averageConfidence === null ? "--" : `%${averageConfidence}`,
      performanceResolved: closedPositions.length,
      performanceWinRate: closedPositions.length ? `%${Math.round(wins / closedPositions.length * 100)}` : "--",
      performanceRealizedPnL: formatCurrency(realizedPnl)
    };
    Object.entries(fields).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) {
        element.textContent = String(value);
      }
    });
    const label = document.getElementById("performanceRangeLabel");
    if (label) {
      label.textContent = bounds.label;
    }
    const note = document.getElementById("performanceNote");
    if (note) {
      note.textContent = closedPositions.length > 0 ? `${bounds.label}: ${closedPositions.length} kapanan paper işlem · ${wins} kârlı işlem.` : `${bounds.label}: seçilen aralıkta kapanan paper işlem yok.`;
    }
  }
  function bindPerformanceRange() {
    const range = document.getElementById("performanceRange");
    const start = document.getElementById("performanceStartDate");
    const end = document.getElementById("performanceEndDate");
    if (!range || range.dataset.bound === "true") {
      return;
    }
    range.dataset.bound = "true";
    const refresh = () => {
      performanceRange = range.value || "ALL";
      renderPerformance();
    };
    range.addEventListener("change", refresh);
    [start, end].forEach(input => {
      if (input) {
        input.addEventListener("change", () => {
          performanceRange = "CUSTOM";
          range.value = "CUSTOM";
          renderPerformance();
        });
      }
    });
  }
  function reconcileScanDecisions(previous, incoming, timestamp) {
    const prior = uniqueDecisions(previous);
    const next = uniqueDecisions(incoming);
    const nextKeys = new Set(next.map(decisionSignature));
    const retained = prior.filter(item => nextKeys.has(decisionSignature(item)));
    const archived = prior.filter(item => !nextKeys.has(decisionSignature(item))).map(item => _objectSpread(_objectSpread({}, item), {}, {
      status: "EXPIRED",
      lifecycle: _objectSpread(_objectSpread({}, item.lifecycle || {}), {}, {
        stage: "EXPIRED",
        closedAt: timestamp
      }),
      outcome: "SUPERSEDED_BY_NEW_SCAN"
    }));
    const retainedKeys = new Set(retained.map(decisionSignature));
    return {
      decisions: [...retained, ...next.filter(item => !retainedKeys.has(decisionSignature(item)))],
      archived
    };
  }
  function renderPaperPortfolio(paper) {
    if (!paper) {
      return;
    }
    const fields = {
      paperInitialCapital: paper.initialCapital,
      paperCash: paper.cash,
      paperEquity: paper.equity,
      paperPnL: paper.pnl
    };
    Object.entries(fields).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) {
        element.textContent = formatCurrency(value);
      }
    });
    const pnlPercent = document.getElementById("paperPnLPct");
    if (pnlPercent) {
      pnlPercent.textContent = formatPercent(paper.pnlPercent);
    }
    const positionCount = document.getElementById("paperPositionCount");
    if (positionCount) {
      const closedPositions = (Array.isArray(paper.positions) ? paper.positions : []).filter(item => item.status === "CLOSED" || item.status === "STOPPED");
      positionCount.textContent = String(closedPositions.length);
    }
    const costs = document.getElementById("paperCostSummary");
    if (costs) {
      const totalEntryFees = (paper.positions || []).reduce((sum, item) => sum + Number(item.entryCommission || 0), 0);
      costs.textContent = `KOMİSYON: ‰1 · GİRİŞ KOMİSYONU: ${formatCurrency(totalEntryFees)} · BIST FİYAT BANTI: ±10%`;
    }
  }
  function loadTradingState() {
    return _loadTradingState.apply(this, arguments);
  }
  function _loadTradingState() {
    _loadTradingState = _asyncToGenerator(function* () {
      const localState = loadLocalTradingState();
      if (localState) {
        var _localState$paper;
        renderAiDecisions(localState.decisions);
        renderPaperPortfolio(localState.paper);
        renderOpenPositions((_localState$paper = localState.paper) === null || _localState$paper === void 0 ? void 0 : _localState$paper.positions);
        renderPerformance(localState);
        renderKillSwitch(localState.killSwitch);
        renderPendingPaperOrders(localState);
      }
      try {
        const response = yield fetch("/api/trading/state", {
          cache: "no-store"
        });
        if (!response.ok) {
          return;
        }
        const state = yield response.json();
        const hasRemoteDecisions = Array.isArray(state.decisions) && state.decisions.length > 0;

        /*
         * Sunucudaki boş varsayılan durum,
         * tarayıcıda saklanan son tarama sonucunu
         * yenileme sırasında ezmemelidir.
         */
        if (!localState || hasRemoteDecisions) {
          var _state$paper7;
          renderAiDecisions(state.decisions);
          renderPaperPortfolio(state.paper);
          renderOpenPositions((_state$paper7 = state.paper) === null || _state$paper7 === void 0 ? void 0 : _state$paper7.positions);
          renderPerformance(state);
          renderKillSwitch(state.killSwitch);
          saveLocalTradingState(state);
          renderPendingPaperOrders(state);
        }

        // Karar listesi boş olsa bile Kill Switch sunucudaki gerçek
        // durumunu her yüklemede ekrana yansıt.
        renderKillSwitch(state.killSwitch);
        if (localState) {
          saveLocalTradingState(_objectSpread(_objectSpread({}, localState), {}, {
            killSwitch: state.killSwitch
          }));
        }
      } catch (error) {
        console.error("Trading state yüklenemedi:", error);
      }
    });
    return _loadTradingState.apply(this, arguments);
  }
  function normalizeRiskSettings(value) {
    return {
      capital: Math.max(1000, Number(value === null || value === void 0 ? void 0 : value.capital) || 100000),
      maxPositionPercent: Math.max(1, Number(value === null || value === void 0 ? void 0 : value.maxPositionPercent) || 31),
      maxPositions: Math.max(1, Math.floor(Number(value === null || value === void 0 ? void 0 : value.maxPositions) || 3)),
      capitalSource: (value === null || value === void 0 ? void 0 : value.capitalSource) === "BROKER" ? "BROKER" : "MANUAL"
    };
  }
  function currentRiskSettings() {
    const state = loadLocalTradingState() || {};
    return normalizeRiskSettings(state.risk);
  }
  function renderRiskSettings(settings) {
    const risk = normalizeRiskSettings(settings);
    const reservePercent = Math.max(0, 100 - risk.maxPositionPercent * risk.maxPositions);
    const display = {
      maxPositions: risk.maxPositions,
      targetPositionSize: `%${risk.maxPositionPercent.toFixed(2)}`,
      cashReserve: `%${reservePercent.toFixed(2)}`,
      stopRule: "YZ KARARI"
    };
    Object.entries(display).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) {
        element.textContent = String(value);
      }
    });
    const inputs = {
      riskCapitalInput: risk.capital,
      maxPositionInput: risk.maxPositionPercent,
      maxPositionsInput: risk.maxPositions,
      capitalSourceInput: risk.capitalSource
    };
    Object.entries(inputs).forEach(([id, value]) => {
      const input = document.getElementById(id);
      if (input) {
        input.value = String(value);
      }
    });
    renderRiskAllocationGauge(risk);
  }
  function renderRiskAllocationGauge(settings) {
    const gauge = document.getElementById("riskAllocationGauge");
    if (!gauge) return;
    const risk = normalizeRiskSettings(settings);
    const allocation = risk.maxPositionPercent * risk.maxPositions;
    const overAllocated = allocation > 100;
    gauge.textContent = `${allocation.toFixed(0)}% TAHSİS`;
    gauge.classList.toggle("is-over", overAllocated);
    gauge.classList.toggle("is-safe", !overAllocated);
    gauge.title = `${risk.maxPositionPercent}% × ${risk.maxPositions} işlem = toplam ${allocation.toFixed(2)}%`;
  }
  function saveRiskSettingsFromForm(_x19) {
    return _saveRiskSettingsFromForm.apply(this, arguments);
  }
  function _saveRiskSettingsFromForm() {
    _saveRiskSettingsFromForm = _asyncToGenerator(function* (event) {
      var _document$getElementB19, _document$getElementB20, _document$getElementB21, _document$getElementB22;
      event.preventDefault();
      const risk = normalizeRiskSettings({
        capital: (_document$getElementB19 = document.getElementById("riskCapitalInput")) === null || _document$getElementB19 === void 0 ? void 0 : _document$getElementB19.value,
        maxPositionPercent: (_document$getElementB20 = document.getElementById("maxPositionInput")) === null || _document$getElementB20 === void 0 ? void 0 : _document$getElementB20.value,
        maxPositions: (_document$getElementB21 = document.getElementById("maxPositionsInput")) === null || _document$getElementB21 === void 0 ? void 0 : _document$getElementB21.value,
        capitalSource: (_document$getElementB22 = document.getElementById("capitalSourceInput")) === null || _document$getElementB22 === void 0 ? void 0 : _document$getElementB22.value
      });
      try {
        var _state$paper8;
        const response = yield fetch("/api/trading/risk-settings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(risk)
        });
        const state = yield response.json();
        if (!response.ok) {
          throw new Error((state === null || state === void 0 ? void 0 : state.error) || "Risk Engine ayarları kaydedilemedi.");
        }

        /*
         * Sunucu kalıcı kaynaktır: aynı anda Risk Engine,
         * Paper Portfolio ve activity kayıtlarını günceller.
         */
        saveLocalTradingState(state);
        renderRiskSettings(state.risk);
        renderPaperPortfolio(state.paper);
        renderAiDecisions(state.decisions || []);
        renderOpenPositions(((_state$paper8 = state.paper) === null || _state$paper8 === void 0 ? void 0 : _state$paper8.positions) || []);
        renderPerformance(state);
      } catch (error) {
        alert(`Risk Engine ayarları kaydedilemedi: ${error.message}`);
      }
    });
    return _saveRiskSettingsFromForm.apply(this, arguments);
  }
  function bindRiskSettings() {
    const form = document.getElementById("riskSettingsForm");
    if (!form || form.dataset.riskBound === "true") {
      return;
    }
    form.dataset.riskBound = "true";
    form.addEventListener("submit", saveRiskSettingsFromForm);
    form.addEventListener("input", () => {
      var _document$getElementB3, _document$getElementB4, _document$getElementB5;
      renderRiskAllocationGauge({
        capital: (_document$getElementB3 = document.getElementById("riskCapitalInput")) === null || _document$getElementB3 === void 0 ? void 0 : _document$getElementB3.value,
        maxPositionPercent: (_document$getElementB4 = document.getElementById("maxPositionInput")) === null || _document$getElementB4 === void 0 ? void 0 : _document$getElementB4.value,
        maxPositions: (_document$getElementB5 = document.getElementById("maxPositionsInput")) === null || _document$getElementB5 === void 0 ? void 0 : _document$getElementB5.value
      });
    });
    renderRiskSettings(currentRiskSettings());
  }
  function runTradingScanner() {
    return _runTradingScanner.apply(this, arguments);
  }
  /*
  --------------------------------------------------------
  STOP
  --------------------------------------------------------
  */
  function _runTradingScanner() {
    _runTradingScanner = _asyncToGenerator(function* () {
      var _window$crypto, _window$crypto$random;
      if (scannerRunning) {
        return;
      }
      scannerRunning = true;
      const requestId = ++scannerRequestId;
      scannerAbortController = new AbortController();
      const jobId = ((_window$crypto = window.crypto) === null || _window$crypto === void 0 || (_window$crypto$random = _window$crypto.randomUUID) === null || _window$crypto$random === void 0 ? void 0 : _window$crypto$random.call(_window$crypto)) || `scan-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      if (scannerStatus) {
        scannerStatus.textContent = "TARANIYOR";
      }
      if (tradingEngineStatus) {
        tradingEngineStatus.textContent = "TARANIYOR";
      }
      if (scannerStartButton) {
        scannerStartButton.disabled = true;
        scannerStartButton.textContent = "SCANNING...";
      }
      renderScannerProgress(1, "Teknik tarama başlatılıyor");
      startScannerProgress(jobId, requestId);
      try {
        var _nextState$paper;
        const risk = currentRiskSettings();
        const scannerQuery = new URLSearchParams({
          capital: String(risk.capital),
          maxPositionPercent: String(risk.maxPositionPercent),
          maxPositions: String(risk.maxPositions),
          // Kullanıcı "Taramayı Başlat" dediğinde eski kapanış snapshot'ı
          // döndürülmez; yeni tarama sonucunun arayüzde kalıcı kalması gerekir.
          force: "1",
          jobId
        });
        const response = yield fetch(`/api/trading/scanner?${scannerQuery}`, {
          method: "GET",
          cache: "no-store",
          signal: scannerAbortController.signal
        });
        const data = yield response.json();
        stopScannerProgress();

        // STOP'a basılmış ya da yeni bir tarama başlatılmışsa eski yanıt
        // ekrandaki yeni durumu geri yazamaz.
        if (requestId !== scannerRequestId) return;
        if (!response.ok || !data.success) {
          throw new Error((data === null || data === void 0 ? void 0 : data.error) || "Scanner başarısız.");
        }
        renderScannerResults(data.results);
        renderAiDecisions(data.decisions);
        renderPaperPortfolio(data.paper);
        const previousState = loadLocalTradingState() || {};

        /*
         * Scanner yanıtı sunucuda kalıcı hale gelen tek
         * kaynak durumdur. Eski localStorage OPEN etiketleri
         * yeni PENDING kararlarını ezemez.
         */
        const nextState = {
          decisions: Array.isArray(data.decisions) ? data.decisions : [],
          paper: data.paper || previousState.paper,
          activity: Array.isArray(data.activity) ? data.activity : [],
          history: Array.isArray(data.history) ? data.history : Array.isArray(previousState.history) ? previousState.history : [],
          lastScanAt: data.timestamp,
          risk: data.risk || risk
        };
        renderAiDecisions(nextState.decisions);
        renderPerformance(nextState);
        saveLocalTradingState(nextState);
        renderPaperPortfolio(nextState.paper);
        renderOpenPositions((_nextState$paper = nextState.paper) === null || _nextState$paper === void 0 ? void 0 : _nextState$paper.positions);
        renderPendingPaperOrders(nextState);
        updatePaperPricesFromScan(data.results);
        if (scannerStatus) {
          scannerStatus.textContent = "TAMAMLANDI";
        }
        if (tradingEngineStatus) {
          tradingEngineStatus.textContent = "HAZIR";
        }
        if (lastScanTime) {
          lastScanTime.textContent = new Date(data.timestamp).toLocaleTimeString("tr-TR", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
          });
        }
      } catch (error) {
        stopScannerProgress();
        if ((error === null || error === void 0 ? void 0 : error.name) === "AbortError" || requestId !== scannerRequestId) {
          return;
        }
        console.error("AI Trading Scanner:", error);
        if (scannerStatus) {
          scannerStatus.textContent = "HATA";
        }
        if (tradingEngineStatus) {
          tradingEngineStatus.textContent = "HATA";
        }
        if (scannerResults) {
          scannerResults.innerHTML = `
        <div class="trading-empty">
          Scanner hatası:
          ${error.message}
        </div>
      `;
        }
      } finally {
        if (requestId !== scannerRequestId) return;
        stopScannerProgress();
        scannerRunning = false;
        scannerAbortController = null;
        if (scannerStartButton) {
          scannerStartButton.disabled = false;
          scannerStartButton.textContent = "TARAMAYI BAŞLAT";
        }
      }
    });
    return _runTradingScanner.apply(this, arguments);
  }
  function stopTradingScanner() {
    var _scannerAbortControll;
    // Tarayıcıdaki gerçek ağ isteğini iptal et. Sunucu tarafında işlem
    // sürse bile sonucu tekrar arayüze yazamaz.
    scannerRequestId += 1;
    (_scannerAbortControll = scannerAbortController) === null || _scannerAbortControll === void 0 || _scannerAbortControll.abort();
    scannerAbortController = null;
    stopScannerProgress();
    scannerRunning = false;
    if (scannerStatus) {
      scannerStatus.textContent = "HAZIR";
    }
    if (tradingEngineStatus) {
      tradingEngineStatus.textContent = "HAZIR";
    }
    if (scannerStartButton) {
      scannerStartButton.disabled = false;
      scannerStartButton.textContent = "TARAMAYI BAŞLAT";
    }
    if (scannerResults) {
      scannerResults.innerHTML = `
      <div class="trading-empty">Tarama durduruldu.</div>
    `;
    }
  }

  /*
  --------------------------------------------------------
  BUTTONS
  --------------------------------------------------------
  */

  function renderKillSwitch(killSwitch) {
    const active = Boolean(killSwitch === null || killSwitch === void 0 ? void 0 : killSwitch.active);
    const status = document.getElementById("killSwitchStatus");
    const button = document.getElementById("killSwitchToggle");
    if (status) {
      status.textContent = active ? "ACTIVE · NEW PAPER TRADES BLOCKED" : "SAFE · NEW PAPER TRADES ENABLED";
    }
    if (button) {
      button.textContent = active ? "ACİL DURDURMAYI KAPAT" : "ACİL DURDURMAYI ETKİNLEŞTİR";
      button.classList.toggle("is-active", active);

      // İşlem yönü, eski localStorage kaydından değil ekranda
      // sunucunun son bildirdiği durumdan türetilir.
      button.dataset.killSwitchActive = active ? "true" : "false";
      button.setAttribute("aria-pressed", active ? "true" : "false");
    }
  }
  function toggleKillSwitch() {
    return _toggleKillSwitch.apply(this, arguments);
  }
  function _toggleKillSwitch() {
    _toggleKillSwitch = _asyncToGenerator(function* () {
      const passwordInput = document.getElementById("killSwitchPassword");
      const button = document.getElementById("killSwitchToggle");

      // Buton, /api/trading/state veya son başarılı işlemden gelen
      // güncel Kill Switch durumunu taşır. Eski tarayıcı kaydı
      // deaktif etme isteğini yanlışlıkla tekrar aktive etmemelidir.
      const active = (button === null || button === void 0 ? void 0 : button.dataset.killSwitchActive) === "true";
      const password = String((passwordInput === null || passwordInput === void 0 ? void 0 : passwordInput.value) || "");
      if (!password) {
        alert("Kill Switch şifresini girin.");
        return;
      }
      if (button) {
        button.disabled = true;
      }
      try {
        var _state$paper9;
        const response = yield fetch("/api/trading/kill-switch", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            action: active ? "deactivate" : "activate",
            password
          })
        });
        const state = yield response.json();
        if (!response.ok) {
          throw new Error((state === null || state === void 0 ? void 0 : state.error) || "Kill Switch güncellenemedi.");
        }
        if (passwordInput) {
          passwordInput.value = "";
        }
        saveLocalTradingState(state);
        renderKillSwitch(state.killSwitch);
        renderAiDecisions(state.decisions || []);
        renderPaperPortfolio(state.paper);
        renderOpenPositions(((_state$paper9 = state.paper) === null || _state$paper9 === void 0 ? void 0 : _state$paper9.positions) || []);
        renderPerformance(state);
      } catch (error) {
        alert("Kill Switch güncellenemedi: " + error.message);
      } finally {
        if (button) {
          button.disabled = false;
        }
      }
    });
    return _toggleKillSwitch.apply(this, arguments);
  }
  function bindKillSwitch() {
    const button = document.getElementById("killSwitchToggle");
    if (!button || button.dataset.killSwitchBound === "true") {
      return;
    }
    button.dataset.killSwitchBound = "true";
    button.addEventListener("click", toggleKillSwitch);
    renderKillSwitch((loadLocalTradingState() || {}).killSwitch);
  }
  let cryptoRenderedRecords = [];
  let cryptoMarketChart = null;
  let cryptoCandleSeries = null;
  let cryptoChartMarkers = null;
  let latestCryptoPaperState = null;
  let cryptoVisibleSignals = [];
  let cryptoQuoteRefreshTimer = null;
  let cryptoManualQuoteTimer = null;
  let cryptoScannerAbortController = null;
  let cryptoScannerPollTimer = null;
  let cryptoScannerRequestId = 0;

  /* ========================================================
     NASDAQ WORKSPACE
     ========================================================
     Kullanıcı NASDAQ HTML'ini BIST ekranından kopyaladı. Bu bölümde yalnızca
     NASDAQ tabı içindeki id'ler ad alanına alınır; BIST controller'ın ilk
     bulduğu elementler değişmez. Böylece iki panelin görünümü aynı kalırken
     state ve olaylar birbirine karışmaz.
  */
  const nasdaqTab = document.getElementById("nasdaqTab");
  function isolateNasdaqDom() {
    if (!nasdaqTab || nasdaqTab.dataset.nasdaqIsolated === "true") return;
    nasdaqTab.querySelectorAll("[id]").forEach(element => {
      const legacy = element.id;
      element.dataset.nasdaqId = legacy;
      if (legacy === "logoutButton") element.setAttribute("data-logout-button", "");
      element.id = `nasdaq-${legacy}`;
    });
    // NASDAQ sekmesi BIST HTML'inden türetildiği için ilk yüklemede kalan
    // sabit para birimi metinlerini yalnız bu tab içinde USD'ye çevir.
    const walker = document.createTreeWalker(nasdaqTab, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    textNodes.forEach(node => {
      var _node$parentElement;
      const parentTag = (_node$parentElement = node.parentElement) === null || _node$parentElement === void 0 ? void 0 : _node$parentElement.tagName;
      if (["SCRIPT", "STYLE"].includes(parentTag)) return;
      node.nodeValue = String(node.nodeValue).replaceAll("₺", "$").replace(/\bTL\b/g, "USD").replace(/BIST FİYAT BANTI/gi, "NASDAQ FİYAT BANTI");
    });
    nasdaqTab.dataset.nasdaqIsolated = "true";
  }
  isolateNasdaqDom();
  const ns = name => (nasdaqTab === null || nasdaqTab === void 0 ? void 0 : nasdaqTab.querySelector(`#nasdaq-${name}`)) || null;
  function placeNasdaqManualOrderForm() {
    var _ns;
    const mount = ns("manualOrderMount");
    const wrap = (_ns = ns("manualPaperOrderForm")) === null || _ns === void 0 ? void 0 : _ns.closest(".manual-paper-order-wrap");
    if (mount && wrap && wrap.parentElement !== mount) mount.append(wrap);
  }
  function renderNasdaqKillSwitch(killSwitch = {}) {
    const active = Boolean(killSwitch.active);
    nasdaqText("killSwitchStatus", active ? "AKTİF · NASDAQ YENİ EMİRLER DURDURULDU" : "GÜVENLİ · NASDAQ YENİ KÂĞIT İŞLEMLER AÇIK");
    const button = ns("killSwitchToggle");
    if (!button) return;
    button.textContent = active ? "ACİL DURDURMAYI KAPAT" : "ACİL DURDURMAYI ETKİNLEŞTİR";
    button.classList.toggle("is-active", active);
    button.dataset.nasdaqKillActive = String(active);
  }
  let nasdaqRecords = [];
  let nasdaqAiRecords = [];
  let latestNasdaqPaperState = null;
  let nasdaqScannerAbortController = null;
  let nasdaqScannerPollTimer = null;
  let nasdaqScannerRequestId = 0;
  let nasdaqMarketChart = null;
  let nasdaqQuoteTimer = null;
  // Tarama cevabındaki ayrıntılı günlük mumlar GitHub state'ine bilinçli olarak
  // yazılmaz. State yenilemesi bu yüzden yeni taramanın kart/grafiklerini eski,
  // history'siz kayıtlarla değiştirmemelidir.
  let nasdaqLocalScannerSnapshotActive = false;
  let nasdaqStateLoadGeneration = 0;
  function formatNasdaqUsd(value) {
    const number = Number(value);
    // P&L sıfır veya negatif olabilir; bunlar eksik veri değildir.
    if (!Number.isFinite(number)) return "—";
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: number < 10 ? 4 : 2
    }).format(number);
  }
  function orderFillProgressMarkup(requestedValue, filledValue, {
    digits = 2
  } = {}) {
    const requested = Math.max(0, Number(requestedValue) || 0);
    const filled = Math.min(requested || Infinity, Math.max(0, Number(filledValue) || 0));
    const percent = requested > 0 ? Math.min(100, filled * 100 / requested) : 0;
    const remaining = Math.max(0, requested - filled);
    const amount = value => Number(value).toLocaleString("tr-TR", {
      maximumFractionDigits: digits
    });
    return `<div class="order-fill-progress"><div class="order-fill-progress-head"><strong>GERÇEKLEŞME %${percent.toFixed(1)}</strong><span>${amount(filled)} / ${amount(requested)}</span></div><div class="order-fill-progress-track" role="progressbar" aria-label="Emir gerçekleşme oranı" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent.toFixed(1)}"><span style="width:${percent.toFixed(2)}%"></span></div><small>Kalan: ${amount(remaining)}</small></div>`;
  }
  function decorateOrderFillProgress(root = document) {
    var _root$querySelectorAl;
    (_root$querySelectorAl = root.querySelectorAll) === null || _root$querySelectorAl === void 0 || _root$querySelectorAl.call(root, ".pending-paper-order-card:not([data-fill-progress-ready])").forEach(card => {
      var _card$querySelector2;
      if (card.querySelector(".order-fill-progress")) {
        card.dataset.fillProgressReady = "true";
        return;
      }
      let requested = Number(((_card$querySelector2 = card.querySelector('input[name="quantity"]')) === null || _card$querySelector2 === void 0 ? void 0 : _card$querySelector2.value) || 0);
      let filled = Number(card.dataset.filledQuantity || 0);
      let digits = requested % 1 ? 8 : 0;
      if (card.classList.contains("crypto-spot-order-card")) {
        var _values$find, _values$find2;
        const values = [...card.querySelectorAll(".decision-detail-grid span")].map(node => node.textContent || "");
        requested = Number(((_values$find = values.find(value => value.startsWith("Miktar:"))) === null || _values$find === void 0 ? void 0 : _values$find.split(":").slice(1).join(":").trim()) || 0);
        filled = Number(((_values$find2 = values.find(value => value.startsWith("Gerçekleşen:"))) === null || _values$find2 === void 0 ? void 0 : _values$find2.split(":").slice(1).join(":").trim()) || 0);
        digits = 8;
      }
      const head = card.querySelector(".pending-paper-order-head");
      if (!head || !requested) return;
      head.insertAdjacentHTML("afterend", orderFillProgressMarkup(requested, filled, {
        digits
      }));
      card.dataset.fillProgressReady = "true";
    });
  }
  new MutationObserver(() => decorateOrderFillProgress()).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
  function nasdaqText(name, value) {
    const element = ns(name);
    if (element) element.textContent = value;
  }
  function nasdaqPlan(item) {
    const fib = (item === null || item === void 0 ? void 0 : item.fibonacci) || {};
    return fib.valid ? fib : (item === null || item === void 0 ? void 0 : item.fallbackPlan) || {};
  }
  function nasdaqEntry(item) {
    const fib = (item === null || item === void 0 ? void 0 : item.fibonacci) || {};
    const plan = nasdaqPlan(item);
    return {
      low: fib.valid ? fib.entryZoneLow : plan.entryPrice,
      high: fib.valid ? fib.entryZoneHigh : plan.entryPrice
    };
  }
  function nasdaqLocalTime(value) {
    return value ? new Date(value).toLocaleString("tr-TR") : "—";
  }
  function renderNasdaqScannerResults(data, records) {
    var _latestNasdaqPaperSta, _latestNasdaqPaperSta2;
    const results = ns("scannerResults");
    if (results) results.innerHTML = `<div class="trading-empty">${Number(data.scanned || 0)} aktif NASDAQ hissesi tarandı · ${Number(data.successful || 0)} geçerli günlük veri · Kaynak: ${escapeHtml(String(data.source || ((_latestNasdaqPaperSta = latestNasdaqPaperState) === null || _latestNasdaqPaperSta === void 0 || (_latestNasdaqPaperSta = _latestNasdaqPaperSta.scanner) === null || _latestNasdaqPaperSta === void 0 ? void 0 : _latestNasdaqPaperSta.source) || "ALPACA"))}</div>`;
    const history = ns("signalHistory");
    const status = ns("signalHistoryStatus");
    if (status) status.textContent = `${(((_latestNasdaqPaperSta2 = latestNasdaqPaperState) === null || _latestNasdaqPaperSta2 === void 0 ? void 0 : _latestNasdaqPaperSta2.signals) || records || []).length} KAYIT`;
    if (history) {
      var _latestNasdaqPaperSta3;
      const signals = (_latestNasdaqPaperSta3 = latestNasdaqPaperState) !== null && _latestNasdaqPaperSta3 !== void 0 && (_latestNasdaqPaperSta3 = _latestNasdaqPaperSta3.signals) !== null && _latestNasdaqPaperSta3 !== void 0 && _latestNasdaqPaperSta3.length ? latestNasdaqPaperState.signals : records;
      history.innerHTML = signals !== null && signals !== void 0 && signals.length ? signals.slice(0, 80).map((item, index) => {
        var _item$fibonacci;
        return `<button type="button" class="signal-history-item" data-nasdaq-history-index="${index}"><strong>${escapeHtml(item.symbol || "SEMBOL")}</strong><span>${escapeHtml(item.grade || "KARAR")} · TEKNİK ${Number(item.score || 0)}/100</span><small>${escapeHtml(translateTradingStatus(item.status || ((_item$fibonacci = item.fibonacci) === null || _item$fibonacci === void 0 ? void 0 : _item$fibonacci.status) || "NO_VALID_STRUCTURE"))} · ${nasdaqLocalTime(item.timestamp)}</small></button>`;
      }).join("") : '<div class="trading-empty">İlk NASDAQ taraması sonrası sinyal geçmişi burada oluşur.</div>';
      bindNasdaqInteractions();
    }
  }
  function renderNasdaqDecisionCards(records) {
    const feed = ns("aiDecisionFeed");
    if (!feed) return;
    feed.innerHTML = (records || []).map((item, index) => {
      const plan = nasdaqPlan(item),
        entry = nasdaqEntry(item),
        fib = item.fibonacci || {};
      return `<article class="decision-item decision-card" tabindex="0" role="button" data-nasdaq-decision-index="${index}"><header><strong>${escapeHtml(item.symbol)}</strong><span>${escapeHtml(item.grade || "KARAR")}</span><span>TEKNİK ${Number(item.score || 0)}/100</span></header><div class="decision-price-grid"><span><small>FİYAT</small>${formatNasdaqUsd(item.price)}</span><span><small>RSI / ATR</small>${formatPrice(item.rsi)} / ${formatNasdaqUsd(item.atr)}</span><span><small>FIBONACCI</small>${escapeHtml(translateTradingStatus(fib.status || "NO_VALID_STRUCTURE"))}</span></div><p>${escapeHtml((item.reasons || []).slice(0, 4).join(" · ") || item.reason || "Teknik veriler günlük Alpaca OHLCV kaynağından hesaplandı.")}</p><small>Giriş: ${formatNasdaqUsd(entry.low)} – ${formatNasdaqUsd(entry.high)} · SL: ${formatNasdaqUsd(plan.stopLoss)} · TP1/2/3: ${formatNasdaqUsd(plan.tp1)} / ${formatNasdaqUsd(plan.tp2)} / ${formatNasdaqUsd(plan.tp3)}</small></article>`;
    }).join("") || '<div class="trading-empty">Henüz NASDAQ AI kararı yok.</div>';
    bindNasdaqInteractions();
  }
  function renderNasdaqChart(item) {
    var _item$history;
    const container = ns("market_chart");
    const empty = ns("chartEmpty");
    if (!container || typeof LightweightCharts === "undefined" || !(item !== null && item !== void 0 && (_item$history = item.history) !== null && _item$history !== void 0 && _item$history.length)) {
      if (empty) {
        empty.hidden = false;
        empty.textContent = item ? "Grafik, yeni NASDAQ taramasında tamamlanmış günlük verilerle hazırlanır." : "Bir karar seçin.";
      }
      return;
    }
    try {
      var _nasdaqMarketChart, _style$Dashed, _style$Dotted, _style$Dotted2, _style$Solid, _style$Solid2, _style$Solid3, _style$Solid4;
      (_nasdaqMarketChart = nasdaqMarketChart) === null || _nasdaqMarketChart === void 0 || _nasdaqMarketChart.remove();
      container.innerHTML = "";
      nasdaqMarketChart = LightweightCharts.createChart(container, {
        width: Math.max(280, container.clientWidth || 320),
        height: 300,
        layout: {
          background: {
            color: "#101922"
          },
          textColor: "#d5e5ef"
        },
        grid: {
          vertLines: {
            color: "rgba(91,169,255,.13)"
          },
          horzLines: {
            color: "rgba(91,169,255,.13)"
          }
        },
        rightPriceScale: {
          borderColor: "rgba(125,202,255,.42)"
        },
        timeScale: {
          borderColor: "rgba(125,202,255,.42)",
          timeVisible: false
        }
      });
      const candles = nasdaqMarketChart.addSeries(LightweightCharts.CandlestickSeries, {
        upColor: "#42d392",
        downColor: "#f05b6b",
        borderVisible: false,
        wickUpColor: "#42d392",
        wickDownColor: "#f05b6b"
      });
      candles.setData(item.history.slice(-150).map(c => ({
        time: Number(c.time),
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close)
      })).filter(c => Number.isFinite(c.time) && [c.open, c.high, c.low, c.close].every(Number.isFinite)));
      const fib = item.fibonacci || {},
        plan = nasdaqPlan(item),
        style = LightweightCharts.LineStyle || {};
      [[fib.valid ? fib.entryTriggerPrice : null, "FIB TETİK", "#76a9ff", (_style$Dashed = style.Dashed) !== null && _style$Dashed !== void 0 ? _style$Dashed : 2], [fib.valid ? fib.entryZoneLow : plan.entryPrice, "GİRİŞ", "#72dddd", (_style$Dotted = style.Dotted) !== null && _style$Dotted !== void 0 ? _style$Dotted : 1], [fib.valid ? fib.entryZoneHigh : null, "GİRİŞ ÜST", "#72dddd", (_style$Dotted2 = style.Dotted) !== null && _style$Dotted2 !== void 0 ? _style$Dotted2 : 1], [plan.stopLoss, "SL", "#ff6b6b", (_style$Solid = style.Solid) !== null && _style$Solid !== void 0 ? _style$Solid : 0], [plan.tp1, "TP1", "#78e58b", (_style$Solid2 = style.Solid) !== null && _style$Solid2 !== void 0 ? _style$Solid2 : 0], [plan.tp2, "TP2", "#78e58b", (_style$Solid3 = style.Solid) !== null && _style$Solid3 !== void 0 ? _style$Solid3 : 0], [plan.tp3, "TP3", "#78e58b", (_style$Solid4 = style.Solid) !== null && _style$Solid4 !== void 0 ? _style$Solid4 : 0]].forEach(([price, title, color, lineStyle]) => {
        if (Number.isFinite(Number(price)) && Number(price) > 0) candles.createPriceLine({
          price: Number(price),
          title,
          color,
          lineWidth: 1,
          lineStyle,
          axisLabelVisible: true
        });
      });
      const markers = [[fib.pointA, "A", "belowBar", "#f8c35a"], [fib.pointB, "B", "aboveBar", "#76a9ff"], [fib.pointC, "C", "belowBar", "#ff7a7a"]].filter(([point]) => (point === null || point === void 0 ? void 0 : point.date) && Number.isFinite(Number(point.price))).map(([point, text, position, color]) => ({
        time: Math.floor(new Date(point.date).getTime() / 1000),
        position,
        color,
        shape: "circle",
        text
      }));
      if (markers.length && typeof LightweightCharts.createSeriesMarkers === "function") LightweightCharts.createSeriesMarkers(candles, markers);
      nasdaqMarketChart.timeScale().fitContent();
      if (empty) {
        empty.textContent = "";
        empty.hidden = true;
      }
    } catch (error) {
      if (empty) {
        empty.hidden = false;
        empty.textContent = "NASDAQ grafik katmanı oluşturulamadı.";
      }
    }
  }
  function renderNasdaqScore(item) {
    const content = ns("decisionScoreContent");
    nasdaqText("decisionScoreSymbol", (item === null || item === void 0 ? void 0 : item.symbol) || "KARAR YOK");
    if (!content) return;
    if (!item) {
      content.textContent = "Bir NASDAQ kararına tıklayarak teknik puan kalemlerini burada gör.";
      return;
    }
    const score = item.scoreBreakdown || {};
    const rows = [["Trend", score.trend], ["Momentum", score.momentum], ["Hacim / likidite", score.volumeLiquidity], ["Giriş kalitesi", score.entryQuality]].map(([label, bucket]) => `<tr><th>${label}</th><td><strong>${Number((bucket === null || bucket === void 0 ? void 0 : bucket.score) || 0)}/${Number((bucket === null || bucket === void 0 ? void 0 : bucket.max) || 0)}</strong></td><td>${escapeHtml(((bucket === null || bucket === void 0 ? void 0 : bucket.items) || []).map(entry => (entry === null || entry === void 0 ? void 0 : entry.label) || entry).join(" · ") || "—")}</td></tr>`).join("");
    content.innerHTML = `<div class="decision-score-summary"><strong>TEKNİK ${Number(item.score || 0)}/100 · ${escapeHtml(item.grade || "KARAR")}</strong><span>Bu puan başarı olasılığı değildir.</span></div><div class="crypto-score-table-wrap"><table class="crypto-score-table"><thead><tr><th>BAŞLIK</th><th>PUAN</th><th>KANITLAR</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  function renderNasdaqDetail(item) {
    var _plan$riskRewardTp, _plan$riskRewardTp2, _plan$riskRewardTp3, _fib$pointA3, _fib$pointB3, _fib$pointC3;
    const detail = ns("aiDecisionDetail");
    if (!detail || !item) return;
    const fib = item.fibonacci || {},
      plan = nasdaqPlan(item),
      entry = nasdaqEntry(item),
      review = item.aiReview || {};
    nasdaqText("chartSymbol", item.symbol || "SEMBOL YOK");
    renderNasdaqChart(item);
    renderNasdaqScore(item);
    const index = nasdaqAiRecords.indexOf(item);
    detail.innerHTML = `<strong>${escapeHtml(item.symbol)} · ${escapeHtml(item.grade || "KARAR")} · ${escapeHtml(translateTradingStatus(fib.status || "NO_VALID_STRUCTURE"))}</strong><div class="decision-detail-grid"><span>Giriş: ${formatNasdaqUsd(entry.low)} – ${formatNasdaqUsd(entry.high)}</span><span>Stop: ${formatNasdaqUsd(plan.stopLoss)}</span><span>TP1: ${formatNasdaqUsd(plan.tp1)} · R/R ${(_plan$riskRewardTp = plan.riskRewardTp1) !== null && _plan$riskRewardTp !== void 0 ? _plan$riskRewardTp : "—"}</span><span>TP2: ${formatNasdaqUsd(plan.tp2)} · R/R ${(_plan$riskRewardTp2 = plan.riskRewardTp2) !== null && _plan$riskRewardTp2 !== void 0 ? _plan$riskRewardTp2 : "—"}</span><span>TP3: ${formatNasdaqUsd(plan.tp3)} · R/R ${(_plan$riskRewardTp3 = plan.riskRewardTp3) !== null && _plan$riskRewardTp3 !== void 0 ? _plan$riskRewardTp3 : "—"}</span><span>A/B/C: ${formatNasdaqUsd((_fib$pointA3 = fib.pointA) === null || _fib$pointA3 === void 0 ? void 0 : _fib$pointA3.price)} / ${formatNasdaqUsd((_fib$pointB3 = fib.pointB) === null || _fib$pointB3 === void 0 ? void 0 : _fib$pointB3.price)} / ${formatNasdaqUsd((_fib$pointC3 = fib.pointC) === null || _fib$pointC3 === void 0 ? void 0 : _fib$pointC3.price)}</span></div><div class="ai-comment"><strong>HABER YORUMU</strong><p>${escapeHtml(review.newsComment || "Doğrulanmış haber başlığı alınamadı.")}</p><strong>UZMAN / ANALİST BİLGİSİ</strong><p>${escapeHtml(review.expertComment || "Analist görüşü veya hedef fiyat, doğrulanmış kaynak olmadan gösterilmez.")}</p><strong>AI ÖZETİ</strong><p>${escapeHtml(review.summary || "Teknik plan backend günlük verisinden oluşturuldu.")}</p></div><small>${escapeHtml(item.reason || plan.message || "Fibonacci seviyeleri günlük Alpaca OHLCV verisi ile hesaplandı.")}</small>${index >= 0 ? `<br><button type="button" class="trading-button" data-nasdaq-action="queue" data-nasdaq-index="${index}">BEKLEYEN NASDAQ EMRİ OLUŞTUR</button>` : ""}`;
    bindNasdaqPaperActions();
  }
  function renderNasdaqHistoryDetail(index) {
    var _latestNasdaqPaperSta4;
    const source = (_latestNasdaqPaperSta4 = latestNasdaqPaperState) !== null && _latestNasdaqPaperSta4 !== void 0 && (_latestNasdaqPaperSta4 = _latestNasdaqPaperSta4.signals) !== null && _latestNasdaqPaperSta4 !== void 0 && _latestNasdaqPaperSta4.length ? latestNasdaqPaperState.signals : nasdaqRecords;
    const item = source === null || source === void 0 ? void 0 : source[index];
    const target = ns("signalDetail");
    if (!target || !item) return;
    const fib = item.fibonacci || {},
      plan = nasdaqPlan(item);
    target.innerHTML = `<strong>${escapeHtml(item.symbol || "SEMBOL")} · ${escapeHtml(item.grade || "KARAR")} · ${escapeHtml(translateTradingStatus(item.status || fib.status || "NO_VALID_STRUCTURE"))}</strong><div class="decision-detail-grid"><span>Fiyat: ${formatNasdaqUsd(item.price)}</span><span>Giriş: ${formatNasdaqUsd(nasdaqEntry(item).low)} – ${formatNasdaqUsd(nasdaqEntry(item).high)}</span><span>SL: ${formatNasdaqUsd(plan.stopLoss)}</span><span>TP1/TP2/TP3: ${formatNasdaqUsd(plan.tp1)} / ${formatNasdaqUsd(plan.tp2)} / ${formatNasdaqUsd(plan.tp3)}</span></div>`;
  }
  function renderNasdaqPerformance(paper) {
    var _ns2;
    const all = [...(paper.signals || []), ...(paper.history || [])];
    const range = ((_ns2 = ns("performanceRange")) === null || _ns2 === void 0 ? void 0 : _ns2.value) || "ALL";
    const now = Date.now();
    const days = {
      "1M": 31,
      "3M": 92,
      "6M": 184
    };
    const active = range === "ALL" ? all : range === "CUSTOM" ? all.filter(item => {
      var _ns3, _ns4;
      const time = new Date(item.timestamp || item.closedAt || 0).getTime();
      const start = (_ns3 = ns("performanceStartDate")) !== null && _ns3 !== void 0 && _ns3.value ? new Date(ns("performanceStartDate").value).getTime() : -Infinity;
      const end = (_ns4 = ns("performanceEndDate")) !== null && _ns4 !== void 0 && _ns4.value ? new Date(`${ns("performanceEndDate").value}T23:59:59`).getTime() : Infinity;
      return time >= start && time <= end;
    }) : all.filter(item => new Date(item.timestamp || item.closedAt || 0).getTime() >= now - (days[range] || 0) * 86400000);
    const closed = (paper.history || []).filter(item => item.status === "CLOSED");
    const wins = closed.filter(item => Number(item.realizedPnl) > 0);
    nasdaqText("performanceTotalSignals", String(active.length));
    nasdaqText("performanceActiveSignals", String((paper.positions || []).length));
    nasdaqText("performanceAvgConfidence", "—");
    nasdaqText("performanceResolved", String(closed.length));
    nasdaqText("performanceWinRate", closed.length ? `${(wins.length * 100 / closed.length).toFixed(1)}%` : "—");
    nasdaqText("performanceRealizedPnL", formatNasdaqUsd(closed.reduce((sum, item) => sum + Number(item.realizedPnl || 0), 0)));
    nasdaqText("performanceRangeLabel", range === "ALL" ? "TÜM ZAMANLAR" : range === "CUSTOM" ? "ÖZEL ARALIK" : `SON ${days[range]} GÜN`);
  }
  function nasdaqPendingCard(decision) {
    const order = decision.pendingOrder || {};
    const market = order.orderType === "MARKET";
    const waiting = decision.status === "PENDING_LIMIT";
    const source = String(order.source || "NASDAQ AI").toUpperCase() === "MANUAL" ? "MANUEL" : "NASDAQ AI";
    return `<article class="pending-paper-order-card${source === "MANUEL" ? " is-manual" : ""}" data-nasdaq-pending-card data-nasdaq-decision-id="${escapeHtml(decision.id)}"><div class="pending-paper-order-head"><strong>${escapeHtml(decision.symbol)} · ${source}</strong><span class="pending-paper-order-badge">${waiting ? "LİMİT BEKLİYOR" : "ONAY BEKLİYOR"}</span></div><div class="paper-order-live-price">SON TAMAMLANMIŞ GÜNLÜK FİYAT: ${formatNasdaqUsd(order.lastMarketPrice || decision.price)}</div><form class="paper-order-form" data-nasdaq-pending-form><label>MİKTAR<input name="quantity" type="number" min="1" step="1" value="${Number(order.quantity || 1)}" required${waiting ? " disabled" : ""}></label><label>GİRİŞ FİYATI ($)<input name="entryPrice" type="number" min="0.0001" step="0.0001" value="${market ? "" : Number(order.entryPrice || "")}" ${market || waiting ? "disabled" : "required"}></label><label>EMİR TÜRÜ<select name="orderType"${waiting ? " disabled" : ""}><option value="MARKET" ${market ? "selected" : ""}>PİYASA</option><option value="LIMIT" ${!market ? "selected" : ""}>LİMİT</option></select></label><label>STOP<input name="stop" type="number" min="0.0001" step="0.0001" value="${Number(order.stop || "")}"${waiting ? " disabled" : ""}></label><label>TP1<input name="target1" type="number" min="0.0001" step="0.0001" value="${Number(order.target1 || "")}"${waiting ? " disabled" : ""}></label><label>TP2<input name="target2" type="number" min="0.0001" step="0.0001" value="${Number(order.target2 || "")}"${waiting ? " disabled" : ""}></label><label>TP3<input name="target3" type="number" min="0.0001" step="0.0001" value="${Number(order.target3 || "")}"${waiting ? " disabled" : ""}></label><div class="paper-order-form-actions">${waiting ? "<small>Limit fiyatına gelince sunucu tarafındaki işlem monitörü emri açar.</small>" : `<button type="submit" class="trading-button">AYARLARI KAYDET</button><button type="button" class="trading-button success" data-nasdaq-action="approve" data-nasdaq-decision-id="${escapeHtml(decision.id)}">KÂĞIT EMRİ ONAYLA</button>`}<button type="button" class="trading-button danger" data-nasdaq-action="reject" data-nasdaq-decision-id="${escapeHtml(decision.id)}">REDDET</button></div></form><small>Fiyat, miktar, emir türü, stop ve hedefler onaydan önce düzenlenebilir.</small></article>`;
  }
  function renderNasdaqBrokerControls(paper) {
    const mount = ns("pendingPaperOrders");
    if (!mount) return;
    mount.querySelectorAll("[data-nasdaq-broker-cancel],[data-nasdaq-protection-enable],[data-nasdaq-reconcile-warning]").forEach(node => {
      var _ref14;
      return (_ref14 = node.matches("article") ? node : node.closest("article")) === null || _ref14 === void 0 ? void 0 : _ref14.remove();
    });
    const pending = Array.isArray(paper === null || paper === void 0 ? void 0 : paper.brokerPendingEntries) ? paper.brokerPendingEntries : [];
    const unprotected = ((paper === null || paper === void 0 ? void 0 : paper.positions) || []).filter(position => {
      var _position$broker;
      return position.status === "OPEN" && ((_position$broker = position.broker) === null || _position$broker === void 0 ? void 0 : _position$broker.protectionSuppressed);
    });
    const discrepant = ((paper === null || paper === void 0 ? void 0 : paper.positions) || []).filter(position => {
      var _position$broker2;
      return position.status === "OPEN" && ((_position$broker2 = position.broker) === null || _position$broker2 === void 0 ? void 0 : _position$broker2.brokerDiscrepancy);
    });
    const cards = [...pending.map(position => {
      var _position$broker3, _position$broker4, _position$broker5, _position$broker6, _position$broker7;
      return `<article class="pending-paper-order-card" data-filled-quantity="${Number(((_position$broker3 = position.broker) === null || _position$broker3 === void 0 ? void 0 : _position$broker3.filledQuantity) || 0)}"><div class="pending-paper-order-head"><strong>${escapeHtml(position.symbol)} · ALPACA</strong><span class="pending-paper-order-badge">BROKER GERÇEKLEŞMESİ BEKLENİYOR</span></div>${orderFillProgressMarkup(position.quantity, ((_position$broker4 = position.broker) === null || _position$broker4 === void 0 ? void 0 : _position$broker4.filledQuantity) || 0, {
        digits: 0
      })}<div class="decision-detail-grid"><span>İstenen: ${Number(position.quantity || 0)}</span><span>Gerçekleşen: ${Number(((_position$broker5 = position.broker) === null || _position$broker5 === void 0 ? void 0 : _position$broker5.filledQuantity) || 0)}</span><span>Broker durumu: ${escapeHtml(((_position$broker6 = position.broker) === null || _position$broker6 === void 0 ? void 0 : _position$broker6.status) || "accepted")}</span><span>Emir ID: ${escapeHtml(((_position$broker7 = position.broker) === null || _position$broker7 === void 0 ? void 0 : _position$broker7.brokerOrderId) || "—")}</span></div><button type="button" class="trading-button danger" data-nasdaq-broker-cancel="${escapeHtml(position.id)}">ALPACA EMRİNİ İPTAL ET</button></article>`;
    }), ...unprotected.map(position => `<article class="pending-paper-order-card"><div class="pending-paper-order-head"><strong>${escapeHtml(position.symbol)} · KORUMASIZ</strong><span class="pending-paper-order-badge">STOP DEVRE DIŞI</span></div><p>Alpaca stop emri dışarıdan iptal edildi. Pozisyon otomatik stop koruması olmadan açık.</p><button type="button" class="trading-button success" data-nasdaq-protection-enable="${escapeHtml(position.id)}">STOP KORUMASINI YENİDEN ETKİNLEŞTİR</button></article>`), ...discrepant.map(position => {
      var _position$broker8;
      return `<article class="pending-paper-order-card" data-nasdaq-reconcile-warning><div class="pending-paper-order-head"><strong>${escapeHtml(position.symbol)} · UZLAŞTIRMA UYARISI</strong><span class="pending-paper-order-badge">BROKER EŞLEŞMESİ YOK</span></div><p>${escapeHtml((_position$broker8 = position.broker) === null || _position$broker8 === void 0 ? void 0 : _position$broker8.brokerDiscrepancy)}</p><small>Güvenlik nedeniyle yerel pozisyon otomatik kapatılmadı; Alpaca hesabını kontrol edin.</small></article>`;
    })];
    if (cards.length) mount.insertAdjacentHTML("beforeend", cards.join(""));
    mount.querySelectorAll("[data-nasdaq-broker-cancel]").forEach(button => button.addEventListener("click", /*#__PURE__*/_asyncToGenerator(function* () {
      if (!window.confirm("Bu bekleyen Alpaca giriş emri iptal edilsin mi? Kısmen gerçekleşmiş miktar varsa açık pozisyon olarak korunur.")) return;
      try {
        renderNasdaqPaperState(yield nasdaqRequest("/api/nasdaq/broker-entry/cancel", {
          positionId: button.dataset.nasdaqBrokerCancel
        }));
      } catch (error) {
        window.alert(error.message);
      }
    }), {
      once: true
    }));
    mount.querySelectorAll("[data-nasdaq-protection-enable]").forEach(button => button.addEventListener("click", /*#__PURE__*/_asyncToGenerator(function* () {
      try {
        renderNasdaqPaperState(yield nasdaqRequest("/api/nasdaq/protection/enable", {
          positionId: button.dataset.nasdaqProtectionEnable
        }));
      } catch (error) {
        window.alert(error.message);
      }
    }), {
      once: true
    }));
  }
  function ensureNasdaqBrokerReconcileControl(paper) {
    let box = ns("brokerReconcileBox");
    if (!box) {
      var _box$querySelector;
      const anchor = ns("paperCostSummary");
      if (!anchor) return;
      box = document.createElement("div");
      box.id = "brokerReconcileBox";
      box.className = "paper-cost-summary";
      box.innerHTML = `<button type="button" class="trading-button" data-nasdaq-broker-reconcile>BROKER İLE UZLAŞTIR</button><span data-nasdaq-broker-reconcile-status>Henüz elle uzlaştırılmadı.</span>`;
      anchor.insertAdjacentElement("afterend", box);
      (_box$querySelector = box.querySelector("[data-nasdaq-broker-reconcile]")) === null || _box$querySelector === void 0 || _box$querySelector.addEventListener("click", /*#__PURE__*/function () {
        var _ref17 = _asyncToGenerator(function* (event) {
          const button = event.currentTarget;
          const status = box.querySelector("[data-nasdaq-broker-reconcile-status]");
          button.disabled = true;
          if (status) status.textContent = "Alpaca BorsaCI emirleri uzlaştırılıyor…";
          try {
            const payload = yield nasdaqRequest("/api/nasdaq/broker/reconcile", {});
            renderNasdaqPaperState(payload);
            const summary = payload.reconciliation || {};
            if (status) status.textContent = `${Number(summary.discovered || 0)} keşfedildi · ${Number(summary.linked || 0)} bağlandı · ${Number(summary.updated || 0)} güncellendi`;
          } catch (error) {
            if (status) status.textContent = `Uzlaştırma hatası: ${error.message}`;
            window.alert(error.message);
          } finally {
            button.disabled = false;
          }
        });
        return function (_x20) {
          return _ref17.apply(this, arguments);
        };
      }());
    }
    const summary = paper === null || paper === void 0 ? void 0 : paper.brokerReconciliation;
    const status = box.querySelector("[data-nasdaq-broker-reconcile-status]");
    if (summary && status) status.textContent = `${nasdaqLocalTime(summary.timestamp)} · ${Number(summary.discovered || 0)} keşif · ${Number(summary.linked || 0)} bağlantı · ${Number(summary.updated || 0)} güncelleme`;
  }
  function renderNasdaqPaperState(payload) {
    var _paper$broker, _paper$broker2, _paper$broker3, _paper$risk, _paper$risk2, _paper$risk3, _paper$risk4, _paper$risk5, _paper$risk6, _paper$scanner, _paper$scanner2, _paper$scanner3;
    const paper = (payload === null || payload === void 0 ? void 0 : payload.nasdaqPaper) || payload || {};
    latestNasdaqPaperState = paper;
    queueMicrotask(() => {
      renderNasdaqBrokerControls(paper);
      ensureNasdaqBrokerReconcileControl(paper);
    });
    nasdaqText("paperInitialCapital", formatNasdaqUsd(paper.initialCapital));
    nasdaqText("paperCash", formatNasdaqUsd(paper.cash));
    nasdaqText("paperEquity", formatNasdaqUsd(paper.equity));
    nasdaqText("paperPnL", formatNasdaqUsd(paper.pnl));
    nasdaqText("paperPnLPct", Number.isFinite(Number(paper.pnlPercent)) ? `${Number(paper.pnlPercent).toFixed(2)}%` : "—");
    nasdaqText("paperPositionCount", String((paper.history || []).filter(item => item.status === "CLOSED").length));
    nasdaqText("paperCostSummary", `ALPACA · ${((_paper$broker = paper.broker) === null || _paper$broker === void 0 ? void 0 : _paper$broker.dataFeed) || "SIP"} GÜNLÜK VERİ · ${((_paper$broker2 = paper.broker) === null || _paper$broker2 === void 0 ? void 0 : _paper$broker2.mode) || "PAPER"} ${(_paper$broker3 = paper.broker) !== null && _paper$broker3 !== void 0 && _paper$broker3.orderSubmissionEnabled ? "EMİR HATTI AÇIK" : "KÂĞIT MOD"} · 60 SN İŞLEM MONİTÖRÜ`);
    nasdaqText("maxPositions", String(((_paper$risk = paper.risk) === null || _paper$risk === void 0 ? void 0 : _paper$risk.maxPositions) || 5));
    nasdaqText("targetPositionSize", `${Number(((_paper$risk2 = paper.risk) === null || _paper$risk2 === void 0 ? void 0 : _paper$risk2.maxPositionPercent) || 20).toFixed(0)}%`);
    nasdaqText("cashReserve", `${Math.max(0, 100 - Number(((_paper$risk3 = paper.risk) === null || _paper$risk3 === void 0 ? void 0 : _paper$risk3.maxPositionPercent) || 20) * Number(((_paper$risk4 = paper.risk) === null || _paper$risk4 === void 0 ? void 0 : _paper$risk4.maxPositions) || 5)).toFixed(0)}%`);
    nasdaqText("stopRule", "YZ KARARI");
    const allocation = ns("maxPositionInput"),
      max = ns("maxPositionsInput"),
      capital = ns("riskCapitalInput");
    if (allocation) allocation.value = Number(((_paper$risk5 = paper.risk) === null || _paper$risk5 === void 0 ? void 0 : _paper$risk5.maxPositionPercent) || 20);
    if (max) max.value = Number(((_paper$risk6 = paper.risk) === null || _paper$risk6 === void 0 ? void 0 : _paper$risk6.maxPositions) || 5);
    if (capital) capital.value = Number(paper.initialCapital || 10000);
    const gauge = ns("riskAllocationGauge");
    if (gauge) {
      const total = Number((allocation === null || allocation === void 0 ? void 0 : allocation.value) || 0) * Number((max === null || max === void 0 ? void 0 : max.value) || 0);
      gauge.textContent = `${total}% TAHSİS`;
      gauge.classList.toggle("risk-overallocated", total > 100);
    }
    // Eski kayıtlardan kalmış tekrarlar olsa bile her onay panelinde yalnız son
    // taslak görünür. Sunucu yeni emir geldiğinde diğer taslakları da temizler.
    const pending = (paper.decisions || []).filter(item => {
      var _item$pendingOrder;
      return ["PENDING_APPROVAL", "PENDING_LIMIT"].includes(item.status) && String(((_item$pendingOrder = item.pendingOrder) === null || _item$pendingOrder === void 0 ? void 0 : _item$pendingOrder.source) || "").toUpperCase() !== "MANUAL";
    }).slice(0, 1);
    const manual = (paper.decisions || []).filter(item => {
      var _item$pendingOrder2;
      return ["PENDING_APPROVAL", "PENDING_LIMIT"].includes(item.status) && String(((_item$pendingOrder2 = item.pendingOrder) === null || _item$pendingOrder2 === void 0 ? void 0 : _item$pendingOrder2.source) || "").toUpperCase() === "MANUAL";
    }).slice(0, 1);
    const pendingBox = ns("pendingPaperOrders"),
      manualBox = ns("manualPendingOrders");
    nasdaqText("pendingPaperOrderStatus", `${pending.length} EMİR`);
    nasdaqText("manualOrderStatus", `${manual.length} EMİR`);
    if (pendingBox) pendingBox.innerHTML = pending.map(nasdaqPendingCard).join("") || '<div class="trading-empty">Bekleyen NASDAQ AI emri yok.</div>';
    if (manualBox) manualBox.innerHTML = manual.map(nasdaqPendingCard).join("") || '<div class="trading-empty">Bekleyen manuel NASDAQ emri yok.</div>';
    const positions = paper.positions || [];
    const tbody = ns("openPositions");
    nasdaqText("openPositionStatus", `${positions.length} POZİSYON`);
    if (tbody) tbody.innerHTML = positions.length ? positions.map(position => `<tr><td>${escapeHtml(position.symbol)}</td><td>LONG</td><td>${formatNasdaqUsd(position.entry)}</td><td>${formatNasdaqUsd(position.current)}</td><td>${Number(position.quantity)}</td><td>${formatNasdaqUsd(Number(position.current || position.entry) * Number(position.quantity || 0))}</td><td>${formatNasdaqUsd(position.stop)}</td><td>${formatNasdaqUsd(position.target1)}</td><td>${formatNasdaqUsd(position.target2)}</td><td>${formatNasdaqUsd((Number(position.current) - Number(position.entry)) * Number(position.quantity))}</td><td>AÇIK</td><td><button class="trading-button danger" data-nasdaq-action="close" data-nasdaq-position-id="${escapeHtml(position.id)}">KAPAT</button></td></tr>`).join("") : '<tr><td colspan="12" class="table-empty">Açık NASDAQ pozisyon yok</td></tr>';
    const activity = ns("tradingActivity"),
      journal = ns("tradeJournal");
    const activityRows = (paper.activity || []).slice(0, 100).map(item => `<div class="log-line"><span class="log-time">${new Date(item.timestamp).toLocaleTimeString("tr-TR")}</span><span>${escapeHtml(item.type || "İŞLEM")} · ${escapeHtml(item.message || "")}</span></div>`).join("") || '<div class="trading-empty">İşlem hareketi yok.</div>';
    if (activity) activity.innerHTML = activityRows;
    if (journal) journal.innerHTML = (paper.history || []).slice(0, 40).map(item => `<details><summary>${escapeHtml(item.symbol || "SEMBOL")} · ${escapeHtml(item.status || "KAYIT")} · ${nasdaqLocalTime(item.closedAt || item.timestamp)}</summary><p>Giriş: ${formatNasdaqUsd(item.entry)} · K/Z: ${formatNasdaqUsd(item.realizedPnl)}</p></details>`).join("") || '<div class="trading-empty">İşlem günlüğü bekleniyor.</div>';
    renderNasdaqKillSwitch(paper.killSwitch);
    renderNasdaqPerformance(paper);
    renderNasdaqScannerResults({
      scanned: (_paper$scanner = paper.scanner) === null || _paper$scanner === void 0 ? void 0 : _paper$scanner.scanned,
      successful: (_paper$scanner2 = paper.scanner) === null || _paper$scanner2 === void 0 ? void 0 : _paper$scanner2.successful,
      source: (_paper$scanner3 = paper.scanner) === null || _paper$scanner3 === void 0 ? void 0 : _paper$scanner3.source
    }, nasdaqRecords);
    bindNasdaqPaperActions();
  }
  function nasdaqRequest(_x21) {
    return _nasdaqRequest.apply(this, arguments);
  }
  function _nasdaqRequest() {
    _nasdaqRequest = _asyncToGenerator(function* (endpoint, body = null) {
      const response = yield fetch(endpoint, {
        method: body ? "POST" : "GET",
        headers: body ? {
          "Content-Type": "application/json"
        } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store"
      });
      const payload = yield response.json();
      if (!response.ok) throw new Error((payload === null || payload === void 0 ? void 0 : payload.error) || "NASDAQ işlemi tamamlanamadı.");
      return payload;
    });
    return _nasdaqRequest.apply(this, arguments);
  }
  function composeNasdaqAiRecords(records, decisions) {
    // Analiz kartı tarama anının değişmez snapshot'ıdır. Emir kararının status,
    // entry ve lifecycle alanları bunun üzerine yazılmaz; bunlar yalnız emir ve
    // açık pozisyon panellerinde gösterilir.
    const snapshots = Array.isArray(records) ? records.filter(Boolean).slice(0, 3) : [];
    if (snapshots.length) return snapshots.map(item => _objectSpread({}, item));
    // Eski state'lerde scanner snapshot'ı bulunmayabilir. Bu geri dönüş yalnız
    // ilk görüntü içindir ve karar nesnelerini birbirine bindirmez.
    return (Array.isArray(decisions) ? decisions : []).slice(0, 3).map(item => _objectSpread({}, item));
  }
  function loadNasdaqPaperState() {
    return _loadNasdaqPaperState.apply(this, arguments);
  } // Capture aşamasında çalışır; mevcut click handler API çağrısına başlamadan
  // önce eski state yenilemelerini geçersiz sayar.
  function _loadNasdaqPaperState() {
    _loadNasdaqPaperState = _asyncToGenerator(function* ({
      loadAnalysis = false
    } = {}) {
      if (!nasdaqTab) return;
      const generation = ++nasdaqStateLoadGeneration;
      try {
        var _data$nasdaqPaper, _data$nasdaqPaper2;
        const data = yield nasdaqRequest("/api/nasdaq/state");
        // Manuel tarama bu istek sürerken tamamlanmış olabilir. Bu eski state
        // cevabının yeni sonuçları geri almasına kesinlikle izin verme.
        if (generation !== nasdaqStateLoadGeneration) return;
        renderNasdaqPaperState(data);
        // Sayfa açılışında son kalıcı özet gösterilebilir; kullanıcı aynı sayfada
        // yeni tarama yaptıysa ayrıntılı mum/AI kartları sadece o taramanın
        // snapshot'ından çizilir. Böylece 10-15 sn sonra eski sonuç dönmez.
        if (!loadAnalysis || nasdaqLocalScannerSnapshotActive) return;
        nasdaqRecords = Array.isArray((_data$nasdaqPaper = data.nasdaqPaper) === null || _data$nasdaqPaper === void 0 || (_data$nasdaqPaper = _data$nasdaqPaper.scanner) === null || _data$nasdaqPaper === void 0 ? void 0 : _data$nasdaqPaper.results) ? data.nasdaqPaper.scanner.results : [];
        nasdaqAiRecords = composeNasdaqAiRecords(nasdaqRecords, (_data$nasdaqPaper2 = data.nasdaqPaper) === null || _data$nasdaqPaper2 === void 0 ? void 0 : _data$nasdaqPaper2.decisions);
        renderNasdaqDecisionCards(nasdaqAiRecords);
        if (nasdaqAiRecords[0]) renderNasdaqDetail(nasdaqAiRecords[0]);
      } catch (error) {
        const target = ns("scannerResults");
        if (target) target.innerHTML = `<div class="trading-empty">NASDAQ yapılandırması bekleniyor: ${escapeHtml(error.message)}</div>`;
      }
    });
    return _loadNasdaqPaperState.apply(this, arguments);
  }
  document.addEventListener("click", event => {
    const start = ns("startScannerBtn");
    if (start && (event.target === start || start.contains(event.target))) {
      nasdaqLocalScannerSnapshotActive = true;
      nasdaqStateLoadGeneration += 1;
    }
  }, true);
  function queueNasdaqDecision(_x22) {
    return _queueNasdaqDecision.apply(this, arguments);
  }
  function _queueNasdaqDecision() {
    _queueNasdaqDecision = _asyncToGenerator(function* (item) {
      var _paper$risk10;
      const plan = nasdaqPlan(item);
      const entry = nasdaqEntry(item);
      if (!Number.isFinite(Number(entry.low)) || !Number.isFinite(Number(plan.stopLoss))) {
        throw new Error("Bu NASDAQ adayında doğrulanmış giriş ve stop seviyesi yok.");
      }
      const paper = latestNasdaqPaperState || {};
      const quantity = Math.max(1, Math.floor(Number(paper.initialCapital || 10000) * Number(((_paper$risk10 = paper.risk) === null || _paper$risk10 === void 0 ? void 0 : _paper$risk10.maxPositionPercent) || 20) / 100 / Number(entry.low)));
      const data = yield nasdaqRequest("/api/nasdaq/paper/queue", {
        symbol: item.symbol,
        quantity,
        entryPrice: entry.low,
        orderType: "LIMIT",
        stop: plan.stopLoss,
        target1: plan.tp1,
        target2: plan.tp2,
        target3: plan.tp3,
        score: item.score,
        grade: item.grade,
        fibonacci: item.fibonacci,
        source: "NASDAQ AI"
      });
      renderNasdaqPaperState(data);
    });
    return _queueNasdaqDecision.apply(this, arguments);
  }
  function openNasdaqCloseDialog(_x23) {
    return _openNasdaqCloseDialog.apply(this, arguments);
  }
  function _openNasdaqCloseDialog() {
    _openNasdaqCloseDialog = _asyncToGenerator(function* (position) {
      var _document$getElementB23;
      (_document$getElementB23 = document.getElementById("nasdaqPaperCloseDialog")) === null || _document$getElementB23 === void 0 || _document$getElementB23.remove();
      const dialog = document.createElement("div");
      dialog.id = "nasdaqPaperCloseDialog";
      dialog.className = "paper-order-dialog-backdrop nasdaq-close-dialog-backdrop";
      dialog.innerHTML = `<section class="paper-order-dialog nasdaq-close-dialog" role="dialog" aria-modal="true" aria-label="NASDAQ satış emri">
    <header><strong>${escapeHtml(position.symbol)} · SATIŞ EMRİ</strong><button type="button" class="trading-button danger" data-nasdaq-close-dialog>×</button></header>
    <p>Varsayılan değerler açık pozisyondan gelir. Piyasa emri son tamamlanmış günlük Alpaca fiyatıyla; limit emri ise belirlediğin fiyata ulaştığında gerçekleşir.</p>
    <div class="paper-order-live-price" data-nasdaq-close-market-price>SON TAMAMLANMIŞ GÜNLÜK FİYAT: YÜKLENİYOR…</div>
    <form class="paper-order-form" data-nasdaq-close-order-form>
      <label>AÇIK MİKTAR<input name="openQuantity" value="${Number(position.quantity)}" disabled></label>
      <label>SATILACAK MİKTAR<input name="quantity" type="number" min="1" max="${Number(position.quantity)}" step="1" value="${Number(position.quantity)}" required></label>
      <label>GÜNCEL FİYAT ($)<input name="currentPrice" value="${Number(position.current || position.entry || 0)}" disabled></label>
      <label>EMİR TÜRÜ<select name="orderType"><option value="MARKET">PİYASA</option><option value="LIMIT">LİMİT</option></select></label>
      <label>LİMİT FİYAT ($)<input name="limitPrice" type="number" min="0.0001" step="0.0001" value="${Number(position.current || position.entry || "")}" disabled></label>
      <div class="paper-order-form-actions"><button type="submit" class="trading-button danger">SATIŞI ONAYLA</button><button type="button" class="trading-button" data-nasdaq-close-dialog>İPTAL</button></div>
    </form>
  </section>`;
      const form = dialog.querySelector("form");
      const orderType = form.elements.orderType;
      const limitPrice = form.elements.limitPrice;
      const currentPrice = form.elements.currentPrice;
      const livePrice = dialog.querySelector("[data-nasdaq-close-market-price]");
      const sync = () => {
        const market = orderType.value === "MARKET";
        limitPrice.disabled = market;
        limitPrice.required = !market;
      };
      orderType.addEventListener("change", sync);
      dialog.addEventListener("click", event => {
        if (event.target === dialog || event.target.closest("[data-nasdaq-close-dialog]")) dialog.remove();
      });
      form.addEventListener("submit", /*#__PURE__*/function () {
        var _ref40 = _asyncToGenerator(function* (event) {
          event.preventDefault();
          try {
            const data = yield nasdaqRequest("/api/nasdaq/paper/close", {
              positionId: position.id,
              quantity: Number(form.elements.quantity.value),
              orderType: orderType.value,
              limitPrice: orderType.value === "LIMIT" ? Number(limitPrice.value) : null
            });
            dialog.remove();
            renderNasdaqPaperState(data);
          } catch (error) {
            window.alert(error.message);
          }
        });
        return function (_x38) {
          return _ref40.apply(this, arguments);
        };
      }());
      document.body.append(dialog);
      sync();
      try {
        var _quote$quotes;
        const quote = yield nasdaqRequest(`/api/nasdaq/quotes?symbols=${encodeURIComponent(position.symbol)}`);
        const latest = quote === null || quote === void 0 || (_quote$quotes = quote.quotes) === null || _quote$quotes === void 0 ? void 0 : _quote$quotes[position.symbol];
        if (latest !== null && latest !== void 0 && latest.price) {
          currentPrice.value = Number(latest.price);
          if (orderType.value === "MARKET") limitPrice.value = Number(latest.price);
          livePrice.textContent = `SON TAMAMLANMIŞ GÜNLÜK FİYAT: ${formatNasdaqUsd(latest.price)}`;
        } else livePrice.textContent = "SON TAMAMLANMIŞ GÜNLÜK FİYAT: GEÇİCİ OLARAK ALINAMADI";
      } catch (_unused13) {
        livePrice.textContent = "SON TAMAMLANMIŞ GÜNLÜK FİYAT: GEÇİCİ OLARAK ALINAMADI";
      }
    });
    return _openNasdaqCloseDialog.apply(this, arguments);
  }
  function bindNasdaqInteractions() {
    nasdaqTab === null || nasdaqTab === void 0 || nasdaqTab.querySelectorAll("[data-nasdaq-decision-index],[data-nasdaq-history-index]").forEach(element => {
      if (element.dataset.nasdaqDetailBound) return;
      element.dataset.nasdaqDetailBound = "true";
      element.addEventListener("click", () => {
        const historyIndex = element.dataset.nasdaqHistoryIndex;
        if (historyIndex !== undefined) return renderNasdaqHistoryDetail(Number(historyIndex));
        const item = nasdaqAiRecords[Number(element.dataset.nasdaqDecisionIndex)];
        if (item) renderNasdaqDetail(item);
      });
    });
  }
  function bindNasdaqPaperActions() {
    nasdaqTab === null || nasdaqTab === void 0 || nasdaqTab.querySelectorAll("[data-nasdaq-action]").forEach(button => {
      if (button.dataset.nasdaqActionBound) return;
      button.dataset.nasdaqActionBound = "true";
      button.addEventListener("click", /*#__PURE__*/_asyncToGenerator(function* () {
        try {
          const action = button.dataset.nasdaqAction;
          if (action === "queue") {
            const item = nasdaqAiRecords[Number(button.dataset.nasdaqIndex)];
            if (item) yield queueNasdaqDecision(item);
            return;
          }
          if (action === "close") {
            var _latestNasdaqPaperSta5;
            const position = (((_latestNasdaqPaperSta5 = latestNasdaqPaperState) === null || _latestNasdaqPaperSta5 === void 0 ? void 0 : _latestNasdaqPaperSta5.positions) || []).find(item => item.id === button.dataset.nasdaqPositionId);
            if (position) openNasdaqCloseDialog(position);
            return;
          }
          const data = yield nasdaqRequest(`/api/nasdaq/paper/${action}`, {
            decisionId: button.dataset.nasdaqDecisionId
          });
          renderNasdaqPaperState(data);
        } catch (error) {
          window.alert(error.message);
        }
      }));
    });
    nasdaqTab === null || nasdaqTab === void 0 || nasdaqTab.querySelectorAll("[data-nasdaq-pending-form]").forEach(form => {
      if (form.dataset.nasdaqBound) return;
      form.dataset.nasdaqBound = "true";
      const type = form.elements.orderType,
        price = form.elements.entryPrice;
      type === null || type === void 0 || type.addEventListener("change", () => {
        const market = type.value === "MARKET";
        price.disabled = market;
        price.required = !market;
        if (market) price.value = "";
      });
      form.addEventListener("submit", /*#__PURE__*/function () {
        var _ref19 = _asyncToGenerator(function* (event) {
          event.preventDefault();
          try {
            const card = form.closest("[data-nasdaq-pending-card]"),
              data = Object.fromEntries(new FormData(form));
            if (data.orderType === "MARKET") data.entryPrice = null;
            const payload = yield nasdaqRequest("/api/nasdaq/paper/update", _objectSpread(_objectSpread({}, data), {}, {
              decisionId: card === null || card === void 0 ? void 0 : card.dataset.nasdaqDecisionId
            }));
            renderNasdaqPaperState(payload);
          } catch (error) {
            window.alert(error.message);
          }
        });
        return function (_x24) {
          return _ref19.apply(this, arguments);
        };
      }());
    });
  }
  function bindNasdaqWorkspaceControls() {
    if (!nasdaqTab) return;
    const start = ns("startScannerBtn"),
      stop = ns("stopScannerBtn");
    if (start && !start.dataset.nasdaqBound) {
      start.dataset.nasdaqBound = "true";
      start.addEventListener("click", /*#__PURE__*/_asyncToGenerator(function* () {
        if (start.disabled) return;
        const requestId = ++nasdaqScannerRequestId,
          jobId = `nasdaq-${Date.now()}`;
        nasdaqScannerAbortController = new AbortController();
        start.disabled = true;
        start.textContent = "TARANIYOR…";
        nasdaqText("scannerStatus", "TARANIYOR");
        nasdaqText("tradingEngineStatus", "TARANIYOR");
        nasdaqScannerPollTimer = window.setInterval(/*#__PURE__*/_asyncToGenerator(function* () {
          try {
            const job = yield nasdaqRequest(`/api/trading/scanner/status?jobId=${encodeURIComponent(jobId)}`);
            if (requestId !== nasdaqScannerRequestId) return;
            const results = ns("scannerResults");
            if (results && job.status !== "COMPLETE") results.innerHTML = `<div class="trading-empty scanner-progress"><strong>NASDAQ TARAMASI ÇALIŞIYOR</strong><br><small>${escapeHtml(job.message || "Hazırlanıyor")}</small><div style="height:8px;border:1px solid #2f6;background:#071008;margin:12px auto;max-width:480px"><div style="height:100%;width:${Math.max(0, Math.min(100, Number(job.progress) || 0))}%;background:#34ff75"></div></div></div>`;
          } catch (_unused1) {}
        }), 700);
        try {
          const data = yield nasdaqRequest(`/api/nasdaq/scanner?jobId=${encodeURIComponent(jobId)}`);
          nasdaqRecords = Array.isArray(data.results) ? data.results : [];
          nasdaqAiRecords = composeNasdaqAiRecords(nasdaqRecords, data.decisions);
          renderNasdaqPaperState(data);
          renderNasdaqDecisionCards(nasdaqAiRecords);
          renderNasdaqScannerResults(data, nasdaqRecords);
          if (nasdaqAiRecords[0]) renderNasdaqDetail(nasdaqAiRecords[0]);
          nasdaqText("scannerStatus", "TAMAMLANDI");
          nasdaqText("tradingEngineStatus", "HAZIR");
          nasdaqText("lastScanTime", new Date(data.timestamp).toLocaleTimeString("tr-TR"));
        } catch (error) {
          const results = ns("scannerResults");
          if (results) results.innerHTML = `<div class="trading-empty">NASDAQ tarama hatası: ${escapeHtml(error.message)}</div>`;
          nasdaqText("scannerStatus", "HATA");
          nasdaqText("tradingEngineStatus", "HATA");
        } finally {
          window.clearInterval(nasdaqScannerPollTimer);
          nasdaqScannerPollTimer = null;
          if (requestId === nasdaqScannerRequestId) {
            start.disabled = false;
            start.textContent = "TARAMAYI BAŞLAT";
            nasdaqScannerAbortController = null;
          }
        }
      }));
    }
    if (stop && !stop.dataset.nasdaqBound) {
      stop.dataset.nasdaqBound = "true";
      stop.addEventListener("click", () => {
        var _nasdaqScannerAbortCo;
        nasdaqScannerRequestId++;
        (_nasdaqScannerAbortCo = nasdaqScannerAbortController) === null || _nasdaqScannerAbortCo === void 0 || _nasdaqScannerAbortCo.abort();
        window.clearInterval(nasdaqScannerPollTimer);
        nasdaqText("scannerStatus", "DURDURULDU");
        nasdaqText("tradingEngineStatus", "HAZIR");
        if (start) {
          start.disabled = false;
          start.textContent = "TARAMAYI BAŞLAT";
        }
      });
    }
    const risk = ns("riskSettingsForm");
    if (risk && !risk.dataset.nasdaqBound) {
      risk.dataset.nasdaqBound = "true";
      risk.addEventListener("submit", /*#__PURE__*/function () {
        var _ref22 = _asyncToGenerator(function* (event) {
          event.preventDefault();
          try {
            var _ns5, _ns6, _ns7;
            const data = yield nasdaqRequest("/api/nasdaq/risk-settings", {
              capital: (_ns5 = ns("riskCapitalInput")) === null || _ns5 === void 0 ? void 0 : _ns5.value,
              maxPositionPercent: (_ns6 = ns("maxPositionInput")) === null || _ns6 === void 0 ? void 0 : _ns6.value,
              maxPositions: (_ns7 = ns("maxPositionsInput")) === null || _ns7 === void 0 ? void 0 : _ns7.value
            });
            renderNasdaqPaperState(data);
          } catch (error) {
            window.alert(error.message);
          }
        });
        return function (_x25) {
          return _ref22.apply(this, arguments);
        };
      }());
      ["maxPositionInput", "maxPositionsInput"].forEach(name => {
        var _ns8;
        return (_ns8 = ns(name)) === null || _ns8 === void 0 ? void 0 : _ns8.addEventListener("input", () => {
          var _ns9, _ns0;
          const gauge = ns("riskAllocationGauge"),
            total = Number(((_ns9 = ns("maxPositionInput")) === null || _ns9 === void 0 ? void 0 : _ns9.value) || 0) * Number(((_ns0 = ns("maxPositionsInput")) === null || _ns0 === void 0 ? void 0 : _ns0.value) || 0);
          if (gauge) {
            gauge.textContent = `${total}% TAHSİS`;
            gauge.classList.toggle("risk-overallocated", total > 100);
          }
        });
      });
    }
    const manual = ns("manualPaperOrderForm");
    if (manual && !manual.dataset.nasdaqBound) {
      manual.dataset.nasdaqBound = "true";
      const type = manual.elements.orderType,
        price = manual.elements.entryPrice,
        symbol = manual.elements.symbol;
      const quote = /*#__PURE__*/function () {
        var _ref23 = _asyncToGenerator(function* () {
          const value = String((symbol === null || symbol === void 0 ? void 0 : symbol.value) || "").trim().toUpperCase();
          if (!/^[A-Z]{1,8}$/.test(value)) return;
          try {
            var _data$quotes;
            const data = yield nasdaqRequest(`/api/nasdaq/quotes?symbols=${encodeURIComponent(value)}`);
            const current = (_data$quotes = data.quotes) === null || _data$quotes === void 0 ? void 0 : _data$quotes[value];
            let label = manual.querySelector(".manual-market-price");
            if (!label) {
              label = document.createElement("small");
              label.className = "manual-market-price";
              manual.prepend(label);
            }
            label.textContent = current ? `SON TAMAMLANMIŞ GÜNLÜK FİYAT: ${formatNasdaqUsd(current.price)} · ${current.source}` : "Fiyat alınamadı";
          } catch (_unused10) {}
        });
        return function quote() {
          return _ref23.apply(this, arguments);
        };
      }();
      const sync = () => {
        const market = (type === null || type === void 0 ? void 0 : type.value) === "MARKET";
        price.disabled = market;
        price.required = !market;
        if (market) price.value = "";
      };
      type === null || type === void 0 || type.addEventListener("change", sync);
      symbol === null || symbol === void 0 || symbol.addEventListener("change", quote);
      symbol === null || symbol === void 0 || symbol.addEventListener("input", () => {
        window.clearTimeout(manual._quoteTimer);
        manual._quoteTimer = window.setTimeout(quote, 400);
      });
      sync();
      manual.addEventListener("submit", /*#__PURE__*/function () {
        var _ref24 = _asyncToGenerator(function* (event) {
          event.preventDefault();
          try {
            const data = Object.fromEntries(new FormData(manual));
            if (data.orderType === "MARKET") data.entryPrice = null;
            const payload = yield nasdaqRequest("/api/nasdaq/paper/queue", _objectSpread(_objectSpread({}, data), {}, {
              source: "MANUAL",
              grade: "MANUEL"
            }));
            renderNasdaqPaperState(payload);
            manual.reset();
            sync();
          } catch (error) {
            window.alert(error.message);
          }
        });
        return function (_x26) {
          return _ref24.apply(this, arguments);
        };
      }());
    }
    ["performanceRange", "performanceStartDate", "performanceEndDate"].forEach(name => {
      var _ns1;
      return (_ns1 = ns(name)) === null || _ns1 === void 0 ? void 0 : _ns1.addEventListener("change", () => renderNasdaqPerformance(latestNasdaqPaperState || {}));
    });
    if (!nasdaqQuoteTimer) nasdaqQuoteTimer = window.setInterval(() => {
      if (latestNasdaqPaperState) renderNasdaqPaperState({
        nasdaqPaper: latestNasdaqPaperState
      });
    }, 30000);
  }
  function bindNasdaqKillSwitch() {
    const button = ns("killSwitchToggle");
    if (!button || button.dataset.nasdaqKillBound === "true") return;
    button.dataset.nasdaqKillBound = "true";
    button.addEventListener("click", /*#__PURE__*/_asyncToGenerator(function* () {
      var _ns10;
      const password = ((_ns10 = ns("killSwitchPassword")) === null || _ns10 === void 0 ? void 0 : _ns10.value) || "";
      const active = button.dataset.nasdaqKillActive === "true";
      if (!password) return window.alert("Acil durdurma şifresini girin.");
      button.disabled = true;
      try {
        const data = yield nasdaqRequest("/api/nasdaq/kill-switch", {
          password,
          action: active ? "deactivate" : "activate"
        });
        if (ns("killSwitchPassword")) ns("killSwitchPassword").value = "";
        renderNasdaqPaperState(data);
      } catch (error) {
        window.alert(`NASDAQ acil durdurma güncellenemedi: ${error.message}`);
      } finally {
        button.disabled = false;
      }
    }));
  }
  function bindNasdaqLogout() {
    const button = ns("logoutButton");
    if (!button || button.dataset.nasdaqLogoutBound === "true") return;
    button.hidden = false;
    button.dataset.nasdaqLogoutBound = "true";
    button.addEventListener("click", /*#__PURE__*/_asyncToGenerator(function* () {
      try {
        yield fetch("/api/auth/logout", {
          method: "POST"
        });
      } finally {
        window.location.reload();
      }
    }));
  }
  function cryptoPricePrecision(value) {
    const number = Math.abs(Number(value));
    if (!Number.isFinite(number) || number === 0) return 2;
    // Binance Spot prices can have far more precision than BIST prices. Keep
    // enough digits to distinguish the current price, entry, stop and targets
    // without forcing every large-cap coin into a long decimal representation.
    if (number < 0.000001) return 10;
    if (number < 0.00001) return 9;
    if (number < 0.0001) return 8;
    if (number < 0.001) return 7;
    if (number < 0.01) return 6;
    if (number < 0.1) return 5;
    if (number < 1) return 4;
    if (number < 100) return 4;
    return 2;
  }
  function cryptoChartPriceFormat(value) {
    const precision = cryptoPricePrecision(value);
    return {
      type: "price",
      precision,
      minMove: Math.pow(10, -precision)
    };
  }
  function formatCryptoUsd(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return "—";
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: cryptoPricePrecision(number)
    }).format(number);
  }
  function renderCryptoDecisionCards(records) {
    const feed = document.getElementById("cryptoDecisionFeed");
    if (!feed) return;
    feed.innerHTML = (records || []).map((item, index) => {
      const fib = item.fibonacci || {};
      const plan = fib.valid ? fib : item.fallbackPlan || {};
      const entryLow = fib.valid ? fib.entryZoneLow : plan.entryPrice;
      const entryHigh = fib.valid ? fib.entryZoneHigh : plan.entryPrice;
      return `<article class="decision-item decision-card" role="button" tabindex="0" data-crypto-decision-index="${index}"><header><strong>${escapeHtml(item.symbol)}</strong><span>TEKNİK ${Number(item.score || 0)}/100</span><span>${escapeHtml(translateTradingStatus(fib.status || "NO_VALID_STRUCTURE"))}</span></header><div class="decision-price-grid"><span><small>FİYAT</small>${formatCryptoUsd(item.price)}</span><span><small>RSI / ATR</small>${formatPrice(item.rsi)} / ${formatCryptoUsd(item.atr)}</span><span><small>FIBONACCI</small>${fib.valid ? "GEÇERLİ" : "YAPI YOK · ATR PLAN"}</span></div><div class="decision-summary">Giriş: ${formatCryptoUsd(entryLow)} – ${formatCryptoUsd(entryHigh)} · SL: ${formatCryptoUsd(plan.stopLoss)} · TP1/2/3: ${formatCryptoUsd(plan.tp1)} / ${formatCryptoUsd(plan.tp2)} / ${formatCryptoUsd(plan.tp3)}</div><button type="button" class="trading-button" data-crypto-live-action="prefill" data-crypto-decision-index="${index}">CANLI EMİR FORMUNA AKTAR</button></article>`;
    }).join("") || '<div class="trading-empty">Uygun kripto adayı bulunamadı.</div>';
    bindCryptoDecisionInteractions();
    bindCryptoPaperActions();
    bindCryptoLiveDecisionActions();
  }
  function restoreCryptoSavedScan(paper) {
    const scanner = (paper === null || paper === void 0 ? void 0 : paper.scanner) || {};
    const records = Array.isArray(scanner.results) ? scanner.results : [];
    if (!records.length || cryptoRenderedRecords.length) return;
    cryptoRenderedRecords = records;
    renderCryptoDecisionCards(records);
    renderCryptoDecisionDetail(records[0]);
    const timestamp = scanner.timestamp ? new Date(scanner.timestamp) : null;
    const results = document.getElementById("cryptoScannerResults");
    if (results) results.innerHTML = `<div class="trading-empty">Son tarama geri yüklendi · ${Number(scanner.scanned || 0)} Binance USDT paritesi · ${Number(scanner.successful || 0)} geçerli günlük veri</div>`;
    const status = document.getElementById("cryptoScannerStatus");
    const engine = document.getElementById("cryptoEngineStatus");
    const time = document.getElementById("cryptoLastScanTime");
    if (status) status.textContent = "SON TARAMA";
    if (engine) engine.textContent = "HAZIR";
    if (time && timestamp && !Number.isNaN(timestamp.getTime())) time.textContent = timestamp.toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }
  function renderCryptoPaperState(payload) {
    var _paper$risk7, _paper$risk8, _paper$risk9, _paper$risk0, _paper$risk1;
    const paper = (payload === null || payload === void 0 ? void 0 : payload.cryptoPaper) || payload || {};
    latestCryptoPaperState = paper;
    renderCryptoKillSwitch(paper.killSwitch || {});
    restoreCryptoSavedScan(paper);
    const setText = (id, value) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    };
    setText("cryptoPaperInitial", formatCryptoUsd(paper.initialCapital));
    setText("cryptoPaperCash", formatCryptoUsd(paper.cash));
    setText("cryptoPaperEquity", formatCryptoUsd(paper.equity));
    setText("cryptoPaperPnl", formatCryptoUsd(paper.pnl));
    setText("cryptoPaperPnlPct", Number.isFinite(Number(paper.pnlPercent)) ? `${Number(paper.pnlPercent).toFixed(2)}%` : "—");
    setText("cryptoPaperPositionCount", `${(paper.positions || []).filter(item => item.status === "OPEN").length} / ${Number(((_paper$risk7 = paper.risk) === null || _paper$risk7 === void 0 ? void 0 : _paper$risk7.maxPositions) || 5)}`);
    setText("cryptoPaperMonitorStatus", "BAĞLI · 60 SN İŞLEM MONİTÖRÜ");
    setText("cryptoRiskMax", Number(((_paper$risk8 = paper.risk) === null || _paper$risk8 === void 0 ? void 0 : _paper$risk8.maxPositions) || 5));
    setText("cryptoRiskAllocation", `${Number(((_paper$risk9 = paper.risk) === null || _paper$risk9 === void 0 ? void 0 : _paper$risk9.maxPositionPercent) || 20)}%`);
    const riskCapital = document.getElementById("cryptoRiskCapital");
    if (riskCapital) riskCapital.value = Number(paper.initialCapital || 10000);
    const riskAllocation = document.getElementById("cryptoRiskAllocationInput");
    if (riskAllocation) riskAllocation.value = Number(((_paper$risk0 = paper.risk) === null || _paper$risk0 === void 0 ? void 0 : _paper$risk0.maxPositionPercent) || 20);
    const riskMax = document.getElementById("cryptoRiskMaxInput");
    if (riskMax) riskMax.value = Number(((_paper$risk1 = paper.risk) === null || _paper$risk1 === void 0 ? void 0 : _paper$risk1.maxPositions) || 5);
    renderCryptoRiskGauge();
    const allPending = (paper.decisions || []).filter(item => ["PENDING_APPROVAL", "PENDING_LIMIT"].includes(item.status));
    renderCryptoLegacyPendingPlans(allPending);
    const pending = allPending.filter(item => {
      var _item$pendingOrder3;
      return String(((_item$pendingOrder3 = item.pendingOrder) === null || _item$pendingOrder3 === void 0 ? void 0 : _item$pendingOrder3.source) || item.source || "").toUpperCase() !== "MANUAL";
    });
    const manualPending = allPending.filter(item => {
      var _item$pendingOrder4;
      return String(((_item$pendingOrder4 = item.pendingOrder) === null || _item$pendingOrder4 === void 0 ? void 0 : _item$pendingOrder4.source) || item.source || "").toUpperCase() === "MANUAL";
    });
    const pendingMount = document.getElementById("cryptoPendingOrders");
    const renderPendingCards = items => items.slice(0, 1).map(item => {
      var _order$entryPrice, _order$stop, _order$target, _order$target2, _order$target3;
      const order = item.pendingOrder || {};
      const waiting = item.status === "PENDING_LIMIT";
      return `<article class="pending-paper-order-card${String(order.source || "").toUpperCase() === "MANUAL" ? " is-manual" : ""}" data-crypto-pending-card data-crypto-decision-id="${escapeHtml(item.id)}"><div class="pending-paper-order-head"><strong>${escapeHtml(item.symbol)} · ${String(order.source || "").toUpperCase() === "MANUAL" ? "MANUEL" : "YZ PLANI"}</strong><span class="pending-paper-order-badge">${waiting ? "LİMİT BEKLİYOR" : "ONAY BEKLİYOR"}</span></div><div class="paper-order-live-price" data-crypto-market-price data-crypto-symbol="${escapeHtml(item.symbol)}">CANLI PİYASA FİYATI: YÜKLENİYOR…</div><form class="paper-order-form" data-crypto-pending-form><label>MİKTAR<input name="quantity" type="number" min="0.00000001" step="any" value="${Number(order.quantity || 1)}" required${waiting ? " disabled" : ""}></label><label data-crypto-price-label>GİRİŞ FİYATI ($)<input name="entryPrice" type="number" min="0.00000001" step="any" value="${(_order$entryPrice = order.entryPrice) !== null && _order$entryPrice !== void 0 ? _order$entryPrice : ""}"${order.orderType === "MARKET" || waiting ? " disabled" : " required"}></label><label>EMİR TÜRÜ<select name="orderType"${waiting ? " disabled" : ""}><option value="MARKET"${order.orderType === "MARKET" ? " selected" : ""}>PİYASA</option><option value="LIMIT"${order.orderType === "LIMIT" ? " selected" : ""}>LİMİT</option></select></label><label>STOP<input name="stop" type="number" min="0.00000001" step="any" value="${(_order$stop = order.stop) !== null && _order$stop !== void 0 ? _order$stop : ""}"${waiting ? " disabled" : ""}></label><label>TP1<input name="target1" type="number" min="0.00000001" step="any" value="${(_order$target = order.target1) !== null && _order$target !== void 0 ? _order$target : ""}"${waiting ? " disabled" : ""}></label><label>TP2<input name="target2" type="number" min="0.00000001" step="any" value="${(_order$target2 = order.target2) !== null && _order$target2 !== void 0 ? _order$target2 : ""}"${waiting ? " disabled" : ""}></label><label>TP3<input name="target3" type="number" min="0.00000001" step="any" value="${(_order$target3 = order.target3) !== null && _order$target3 !== void 0 ? _order$target3 : ""}"${waiting ? " disabled" : ""}></label><div class="paper-order-form-actions">${waiting ? "<small>Limit fiyatına gelince sunucu tarafındaki işlem monitörü emri açar.</small>" : `<button type="submit" class="trading-button">AYARLARI KAYDET</button><button type="button" class="trading-button" data-crypto-paper-action="approve" data-crypto-decision-id="${escapeHtml(item.id)}">KÂĞIT EMRİ ONAYLA</button>`}<button type="button" class="trading-button danger" data-crypto-paper-action="reject" data-crypto-decision-id="${escapeHtml(item.id)}">REDDET</button><small>YALNIZCA KÂĞIT · Fiyat, miktar, emir türü, SL ve hedefler onaydan önce düzenlenebilir.</small></div></form></article>`;
    }).join("");
    setText("cryptoPendingStatus", `${pending.length} EMİR`);
    setText("cryptoManualOrderStatus", `${manualPending.length} EMİR`);
    if (pendingMount) pendingMount.innerHTML = pending.length ? renderPendingCards(pending) : '<div class="trading-empty">Bekleyen kripto YZ emri yok.</div>';
    const manualPendingMount = document.getElementById("cryptoManualPendingOrders");
    if (manualPendingMount) manualPendingMount.innerHTML = manualPending.length ? renderPendingCards(manualPending) : '<div class="trading-empty">Bekleyen manuel kripto emri yok.</div>';
    const positions = (paper.positions || []).filter(item => item.status === "OPEN");
    const tbody = document.getElementById("cryptoOpenPositions");
    setText("cryptoOpenStatus", `${positions.length} POZİSYON`);
    if (tbody) tbody.innerHTML = positions.length ? positions.map(item => {
      const pnl = (Number(item.current || item.entry) - Number(item.entry)) * Number(item.quantity);
      return `<tr><td>${escapeHtml(item.symbol)}</td><td>LONG</td><td>${formatCryptoUsd(item.entry)}</td><td>${formatCryptoUsd(item.current)}</td><td>${Number(item.quantity)}</td><td>${formatCryptoUsd(Number(item.entry) * Number(item.quantity))}</td><td>${formatCryptoUsd(item.stop)}</td><td>${formatCryptoUsd(item.target1)}</td><td>${formatCryptoUsd(item.target2)}</td><td>${formatCryptoUsd(pnl)}</td><td>AÇIK</td><td><button type="button" class="trading-button danger" data-crypto-paper-action="close" data-crypto-position-id="${escapeHtml(item.id)}">KAPAT</button></td></tr>`;
    }).join("") : '<tr><td colspan="12" class="table-empty">Açık kripto pozisyon yok</td></tr>';
    renderCryptoPersistentSignals(paper);
    const activity = document.getElementById("cryptoTradingActivity");
    if (activity) activity.innerHTML = (paper.activity || []).length ? paper.activity.slice(0, 8).map(item => `<div class="log-line"><span class="log-time">${escapeHtml(new Date(item.timestamp).toLocaleTimeString("tr-TR"))}</span><span>${escapeHtml(item.message || item.type || "İşlem kaydı")}</span></div>`).join("") : '<div class="trading-empty">İşlem hareketi yok.</div>';
    const journal = document.getElementById("cryptoTradeJournal");
    if (journal) journal.innerHTML = (paper.activity || []).length ? paper.activity.slice(0, 100).map(item => `<details><summary>${escapeHtml(item.type || "EVENT")} · ${escapeHtml(new Date(item.timestamp).toLocaleString("tr-TR"))}</summary><p>${escapeHtml(item.message || "")}</p></details>`).join("") : '<div class="trading-empty">İşlem günlüğü bekleniyor.</div>';
    bindCryptoPaperActions();
    void refreshCryptoQuotes();
  }
  function renderCryptoLegacyPendingPlans(items = []) {
    const status = document.getElementById("cryptoPaperPendingPlanStatus");
    const mount = document.getElementById("cryptoPaperPendingPlanOrders");
    if (!mount) return;
    const plans = Array.isArray(items) ? items : [];
    if (status) status.textContent = `${plans.length} PLAN`;
    if (!plans.length) {
      mount.innerHTML = '<div class="trading-empty">Kontrol paneline sayılacak bekleyen kripto kâğıt planı yok.</div>';
      return;
    }
    mount.innerHTML = plans.map(item => {
      var _order$quantity;
      const order = item.pendingOrder || {};
      const source = String(order.source || item.source || "KRİPTO PLANI").toUpperCase();
      const stage = item.status === "PENDING_LIMIT" ? "LİMİT PLAN" : "ONAY BEKLİYOR";
      return `<article class="pending-paper-order-card crypto-paper-pending-plan-card"><div class="pending-paper-order-head"><strong>${escapeHtml(item.symbol || "KRİPTO")} · ${escapeHtml(source)}</strong><span class="pending-paper-order-badge">${stage}</span></div><div class="decision-detail-grid"><span>Tür: ${escapeHtml(order.orderType || "MARKET")}</span><span>Miktar: ${escapeHtml(String((_order$quantity = order.quantity) !== null && _order$quantity !== void 0 ? _order$quantity : "—"))}</span><span>Planlanan fiyat: ${formatCryptoUsd(order.entryPrice)}</span></div><button type="button" class="trading-button danger" data-crypto-legacy-plan-cancel data-crypto-decision-id="${escapeHtml(item.id)}">PLANI İPTAL ET</button></article>`;
    }).join("");
    document.querySelectorAll("[data-crypto-legacy-plan-cancel]").forEach(button => {
      if (button.dataset.cryptoLegacyCancelBound === "true") return;
      button.dataset.cryptoLegacyCancelBound = "true";
      button.addEventListener("click", /*#__PURE__*/_asyncToGenerator(function* () {
        const decisionId = button.dataset.cryptoDecisionId;
        if (!decisionId || !window.confirm("Bu kâğıt plan iptal edilsin mi? Binance'e gerçek emir gönderilmez veya iptal edilmez.")) return;
        button.disabled = true;
        try {
          const response = yield fetch("/api/crypto/paper/reject", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              decisionId
            })
          });
          const payload = yield response.json().catch(() => ({}));
          if (!response.ok) throw new Error((payload === null || payload === void 0 ? void 0 : payload.error) || "Bekleyen kripto planı iptal edilemedi.");
          renderCryptoPaperState(payload);
          yield loadControlCenter();
        } catch (error) {
          window.alert(error.message);
        } finally {
          button.disabled = false;
        }
      }));
    });
  }
  function renderCryptoKillSwitch(killSwitch = {}) {
    const active = Boolean(killSwitch.active);
    const status = document.getElementById("cryptoKillSwitchStatus");
    const button = document.getElementById("cryptoKillSwitchToggle");
    if (status) status.textContent = active ? "AKTİF · YALNIZ KRİPTO YENİ EMİRLER DURDURULDU" : "GÜVENLİ · YENİ KRİPTO KÂĞIT İŞLEMLER AÇIK";
    if (!button) return;
    button.textContent = active ? "KRİPTO DURDURMAYI KAPAT" : "KRİPTO DURDURMAYI ETKİNLEŞTİR";
    button.classList.toggle("is-active", active);
  }
  function bindCryptoKillSwitch() {
    const button = document.getElementById("cryptoKillSwitchToggle");
    const passwordInput = document.getElementById("cryptoKillSwitchPassword");
    if (!button || button.dataset.cryptoKillBound === "true") return;
    button.dataset.cryptoKillBound = "true";
    button.addEventListener("click", /*#__PURE__*/_asyncToGenerator(function* () {
      var _latestCryptoPaperSta;
      const password = String((passwordInput === null || passwordInput === void 0 ? void 0 : passwordInput.value) || "");
      if (!password) return window.alert("Acil durdurma şifresini gir.");
      const active = Boolean((_latestCryptoPaperSta = latestCryptoPaperState) === null || _latestCryptoPaperSta === void 0 || (_latestCryptoPaperSta = _latestCryptoPaperSta.killSwitch) === null || _latestCryptoPaperSta === void 0 ? void 0 : _latestCryptoPaperSta.active);
      const confirmed = window.confirm(active ? "Yalnız kripto emir takibini yeniden açmak istiyor musun?" : "Yalnız kripto açık pozisyonlar kapatılacak ve kripto bekleyen emirleri iptal edilecek. Devam edilsin mi?");
      if (!confirmed) return;
      button.disabled = true;
      try {
        const response = yield fetch("/api/crypto/kill-switch", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            password,
            action: active ? "deactivate" : "activate"
          })
        });
        const payload = yield response.json();
        if (!response.ok) throw new Error((payload === null || payload === void 0 ? void 0 : payload.error) || "Kripto acil durdurma uygulanamadı.");
        if (passwordInput) passwordInput.value = "";
        renderCryptoPaperState(payload);
      } catch (error) {
        window.alert(error.message);
      } finally {
        button.disabled = false;
      }
    }));
  }
  function cryptoRangeStart() {
    var _document$getElementB6, _document$getElementB7;
    const range = ((_document$getElementB6 = document.getElementById("cryptoPerformanceRange")) === null || _document$getElementB6 === void 0 ? void 0 : _document$getElementB6.value) || "ALL";
    const custom = (_document$getElementB7 = document.getElementById("cryptoPerformanceStart")) === null || _document$getElementB7 === void 0 ? void 0 : _document$getElementB7.value;
    if (range === "CUSTOM") return custom ? new Date(`${custom}T00:00:00`).getTime() : null;
    const months = {
      "1M": 1,
      "3M": 3,
      "6M": 6
    }[range];
    if (!months) return null;
    const date = new Date();
    date.setMonth(date.getMonth() - months);
    return date.getTime();
  }
  function renderCryptoPersistentSignals(paper) {
    var _document$getElementB8, _document$getElementB9;
    const range = ((_document$getElementB8 = document.getElementById("cryptoPerformanceRange")) === null || _document$getElementB8 === void 0 ? void 0 : _document$getElementB8.value) || "ALL";
    const start = cryptoRangeStart();
    const endText = (_document$getElementB9 = document.getElementById("cryptoPerformanceEnd")) === null || _document$getElementB9 === void 0 ? void 0 : _document$getElementB9.value;
    const end = range === "CUSTOM" && endText ? new Date(`${endText}T23:59:59`).getTime() : null;
    const signals = (paper.signals || []).filter(item => {
      const time = new Date(item.timestamp || 0).getTime();
      return (!start || time >= start) && (!end || time <= end);
    });
    cryptoVisibleSignals = signals;
    const history = document.getElementById("cryptoSignalHistory");
    const status = document.getElementById("cryptoHistoryStatus");
    const average = signals.length ? signals.reduce((sum, item) => sum + Number(item.score || 0), 0) / signals.length : 0;
    const active = (paper.decisions || []).filter(item => ["PENDING_APPROVAL", "OPEN"].includes(item.status)).length;
    const closed = (paper.history || []).filter(item => item.status === "CLOSED");
    const wins = closed.filter(item => Number(item.realizedPnl || 0) > 0).length;
    const realized = closed.reduce((sum, item) => sum + Number(item.realizedPnl || 0), 0);
    const update = (id, value) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    };
    update("cryptoPerformanceScanned", signals.length);
    update("cryptoPerformanceValid", active);
    update("cryptoPerformanceBest", signals.length ? `${average.toFixed(1)}/100` : "—");
    update("cryptoPerformanceSelected", closed.length);
    update("cryptoPerformanceWinRate", closed.length ? `%${(wins * 100 / closed.length).toFixed(1)}` : "—");
    update("cryptoPerformanceRealized", formatCryptoUsd(realized));
    if (status) status.textContent = `${signals.length} KAYIT`;
    if (history) history.innerHTML = signals.length ? signals.slice(0, 50).map((item, index) => `<button type="button" class="signal-history-item" data-crypto-signal-index="${index}"><strong>${escapeHtml(item.symbol)}</strong><span>${escapeHtml(item.grade || "KARAR")} · TEKNİK ${Number(item.score || 0)}/100</span><small>${escapeHtml(translateTradingStatus(item.status || "NO_VALID_STRUCTURE"))} · ${escapeHtml(new Date(item.timestamp).toLocaleString("tr-TR"))}</small></button>`).join("") : '<div class="trading-empty">Bu tarih aralığında kayıtlı kripto sinyali yok.</div>';
    bindCryptoSignalHistoryDetails();
  }
  function cryptoHistoryDetailMarkup(item) {
    var _fib$pointA4, _fib$pointB4, _fib$pointC4;
    const fib = (item === null || item === void 0 ? void 0 : item.fibonacci) || {};
    const plan = fib.valid ? fib : (item === null || item === void 0 ? void 0 : item.fallbackPlan) || {};
    const entryLow = fib.valid ? fib.entryZoneLow : plan.entryPrice;
    const entryHigh = fib.valid ? fib.entryZoneHigh : plan.entryPrice;
    return `<strong>${escapeHtml((item === null || item === void 0 ? void 0 : item.symbol) || "KRİPTO")} · ${escapeHtml((item === null || item === void 0 ? void 0 : item.grade) || "KARAR")} · ${escapeHtml(translateTradingStatus((item === null || item === void 0 ? void 0 : item.status) || fib.status || "NO_VALID_STRUCTURE"))}</strong>
    <div>Fiyat: ${formatCryptoUsd(item === null || item === void 0 ? void 0 : item.price)} · Teknik puan: ${Number((item === null || item === void 0 ? void 0 : item.score) || 0)}/100</div>
    <div>Giriş: ${formatCryptoUsd(entryLow)}–${formatCryptoUsd(entryHigh)} · SL: ${formatCryptoUsd(plan.stopLoss)}</div>
    <div>TP1: ${formatCryptoUsd(plan.tp1)} · TP2: ${formatCryptoUsd(plan.tp2)} · TP3: ${formatCryptoUsd(plan.tp3)}</div>
    <div>A/B/C: ${formatCryptoUsd((_fib$pointA4 = fib.pointA) === null || _fib$pointA4 === void 0 ? void 0 : _fib$pointA4.price)} / ${formatCryptoUsd((_fib$pointB4 = fib.pointB) === null || _fib$pointB4 === void 0 ? void 0 : _fib$pointB4.price)} / ${formatCryptoUsd((_fib$pointC4 = fib.pointC) === null || _fib$pointC4 === void 0 ? void 0 : _fib$pointC4.price)} · Tetik: ${formatCryptoUsd(fib.entryTriggerPrice)}</div>
    <small>${escapeHtml((item === null || item === void 0 ? void 0 : item.reason) || (fib.valid ? "Fibonacci seviyeleri Binance günlük verisinden hesaplandı." : plan.message || "Geçerli Fibonacci yapısı bulunamadı; seviyeler destek/direnç ve ATR ile hesaplandı."))}</small>`;
  }
  function loadCryptoPaperState() {
    return _loadCryptoPaperState.apply(this, arguments);
  }
  function _loadCryptoPaperState() {
    _loadCryptoPaperState = _asyncToGenerator(function* () {
      try {
        const response = yield fetch("/api/crypto/state", {
          cache: "no-store"
        });
        if (!response.ok) return;
        renderCryptoPaperState(yield response.json());
      } catch (_unused14) {}
    });
    return _loadCryptoPaperState.apply(this, arguments);
  }
  function queueCryptoPaperDecision(_x27) {
    return _queueCryptoPaperDecision.apply(this, arguments);
  }
  function _queueCryptoPaperDecision() {
    _queueCryptoPaperDecision = _asyncToGenerator(function* (item) {
      var _latestCryptoPaperSta3, _latestCryptoPaperSta4;
      const fib = (item === null || item === void 0 ? void 0 : item.fibonacci) || {};
      const plan = fib.valid ? fib : (item === null || item === void 0 ? void 0 : item.fallbackPlan) || {};
      const price = Number(plan.entryPrice || fib.entryPrice || (item === null || item === void 0 ? void 0 : item.price));
      if (!item || !Number.isFinite(price) || price <= 0) return window.alert("Bu aday için doğrulanmış giriş fiyatı yok.");
      const quantity = Math.max(1, Math.floor(Number(((_latestCryptoPaperSta3 = latestCryptoPaperState) === null || _latestCryptoPaperSta3 === void 0 ? void 0 : _latestCryptoPaperSta3.initialCapital) || 10000) * Number(((_latestCryptoPaperSta4 = latestCryptoPaperState) === null || _latestCryptoPaperSta4 === void 0 || (_latestCryptoPaperSta4 = _latestCryptoPaperSta4.risk) === null || _latestCryptoPaperSta4 === void 0 ? void 0 : _latestCryptoPaperSta4.maxPositionPercent) || 20) / 100 / price));
      try {
        const response = yield fetch("/api/crypto/paper/queue", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            symbol: item.symbol,
            quantity,
            entryPrice: price,
            orderType: "MARKET",
            stop: plan.stopLoss,
            target1: plan.tp1,
            target2: plan.tp2,
            target3: plan.tp3,
            score: item.score,
            grade: item.grade,
            fibonacci: item.fibonacci,
            source: "CRYPTO AI"
          })
        });
        const payload = yield response.json();
        if (!response.ok) throw new Error((payload === null || payload === void 0 ? void 0 : payload.error) || "Kripto emri oluşturulamadı.");
        renderCryptoPaperState(payload);
      } catch (error) {
        window.alert(error.message);
      }
    });
    return _queueCryptoPaperDecision.apply(this, arguments);
  }
  function refreshCryptoQuotes() {
    return _refreshCryptoQuotes.apply(this, arguments);
  }
  function _refreshCryptoQuotes() {
    _refreshCryptoQuotes = _asyncToGenerator(function* () {
      const priceNodes = [...document.querySelectorAll("[data-crypto-market-price]")];
      const symbols = [...new Set(priceNodes.map(node => node.dataset.cryptoSymbol).filter(Boolean))];
      if (!symbols.length) return;
      try {
        const response = yield fetch(`/api/crypto/quotes?symbols=${encodeURIComponent(symbols.join(","))}`, {
          cache: "no-store"
        });
        const payload = yield response.json();
        if (!response.ok) throw new Error((payload === null || payload === void 0 ? void 0 : payload.error) || "Canlı fiyat alınamadı.");
        priceNodes.forEach(node => {
          var _payload$quotes;
          const quote = (_payload$quotes = payload.quotes) === null || _payload$quotes === void 0 ? void 0 : _payload$quotes[node.dataset.cryptoSymbol];
          node.textContent = quote ? `CANLI PİYASA FİYATI: ${formatCryptoUsd(quote.price)}` : "CANLI PİYASA FİYATI: GEÇİCİ OLARAK ALINAMADI";
        });
      } catch (_unused15) {
        priceNodes.forEach(node => {
          node.textContent = "CANLI PİYASA FİYATI: GEÇİCİ OLARAK ALINAMADI";
        });
      }
    });
    return _refreshCryptoQuotes.apply(this, arguments);
  }
  function refreshCryptoManualPrice() {
    return _refreshCryptoManualPrice.apply(this, arguments);
  }
  function _refreshCryptoManualPrice() {
    _refreshCryptoManualPrice = _asyncToGenerator(function* () {
      var _form$elements;
      const form = document.getElementById("cryptoManualOrderForm");
      let target = document.getElementById("cryptoManualLivePrice");
      if (!target && form) {
        var _form$querySelector;
        target = document.createElement("div");
        target.id = "cryptoManualLivePrice";
        target.className = "paper-order-live-price";
        (_form$querySelector = form.querySelector(".paper-order-form-actions")) === null || _form$querySelector === void 0 || _form$querySelector.before(target);
      }
      const symbol = String((form === null || form === void 0 || (_form$elements = form.elements) === null || _form$elements === void 0 || (_form$elements = _form$elements.symbol) === null || _form$elements === void 0 ? void 0 : _form$elements.value) || "").trim().toUpperCase();
      if (!target) return;
      if (!/^[A-Z0-9]{2,12}$/.test(symbol)) {
        target.textContent = "CANLI PİYASA FİYATI: PARİTE GİRİLMESİ BEKLENİYOR";
        return;
      }
      target.textContent = "CANLI PİYASA FİYATI: YÜKLENİYOR…";
      try {
        var _payload$quotes2;
        const response = yield fetch(`/api/crypto/quotes?symbols=${encodeURIComponent(symbol)}`, {
          cache: "no-store"
        });
        const payload = yield response.json();
        const quote = payload === null || payload === void 0 || (_payload$quotes2 = payload.quotes) === null || _payload$quotes2 === void 0 ? void 0 : _payload$quotes2[symbol];
        if (!response.ok || !quote) throw new Error("Fiyat alınamadı.");
        target.textContent = `CANLI PİYASA FİYATI: ${formatCryptoUsd(quote.price)}`;
      } catch (_unused16) {
        target.textContent = "CANLI PİYASA FİYATI: GEÇİCİ OLARAK ALINAMADI";
      }
    });
    return _refreshCryptoManualPrice.apply(this, arguments);
  }
  function bindCryptoSignalHistoryDetails() {
    document.querySelectorAll("#cryptoSignalHistory [data-crypto-signal-index]").forEach(button => {
      if (button.dataset.cryptoSignalBound === "true") return;
      button.dataset.cryptoSignalBound = "true";
      button.addEventListener("click", () => {
        var _signal$fibonacci;
        const signal = cryptoVisibleSignals[Number(button.dataset.cryptoSignalIndex)];
        if (!signal) return;
        const liveRecord = cryptoRenderedRecords.find(record => record.symbol === signal.symbol);
        const record = liveRecord || _objectSpread(_objectSpread({}, signal), {}, {
          price: signal.price || ((_signal$fibonacci = signal.fibonacci) === null || _signal$fibonacci === void 0 ? void 0 : _signal$fibonacci.entryPrice) || null,
          indicators: signal.indicators || {},
          history: signal.history || []
        });
        const detail = document.getElementById("cryptoSignalDetail");
        if (detail) detail.innerHTML = cryptoHistoryDetailMarkup(record);
      });
    });
  }
  function bindCryptoPaperActions() {
    document.querySelectorAll("[data-crypto-paper-action]").forEach(button => {
      if (button.dataset.cryptoPaperBound === "true") return;
      button.dataset.cryptoPaperBound = "true";
      button.addEventListener("click", /*#__PURE__*/_asyncToGenerator(function* () {
        const action = button.dataset.cryptoPaperAction;
        if (action === "queue") {
          const item = cryptoRenderedRecords[Number(button.dataset.cryptoDecisionIndex)];
          if (item) yield queueCryptoPaperDecision(item);
          return;
        }
        if (action === "close") {
          openCryptoCloseOrder(button.dataset.cryptoPositionId);
          return;
        }
        const endpoint = action === "approve" ? "/api/crypto/paper/approve" : "/api/crypto/paper/reject";
        const body = {
          decisionId: button.dataset.cryptoDecisionId
        };
        try {
          const response = yield fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
          });
          const payload = yield response.json();
          if (!response.ok) throw new Error((payload === null || payload === void 0 ? void 0 : payload.error) || "İşlem yapılamadı.");
          renderCryptoPaperState(payload);
        } catch (error) {
          window.alert(error.message);
        }
      }));
    });
    document.querySelectorAll("[data-crypto-pending-form]").forEach(form => {
      var _form$elements$namedI3;
      if (form.dataset.cryptoBound === "true") return;
      form.dataset.cryptoBound = "true";
      const sync = () => {
        var _form$elements$namedI2;
        const field = form.elements.namedItem("entryPrice");
        const market = String(((_form$elements$namedI2 = form.elements.namedItem("orderType")) === null || _form$elements$namedI2 === void 0 ? void 0 : _form$elements$namedI2.value) || "").toUpperCase() === "MARKET";
        if (field) {
          field.disabled = market;
          field.required = !market;
          if (market) field.value = "";
        }
      };
      (_form$elements$namedI3 = form.elements.namedItem("orderType")) === null || _form$elements$namedI3 === void 0 || _form$elements$namedI3.addEventListener("change", sync);
      sync();
      form.addEventListener("submit", /*#__PURE__*/function () {
        var _ref30 = _asyncToGenerator(function* (event) {
          event.preventDefault();
          const card = form.closest("[data-crypto-pending-card]");
          const data = Object.fromEntries(new FormData(form));
          if (String(data.orderType).toUpperCase() === "MARKET") data.entryPrice = null;
          try {
            const response = yield fetch("/api/crypto/paper/update", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify(_objectSpread(_objectSpread({}, data), {}, {
                decisionId: card === null || card === void 0 ? void 0 : card.dataset.cryptoDecisionId
              }))
            });
            const payload = yield response.json();
            if (!response.ok) throw new Error((payload === null || payload === void 0 ? void 0 : payload.error) || "Emir güncellenemedi.");
            renderCryptoPaperState(payload);
          } catch (error) {
            window.alert(error.message);
          }
        });
        return function (_x28) {
          return _ref30.apply(this, arguments);
        };
      }());
    });
  }
  function openCryptoCloseOrder(positionId) {
    var _latestCryptoPaperSta2, _document$getElementB0;
    const position = (((_latestCryptoPaperSta2 = latestCryptoPaperState) === null || _latestCryptoPaperSta2 === void 0 ? void 0 : _latestCryptoPaperSta2.positions) || []).find(item => item.id === positionId && item.status === "OPEN");
    if (!position) return window.alert("Bu pozisyon artık açık değil. Ekran güncel sunucu durumuyla yenilendi.");
    (_document$getElementB0 = document.getElementById("cryptoPaperCloseDialog")) === null || _document$getElementB0 === void 0 || _document$getElementB0.remove();
    const dialog = document.createElement("div");
    dialog.id = "cryptoPaperCloseDialog";
    dialog.className = "paper-order-dialog-backdrop";
    dialog.innerHTML = `<section class="paper-order-dialog" role="dialog" aria-modal="true" aria-label="Kripto pozisyon kapatma emri">
    <header><strong>${escapeHtml(position.symbol)} · SATIŞ EMRİ</strong><button type="button" class="trading-button danger" data-crypto-close-dialog>×</button></header>
    <p>Varsayılan değerler açık pozisyondan gelir. PİYASA, sunucunun doğruladığı son fiyatla; LİMİT ise fiyat limitine ulaştığında gerçekleşir.</p>
    <div class="paper-order-live-price" data-crypto-market-price data-crypto-symbol="${escapeHtml(position.symbol)}">CANLI PİYASA FİYATI: YÜKLENİYOR…</div>
    <form class="paper-order-form" data-crypto-close-order-form>
      <label>AÇIK MİKTAR<input name="openQuantity" value="${Number(position.quantity)}" disabled></label>
      <label>SATILACAK MİKTAR<input name="quantity" type="number" min="0.00000001" max="${Number(position.quantity)}" step="any" value="${Number(position.quantity)}" required></label>
      <label>GÜNCEL FİYAT ($)<input name="currentPrice" value="${Number(position.current || position.entry || 0)}" disabled></label>
      <label>EMİR TÜRÜ<select name="orderType"><option value="MARKET">PİYASA</option><option value="LIMIT">LİMİT</option></select></label>
      <label>LİMİT FİYAT ($)<input name="limitPrice" type="number" min="0.000001" step="any" value="${Number(position.current || position.entry || "")}" disabled></label>
      <div class="paper-order-form-actions"><button type="submit" class="trading-button danger">KÂĞIT POZİSYONU SAT</button><button type="button" class="trading-button" data-crypto-close-dialog>İPTAL</button></div>
    </form>
  </section>`;
    const sync = () => {
      const market = dialog.querySelector('[name="orderType"]').value === "MARKET";
      const limit = dialog.querySelector('[name="limitPrice"]');
      limit.disabled = market;
      limit.required = !market;
    };
    dialog.querySelector('[name="orderType"]').addEventListener("change", sync);
    dialog.addEventListener("click", event => {
      if (event.target === dialog || event.target.closest("[data-crypto-close-dialog]")) dialog.remove();
    });
    dialog.querySelector("form").addEventListener("submit", /*#__PURE__*/function () {
      var _ref31 = _asyncToGenerator(function* (event) {
        event.preventDefault();
        const form = event.currentTarget;
        const orderType = form.elements.orderType.value;
        try {
          const response = yield fetch("/api/crypto/paper/close", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              positionId: position.id,
              quantity: Number(form.elements.quantity.value),
              orderType,
              limitPrice: orderType === "LIMIT" ? Number(form.elements.limitPrice.value) : null
            })
          });
          const payload = yield response.json();
          if (!response.ok) throw new Error((payload === null || payload === void 0 ? void 0 : payload.error) || "Satış emri gerçekleştirilemedi.");
          renderCryptoPaperState(payload);
          dialog.remove();
        } catch (error) {
          window.alert(error.message);
        }
      });
      return function (_x29) {
        return _ref31.apply(this, arguments);
      };
    }());
    document.body.appendChild(dialog);
    sync();
    void refreshCryptoQuotes();
  }
  function renderCryptoRiskGauge() {
    var _document$getElementB1, _document$getElementB10;
    const gauge = document.getElementById("cryptoRiskAllocationGauge");
    if (!gauge) return;
    const allocation = Number(((_document$getElementB1 = document.getElementById("cryptoRiskAllocationInput")) === null || _document$getElementB1 === void 0 ? void 0 : _document$getElementB1.value) || 0) * Number(((_document$getElementB10 = document.getElementById("cryptoRiskMaxInput")) === null || _document$getElementB10 === void 0 ? void 0 : _document$getElementB10.value) || 0);
    gauge.textContent = `${allocation.toFixed(0)}% TAHSİS`;
    gauge.classList.toggle("is-over", allocation > 100);
    gauge.classList.toggle("is-safe", allocation <= 100);
    gauge.title = `Hedef pozisyon × azami işlem: toplam ${allocation.toFixed(2)}%`;
  }
  function bindCryptoWorkspaceControls() {
    const riskForm = document.getElementById("cryptoRiskSettingsForm");
    if (riskForm && riskForm.dataset.cryptoBound !== "true") {
      riskForm.dataset.cryptoBound = "true";
      riskForm.addEventListener("submit", /*#__PURE__*/function () {
        var _ref32 = _asyncToGenerator(function* (event) {
          event.preventDefault();
          try {
            var _document$getElementB11, _document$getElementB12, _document$getElementB13;
            const response = yield fetch("/api/crypto/risk-settings", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                capital: (_document$getElementB11 = document.getElementById("cryptoRiskCapital")) === null || _document$getElementB11 === void 0 ? void 0 : _document$getElementB11.value,
                maxPositionPercent: (_document$getElementB12 = document.getElementById("cryptoRiskAllocationInput")) === null || _document$getElementB12 === void 0 ? void 0 : _document$getElementB12.value,
                maxPositions: (_document$getElementB13 = document.getElementById("cryptoRiskMaxInput")) === null || _document$getElementB13 === void 0 ? void 0 : _document$getElementB13.value
              })
            });
            const payload = yield response.json();
            if (!response.ok) throw new Error((payload === null || payload === void 0 ? void 0 : payload.error) || "Risk ayarı kaydedilemedi.");
            renderCryptoPaperState(payload);
          } catch (error) {
            window.alert(error.message);
          }
        });
        return function (_x30) {
          return _ref32.apply(this, arguments);
        };
      }());
    }
    const manualForm = document.getElementById("cryptoManualOrderForm");
    const manualMount = document.getElementById("cryptoManualOrderMount");
    const manualWrap = document.querySelector("#cryptoTab .manual-paper-order-wrap");
    if (manualMount && manualWrap && manualWrap.parentElement !== manualMount) manualMount.appendChild(manualWrap);
    if (manualForm && manualForm.dataset.cryptoBound !== "true") {
      var _manualForm$elements$2, _manualForm$elements$3, _manualForm$elements$4;
      manualForm.dataset.cryptoBound = "true";
      const syncManualOrderType = () => {
        var _manualForm$elements$;
        const market = String(((_manualForm$elements$ = manualForm.elements.orderType) === null || _manualForm$elements$ === void 0 ? void 0 : _manualForm$elements$.value) || "").toUpperCase() === "MARKET";
        const price = manualForm.elements.entryPrice;
        const label = price === null || price === void 0 ? void 0 : price.closest("label");
        if (price) {
          price.disabled = market;
          price.required = !market;
          if (market) price.value = "";
        }
        if (label) label.firstChild.textContent = market ? "PİYASA FİYATI ($)" : "LİMİT FİYAT ($)";
      };
      (_manualForm$elements$2 = manualForm.elements.orderType) === null || _manualForm$elements$2 === void 0 || _manualForm$elements$2.addEventListener("change", syncManualOrderType);
      (_manualForm$elements$3 = manualForm.elements.symbol) === null || _manualForm$elements$3 === void 0 || _manualForm$elements$3.addEventListener("input", () => {
        window.clearTimeout(cryptoManualQuoteTimer);
        cryptoManualQuoteTimer = window.setTimeout(() => {
          void refreshCryptoManualPrice();
        }, 350);
      });
      (_manualForm$elements$4 = manualForm.elements.symbol) === null || _manualForm$elements$4 === void 0 || _manualForm$elements$4.addEventListener("change", () => {
        void refreshCryptoManualPrice();
      });
      syncManualOrderType();
      void refreshCryptoManualPrice();
      manualForm.addEventListener("submit", /*#__PURE__*/function () {
        var _ref33 = _asyncToGenerator(function* (event) {
          event.preventDefault();
          const data = Object.fromEntries(new FormData(manualForm));
          if (String(data.orderType).toUpperCase() === "MARKET") data.entryPrice = null;
          try {
            const response = yield fetch("/api/crypto/paper/queue", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify(_objectSpread(_objectSpread({}, data), {}, {
                source: "MANUAL",
                grade: "MANUEL"
              }))
            });
            const payload = yield response.json();
            if (!response.ok) throw new Error((payload === null || payload === void 0 ? void 0 : payload.error) || "Manuel emir oluşturulamadı.");
            renderCryptoPaperState(payload);
            manualForm.reset();
            syncManualOrderType();
            void refreshCryptoManualPrice();
          } catch (error) {
            window.alert(error.message);
          }
        });
        return function (_x31) {
          return _ref33.apply(this, arguments);
        };
      }());
    }
    const performanceRange = document.getElementById("cryptoPerformanceRange");
    if (performanceRange && performanceRange.dataset.cryptoBound !== "true") {
      performanceRange.dataset.cryptoBound = "true";
      performanceRange.addEventListener("change", () => renderCryptoPersistentSignals(latestCryptoPaperState || {}));
    }
    ["cryptoPerformanceStart", "cryptoPerformanceEnd"].forEach(id => {
      const element = document.getElementById(id);
      if (element && element.dataset.cryptoBound !== "true") {
        element.dataset.cryptoBound = "true";
        element.addEventListener("change", () => {
          if (performanceRange) performanceRange.value = "CUSTOM";
          renderCryptoPersistentSignals(latestCryptoPaperState || {});
        });
      }
    });
    ["cryptoRiskAllocationInput", "cryptoRiskMaxInput"].forEach(id => {
      const element = document.getElementById(id);
      if (element && element.dataset.cryptoGaugeBound !== "true") {
        element.dataset.cryptoGaugeBound = "true";
        element.addEventListener("input", renderCryptoRiskGauge);
      }
    });
    renderCryptoRiskGauge();
    const closeForm = document.getElementById("cryptoCloseOrderForm");
    if (closeForm && closeForm.dataset.cryptoBound !== "true") {
      closeForm.dataset.cryptoBound = "true";
      closeForm.addEventListener("submit", /*#__PURE__*/function () {
        var _ref34 = _asyncToGenerator(function* (event) {
          event.preventDefault();
          const data = Object.fromEntries(new FormData(closeForm));
          try {
            const response = yield fetch("/api/crypto/paper/close", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify(data)
            });
            const payload = yield response.json();
            if (!response.ok) throw new Error((payload === null || payload === void 0 ? void 0 : payload.error) || "Satış emri gerçekleştirilemedi.");
            renderCryptoPaperState(payload);
            document.getElementById("cryptoCloseOrderPanel").hidden = true;
          } catch (error) {
            window.alert(error.message);
          }
        });
        return function (_x32) {
          return _ref34.apply(this, arguments);
        };
      }());
    }
    const cancel = document.getElementById("cryptoCloseOrderCancel");
    if (cancel && cancel.dataset.cryptoBound !== "true") {
      cancel.dataset.cryptoBound = "true";
      cancel.addEventListener("click", () => {
        document.getElementById("cryptoCloseOrderPanel").hidden = true;
      });
    }
    if (!cryptoQuoteRefreshTimer) cryptoQuoteRefreshTimer = window.setInterval(() => {
      void refreshCryptoQuotes();
    }, 15000);
  }
  function renderCryptoDecisionChart(item) {
    const container = document.getElementById("cryptoDecisionChart");
    if (!container || typeof LightweightCharts === "undefined") return;
    try {
      var _candles$at, _lineStyle$Dashed2, _lineStyle$Dotted2, _lineStyle$Dotted3, _lineStyle$Solid2, _lineStyle$Solid3, _lineStyle$Solid4, _lineStyle$Solid5;
      if (cryptoMarketChart) cryptoMarketChart.remove();
      container.innerHTML = "";
      const candles = (item.history || []).slice(-150).map(candle => ({
        time: Number(candle.time),
        open: Number(candle.open),
        high: Number(candle.high),
        low: Number(candle.low),
        close: Number(candle.close)
      })).filter(candle => Number.isFinite(candle.time) && [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite));
      const referencePrice = Number(item.price) || Number((_candles$at = candles.at(-1)) === null || _candles$at === void 0 ? void 0 : _candles$at.close) || 1;
      cryptoMarketChart = LightweightCharts.createChart(container, {
        width: Math.max(280, container.clientWidth || 320),
        height: 300,
        layout: {
          background: {
            color: "#071008"
          },
          textColor: "#b8d9c0"
        },
        grid: {
          vertLines: {
            color: "rgba(72,255,104,.08)"
          },
          horzLines: {
            color: "rgba(72,255,104,.08)"
          }
        },
        rightPriceScale: {
          borderColor: "rgba(72,255,104,.25)"
        },
        timeScale: {
          borderColor: "rgba(72,255,104,.25)",
          timeVisible: false
        }
      });
      cryptoCandleSeries = cryptoMarketChart.addSeries(LightweightCharts.CandlestickSeries, {
        upColor: "#42d392",
        downColor: "#f05b6b",
        borderVisible: false,
        wickUpColor: "#42d392",
        wickDownColor: "#f05b6b",
        priceFormat: cryptoChartPriceFormat(referencePrice)
      });
      cryptoCandleSeries.setData(candles);
      const fib = item.fibonacci || {};
      const plan = fib.valid ? fib : item.fallbackPlan || {};
      const lineStyle = LightweightCharts.LineStyle || {};
      [[fib.valid ? fib.entryTriggerPrice : null, "FIB TETİK", "#76a9ff", (_lineStyle$Dashed2 = lineStyle.Dashed) !== null && _lineStyle$Dashed2 !== void 0 ? _lineStyle$Dashed2 : 2], [fib.valid ? fib.entryZoneLow : plan.entryPrice, fib.valid ? "GİRİŞ ALT" : "GİRİŞ", "#72dddd", (_lineStyle$Dotted2 = lineStyle.Dotted) !== null && _lineStyle$Dotted2 !== void 0 ? _lineStyle$Dotted2 : 1], [fib.valid ? fib.entryZoneHigh : null, "GİRİŞ ÜST", "#72dddd", (_lineStyle$Dotted3 = lineStyle.Dotted) !== null && _lineStyle$Dotted3 !== void 0 ? _lineStyle$Dotted3 : 1], [plan.stopLoss, "SL", "#ff6b6b", (_lineStyle$Solid2 = lineStyle.Solid) !== null && _lineStyle$Solid2 !== void 0 ? _lineStyle$Solid2 : 0], [plan.tp1, "TP1", "#78e58b", (_lineStyle$Solid3 = lineStyle.Solid) !== null && _lineStyle$Solid3 !== void 0 ? _lineStyle$Solid3 : 0], [plan.tp2, "TP2", "#78e58b", (_lineStyle$Solid4 = lineStyle.Solid) !== null && _lineStyle$Solid4 !== void 0 ? _lineStyle$Solid4 : 0], [plan.tp3, "TP3", "#78e58b", (_lineStyle$Solid5 = lineStyle.Solid) !== null && _lineStyle$Solid5 !== void 0 ? _lineStyle$Solid5 : 0]].forEach(([price, title, color, lineStyleValue]) => {
        if (Number.isFinite(Number(price)) && Number(price) > 0) cryptoCandleSeries.createPriceLine({
          price: Number(price),
          title,
          color,
          lineWidth: 1,
          lineStyle: lineStyleValue,
          axisLabelVisible: true
        });
      });
      const resistance = fib.valid ? fib.descendingResistance : null;
      if (resistance !== null && resistance !== void 0 && resistance.valid && resistance !== null && resistance !== void 0 && resistance.anchor1 && resistance !== null && resistance !== void 0 && resistance.anchor2 && resistance !== null && resistance !== void 0 && resistance.projectedPoint && LightweightCharts.LineSeries) {
        var _lineStyle$Dashed3;
        const trendLine = cryptoMarketChart.addSeries(LightweightCharts.LineSeries, {
          color: "#ff7979",
          lineWidth: 2,
          lineStyle: (_lineStyle$Dashed3 = lineStyle.Dashed) !== null && _lineStyle$Dashed3 !== void 0 ? _lineStyle$Dashed3 : 2,
          lastValueVisible: false,
          priceLineVisible: false
        });
        trendLine.setData([resistance.anchor1, resistance.anchor2, resistance.projectedPoint].map(point => ({
          time: Math.floor(new Date(point.date).getTime() / 1000),
          value: Number(point.price)
        })).filter(point => Number.isFinite(point.time) && Number.isFinite(point.value)));
      }
      const points = [[fib.pointA, "A", "belowBar", "#f8c35a"], [fib.pointB, "B", "aboveBar", "#76a9ff"], [fib.pointC, "C", "belowBar", "#ff7a7a"]].filter(([point]) => Number.isFinite(Number(point === null || point === void 0 ? void 0 : point.price)) && (point === null || point === void 0 ? void 0 : point.date)).map(([point, text, position, color]) => ({
        time: Math.floor(new Date(point.date).getTime() / 1000),
        position,
        color,
        shape: "circle",
        text
      }));
      if (points.length && typeof LightweightCharts.createSeriesMarkers === "function") cryptoChartMarkers = LightweightCharts.createSeriesMarkers(cryptoCandleSeries, points);
      cryptoMarketChart.timeScale().fitContent();
    } catch (error) {
      console.warn("CRYPTO CHART:", error.message);
      container.innerHTML = '<div class="trading-empty">Kripto grafik verisi oluşturulamadı.</div>';
    }
  }
  function renderCryptoScoreBreakdown(item) {
    var _breakdown$penalties2, _breakdown$penalties3;
    const symbol = document.getElementById("cryptoScoreSymbol");
    const content = document.getElementById("cryptoScoreContent");
    if (!symbol || !content) return;
    if (!item) {
      symbol.textContent = "KARAR YOK";
      content.textContent = "Bir kripto adayına dokunarak teknik puan kalemlerini burada gör.";
      return;
    }
    symbol.textContent = item.symbol || "SEMBOL YOK";
    const breakdown = item.scoreBreakdown || {};
    const buckets = [["Trend", breakdown.trend], ["Momentum", breakdown.momentum], ["Hacim / likidite", breakdown.volumeLiquidity], ["Giriş kalitesi", breakdown.entryQuality]];
    const rows = buckets.map(([label, bucket]) => {
      const factors = Array.isArray(bucket === null || bucket === void 0 ? void 0 : bucket.items) ? bucket.items.map(entry => escapeHtml(String((entry === null || entry === void 0 ? void 0 : entry.label) || entry))).join(" · ") : "Veri yok";
      return `<tr><th>${escapeHtml(label)}</th><td><strong>${Number((bucket === null || bucket === void 0 ? void 0 : bucket.score) || 0)}/${Number((bucket === null || bucket === void 0 ? void 0 : bucket.max) || 0)}</strong></td><td>${factors || "—"}</td></tr>`;
    }).join("");
    content.innerHTML = `<div class="decision-score-summary"><strong>TEKNİK ${Number(item.score || 0)}/100 · ${escapeHtml(item.grade || "KARAR")}</strong><span>Bu puan başarı olasılığı değildir.</span></div><div class="crypto-score-table-wrap"><table class="crypto-score-table"><thead><tr><th>BAŞLIK</th><th>PUAN</th><th>KANITLAR</th></tr></thead><tbody>${rows}<tr class="decision-score-penalty-row"><th>Cezalar</th><td><strong>${Number(((_breakdown$penalties2 = breakdown.penalties) === null || _breakdown$penalties2 === void 0 ? void 0 : _breakdown$penalties2.score) || 0)}</strong></td><td>${Array.isArray((_breakdown$penalties3 = breakdown.penalties) === null || _breakdown$penalties3 === void 0 ? void 0 : _breakdown$penalties3.items) ? breakdown.penalties.items.map(entry => escapeHtml(String((entry === null || entry === void 0 ? void 0 : entry.label) || entry))).join(" · ") : "Ceza yok"}</td></tr></tbody></table></div>`;
  }
  function renderCryptoDecisionDetail(item) {
    var _fib$pointA5, _fib$pointA6, _fib$pointB5, _fib$pointB6, _fib$pointC5, _fib$pointC6, _plan$riskRewardTp4, _plan$riskRewardTp5, _plan$riskRewardTp6;
    const detail = document.getElementById("cryptoDecisionDetail");
    const symbol = document.getElementById("cryptoDecisionSymbol");
    const chart = document.getElementById("cryptoDecisionChart");
    const chartSymbol = document.getElementById("cryptoChartSymbol");
    if (!detail || !item) return;
    const fib = item.fibonacci || {};
    const plan = fib.valid ? fib : item.fallbackPlan || {};
    const entryLow = fib.valid ? fib.entryZoneLow : plan.entryPrice;
    const entryHigh = fib.valid ? fib.entryZoneHigh : plan.entryPrice;
    if (symbol) symbol.textContent = item.symbol || "SEMBOL YOK";
    if (chartSymbol) chartSymbol.textContent = item.symbol || "SEMBOL YOK";
    if (chart) renderCryptoDecisionChart(item);
    renderCryptoScoreBreakdown(item);
    const index = cryptoRenderedRecords.indexOf(item);
    detail.innerHTML = `<strong>${escapeHtml(item.symbol)} · ${escapeHtml(item.grade || "KARAR")} · ${escapeHtml(translateTradingStatus(fib.status || "NO_VALID_STRUCTURE"))}</strong><div class="decision-detail-grid"><span>Son fiyat: ${formatCryptoUsd(item.price)}</span><span>RSI: ${formatPrice(item.rsi)} · ATR: ${formatCryptoUsd(item.atr)}</span><span>A: ${formatCryptoUsd((_fib$pointA5 = fib.pointA) === null || _fib$pointA5 === void 0 ? void 0 : _fib$pointA5.price)} · ${escapeHtml(chartDateKey((_fib$pointA6 = fib.pointA) === null || _fib$pointA6 === void 0 ? void 0 : _fib$pointA6.date) || "—")}</span><span>B: ${formatCryptoUsd((_fib$pointB5 = fib.pointB) === null || _fib$pointB5 === void 0 ? void 0 : _fib$pointB5.price)} · ${escapeHtml(chartDateKey((_fib$pointB6 = fib.pointB) === null || _fib$pointB6 === void 0 ? void 0 : _fib$pointB6.date) || "—")}</span><span>C: ${formatCryptoUsd((_fib$pointC5 = fib.pointC) === null || _fib$pointC5 === void 0 ? void 0 : _fib$pointC5.price)} · ${escapeHtml(chartDateKey((_fib$pointC6 = fib.pointC) === null || _fib$pointC6 === void 0 ? void 0 : _fib$pointC6.date) || "—")}</span><span>FIB TETİK: ${formatCryptoUsd(fib.entryTriggerPrice)}</span><span>Giriş bölgesi: ${formatCryptoUsd(entryLow)} – ${formatCryptoUsd(entryHigh)}</span><span>Stop: ${formatCryptoUsd(plan.stopLoss)}</span><span>TP1: ${formatCryptoUsd(plan.tp1)} · R/R ${(_plan$riskRewardTp4 = plan.riskRewardTp1) !== null && _plan$riskRewardTp4 !== void 0 ? _plan$riskRewardTp4 : "—"}</span><span>TP2: ${formatCryptoUsd(plan.tp2)} · R/R ${(_plan$riskRewardTp5 = plan.riskRewardTp2) !== null && _plan$riskRewardTp5 !== void 0 ? _plan$riskRewardTp5 : "—"}</span><span>TP3: ${formatCryptoUsd(plan.tp3)} · R/R ${(_plan$riskRewardTp6 = plan.riskRewardTp3) !== null && _plan$riskRewardTp6 !== void 0 ? _plan$riskRewardTp6 : "—"}</span><span>Teyit: ${fib.valid ? fib.confirmationPassed ? "GEÇTİ" : "BEKLİYOR" : "FIBONACCI YAPISI YOK"}</span></div><small>${escapeHtml(item.reason || (fib.valid ? "Fibonacci seviyeleri backend günlük OHLCV verisinden hesaplandı." : plan.message || "Geçerli Fibonacci yapısı bulunamadı; seviyeler destek/direnç ve ATR ile hesaplandı."))}</small>${index >= 0 ? `<br><button type="button" class="trading-button" data-crypto-live-action="prefill" data-crypto-decision-index="${index}">CANLI EMİR FORMUNA AKTAR</button>` : ""}`;
    bindCryptoPaperActions();
    bindCryptoLiveDecisionActions();
  }
  function renderCryptoScanSummary(data, records) {
    const history = document.getElementById("cryptoSignalHistory");
    const status = document.getElementById("cryptoHistoryStatus");
    const setText = (id, value) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    };
    setText("cryptoPerformanceScanned", Number(data.scanned || 0));
    setText("cryptoPerformanceValid", Number(data.successful || 0));
    setText("cryptoPerformanceBest", records.length ? `${Number(records[0].score || 0)}/100` : "—");
    setText("cryptoPerformanceSelected", records.length);
    if (status) status.textContent = `${records.length} KAYIT`;
    if (history && !latestCryptoPaperState) history.innerHTML = records.length ? records.map((item, index) => {
      var _item$fibonacci2;
      return `<button type="button" class="signal-history-item" data-crypto-history-index="${index}"><strong>${escapeHtml(item.symbol)}</strong><span>${escapeHtml(item.grade || "KARAR")} · TEKNİK ${Number(item.score || 0)}/100</span><small>${escapeHtml(translateTradingStatus(((_item$fibonacci2 = item.fibonacci) === null || _item$fibonacci2 === void 0 ? void 0 : _item$fibonacci2.status) || "NO_VALID_STRUCTURE"))} · ${new Date(data.timestamp).toLocaleString("tr-TR")}</small></button>`;
    }).join("") : '<div class="trading-empty">Kaydedilecek kripto adayı bulunamadı.</div>';
  }
  function bindCryptoDecisionInteractions() {
    document.querySelectorAll("#cryptoDecisionFeed [data-crypto-decision-index], [data-crypto-history-index]").forEach(element => {
      if (element.dataset.cryptoDetailBound === "true") return;
      element.dataset.cryptoDetailBound = "true";
      element.addEventListener("click", () => {
        var _element$dataset$cryp;
        const index = Number((_element$dataset$cryp = element.dataset.cryptoDecisionIndex) !== null && _element$dataset$cryp !== void 0 ? _element$dataset$cryp : element.dataset.cryptoHistoryIndex);
        const item = cryptoRenderedRecords[index];
        if (item) renderCryptoDecisionDetail(item);
      });
    });
  }
  function cryptoLiveOrderForm() {
    return document.getElementById("cryptoLiveOrderForm");
  }
  function renderCryptoSpotAccount(payload) {
    const status = document.getElementById("cryptoSpotConnectionStatus");
    const headerStatus = document.getElementById("cryptoSpotHeaderStatus");
    const summary = document.getElementById("cryptoSpotAccountSummary");
    const balances = document.getElementById("cryptoSpotBalances");
    if (!(payload !== null && payload !== void 0 && payload.connected)) {
      if (status) status.textContent = "BAĞLANTI HATASI";
      if (headerStatus) headerStatus.textContent = "BAĞLANTI HATASI";
      if (summary) {
        const error = (payload === null || payload === void 0 ? void 0 : payload.error) || {};
        const code = String(error.code || "BINANCE_ACCOUNT_UNAVAILABLE").replace(/[^A-Z0-9_]/g, "");
        summary.textContent = `${error.message || "Binance Spot hesabına bağlanılamadı."}${code ? ` · Kod: ${code}` : ""}`;
      }
      if (balances) balances.innerHTML = "";
      return;
    }
    const account = payload.account || {};
    if (status) status.textContent = account.canTrade ? "SPOT HAZIR" : "İŞLEM YETKİSİ KAPALI";
    if (headerStatus) headerStatus.textContent = account.canTrade ? "BAĞLI" : "YETKİ KAPALI";
    if (summary) summary.textContent = `${escapeHtml(account.type || "SPOT")} · ${account.canTrade ? "Spot işlem yetkisi açık" : "API anahtarında Spot işlem yetkisi kapalı"}`;
    const rows = Array.isArray(payload.balances) ? payload.balances : [];
    if (balances) balances.innerHTML = rows.length ? `<div class="crypto-spot-balance-grid">${rows.map(item => `<div><strong>${escapeHtml(item.asset)}</strong><span>Kullanılabilir: ${escapeHtml(String(item.free))}</span><span>Bloke: ${escapeHtml(String(item.locked))}</span></div>`).join("")}</div>` : '<div class="trading-empty">Sıfırdan büyük Spot bakiye bulunamadı.</div>';
  }
  function loadCryptoSpotAccount() {
    return _loadCryptoSpotAccount.apply(this, arguments);
  }
  function _loadCryptoSpotAccount() {
    _loadCryptoSpotAccount = _asyncToGenerator(function* () {
      const status = document.getElementById("cryptoSpotConnectionStatus");
      if (status) status.textContent = "KONTROL EDİLİYOR";
      try {
        const response = yield fetch("/api/trading/crypto/account", {
          cache: "no-store"
        });
        const payload = yield response.json();
        renderCryptoSpotAccount(payload);
        return payload;
      } catch (_unused17) {
        renderCryptoSpotAccount({
          connected: false,
          error: {
            message: "Binance Spot hesap bağlantısı kontrol edilemedi."
          }
        });
        return null;
      }
    });
    return _loadCryptoSpotAccount.apply(this, arguments);
  }
  function renderCryptoSpotOpenOrders(payload) {
    const status = document.getElementById("cryptoSpotOpenOrdersStatus");
    const mount = document.getElementById("cryptoSpotOpenOrders");
    const cancelAll = document.getElementById("cancelAllCryptoSpotOrders");
    if (!mount) return;
    if (!(payload !== null && payload !== void 0 && payload.connected)) {
      var _payload$error;
      latestCryptoSpotOpenOrders = [];
      if (status) status.textContent = "BAĞLANTI HATASI";
      if (cancelAll) cancelAll.disabled = true;
      mount.innerHTML = `<div class="trading-empty">${escapeHtml((payload === null || payload === void 0 || (_payload$error = payload.error) === null || _payload$error === void 0 ? void 0 : _payload$error.message) || "Binance açık emirleri alınamadı.")}</div>`;
      return;
    }
    const orders = Array.isArray(payload.orders) ? payload.orders : [];
    latestCryptoSpotOpenOrders = orders;
    if (status) status.textContent = `${orders.length} AÇIK EMİR`;
    if (cancelAll) cancelAll.disabled = orders.length === 0;
    mount.innerHTML = orders.length ? orders.map(order => `<article class="pending-paper-order-card crypto-spot-order-card"><div class="pending-paper-order-head"><strong>${escapeHtml(order.symbol)} · ${escapeHtml(order.side)} · ${escapeHtml(order.type)}</strong><span class="pending-paper-order-badge">${escapeHtml(order.status)}</span></div><div class="decision-detail-grid"><span>Fiyat: ${escapeHtml(order.price)}</span><span>Miktar: ${escapeHtml(order.origQty)}</span><span>Gerçekleşen: ${escapeHtml(order.executedQty)}</span><span>Zaman: ${escapeHtml(new Date(order.transactTime).toLocaleString("tr-TR"))}</span></div><button type="button" class="trading-button danger" data-crypto-live-cancel data-crypto-symbol="${escapeHtml(order.symbol)}" data-crypto-order-id="${escapeHtml(order.orderId)}">EMRİ İPTAL ET</button></article>`).join("") : '<div class="trading-empty">Binance Spot hesabında açık emir yok.</div>';
    bindCryptoSpotOrderCancelButtons();
    bindCryptoSpotCancelAllButton();
  }
  function loadCryptoSpotOpenOrders() {
    return _loadCryptoSpotOpenOrders.apply(this, arguments);
  }
  function _loadCryptoSpotOpenOrders() {
    _loadCryptoSpotOpenOrders = _asyncToGenerator(function* () {
      try {
        const response = yield fetch("/api/trading/crypto/open-orders", {
          cache: "no-store"
        });
        const payload = yield response.json();
        renderCryptoSpotOpenOrders(payload);
        return payload;
      } catch (_unused18) {
        renderCryptoSpotOpenOrders({
          connected: false,
          error: {
            message: "Binance açık emirleri alınamadı."
          }
        });
        return null;
      }
    });
    return _loadCryptoSpotOpenOrders.apply(this, arguments);
  }
  function formatCryptoSpotTimestamp(value) {
    const timestamp = Number(value);
    return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp).toLocaleString("tr-TR") : "—";
  }
  function renderCryptoSpotActivity(payload) {
    const status = document.getElementById("cryptoSpotActivityStatus");
    const mount = document.getElementById("cryptoSpotActivity");
    if (!mount) return;
    if (!(payload !== null && payload !== void 0 && payload.connected)) {
      var _payload$error2;
      if (status) status.textContent = "BAĞLANTI HATASI";
      mount.innerHTML = `<div class="trading-empty">${escapeHtml((payload === null || payload === void 0 || (_payload$error2 = payload.error) === null || _payload$error2 === void 0 ? void 0 : _payload$error2.message) || "Binance işlem kaydı alınamadı.")}</div>`;
      return;
    }
    const orders = Array.isArray(payload.orders) ? payload.orders : [];
    const trades = Array.isArray(payload.trades) ? payload.trades : [];
    if (status) status.textContent = `${escapeHtml(payload.symbol || "SPOT")} · ${trades.length} İŞLEM`;
    const orderRows = orders.length ? orders.map(order => `<div class="crypto-spot-activity-row"><strong>${escapeHtml(order.side)} · ${escapeHtml(order.type)} · ${escapeHtml(order.status)}</strong><span>${escapeHtml(order.origQty)} @ ${escapeHtml(order.price)}</span><small>${escapeHtml(formatCryptoSpotTimestamp(order.transactTime))}</small></div>`).join("") : '<div class="trading-empty">Bu parite için emir kaydı bulunamadı.</div>';
    const tradeRows = trades.length ? trades.map(trade => `<div class="crypto-spot-activity-row"><strong>${escapeHtml(trade.side)} · ${escapeHtml(trade.quantity)} @ ${escapeHtml(trade.price)}</strong><span>Toplam: ${escapeHtml(trade.quoteQuantity)} · Komisyon: ${escapeHtml(trade.commission)} ${escapeHtml(trade.commissionAsset)}</span><small>${escapeHtml(formatCryptoSpotTimestamp(trade.time))}</small></div>`).join("") : '<div class="trading-empty">Bu parite için gerçekleşen işlem bulunamadı.</div>';
    mount.innerHTML = `<section class="crypto-spot-activity-column"><h4>SON EMİRLER</h4><div class="crypto-spot-activity-list">${orderRows}</div></section><section class="crypto-spot-activity-column"><h4>SON GERÇEKLEŞENLER</h4><div class="crypto-spot-activity-list">${tradeRows}</div></section>`;
  }
  function loadCryptoSpotActivity(_x33) {
    return _loadCryptoSpotActivity.apply(this, arguments);
  }
  function _loadCryptoSpotActivity() {
    _loadCryptoSpotActivity = _asyncToGenerator(function* (symbol) {
      const input = document.getElementById("cryptoSpotActivitySymbol");
      const selectedSymbol = String(symbol || (input === null || input === void 0 ? void 0 : input.value) || "BTCUSDT").trim().toUpperCase();
      if (input) input.value = selectedSymbol;
      try {
        const response = yield fetch(`/api/trading/crypto/recent-activity?symbol=${encodeURIComponent(selectedSymbol)}`, {
          cache: "no-store"
        });
        const payload = yield response.json();
        renderCryptoSpotActivity(payload);
        return payload;
      } catch (_unused19) {
        renderCryptoSpotActivity({
          connected: false,
          error: {
            message: "Binance işlem kaydı alınamadı."
          }
        });
        return null;
      }
    });
    return _loadCryptoSpotActivity.apply(this, arguments);
  }
  function bindCryptoSpotActivity() {
    const button = document.getElementById("refreshCryptoSpotActivity");
    const input = document.getElementById("cryptoSpotActivitySymbol");
    if (button && button.dataset.cryptoSpotActivityBound !== "true") {
      button.dataset.cryptoSpotActivityBound = "true";
      button.addEventListener("click", () => {
        void loadCryptoSpotActivity();
      });
    }
    if (input && input.dataset.cryptoSpotActivityBound !== "true") {
      input.dataset.cryptoSpotActivityBound = "true";
      input.addEventListener("change", () => {
        void loadCryptoSpotActivity();
      });
    }
  }
  function bindCryptoSpotKillSwitch() {
    const button = document.getElementById("cryptoSpotKillSwitchButton");
    if (!button || button.dataset.cryptoSpotKillBound === "true") return;
    button.dataset.cryptoSpotKillBound = "true";
    button.addEventListener("click", /*#__PURE__*/_asyncToGenerator(function* () {
      var _document$getElementB14, _document$getElementB15;
      const password = ((_document$getElementB14 = document.getElementById("cryptoSpotKillSwitchPassword")) === null || _document$getElementB14 === void 0 ? void 0 : _document$getElementB14.value) || "";
      const confirmed = ((_document$getElementB15 = document.getElementById("cryptoSpotKillSwitchConfirm")) === null || _document$getElementB15 === void 0 ? void 0 : _document$getElementB15.checked) === true;
      const result = document.getElementById("cryptoSpotKillSwitchResult");
      if (!password) {
        window.alert("Acil durdurma şifresini girin.");
        return;
      }
      if (!confirmed) {
        window.alert("Açık emirlerin iptali için onay kutusunu işaretleyin.");
        return;
      }
      if (!window.confirm("Binance Spot hesabındaki açık emirler iptal edilecek. Cüzdan varlıkları SATILMAYACAK. Devam edilsin mi?")) return;
      button.disabled = true;
      button.textContent = "AÇIK EMİRLER İPTAL EDİLİYOR…";
      if (result) result.textContent = "Binance Spot açık emirleri kontrol ediliyor…";
      try {
        var _payload$error3;
        const response = yield fetch("/api/trading/crypto/kill-switch", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            password,
            confirm: true
          })
        });
        const payload = yield response.json();
        if (!response.ok) throw new Error((payload === null || payload === void 0 || (_payload$error3 = payload.error) === null || _payload$error3 === void 0 ? void 0 : _payload$error3.message) || "Binance Spot acil durdurma tamamlanamadı.");
        const failed = Array.isArray(payload.failed) ? payload.failed : [];
        if (result) result.textContent = `${payload.message || "Acil durdurma tamamlandı."}${failed.length ? ` ${failed.length} emir iptal edilemedi; açık emirleri kontrol edin.` : ""}`;
        const passwordInput = document.getElementById("cryptoSpotKillSwitchPassword");
        const confirmInput = document.getElementById("cryptoSpotKillSwitchConfirm");
        if (passwordInput) passwordInput.value = "";
        if (confirmInput) confirmInput.checked = false;
        yield Promise.all([loadCryptoSpotOpenOrders(), loadCryptoSpotAccount(), loadCryptoSpotActivity()]);
      } catch (error) {
        if (result) result.textContent = `ACİL DURDURMA BAŞARISIZ · ${error.message}`;
        window.alert(error.message);
      } finally {
        button.disabled = false;
        button.textContent = "AÇIK EMİRLERİ ACİLEN İPTAL ET";
      }
    }));
  }
  function refreshCryptoLivePrice() {
    return _refreshCryptoLivePrice.apply(this, arguments);
  }
  function _refreshCryptoLivePrice() {
    _refreshCryptoLivePrice = _asyncToGenerator(function* () {
      var _form$elements2;
      const form = cryptoLiveOrderForm();
      const output = document.getElementById("cryptoLiveMarketPrice");
      const symbol = String((form === null || form === void 0 || (_form$elements2 = form.elements) === null || _form$elements2 === void 0 || (_form$elements2 = _form$elements2.symbol) === null || _form$elements2 === void 0 ? void 0 : _form$elements2.value) || "").trim().toUpperCase();
      if (!output) return;
      if (!/^[A-Z0-9]{5,20}$/.test(symbol)) {
        output.textContent = "CANLI PİYASA FİYATI: GEÇERLİ PARİTE GİRİN";
        return;
      }
      output.textContent = "CANLI PİYASA FİYATI: YÜKLENİYOR…";
      try {
        var _payload$quotes3;
        const response = yield fetch(`/api/crypto/quotes?symbols=${encodeURIComponent(symbol)}`, {
          cache: "no-store"
        });
        const payload = yield response.json();
        const quote = payload === null || payload === void 0 || (_payload$quotes3 = payload.quotes) === null || _payload$quotes3 === void 0 ? void 0 : _payload$quotes3[symbol];
        if (!response.ok || !quote) throw new Error("Fiyat alınamadı.");
        output.textContent = `CANLI PİYASA FİYATI: ${formatCryptoUsd(quote.price)}`;
      } catch (_unused20) {
        output.textContent = "CANLI PİYASA FİYATI: GEÇİCİ OLARAK ALINAMADI";
      }
    });
    return _refreshCryptoLivePrice.apply(this, arguments);
  }
  function syncCryptoLiveOrderType() {
    var _form$elements$orderT;
    const form = cryptoLiveOrderForm();
    if (!form) return;
    const isMarket = String(((_form$elements$orderT = form.elements.orderType) === null || _form$elements$orderT === void 0 ? void 0 : _form$elements$orderT.value) || "").toUpperCase() === "MARKET";
    const price = form.elements.price;
    const label = document.querySelector("[data-crypto-live-price-label]");
    if (price) {
      price.disabled = isMarket;
      price.required = !isMarket;
      if (isMarket) price.value = "";
    }
    if (label) label.firstChild.textContent = isMarket ? "PİYASA FİYATI (USDT)" : "LİMİT FİYAT (USDT)";
  }
  function prefillCryptoLiveOrder(item) {
    var _document$getElementB16;
    const form = cryptoLiveOrderForm();
    if (!form || !item) return;
    const fib = item.fibonacci || {};
    const plan = fib.valid ? fib : item.fallbackPlan || {};
    const reference = Number(plan.entryPrice || fib.entryPrice || fib.entryZoneLow || item.price);
    form.elements.symbol.value = String(item.symbol || "").toUpperCase();
    form.elements.side.value = "BUY";
    form.elements.orderType.value = "LIMIT";
    form.elements.price.value = Number.isFinite(reference) && reference > 0 ? String(reference) : "";
    form.elements.quantity.value = "";
    const confirmation = document.getElementById("cryptoLiveOrderConfirm");
    if (confirmation) confirmation.checked = false;
    syncCryptoLiveOrderType();
    void refreshCryptoLivePrice();
    (_document$getElementB16 = document.getElementById("cryptoLiveOrderPanel")) === null || _document$getElementB16 === void 0 || _document$getElementB16.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }
  function bindCryptoLiveDecisionActions() {
    document.querySelectorAll("[data-crypto-live-action=\"prefill\"]").forEach(button => {
      if (button.dataset.cryptoLiveBound === "true") return;
      button.dataset.cryptoLiveBound = "true";
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        const item = cryptoRenderedRecords[Number(button.dataset.cryptoDecisionIndex)];
        if (item) prefillCryptoLiveOrder(item);
      });
    });
  }
  function bindCryptoSpotOrderCancelButtons() {
    document.querySelectorAll("[data-crypto-live-cancel]").forEach(button => {
      if (button.dataset.cryptoCancelBound === "true") return;
      button.dataset.cryptoCancelBound = "true";
      button.addEventListener("click", /*#__PURE__*/_asyncToGenerator(function* () {
        const symbol = String(button.dataset.cryptoSymbol || "");
        const orderId = String(button.dataset.cryptoOrderId || "");
        if (!window.confirm(`${symbol} emrini Binance Spot'ta gerçekten iptal etmek istiyor musun?`)) return;
        button.disabled = true;
        try {
          yield cancelCryptoSpotOrder(symbol, orderId);
          yield Promise.all([loadCryptoSpotOpenOrders(), loadCryptoSpotAccount(), loadCryptoSpotActivity(symbol)]);
        } catch (error) {
          window.alert(error.message);
        } finally {
          button.disabled = false;
        }
      }));
    });
  }
  function cancelCryptoSpotOrder(_x34, _x35) {
    return _cancelCryptoSpotOrder.apply(this, arguments);
  }
  function _cancelCryptoSpotOrder() {
    _cancelCryptoSpotOrder = _asyncToGenerator(function* (symbol, orderId) {
      const response = yield fetch("/api/trading/crypto/order/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          symbol,
          orderId,
          confirm: true
        })
      });
      const payload = yield response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        var _payload$error5;
        throw new Error((payload === null || payload === void 0 || (_payload$error5 = payload.error) === null || _payload$error5 === void 0 ? void 0 : _payload$error5.message) || "Binance emri iptal edilemedi.");
      }
      return payload;
    });
    return _cancelCryptoSpotOrder.apply(this, arguments);
  }
  function bindCryptoSpotCancelAllButton() {
    const button = document.getElementById("cancelAllCryptoSpotOrders");
    if (!button || button.dataset.cryptoCancelAllBound === "true") return;
    button.dataset.cryptoCancelAllBound = "true";
    button.addEventListener("click", /*#__PURE__*/_asyncToGenerator(function* () {
      const orders = latestCryptoSpotOpenOrders.slice();
      if (!orders.length) return;
      if (!window.confirm(`${orders.length} açık Binance Spot emrinin tamamı iptal edilecek. Devam edilsin mi?`)) return;
      button.disabled = true;
      const failures = [];
      for (const order of orders) {
        try {
          yield cancelCryptoSpotOrder(String(order.symbol || ""), String(order.orderId || ""));
        } catch (error) {
          failures.push(`${order.symbol || "EMİR"}: ${error.message || "iptal edilemedi"}`);
        }
      }
      yield Promise.all([loadCryptoSpotOpenOrders(), loadCryptoSpotAccount(), loadCryptoSpotActivity()]);
      if (failures.length) window.alert(`Bazı emirler iptal edilemedi:\n${failures.join("\n")}`);
    }));
  }
  function bindCryptoLiveTrading() {
    var _form$elements$orderT2, _form$elements$symbol;
    const refresh = document.getElementById("refreshCryptoSpotAccount");
    if (refresh && refresh.dataset.cryptoLiveBound !== "true") {
      refresh.dataset.cryptoLiveBound = "true";
      refresh.addEventListener("click", () => {
        void Promise.all([loadCryptoSpotAccount(), loadCryptoSpotOpenOrders(), loadCryptoSpotActivity()]);
      });
    }
    const form = cryptoLiveOrderForm();
    if (!form || form.dataset.cryptoLiveBound === "true") return;
    form.dataset.cryptoLiveBound = "true";
    let quoteTimer = null;
    (_form$elements$orderT2 = form.elements.orderType) === null || _form$elements$orderT2 === void 0 || _form$elements$orderT2.addEventListener("change", syncCryptoLiveOrderType);
    (_form$elements$symbol = form.elements.symbol) === null || _form$elements$symbol === void 0 || _form$elements$symbol.addEventListener("input", () => {
      window.clearTimeout(quoteTimer);
      quoteTimer = window.setTimeout(() => {
        void refreshCryptoLivePrice();
      }, 350);
    });
    form.addEventListener("submit", /*#__PURE__*/function () {
      var _ref38 = _asyncToGenerator(function* (event) {
        var _document$getElementB17;
        event.preventDefault();
        const result = document.getElementById("cryptoLiveOrderResult");
        const data = Object.fromEntries(new FormData(form));
        const isMarket = String(data.orderType || "").toUpperCase() === "MARKET";
        if (isMarket) data.price = null;
        data.confirm = ((_document$getElementB17 = document.getElementById("cryptoLiveOrderConfirm")) === null || _document$getElementB17 === void 0 ? void 0 : _document$getElementB17.checked) === true;
        if (!data.confirm) {
          window.alert("Gerçek emir için onay kutusunu işaretleyin.");
          return;
        }
        const readable = `${String(data.symbol || "").toUpperCase()} · ${data.side === "SELL" ? "SAT" : "AL"} · ${isMarket ? "PİYASA" : `LİMİT ${data.price}`} · miktar ${data.quantity}`;
        if (!window.confirm(`Bu gerçek Binance Spot emrini göndermek istiyor musun?\n\n${readable}`)) return;
        const submit = document.getElementById("submitCryptoLiveOrder");
        if (submit) {
          submit.disabled = true;
          submit.textContent = "BİNANCE’E GÖNDERİLİYOR…";
        }
        if (result) result.textContent = "Emir Binance’e gönderiliyor…";
        try {
          var _payload$error4;
          const response = yield fetch("/api/trading/crypto/order", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(data)
          });
          const payload = yield response.json();
          if (!response.ok || !payload.success) throw new Error((payload === null || payload === void 0 || (_payload$error4 = payload.error) === null || _payload$error4 === void 0 ? void 0 : _payload$error4.message) || "Binance emri gönderilemedi.");
          const order = payload.order || {};
          if (result) result.textContent = `EMİR KAYDEDİLDİ · ${order.symbol} · ${order.side} · ${order.type} · ${order.status} · ID ${order.orderId}`;
          form.reset();
          form.elements.symbol.value = order.symbol || "BTCUSDT";
          form.elements.orderType.value = "MARKET";
          form.elements.side.value = "BUY";
          syncCryptoLiveOrderType();
          void refreshCryptoLivePrice();
          yield Promise.all([loadCryptoSpotOpenOrders(), loadCryptoSpotAccount(), loadCryptoSpotActivity(order.symbol)]);
        } catch (error) {
          if (result) result.textContent = `EMİR GÖNDERİLEMEDİ · ${error.message}`;
          window.alert(error.message);
        } finally {
          if (submit) {
            submit.disabled = false;
            submit.textContent = "BİNANCE’E GERÇEK EMİR GÖNDER";
          }
        }
      });
      return function (_x36) {
        return _ref38.apply(this, arguments);
      };
    }());
    syncCryptoLiveOrderType();
    void refreshCryptoLivePrice();
    void loadCryptoLiveSafety();
  }
  function loadCryptoLiveSafety() {
    return _loadCryptoLiveSafety.apply(this, arguments);
  }
  function _loadCryptoLiveSafety() {
    _loadCryptoLiveSafety = _asyncToGenerator(function* () {
      const mount = document.getElementById("cryptoLiveSafetyInfo");
      if (!mount) return;
      try {
        const response = yield fetch("/api/trading/crypto/safety", {
          cache: "no-store"
        });
        const payload = yield response.json();
        if (!response.ok || !(payload !== null && payload !== void 0 && payload.connected)) throw new Error("Canlı Spot güvenlik politikası alınamadı.");
        const policy = payload.policy || {};
        mount.textContent = `SUNUCU KORUMASI · Son onay zorunlu · Emir üst sınırı ${Number(policy.maxOrderNotionalUsdt || 0).toLocaleString("tr-TR", {
          maximumFractionDigits: 2
        })} USDT · Limit sapması en fazla %${Number(policy.maxLimitDeviationPercent || 0).toLocaleString("tr-TR")} · Aynı emir ${Number(policy.duplicateWindowSeconds || 0)} sn içinde tekrar gönderilmez.`;
      } catch (_unused21) {
        mount.textContent = "CANLI EMİR KORUMASI SUNUCUDAN DOĞRULANAMADI. Emir göndermeden önce bağlantıyı kontrol edin.";
      }
    });
    return _loadCryptoLiveSafety.apply(this, arguments);
  }
  function runCryptoScanner() {
    return _runCryptoScanner.apply(this, arguments);
  }
  function _runCryptoScanner() {
    _runCryptoScanner = _asyncToGenerator(function* () {
      var _window$crypto2, _window$crypto2$rando;
      const button = document.getElementById("startCryptoScannerBtn");
      const status = document.getElementById("cryptoScannerStatus");
      const engine = document.getElementById("cryptoEngineStatus");
      const results = document.getElementById("cryptoScannerResults");
      const feed = document.getElementById("cryptoDecisionFeed");
      if (!button || button.disabled) return;
      const requestId = ++cryptoScannerRequestId;
      cryptoScannerAbortController = new AbortController();
      const jobId = ((_window$crypto2 = window.crypto) === null || _window$crypto2 === void 0 || (_window$crypto2$rando = _window$crypto2.randomUUID) === null || _window$crypto2$rando === void 0 ? void 0 : _window$crypto2$rando.call(_window$crypto2)) || `crypto-${Date.now()}`;
      button.disabled = true;
      button.textContent = "TARANIYOR…";
      if (status) status.textContent = "TARANIYOR";
      if (engine) engine.textContent = "TARANIYOR";
      cryptoScannerPollTimer = window.setInterval(/*#__PURE__*/_asyncToGenerator(function* () {
        try {
          const response = yield fetch(`/api/trading/scanner/status?jobId=${encodeURIComponent(jobId)}`, {
            cache: "no-store"
          });
          const job = yield response.json();
          if (requestId !== cryptoScannerRequestId) return;
          if (results && job.status !== "COMPLETE") results.innerHTML = `<div class="trading-empty scanner-progress"><strong>KRİPTO TARAMASI ÇALIŞIYOR</strong><br><small>${escapeHtml(String(job.message || "Hazırlanıyor"))}</small><div style="height:8px;border:1px solid #2f6;background:#071008;margin:12px auto;max-width:480px"><div style="height:100%;width:${Math.max(0, Math.min(100, Number(job.progress) || 0))}%;background:#34ff75"></div></div></div>`;
        } catch (_unused22) {}
      }), 700);
      try {
        const response = yield fetch(`/api/crypto/scanner?jobId=${encodeURIComponent(jobId)}`, {
          cache: "no-store",
          signal: cryptoScannerAbortController.signal
        });
        const data = yield response.json();
        if (requestId !== cryptoScannerRequestId) return;
        if (!response.ok || !data.success) throw new Error((data === null || data === void 0 ? void 0 : data.error) || "Kripto taraması başarısız.");
        cryptoRenderedRecords = Array.isArray(data.results) ? data.results : [];
        if (results) results.innerHTML = `<div class="trading-empty">${data.scanned} Binance USDT paritesi tarandı · ${data.successful} geçerli günlük veri</div>`;
        if (feed) renderCryptoDecisionCards(cryptoRenderedRecords);
        renderCryptoScanSummary(data, cryptoRenderedRecords);
        if (data.cryptoPaper) renderCryptoPaperState({
          cryptoPaper: data.cryptoPaper
        });
        renderCryptoDecisionDetail(cryptoRenderedRecords[0]);
        if (status) status.textContent = "TAMAMLANDI";
        if (engine) engine.textContent = "HAZIR";
        const time = document.getElementById("cryptoLastScanTime");
        if (time) time.textContent = new Date(data.timestamp).toLocaleTimeString("tr-TR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit"
        });
      } catch (error) {
        if ((error === null || error === void 0 ? void 0 : error.name) === "AbortError" || requestId !== cryptoScannerRequestId) return;
        if (results) results.innerHTML = `<div class="trading-empty">Kripto tarama hatası: ${escapeHtml(error.message)}</div>`;
        if (status) status.textContent = "HATA";
        if (engine) engine.textContent = "HATA";
      } finally {
        if (cryptoScannerPollTimer) window.clearInterval(cryptoScannerPollTimer);
        cryptoScannerPollTimer = null;
        if (requestId !== cryptoScannerRequestId) return;
        cryptoScannerAbortController = null;
        button.disabled = false;
        button.textContent = "KRİPTO TARAMASINI BAŞLAT";
      }
    });
    return _runCryptoScanner.apply(this, arguments);
  }
  function bindCryptoScannerControls() {
    const button = document.getElementById("startCryptoScannerBtn");
    const stop = document.getElementById("stopCryptoScannerBtn");
    if (!button || button.dataset.cryptoBound === "true") return;
    button.dataset.cryptoBound = "true";
    button.addEventListener("click", runCryptoScanner);
    if (stop && stop.dataset.cryptoBound !== "true") {
      stop.dataset.cryptoBound = "true";
      stop.addEventListener("click", () => {
        var _cryptoScannerAbortCo;
        cryptoScannerRequestId += 1;
        (_cryptoScannerAbortCo = cryptoScannerAbortController) === null || _cryptoScannerAbortCo === void 0 || _cryptoScannerAbortCo.abort();
        cryptoScannerAbortController = null;
        if (cryptoScannerPollTimer) window.clearInterval(cryptoScannerPollTimer);
        cryptoScannerPollTimer = null;
        const status = document.getElementById("cryptoScannerStatus");
        const engine = document.getElementById("cryptoEngineStatus");
        if (status) status.textContent = "DURDURULDU";
        if (engine) engine.textContent = "HAZIR";
        button.disabled = false;
        button.textContent = "KRİPTO TARAMASINI BAŞLAT";
      });
    }
  }
  function bindTradingScannerControls() {
    /*
     * Scanner arayüzü DOM tamamen hazır olduğunda bağlanır.
     * Böylece üstteki görsel/terminal kodlarından bağımsız kalır.
     */
    if (scannerStartButton && scannerStartButton.dataset.scannerBound !== "true") {
      scannerStartButton.dataset.scannerBound = "true";
      scannerStartButton.addEventListener("click", event => {
        event.preventDefault();
        runTradingScanner();
      });
    }
    loadTradingState();
    bindRiskSettings();
    bindPerformanceRange();
    bindDecisionBoard();
    bindPaperOrderControls();
    startPaperMonitorUi();
    bindKillSwitch();
    bindCryptoScannerControls();
    bindCryptoWorkspaceControls();
    bindCryptoKillSwitch();
    bindCryptoLiveTrading();
    bindCryptoSpotActivity();
    bindCryptoSpotKillSwitch();
    void loadCryptoPaperState();
    void loadCryptoSpotAccount();
    void loadCryptoSpotOpenOrders();
    void loadCryptoSpotActivity();
    if (scannerStopButton && scannerStopButton.dataset.scannerBound !== "true") {
      scannerStopButton.dataset.scannerBound = "true";
      scannerStopButton.addEventListener("click", event => {
        event.preventDefault();
        stopTradingScanner();
      });
    }
  }
  window.runTradingScanner = runTradingScanner;

  /* ======================================================
     ORTAK KONTROL MERKEZİ
  ====================================================== */

  function controlCenterMarketSummary(label, tabId, paper, currency, extraStatus = "") {
    var _paper$killSwitch;
    const positions = Array.isArray(paper === null || paper === void 0 ? void 0 : paper.positions) ? paper.positions.filter(item => {
      var _item$remainingQuanti;
      const status = String((item === null || item === void 0 ? void 0 : item.status) || "").toUpperCase();
      const quantity = Number((_item$remainingQuanti = item === null || item === void 0 ? void 0 : item.remainingQuantity) !== null && _item$remainingQuanti !== void 0 ? _item$remainingQuanti : item === null || item === void 0 ? void 0 : item.quantity);
      return status === "OPEN" && !(item !== null && item !== void 0 && item.closedAt) && (!Number.isFinite(quantity) || quantity > 0);
    }) : [];
    const pending = Array.isArray(paper === null || paper === void 0 ? void 0 : paper.pendingOrders) ? paper.pendingOrders : Array.isArray(paper === null || paper === void 0 ? void 0 : paper.decisions) ? paper.decisions.filter(item => ["PENDING_APPROVAL", "PENDING_LIMIT"].includes(item === null || item === void 0 ? void 0 : item.status)) : [];
    const activity = Array.isArray(paper === null || paper === void 0 ? void 0 : paper.activity) ? paper.activity : [];
    const stopped = Boolean(paper === null || paper === void 0 || (_paper$killSwitch = paper.killSwitch) === null || _paper$killSwitch === void 0 ? void 0 : _paper$killSwitch.active);
    const money = value => {
      const number = Number(value);
      if (!Number.isFinite(number)) return "—";
      return new Intl.NumberFormat("tr-TR", {
        style: "currency",
        currency,
        maximumFractionDigits: currency === "TRY" ? 2 : 2
      }).format(number);
    };
    return {
      label,
      tabId,
      stopped,
      activity,
      html: `<article class="control-market-card${stopped ? " is-stopped" : ""}">
      <header><strong>${escapeHtml(label)}</strong><span>${stopped ? "ACİL DURDURMA AKTİF" : extraStatus || "HAZIR"}</span></header>
      <div class="control-market-metrics">
        <span><small>AÇIK POZİSYON</small>${positions.length}</span>
        <span><small>BEKLEYEN EMİR</small>${pending.length}</span>
        <span><small>PORTFÖY DEĞERİ</small>${money(paper === null || paper === void 0 ? void 0 : paper.equity)}</span>
        <span><small>NAKİT</small>${money(paper === null || paper === void 0 ? void 0 : paper.cash)}</span>
      </div>
      <button type="button" class="trading-button" data-control-open="${escapeHtml(tabId)}">${escapeHtml(label)} ALANINI AÇ</button>
    </article>`
    };
  }
  function controlCenterTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit"
    });
  }
  function loadControlCenter() {
    return _loadControlCenter.apply(this, arguments);
  }
  function _loadControlCenter() {
    _loadControlCenter = _asyncToGenerator(function* () {
      if (controlCenterRefreshInFlight || !document.getElementById("controlTab")) return;
      controlCenterRefreshInFlight = true;
      const refreshedAt = document.getElementById("controlCenterUpdated");
      const cards = document.getElementById("controlMarketCards");
      const recent = document.getElementById("controlRecentActivity");
      const healthGrid = document.getElementById("controlHealthGrid");
      const healthStatus = document.getElementById("controlHealthStatus");
      if (refreshedAt) refreshedAt.textContent = "YÜKLENİYOR";
      try {
        var _cryptoResult$value, _nasdaqResult$value;
        const cacheKey = `_=${Date.now()}`;
        const readFreshJson = (path, message) => fetch(`${path}${path.includes("?") ? "&" : "?"}${cacheKey}`, {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache, no-store, max-age=0"
          }
        }).then(/*#__PURE__*/function () {
          var _ref42 = _asyncToGenerator(function* (response) {
            if (!response.ok) throw new Error(message);
            return response.json();
          });
          return function (_x39) {
            return _ref42.apply(this, arguments);
          };
        }());
        const [bistResult, cryptoResult, nasdaqResult, healthResult] = yield Promise.allSettled([readFreshJson("/api/trading/state", "BIST state alınamadı"), readFreshJson("/api/crypto/state", "Kripto state alınamadı"), readFreshJson("/api/nasdaq/state", "NASDAQ state alınamadı"), readFreshJson("/api/system/health", "Sağlık özeti alınamadı")]);
        const bist = bistResult.status === "fulfilled" ? bistResult.value : null;
        const crypto = cryptoResult.status === "fulfilled" ? (_cryptoResult$value = cryptoResult.value) === null || _cryptoResult$value === void 0 ? void 0 : _cryptoResult$value.cryptoPaper : null;
        const nasdaq = nasdaqResult.status === "fulfilled" ? (_nasdaqResult$value = nasdaqResult.value) === null || _nasdaqResult$value === void 0 ? void 0 : _nasdaqResult$value.nasdaqPaper : null;
        const summaries = [controlCenterMarketSummary("BIST100", "tradingTab", bist === null || bist === void 0 ? void 0 : bist.paper, "TRY", bist ? "KAĞIT İŞLEM" : "BAĞLANTI HATASI"), controlCenterMarketSummary("KRİPTO", "cryptoTab", crypto, "USD", crypto ? "SPOT / KAĞIT" : "BAĞLANTI HATASI"), controlCenterMarketSummary("NASDAQ", "nasdaqTab", nasdaq, "USD", nasdaq ? "ALPACA / KAĞIT" : "BAĞLANTI HATASI")];
        if (cards) cards.innerHTML = summaries.map(item => item.html).join("");
        const activities = summaries.flatMap(summary => summary.activity.slice(0, 3).map(item => _objectSpread(_objectSpread({}, item), {}, {
          market: summary.label
        }))).sort((left, right) => String(right.timestamp || "").localeCompare(String(left.timestamp || ""))).slice(0, 9);
        if (recent) recent.innerHTML = activities.length ? activities.map(item => `<article class="control-activity-item"><strong>${escapeHtml(item.market)} · ${escapeHtml(String(item.type || "HAREKET").replaceAll("_", " "))}</strong><span>${escapeHtml(item.message || "İşlem hareketi kaydedildi.")}</span><time>${controlCenterTime(item.timestamp)}</time></article>`).join("") : '<div class="trading-empty">Henüz gösterilecek işlem hareketi yok.</div>';
        const health = healthResult.status === "fulfilled" ? healthResult.value : null;
        if (healthGrid) healthGrid.innerHTML = Array.isArray(health === null || health === void 0 ? void 0 : health.items) && health.items.length ? health.items.map(item => {
          const running = item.status === "RUNNING";
          const healthy = item.status === "READY" || running;
          const label = running ? "ÇALIŞIYOR" : healthy ? "HAZIR" : "DİKKAT GEREKİYOR";
          return `<article class="control-health-item ${healthy ? "" : "needs-attention"}${running ? " is-running" : ""}"><strong>${escapeHtml(item.label || "SERVİS")}</strong><span>${label}</span><small>${escapeHtml(item.detail || "")}</small></article>`;
        }).join("") : '<div class="trading-empty">Sağlık özeti alınamadı.</div>';
        const failedReads = [bistResult, cryptoResult, nasdaqResult, healthResult].filter(result => result.status === "rejected").length;
        if (healthStatus) healthStatus.textContent = health ? `${health.healthy}/${health.total} HAZIR${failedReads ? ` · ${failedReads} VERİ HATASI` : ""}` : "BAĞLANTI HATASI";
        if (refreshedAt) refreshedAt.textContent = `${failedReads ? "KISMİ GÜNCELLEME" : "GÜNCELLENDİ"} · ${new Date().toLocaleTimeString("tr-TR", {
          hour: "2-digit",
          minute: "2-digit"
        })}`;
      } catch (error) {
        if (cards) cards.innerHTML = `<div class="trading-empty">Kontrol merkezi verileri alınamadı: ${escapeHtml(error.message || "bilinmeyen hata")}</div>`;
        if (recent) recent.innerHTML = '<div class="trading-empty">İşlem hareketleri alınamadı.</div>';
        if (refreshedAt) refreshedAt.textContent = "BAĞLANTI HATASI";
      } finally {
        controlCenterRefreshInFlight = false;
      }
    });
    return _loadControlCenter.apply(this, arguments);
  }
  function bindControlCenter() {
    var _document$querySelect2;
    const refresh = document.getElementById("refreshControlCenter");
    if (refresh && !refresh.dataset.controlCenterBound) {
      refresh.dataset.controlCenterBound = "true";
      refresh.addEventListener("click", () => void loadControlCenter());
    }
    const cards = document.getElementById("controlMarketCards");
    if (cards && !cards.dataset.controlCenterBound) {
      cards.dataset.controlCenterBound = "true";
      cards.addEventListener("click", event => {
        var _document$querySelect;
        const button = event.target.closest("[data-control-open]");
        const tabId = button === null || button === void 0 ? void 0 : button.dataset.controlOpen;
        if (!tabId) return;
        (_document$querySelect = document.querySelector(`.main-tab[data-tab="${tabId}"]`)) === null || _document$querySelect === void 0 || _document$querySelect.click();
      });
    }
    (_document$querySelect2 = document.querySelector('.main-tab[data-tab="controlTab"]')) === null || _document$querySelect2 === void 0 || _document$querySelect2.addEventListener("click", () => void loadControlCenter());
    void loadControlCenter();
  }
  function startTradingWhenAuthenticated() {
    return _startTradingWhenAuthenticated.apply(this, arguments);
  }
  function _startTradingWhenAuthenticated() {
    _startTradingWhenAuthenticated = _asyncToGenerator(function* () {
      var _window$borsaciAuth;
      if (!((_window$borsaciAuth = window.borsaciAuth) !== null && _window$borsaciAuth !== void 0 && _window$borsaciAuth.authenticated)) {
        yield new Promise(resolve => window.addEventListener("borsaci:auth-ready", resolve, {
          once: true
        }));
      }
      bindTradingScannerControls();
      // NASDAQ controller BIST akışından bağımsız state/DOM alanını kullanır.
      placeNasdaqManualOrderForm();
      // NASDAQ açık pozisyonlar ekranı eski istemci state'ini tekrar çizmek yerine
      // düzenli olarak sunucudan son tamamlanmış günlük fiyatı ister.
      if (!nasdaqQuoteTimer) {
        nasdaqQuoteTimer = window.setInterval(() => {
          void loadNasdaqPaperState();
        }, 30000);
      }
      bindNasdaqWorkspaceControls();
      bindNasdaqKillSwitch();
      bindNasdaqLogout();
      bindControlCenter();
      void loadNasdaqPaperState({
        loadAnalysis: true
      });
    });
    return _startTradingWhenAuthenticated.apply(this, arguments);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startTradingWhenAuthenticated, {
      once: true
    });
  } else {
    startTradingWhenAuthenticated();
  }
})();

})();
};
window.__borsaciBootLegacyChart(window.__borsaciStartLegacyApp);
