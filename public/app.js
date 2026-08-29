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

const WATCHLIST_STORAGE_KEY =
  "borsaci_watchlist_v1";

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

let newsFeed = null;
let newsImpact = null;
let dataStatus = null;

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

  const clock =
    document.getElementById("clock");

  if (!clock) return;

  clock.innerText =
    new Date().toLocaleTimeString(
      "tr-TR",
      {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      }
    );

}

/* ======================================================
   ELEMENT INITIALIZATION
====================================================== */

function initializeElements() {

  questionInput =
    document.getElementById("question");

  analyzeBtn =
    document.getElementById("analyzeBtn");

  responseBox =
    document.getElementById("response");

  addSymbolBtn =
    document.getElementById("addSymbolBtn");

  watchlist =
    document.getElementById("watchlist");

  chartSymbol =
    document.getElementById("chartSymbol");

  chartEmpty =
    document.getElementById("chartEmpty");

  chartContainer =
    document.getElementById("market_chart");

  newsFeed =
    document.getElementById("newsFeed");

  newsImpact =
    document.getElementById("newsImpact");

  dataStatus =
    document.getElementById("dataStatus");

}

/* ======================================================
   ATTACH-IMAGE ELEMENT INITIALIZATION
====================================================== */

function initializeImageElements() {

  attachImageBtn =
    document.getElementById("attachImageBtn");

  imageInput =
    document.getElementById("imageInput");

  imagePreview =
    document.getElementById("imagePreview");

  previewImage =
    document.getElementById("previewImage");

  removeImageBtn =
    document.getElementById("removeImageBtn");

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

  reader.onload = (event) => {

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

    imageInput.addEventListener("change", (event) => {
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

function formatNumber(
  value,
  decimals = 2
) {

  const number =
    Number(value);

  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(number)
  ) {

    return "--";

  }

  return number.toLocaleString(
    "tr-TR",
    {
      minimumFractionDigits:
        decimals,

      maximumFractionDigits:
        decimals
    }
  );

}

function formatCompact(
  value
) {

  const number =
    Number(value);

  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(number)
  ) {

    return "--";

  }

  if (
    number >= 1_000_000_000
  ) {

    return (
      number / 1_000_000_000
    ).toFixed(2) + "B";

  }

  if (
    number >= 1_000_000
  ) {

    return (
      number / 1_000_000
    ).toFixed(2) + "M";

  }

  if (
    number >= 1_000
  ) {

    return (
      number / 1_000
    ).toFixed(2) + "K";

  }

  return formatNumber(
    number,
    0
  );

}

function setText(
  id,
  value
) {

  const element =
    document.getElementById(id);

  if (!element) return;

  element.innerText =
    value;

}

/* ======================================================
   ESCAPE
====================================================== */

function escapeHtml(
  value
) {

  return String(
    value ?? ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );

}

/* ======================================================
   SYMBOL
====================================================== */

function normalizeSymbol(
  symbol
) {

  if (!symbol) return null;

  return String(symbol)
    .trim()
    .toUpperCase()
    .replace(
      /^BIST:/,
      ""
    )
    .replace(
      /\.IS$/,
      ""
    );

}

function toYahooSymbol(
  symbol
) {

  const clean =
    normalizeSymbol(
      symbol
    );

  if (!clean) return null;

  if (
    clean === "XU100"
  ) {

    return "XU100.IS";

  }

  if (
    clean.endsWith(".IS")
  ) {

    return clean;

  }

  return `${clean}.IS`;

}

/* ======================================================
   WATCHLIST STORAGE
====================================================== */

function saveWatchlist() {

  try {

    const cleanSymbols =
      [
        ...new Set(
          symbols
            .map(
              normalizeSymbol
            )
            .filter(Boolean)
        )
      ];

    localStorage.setItem(
      WATCHLIST_STORAGE_KEY,
      JSON.stringify(
        cleanSymbols
      )
    );

  } catch (error) {

    console.error(
      "BORSACI WATCHLIST SAVE ERROR:",
      error
    );

  }

}

function loadWatchlist() {

  try {

    const raw =
      localStorage.getItem(
        WATCHLIST_STORAGE_KEY
      );

    if (!raw) {

      symbols = [];

      return;

    }

    const data =
      JSON.parse(raw);

    if (
      !Array.isArray(data)
    ) {

      symbols = [];

      return;

    }

    symbols =
      [
        ...new Set(
          data
            .map(
              normalizeSymbol
            )
            .filter(Boolean)
        )
      ];

    console.log(
      "BORSACI WATCHLIST LOADED:",
      symbols
    );

  } catch (error) {

    console.error(
      "BORSACI WATCHLIST LOAD ERROR:",
      error
    );

    symbols = [];

  }

}

/* ======================================================
   WATCHLIST RENDER
====================================================== */

function renderWatchlist() {

  if (!watchlist) return;

  if (
    symbols.length === 0
  ) {

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

  symbols.forEach(
    (
      symbol,
      index
    ) => {

      const cached =
        marketCache[
          symbol
        ];

      const price =
        cached?.quote?.price ??
        cached?.price ??
        cached?.lastPrice;

      const change =
        cached?.quote?.changePercent ??
        cached?.changePercent ??
        cached?.change;

      const row =
        document.createElement(
          "div"
        );

      row.className =
        "watch-row";

      row.innerHTML = `

        <button
          type="button"
          class="symbol-button ${
            selectedSymbol === symbol
              ? "active"
              : ""
          }"
          data-index="${index}"
        >

          <span>
            ${escapeHtml(symbol)}
          </span>

          <span class="watch-price">

            <strong>
              ${
                price !== undefined &&
                price !== null
                  ? formatNumber(
                      price,
                      2
                    )
                  : "--"
              }
            </strong>

            <small
              class="${
                Number(change) > 0
                  ? "positive"
                  : Number(change) < 0
                    ? "negative"
                    : ""
              }"
            >

              ${
                change !== undefined &&
                change !== null &&
                Number.isFinite(
                  Number(change)
                )
                  ? (
                      Number(change) > 0
                        ? "+"
                        : ""
                    ) +
                    formatNumber(
                      change,
                      2
                    ) +
                    "%"
                  : "--"
              }

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

      watchlist.appendChild(
        row
      );

    }
  );

  watchlist
    .querySelectorAll(
      ".symbol-button"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            const index =
              Number(
                button.dataset.index
              );

            const symbol =
              symbols[index];

            if (symbol) {

              selectSymbol(
                symbol
              );

            }

          }
        );

      }
    );

  watchlist
    .querySelectorAll(
      ".remove-symbol"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          event => {

            event.stopPropagation();

            const index =
              Number(
                button.dataset.index
              );

            const removed =
              symbols[index];

            if (!removed) return;

            symbols.splice(
              index,
              1
            );

            delete marketCache[
              removed
            ];

            Object.keys(
              chartCache
            ).forEach(
              key => {

                if (
                  key === removed ||
                  key.startsWith(
                    `${removed}_`
                  )
                ) {

                  delete chartCache[
                    key
                  ];

                }

              }
            );

            if (
              selectedSymbol ===
              removed
            ) {

              selectedSymbol =
                symbols[0] ||
                null;

              if (
                selectedSymbol
              ) {

                selectSymbol(
                  selectedSymbol
                );

              } else {

                clearDashboard();

              }

            }

            saveWatchlist();

            renderWatchlist();

          }
        );

      }
    );

}

/* ======================================================
   ADD SYMBOL
====================================================== */

function addSymbol() {

  const input =
    prompt(
      "BIST sembolünü gir:\n\nÖrnek: ASELS"
    );

  if (!input) return;

  const symbol =
    normalizeSymbol(
      input
    );

  if (!symbol) return;

  if (
    !symbols.includes(
      symbol
    )
  ) {

    symbols.push(
      symbol
    );

  }

  saveWatchlist();

  renderWatchlist();

  selectSymbol(
    symbol
  );

}

/* ======================================================
   SELECT SYMBOL
====================================================== */

async function selectSymbol(
  symbol,
  {
    persistInWatchlist = true
  } = {}
) {

  const clean =
    normalizeSymbol(
      symbol
    );

  if (!clean) return;

  const requestId =
    ++symbolSelectionRequestId;

  selectedSymbol =
    clean;

  if (chartSymbol) {

    chartSymbol.innerText =
      clean;

  }

  if (
    persistInWatchlist &&
    !symbols.includes(
      clean
    )
  ) {

    symbols.push(
      clean
    );

  }

  if (persistInWatchlist) {

    saveWatchlist();

  }

  renderWatchlist();

  clearChartOnly();

  await loadMarketData(
    clean,
    requestId,
    persistInWatchlist
  );

  if (
    requestId !==
      symbolSelectionRequestId ||
    selectedSymbol !== clean
  ) {

    return;

  }

  await loadChartData(
    clean,
    chartRange,
    chartInterval,
    requestId
  );

}

/* ======================================================
   MARKET DATA
====================================================== */

function isCurrentSymbolRequest(
  symbol,
  requestId
) {

  return (
    requestId === null ||
    requestId === undefined ||
    (
      requestId ===
        symbolSelectionRequestId &&
      selectedSymbol === symbol
    )
  );

}

async function loadMarketData(
  symbol,
  requestId = null,
  persistInWatchlist = true
) {

  const clean =
    normalizeSymbol(
      symbol
    );

  if (!clean) return;

  if (dataStatus) {

    dataStatus.innerText =
      "LOADING";

    dataStatus.classList.add(
      "loading"
    );

  }

  try {

    const cached =
      marketCache[
        clean
      ];

    if (
      cached?.timestamp
    ) {

      const timestamp =
        new Date(
          cached.timestamp
        ).getTime();

      const age =
        Date.now() -
        timestamp;

      if (
        Number.isFinite(age) &&
        age >= 0 &&
        age < 20000
      ) {

        if (
          !isCurrentSymbolRequest(
            clean,
            requestId
          )
        ) {

          return;

        }

        updateDashboard(
          cached,
          false,
          persistInWatchlist
        );

        if (dataStatus) {

          dataStatus.innerText =
            "LIVE";

        }

        return;

      }

    }

    const url =
      `/market?symbol=${encodeURIComponent(
        clean
      )}`;

    console.log(
      "BORSACI MARKET REQUEST:",
      url
    );

    const response =
      await fetch(
        url,
        {
          method: "GET",

          headers: {
            Accept:
              "application/json"
          },

          cache:
            "no-store"
        }
      );

    const text =
      await response.text();

    let data;

    try {

      data =
        JSON.parse(
          text
        );

    } catch {

      throw new Error(
        `Market endpoint JSON döndürmedi. HTTP ${response.status}`
      );

    }

    if (
      !response.ok
    ) {

      throw new Error(
        data?.error ||
        `Market endpoint HTTP ${response.status}`
      );

    }

    if (!data) {

      throw new Error(
        "Market endpoint boş cevap döndürdü."
      );

    }

    if (
      !data.timestamp
    ) {

      data.timestamp =
        new Date().toISOString();

    }

    marketCache[
      clean
    ] = data;

    if (
      !isCurrentSymbolRequest(
        clean,
        requestId
      )
    ) {

      return;

    }

    updateDashboard(
      data,
      false,
      persistInWatchlist
    );

    if (dataStatus) {

      dataStatus.innerText =
        "LIVE";

    }

  } catch (error) {

    if (
      !isCurrentSymbolRequest(
        clean,
        requestId
      )
    ) {

      return;

    }

    console.error(
      "BORSACI MARKET ERROR:",
      error
    );

    if (dataStatus) {

      dataStatus.innerText =
        "ERROR";

    }

    showDashboardError(
      error.message
    );

  } finally {

    if (
      dataStatus &&
      isCurrentSymbolRequest(
        clean,
        requestId
      )
    ) {

      dataStatus.classList.remove(
        "loading"
      );

    }

  }

}

/* ======================================================
   DASHBOARD
====================================================== */

function updateDashboard(
  data,
  updateChart = false,
  persistInWatchlist = true
) {

  if (!data) return;

  const backendSymbol =
    normalizeSymbol(
      data.symbol
    );

  if (
    backendSymbol
  ) {

    selectedSymbol =
      backendSymbol;

    if (chartSymbol) {

      chartSymbol.innerText =
        backendSymbol;

    }

    if (
      persistInWatchlist &&
      !symbols.includes(
        backendSymbol
      )
    ) {

      symbols.push(
        backendSymbol
      );

      saveWatchlist();

    }

  }

  updateWatchlistData(
    data
  );

  updateTechnical(
    data.technical
  );

  if (
    updateChart
  ) {

    const history =
      extractHistory(
        data
      );

    updateChartData(
      history
    );

  }

  updateNews(
    data.news
  );

  updateNewsImpact(
    data.news
  );

  renderWatchlist();

}

/* ======================================================
   HISTORY
====================================================== */

function extractHistory(
  data
) {

  if (!data) return [];

  if (
    Array.isArray(
      data.history
    )
  ) {

    return data.history;

  }

  if (
    Array.isArray(
      data.data?.history
    )
  ) {

    return data.data.history;

  }

  if (
    Array.isArray(
      data.market?.history
    )
  ) {

    return data.market.history;

  }

  if (
    Array.isArray(
      data.chart
    )
  ) {

    return data.chart;

  }

  if (
    Array.isArray(
      data.candles
    )
  ) {

    return data.candles;

  }

  if (
    Array.isArray(
      data.data?.candles
    )
  ) {

    return data.data.candles;

  }

  return [];

}

/* ======================================================
   WATCHLIST DATA
====================================================== */

function updateWatchlistData(
  data
) {

  if (!data) return;

  const symbol =
    normalizeSymbol(
      data.symbol
    ) ||
    selectedSymbol;

  if (!symbol) return;

  marketCache[
    symbol
  ] = {
    ...marketCache[symbol],
    ...data
  };

}

/* ======================================================
   TECHNICAL
====================================================== */

function updateTechnical(
  technical
) {

  if (!technical) {

    [
      "rsi",
      "macd",
      "ema20",
      "ema50",
      "volume",
      "atr"
    ].forEach(
      id => {

        setText(
          id,
          "--"
        );

      }
    );

    return;

  }

  setText(
    "rsi",
    formatNumber(
      technical.rsi
    )
  );

  setText(
    "macd",
    formatNumber(
      technical.macd
    )
  );

  setText(
    "ema20",
    formatNumber(
      technical.ema20
    )
  );

  setText(
    "ema50",
    formatNumber(
      technical.ema50
    )
  );

  setText(
    "atr",
    formatNumber(
      technical.atr
    )
  );

  const volume =
    marketCache[
      selectedSymbol
    ]?.quote?.volume ??
    marketCache[
      selectedSymbol
    ]?.volume ??
    technical.volume;

  setText(
    "volume",
    formatCompact(
      volume
    )
  );

}

/* ======================================================
   CHART INIT
====================================================== */

function initMarketChart() {

  if (
    chartInitialized &&
    marketChart
  ) {

    return;

  }

  if (!chartContainer) {

    console.error(
      "BORSACI: #market_chart bulunamadı."
    );

    return;

  }

  if (
    typeof LightweightCharts ===
    "undefined"
  ) {

    console.error(
      "BORSACI: LightweightCharts yüklenmedi."
    );

    return;

  }

  let width =
    chartContainer.clientWidth;

  let height =
    chartContainer.clientHeight;

  if (
    width <= 0
  ) {

    width =
      chartContainer.parentElement
        ?.clientWidth ||
      600;

  }

  if (
    height <= 0
  ) {

    height =
      420;

  }

  if (marketChart) {

    try {

      clearDecisionChartOverlay();

      marketChart.remove();

    } catch {}

  }

  marketChart =
    null;

  candleSeries =
    null;

  volumeSeries =
    null;

  chartContainer.innerHTML =
    "";

  marketChart =
    LightweightCharts.createChart(
      chartContainer,
      {
        width,
        height,

        layout: {
          background: {
            type: "solid",
            color: "#0b0f14"
          },

          textColor:
            "#9aa4b2"
        },

        grid: {
          vertLines: {
            color:
              "#151b23"
          },

          horzLines: {
            color:
              "#151b23"
          }
        },

        crosshair: {
          mode:
            LightweightCharts
              .CrosshairMode
              .Normal
        },

        rightPriceScale: {
          borderColor:
            "#252c36"
        },

        timeScale: {
          borderColor:
            "#252c36",

          timeVisible:
            false,

          secondsVisible:
            false
        },

        handleScroll: {
          mouseWheel:
            true,

          pressedMouseMove:
            true
        },

        handleScale: {
          axisPressedMouseMove:
            true,

          mouseWheel:
            true,

          pinch:
            true
        }
      }
    );

  chartContainer.parentElement
    ?.classList.add(
      "has-borsaci-chart"
    );

  candleSeries =
    marketChart.addSeries(
      LightweightCharts.CandlestickSeries,
      {
        upColor:
          "#26a69a",

        downColor:
          "#ef5350",

        borderUpColor:
          "#26a69a",

        borderDownColor:
          "#ef5350",

        wickUpColor:
          "#26a69a",

        wickDownColor:
          "#ef5350"
      }
    );

  volumeSeries =
    marketChart.addSeries(
      LightweightCharts.HistogramSeries,
      {
        priceFormat: {
          type:
            "volume"
        },

        priceScaleId:
          "volume"
      }
    );

  marketChart
    .priceScale(
      "volume"
    )
    .applyOptions(
      {
        scaleMargins: {
          top:
            0.80,

          bottom:
            0
        }
      }
    );

  if (
    chartResizeObserver
  ) {

    try {

      chartResizeObserver.disconnect();

    } catch {}

  }

  if (
    typeof ResizeObserver !==
    "undefined"
  ) {

    chartResizeObserver =
      new ResizeObserver(
        entries => {

          if (!marketChart)
            return;

          const entry =
            entries[0];

          if (!entry)
            return;

          const rect =
            entry.contentRect;

          const newWidth =
            Math.floor(
              rect.width
            );

          const newHeight =
            Math.floor(
              rect.height
            );

          if (
            newWidth <= 0 ||
            newHeight <= 0
          ) {

            return;

          }

          try {

            marketChart.applyOptions(
              {
                width:
                  newWidth,

                height:
                  newHeight
              }
            );

          } catch {}

        }
      );

    chartResizeObserver.observe(
      chartContainer
    );

  }

  chartInitialized =
    true;

  console.log(
    "BORSACI: Market chart initialized."
  );

}

/* ======================================================
   CHART TIME
====================================================== */

function normalizeChartTime(
  value
) {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {

    return null;

  }

  if (
    typeof value === "number" ||
    /^\d+$/.test(
      String(value)
    )
  ) {

    let number =
      Number(value);

    if (
      !Number.isFinite(
        number
      )
    ) {

      return null;

    }

    if (
      number >
      10_000_000_000
    ) {

      number =
        Math.floor(
          number / 1000
        );

    }

    return number;

  }

  const stringValue =
    String(value).trim();

  if (
    /^\d{4}-\d{2}-\d{2}$/.test(
      stringValue
    )
  ) {

    return stringValue;

  }

  const date =
    new Date(
      stringValue
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return null;

  }

  return date
    .toISOString()
    .slice(
      0,
      10
    );

}

/* ======================================================
   HISTORY VALUE
====================================================== */

function getHistoryValue(
  item,
  names
) {

  if (!item) return null;

  for (
    const name of names
  ) {

    if (
      item[name] !== undefined &&
      item[name] !== null
    ) {

      return item[name];

    }

  }

  return null;

}

/* ======================================================
   CHART HISTORY EXTRACT
====================================================== */

function extractChartHistory(
  data
) {

  if (!data) {

    return [];

  }

  if (
    Array.isArray(
      data.history
    )
  ) {

    return data.history;

  }

  if (
    Array.isArray(
      data.data?.history
    )
  ) {

    return data.data.history;

  }

  const result =
    data.chart
      ?.result
      ?.[0];

  if (!result) {

    return [];

  }

  const timestamps =
    result.timestamp ||
    [];

  const quote =
    result.indicators
      ?.quote
      ?.[0];

  if (
    !quote ||
    !Array.isArray(
      timestamps
    )
  ) {

    return [];

  }

  const history = [];

  for (
    let i = 0;
    i < timestamps.length;
    i++
  ) {

    const time =
      timestamps[i];

    const open =
      quote.open?.[i];

    const high =
      quote.high?.[i];

    const low =
      quote.low?.[i];

    const close =
      quote.close?.[i];

    const volume =
      quote.volume?.[i];

    if (
      !Number.isFinite(
        Number(close)
      )
    ) {

      continue;

    }

    history.push(
      {
        time,

        open:
          Number(open),

        high:
          Number(high),

        low:
          Number(low),

        close:
          Number(close),

        volume:
          Number(volume) || 0
      }
    );

  }

  return history;

}

/* ======================================================
   LOAD CHART DATA
====================================================== */

async function loadChartData(
  symbol,
  range = chartRange,
  interval = chartInterval,
  requestId = null
) {

  const clean =
    normalizeSymbol(
      symbol
    );

  if (!clean) return;

  const cacheKey =
    `${clean}_${range}_${interval}`;

  const cached =
    chartCache[
      cacheKey
    ];

  if (
    cached?.timestamp &&
    Array.isArray(
      cached.history
    )
  ) {

    const age =
      Date.now() -
      cached.timestamp;

    if (
      age >= 0 &&
      age < 60000 &&
      cached.history.length > 0
    ) {

      if (
        !isCurrentSymbolRequest(
          clean,
          requestId
        )
      ) {

        return;

      }

      updateChartData(
        cached.history
      );

      return;

    }

  }

  if (
    isCurrentSymbolRequest(
      clean,
      requestId
    )
  ) {

    showEmptyChart(
      "GRAFİK YÜKLENİYOR",
      `${range.toUpperCase()} / ${interval.toUpperCase()}`
    );

  }

  try {

    const url =
      `/chart?symbol=${encodeURIComponent(
        clean
      )}` +
      `&range=${encodeURIComponent(
        range
      )}` +
      `&interval=${encodeURIComponent(
        interval
      )}`;

    console.log(
      "BORSACI CHART REQUEST:",
      url
    );

    const response =
      await fetch(
        url,
        {
          method:
            "GET",

          headers: {
            Accept:
              "application/json"
          },

          cache:
            "no-store"
        }
      );

    const text =
      await response.text();

    let data;

    try {

      data =
        JSON.parse(
          text
        );

    } catch {

      throw new Error(
        `Chart endpoint JSON döndürmedi. HTTP ${response.status}`
      );

    }

    if (
      !response.ok
    ) {

      throw new Error(
        data?.error ||
        `Chart endpoint HTTP ${response.status}`
      );

    }

    const history =
      extractChartHistory(
        data
      );

    if (
      !Array.isArray(history) ||
      history.length === 0
    ) {

      throw new Error(
        "Yahoo Finance chart verisi boş."
      );

    }

    chartCache[
      cacheKey
    ] = {
      timestamp:
        Date.now(),

      history
    };

    if (
      !isCurrentSymbolRequest(
        clean,
        requestId
      )
    ) {

      return;

    }

    chartHistory =
      history;

    updateChartData(
      history
    );

  } catch (error) {

    if (
      !isCurrentSymbolRequest(
        clean,
        requestId
      )
    ) {

      return;

    }

    console.error(
      "BORSACI CHART ERROR:",
      error
    );

    const marketHistory =
      extractHistory(
        marketCache[
          clean
        ]
      );

    if (
      marketHistory.length > 0
    ) {

      console.warn(
        "BORSACI: /chart başarısız. /market history fallback."
      );

      chartHistory =
        marketHistory;

      updateChartData(
        marketHistory
      );

      return;

    }

    showEmptyChart(
      "GRAFİK VERİ HATASI",
      error.message
    );

  }

}

/* ======================================================
   UPDATE CHART
====================================================== */

function updateChartData(
  history
) {

  chartHistory =
    Array.isArray(
      history
    )
      ? history
      : [];

  if (
    !marketChart ||
    !candleSeries
  ) {

    console.warn(
      "BORSACI: Chart hazır değil."
    );

    return;

  }

  if (
    !Array.isArray(
      history
    ) ||
    history.length === 0
  ) {

    showEmptyChart(
      "GRAFİK VERİSİ YOK",
      "Chart provider history döndürmedi."
    );

    return;

  }

  const candles = [];

  for (
    const item of history
  ) {

    const rawTime =
      getHistoryValue(
        item,
        [
          "time",
          "date",
          "timestamp",
          "datetime",
          "t"
        ]
      );

    const time =
      normalizeChartTime(
        rawTime
      );

    if (!time) {

      continue;

    }

    let open =
      Number(
        getHistoryValue(
          item,
          [
            "open",
            "o"
          ]
        )
      );

    let high =
      Number(
        getHistoryValue(
          item,
          [
            "high",
            "h"
          ]
        )
      );

    let low =
      Number(
        getHistoryValue(
          item,
          [
            "low",
            "l"
          ]
        )
      );

    let close =
      Number(
        getHistoryValue(
          item,
          [
            "close",
            "c",
            "price",
            "p"
          ]
        )
      );

    if (
      !Number.isFinite(
        close
      )
    ) {

      continue;

    }

    if (
      !Number.isFinite(
        open
      )
    ) {

      open =
        close;

    }

    if (
      !Number.isFinite(
        high
      )
    ) {

      high =
        Math.max(
          open,
          close
        );

    }

    if (
      !Number.isFinite(
        low
      )
    ) {

      low =
        Math.min(
          open,
          close
        );

    }

    high =
      Math.max(
        high,
        open,
        close
      );

    low =
      Math.min(
        low,
        open,
        close
      );

    candles.push(
      {
        time,
        open,
        high,
        low,
        close
      }
    );

  }

  candles.sort(
    (
      a,
      b
    ) => {

      const ta =
        typeof a.time === "number"
          ? a.time
          : Date.parse(
              a.time
            );

      const tb =
        typeof b.time === "number"
          ? b.time
          : Date.parse(
              b.time
            );

      return ta - tb;

    }
  );

  const uniqueCandles =
    [];

  const seen =
    new Set();

  for (
    const candle of candles
  ) {

    const key =
      String(
        candle.time
      );

    if (
      seen.has(key)
    ) {

      continue;

    }

    seen.add(key);

    uniqueCandles.push(
      candle
    );

  }

  if (
    uniqueCandles.length === 0
  ) {

    showEmptyChart(
      "GRAFİK VERİ HATASI",
      "OHLC verisi okunamadı."
    );

    return;

  }

  try {

    candleSeries.setData(
      uniqueCandles
    );

  } catch (error) {

    console.error(
      "BORSACI CANDLE ERROR:",
      error
    );

    showEmptyChart(
      "GRAFİK HATASI",
      error.message
    );

    return;

  }

  if (volumeSeries) {

    const volumes = [];

    for (
      const item of history
    ) {

      const rawTime =
        getHistoryValue(
          item,
          [
            "time",
            "date",
            "timestamp",
            "datetime",
            "t"
          ]
        );

      const time =
        normalizeChartTime(
          rawTime
        );

      const volume =
        Number(
          getHistoryValue(
            item,
            [
              "volume",
              "vol",
              "v"
            ]
          )
        );

      if (
        time &&
        Number.isFinite(
          volume
        )
      ) {

        volumes.push(
          {
            time,
            value:
              volume
          }
        );

      }

    }

    volumes.sort(
      (
        a,
        b
      ) => {

        const ta =
          typeof a.time === "number"
            ? a.time
            : Date.parse(
                a.time
              );

        const tb =
          typeof b.time === "number"
            ? b.time
            : Date.parse(
                b.time
              );

        return ta - tb;

      }
    );

    const uniqueVolumes =
      [];

    const volumeSeen =
      new Set();

    for (
      const item of volumes
    ) {

      const key =
        String(
          item.time
        );

      if (
        volumeSeen.has(
          key
        )
      ) {

        continue;

      }

      volumeSeen.add(
        key
      );

      uniqueVolumes.push(
        item
      );

    }

    if (
      uniqueVolumes.length > 0
    ) {

      try {

        volumeSeries.setData(
          uniqueVolumes
        );

      } catch (error) {

        console.warn(
          "BORSACI VOLUME ERROR:",
          error
        );

      }

    }

  }

  try {

    marketChart
      .timeScale()
      .fitContent();

  } catch (error) {

    console.warn(
      "BORSACI FIT ERROR:",
      error
    );

  }

  if (chartEmpty) {

    chartEmpty.style.display =
      "none";

  }

  console.log(
    `BORSACI: ${uniqueCandles.length} candle çizildi.`
  );

  /* Yeni mum geldiğinde A/B/C ışınları son grafik mumuna kadar uzatılır. */
  if (
    activeDecisionOverlay &&
    normalizeSymbol(
      activeDecisionOverlay.symbol
    ) === selectedSymbol
  ) {

    renderDecisionChartOverlay(
      activeDecisionOverlay
    );

  }

}

/* ======================================================
   CLEAR CHART
====================================================== */

function decisionPrice(
  value
) {

  if (
    value === null ||
    value === undefined ||
    value === "" ||
    !Number.isFinite(
      Number(value)
    )
  ) {

    return null;

  }

  const price =
    Number(value);

  return price > 0
    ? price
    : null;

}


function chartDateKey(
  value
) {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {

    return null;

  }

  if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}/.test(
      value
    )
  ) {

    return value.slice(
      0,
      10
    );

  }

  let timestamp =
    Number(value);

  if (
    !Number.isFinite(
      timestamp
    )
  ) {

    timestamp =
      new Date(value)
        .getTime();

  } else if (
    timestamp < 10_000_000_000
  ) {

    timestamp *= 1000;

  }

  if (
    !Number.isFinite(
      timestamp
    )
  ) {

    return null;

  }

  return new Date(
    timestamp
  )
    .toISOString()
    .slice(
      0,
      10
    );

}


function decisionMarkerTime(
  value
) {

  const wantedDate =
    chartDateKey(
      value
    );

  if (!wantedDate) {

    return null;

  }

  const candle =
    chartHistory.find(
      item =>
        chartDateKey(
          getHistoryValue(
            item,
            [
              "time",
              "date",
              "timestamp",
              "datetime",
              "t"
            ]
          )
        ) === wantedDate
    );

  if (!candle) {

    return null;

  }

  return normalizeChartTime(
    getHistoryValue(
      candle,
      [
        "time",
        "date",
        "timestamp",
        "datetime",
        "t"
      ]
    )
  );

}


function clearDecisionChartOverlay() {

  if (
    candleSeries &&
    Array.isArray(
      decisionOverlayPriceLines
    )
  ) {

    decisionOverlayPriceLines.forEach(
      line => {

        try {

          candleSeries.removePriceLine(
            line
          );

        } catch {}

      }
    );

  }

  decisionOverlayPriceLines = [];

  if (
    marketChart &&
    Array.isArray(
      decisionOverlayRaySeries
    )
  ) {

    decisionOverlayRaySeries.forEach(
      series => {

        try {

          marketChart.removeSeries(
            series
          );

        } catch {}

      }
    );

  }

  decisionOverlayRaySeries = [];

  if (
    decisionOverlayMarkers &&
    typeof decisionOverlayMarkers.setMarkers ===
      "function"
  ) {

    try {

      decisionOverlayMarkers.setMarkers(
        []
      );

    } catch {}

  } else if (
    decisionOverlayUsesSeriesMarkers &&
    candleSeries &&
    typeof candleSeries.setMarkers ===
      "function"
  ) {

    try {

      candleSeries.setMarkers(
        []
      );

    } catch {}

  }

  decisionOverlayMarkers = null;
  decisionOverlayUsesSeriesMarkers = false;
  activeDecisionOverlay = null;

}


function addDecisionPriceLine(
  price,
  title,
  color,
  lineStyle
) {

  const safePrice =
    decisionPrice(
      price
    );

  if (
    !candleSeries ||
    safePrice === null
  ) {

    return;

  }

  try {

    const line =
      candleSeries.createPriceLine(
        {
          price: safePrice,
          color,
          lineWidth: 1,
          lineStyle,
          axisLabelVisible: true,
          title
        }
      );

    decisionOverlayPriceLines.push(
      line
    );

  } catch (error) {

    console.warn(
      "BORSACI: işlem planı çizgisi eklenemedi.",
      error
    );

  }

}


function chartTimeOrder(
  value
) {

  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {

    return value;

  }

  const parsed =
    Date.parse(
      String(value || "")
    );

  return Number.isFinite(parsed)
    ? Math.floor(parsed / 1000)
    : null;

}


function latestDecisionChartTime() {

  let latest =
    null;

  (chartHistory || []).forEach(
    item => {

      const time =
        normalizeChartTime(
          getHistoryValue(
            item,
            [
              "time",
              "date",
              "timestamp",
              "datetime",
              "t"
            ]
          )
        );

      if (
        time === null ||
        chartTimeOrder(time) === null ||
        (
          latest !== null &&
          chartTimeOrder(time) <=
            chartTimeOrder(latest)
        )
      ) {

        return;

      }

      latest =
        time;

    }
  );

  return latest;

}


function addDecisionPivotRay(
  point,
  label,
  color,
  lineStyle
) {

  if (
    !marketChart ||
    typeof LightweightCharts ===
      "undefined" ||
    !LightweightCharts.LineSeries
  ) {

    return;

  }

  const price =
    decisionPrice(
      point?.price
    );

  const startTime =
    decisionMarkerTime(
      point?.date
    );

  const endTime =
    latestDecisionChartTime();

  if (
    price === null ||
    startTime === null ||
    endTime === null ||
    chartTimeOrder(startTime) === null ||
    chartTimeOrder(endTime) === null ||
    chartTimeOrder(startTime) >=
      chartTimeOrder(endTime)
  ) {

    return;

  }

  try {

    const series =
      marketChart.addSeries(
        LightweightCharts.LineSeries,
        {
          color,
          lineWidth: 1,
          lineStyle,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
          title: `${label} RAY`
        }
      );

    series.setData(
      [
        {
          time: startTime,
          value: price
        },
        {
          time: endTime,
          value: price
        }
      ]
    );

    decisionOverlayRaySeries.push(
      series
    );

  } catch (error) {

    console.warn(
      "BORSACI: A/B/C yatay ışını eklenemedi.",
      error
    );

  }

}


function addDecisionDescendingResistanceTrendline(
  resistance,
  lineStyle
) {

  if (
    !marketChart ||
    typeof LightweightCharts ===
      "undefined" ||
    !LightweightCharts.LineSeries ||
    !(
      resistance?.valid ??
      resistance?.available
    )
  ) {

    return;

  }

  const anchor1 =
    resistance.anchor1;

  const anchor2 =
    resistance.anchor2;

  const projectedPoint =
    resistance.projectedPoint;

  const startTime =
    decisionMarkerTime(
      anchor1?.date
    );

  const anchor2Time =
    decisionMarkerTime(
      anchor2?.date
    );

  const endTime =
    decisionMarkerTime(
      projectedPoint?.date ??
      resistance.lastCompletedCandleTime
    );

  const startPrice =
    decisionPrice(
      anchor1?.price
    );

  const anchor2Price =
    decisionPrice(
      anchor2?.price
    );

  const endPrice =
    decisionPrice(
      projectedPoint?.price ??
      resistance.breakoutPrice ??
      resistance.breakoutPriceAtLast
    );

  if (
    startTime === null ||
    anchor2Time === null ||
    endTime === null ||
    startPrice === null ||
    anchor2Price === null ||
    endPrice === null ||
    chartTimeOrder(startTime) === null ||
    chartTimeOrder(anchor2Time) === null ||
    chartTimeOrder(endTime) === null ||
    chartTimeOrder(startTime) >=
      chartTimeOrder(anchor2Time) ||
    chartTimeOrder(anchor2Time) >
      chartTimeOrder(endTime)
  ) {

    return;

  }

  try {

    const series =
      marketChart.addSeries(
        LightweightCharts.LineSeries,
        {
          color:
            "#ff5d5d",
          lineWidth:
            2,
          lineStyle,
          lastValueVisible:
            false,
          priceLineVisible:
            false,
          crosshairMarkerVisible:
            false,
          title:
            "ALÇALAN TEPE TRENDİ"
        }
      );

    const data =
      [
        {
          time:
            startTime,
          value:
            startPrice
        },
        {
          time:
            anchor2Time,
          value:
            anchor2Price
        }
      ];

    if (
      chartTimeOrder(anchor2Time) <
      chartTimeOrder(endTime)
    ) {

      data.push(
        {
          time:
            endTime,
          value:
            endPrice
        }
      );

    }

    series.setData(
      data
    );

    decisionOverlayRaySeries.push(
      series
    );

  } catch (error) {

    console.warn(
      "BORSACI: alçalan tepe trend çizgisi eklenemedi.",
      error
    );

  }

}


function renderDecisionChartOverlay(
  decision
) {

  clearDecisionChartOverlay();

  if (
    !decision ||
    !candleSeries ||
    !marketChart
  ) {

    return;

  }

  const fib =
    decision.fibonacci ||
    {};

  const lineStyle =
    typeof LightweightCharts !==
      "undefined"
      ? (
          LightweightCharts.LineStyle ||
          {}
        )
      : {};

  const dotted =
    lineStyle.Dotted ??
    1;

  const dashed =
    lineStyle.Dashed ??
    2;

  const solid =
    lineStyle.Solid ??
    0;

  const levels =
    [
      {
        price:
          fib.entryTriggerPrice,
        title:
          "FIB TETİK",
        color:
          "#76a9ff",
        style:
          dashed
      },
      {
        price:
          decision.entry?.low ??
          fib.entryZoneLow ??
          fib.entryPrice,
        title:
          "GİRİŞ ALT",
        color:
          "#72dddd",
        style:
          dotted
      },
      {
        price:
          decision.entry?.high ??
          fib.entryZoneHigh,
        title:
          "GİRİŞ ÜST",
        color:
          "#72dddd",
        style:
          dotted
      },
      {
        price:
          fib.stopLoss ??
          decision.stop,
        title:
          "SL",
        color:
          "#ff6b6b",
        style:
          solid
      },
      {
        price:
          fib.tp1 ??
          decision.target1,
        title:
          "TP1",
        color:
          "#78e58b",
        style:
          solid
      },
      {
        price:
          fib.tp2 ??
          decision.target2,
        title:
          "TP2",
        color:
          "#78e58b",
        style:
          solid
      },
      {
        price:
          fib.tp3 ??
          decision.target3,
        title:
          "TP3",
        color:
          "#78e58b",
        style:
          solid
      }
    ];

  const drawnPrices =
    new Set();

  levels.forEach(
    level => {

      const price =
        decisionPrice(
          level.price
        );

      if (
        price === null ||
        drawnPrices.has(
          price.toFixed(6)
        )
      ) {

        return;

      }

      drawnPrices.add(
        price.toFixed(6)
      );

      addDecisionPriceLine(
        price,
        level.title,
        level.color,
        level.style
      );

    }
  );

  addDecisionDescendingResistanceTrendline(
    fib.descendingResistance,
    solid
  );

  const pivotOverlays =
    [
      {
        point:
          fib.pointA,
        label:
          "A",
        position:
          "belowBar",
        shape:
          "arrowUp",
        color:
          "#f5c15d",
        lineStyle:
          dotted
      },
      {
        point:
          fib.pointB,
        label:
          "B",
        position:
          "aboveBar",
        shape:
          "arrowDown",
        color:
          "#78e58b",
        lineStyle:
          dashed
      },
      {
        point:
          fib.pointC,
        label:
          "C",
        position:
          "belowBar",
        shape:
          "arrowUp",
        color:
          "#76a9ff",
        lineStyle:
          solid
      }
    ];

  pivotOverlays.forEach(
    pivot =>
      addDecisionPivotRay(
        pivot.point,
        pivot.label,
        pivot.color,
        pivot.lineStyle
      )
  );

  const markers =
    pivotOverlays
      .map(
        marker => {

          const time =
            decisionMarkerTime(
              marker.point?.date
            );

          const price =
            decisionPrice(
              marker.point?.price
            );

          if (
            time === null ||
            price === null
          ) {

            return null;

          }

          return {
            time,
            position:
              marker.position,
            color:
              marker.color,
            shape:
              marker.shape,
            text:
              `${marker.label} ₺${formatPrice(price)}`
          };

        }
      )
      .filter(Boolean);

  if (
    markers.length > 0
  ) {

    try {

      if (
        typeof LightweightCharts !==
          "undefined" &&
        typeof LightweightCharts.createSeriesMarkers ===
          "function"
      ) {

        decisionOverlayMarkers =
          LightweightCharts.createSeriesMarkers(
            candleSeries,
            markers
          );

      } else if (
        typeof candleSeries.setMarkers ===
          "function"
      ) {

        candleSeries.setMarkers(
          markers
        );

        decisionOverlayUsesSeriesMarkers =
          true;

      }

    } catch (error) {

      console.warn(
        "BORSACI: A/B/C grafikte işaretlenemedi.",
        error
      );

    }

  }

  activeDecisionOverlay =
    decision;

}


async function focusDecisionOnChart(
  decision
) {

  const symbol =
    normalizeSymbol(
      decision?.symbol
    );

  if (!symbol) {

    return;

  }

  const requestId =
    ++decisionOverlayRequestId;

  /* Fibonacci noktaları günlük olduğundan aynı zaman diliminde çizilir. */
  chartRange = "1y";
  chartInterval = "1d";

  try {

    await selectSymbol(
      symbol,
      {
        /* Karar grafiğini açmak watchlist'i veya GitHub'daki listeyi değiştirmez. */
        persistInWatchlist: false
      }
    );

    if (
      requestId !==
        decisionOverlayRequestId ||
      selectedSymbol !== symbol
    ) {

      return;

    }

    renderDecisionChartOverlay(
      decision
    );

  } catch (error) {

    console.warn(
      "BORSACI: işlem planı grafiği yüklenemedi.",
      error
    );

  }

}

function clearChartOnly() {

  clearDecisionChartOverlay();

  if (candleSeries) {

    try {

      candleSeries.setData(
        []
      );

    } catch {}

  }

  if (volumeSeries) {

    try {

      volumeSeries.setData(
        []
      );

    } catch {}

  }

  chartHistory =
    [];

}

/* ======================================================
   EMPTY CHART
====================================================== */

function showEmptyChart(
  title,
  message
) {

  if (!chartEmpty) return;

  chartEmpty.style.display =
    "flex";

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
   NEWS
====================================================== */

function updateNews(
  news
) {

  if (!newsFeed) return;

  if (
    !Array.isArray(news) ||
    news.length === 0
  ) {

    newsFeed.innerHTML = `
      <div class="empty-state">

        <span>
          NO NEWS DATA
        </span>

        <small>
          No recent news found.
        </small>

      </div>
    `;

    return;

  }

  newsFeed.innerHTML =
    news
      .slice(
        0,
        8
      )
      .map(
        item => {

          const title =
            escapeHtml(
              item?.title ||
              "Haber"
            );

          const source =
            escapeHtml(
              item?.source ||
              ""
            );

          const date =
            escapeHtml(
              item?.publishedDate ||
              item?.date ||
              ""
            );

          return `

            <div
              class="news-item"
            >

              <div
                class="news-date"
              >
                ${date}
              </div>

              <div
                class="news-title"
              >
                ${title}
              </div>

              <div
                class="news-source"
              >
                ${source}
              </div>

            </div>

          `;

        }
      )
      .join("");

}

/* ======================================================
   NEWS IMPACT
====================================================== */

function updateNewsImpact(
  news
) {

  if (!newsImpact) return;

  if (
    !Array.isArray(news) ||
    news.length === 0
  ) {

    newsImpact.innerHTML = `
      <span>
        NO NEWS DATA
      </span>

      <small>
        News impact will appear here.
      </small>
    `;

    return;

  }

  const latest =
    news[0];

  newsImpact.innerHTML = `

    <div class="impact-label">
      LATEST EVENT
    </div>

    <strong>
      ${escapeHtml(
        latest?.title ||
        "Haber"
      )}
    </strong>

    <small>
      ${escapeHtml(
        latest?.source ||
        ""
      )}
    </small>

  `;

}

/* ======================================================
   DASHBOARD ERROR
====================================================== */

function showDashboardError(
  message
) {

  showEmptyChart(
    "PİYASA VERİ HATASI",
    message
  );

  if (newsFeed) {

    newsFeed.innerHTML = `

      <div
        class="empty-state"
      >

        <span>
          DATA ERROR
        </span>

        <small>
          ${escapeHtml(
            message
          )}
        </small>

      </div>

    `;

  }

}

/* ======================================================
   CLEAR DASHBOARD
====================================================== */

function clearDashboard() {

  selectedSymbol =
    null;

  if (chartSymbol) {

    chartSymbol.innerText =
      "SEMBOL YOK";

  }

  clearChartOnly();

  [
    "rsi",
    "macd",
    "ema20",
    "ema50",
    "volume",
    "atr"
  ].forEach(
    id => {

      setText(
        id,
        "--"
      );

    }
  );

  showEmptyChart(
    "PİYASA VERİSİ YOK",
    "Select a symbol to display the chart."
  );

  if (newsFeed) {

    newsFeed.innerHTML = `
      <div class="empty-state">

        <span>
          NO NEWS LOADED
        </span>

        <small>
          Select a symbol.
        </small>

      </div>
    `;

  }

  if (newsImpact) {

    newsImpact.innerHTML = `
      <span>
        NO NEWS DATA
      </span>

      <small>
        Select a symbol.
      </small>
    `;

  }

  renderWatchlist();

}

/* ======================================================
   AI RESPONSE
====================================================== */

function renderAIResponse(
  text
) {

  if (!responseBox) return;

  if (
    text === null ||
    text === undefined ||
    String(text).trim() === ""
  ) {

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

  let html =
    escapeHtml(
      String(text)
    );

  html =
    html.replace(
      /^### (.+)$/gm,
      "<h4>$1</h4>"
    );

  html =
    html.replace(
      /^## (.+)$/gm,
      "<h3>$1</h3>"
    );

  html =
    html.replace(
      /^# (.+)$/gm,
      "<h2>$1</h2>"
    );

  html =
    html.replace(
      /\*\*(.+?)\*\*/g,
      "<strong>$1</strong>"
    );

  html =
    html.replace(
      /^[-•] (.+)$/gm,
      '<div class="ai-bullet">• $1</div>'
    );

  html =
    html.replace(
      /\n/g,
      "<br>"
    );

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

function showAnalysisError(
  message
) {

  if (!responseBox) return;

  responseBox.innerHTML = `

    <div class="ai-error">

      <strong>
        ANALYSIS ERROR
      </strong>

      <small>
        ${escapeHtml(
          message ||
          "Analiz sırasında bilinmeyen bir hata oluştu."
        )}
      </small>

    </div>

  `;

}

/* ======================================================
   ANALYZE BUTTON STATE
====================================================== */

function setAnalyzeButtonState(
  loading
) {

  if (!analyzeBtn) return;

  analyzeBtn.disabled =
    loading;

  if (loading) {

    if (
      !analyzeBtn.dataset.originalText
    ) {

      analyzeBtn.dataset.originalText =
        analyzeBtn.innerText;

    }

    analyzeBtn.innerText =
      "ANALYZING...";

    analyzeBtn.classList.add(
      "loading"
    );

  } else {

    analyzeBtn.innerText =
      analyzeBtn.dataset.originalText ||
      "ANALYZE";

    analyzeBtn.classList.remove(
      "loading"
    );

  }

}

/* ======================================================
   FETCH TIMEOUT
====================================================== */

async function fetchWithTimeout(
  url,
  options = {},
  timeout = 4500000
) {

  const controller =
    new AbortController();

  const timeoutId =
    setTimeout(
      () => {

        controller.abort();

      },
      timeout
    );

  try {

    return await fetch(
      url,
      {
        ...options,
        signal:
          controller.signal
      }
    );

  } catch (error) {

    if (
      error?.name ===
      "AbortError"
    ) {

      throw new Error(
        "Render /ask 45 saniye içinde cevap vermedi."
      );

    }

    throw error;

  } finally {

    clearTimeout(
      timeoutId
    );

  }

}

/* ======================================================
   ANALYZE
====================================================== */

async function analyzeQuestion() {

  if (
    analysisRunning
  ) {

    return;

  }

  if (!questionInput) {

    console.error(
      "BORSACI: #question bulunamadı."
    );

    return;

  }

  const question =
    questionInput.value.trim();

  if (!question) {

    questionInput.focus();

    return;

  }

  analysisRunning =
    true;

  setAnalyzeButtonState(
    true
  );

  showAnalysisLoading();

  console.log(
    "========================================"
  );

  console.log(
    "BORSACI AI REQUEST START"
  );

  console.log(
    "Endpoint:",
    "/ask"
  );

  console.log(
    "Question:",
    question
  );

  console.log(
    "Image attached:",
    Boolean(selectedImageBase64)
  );

  try {

    const response =
      await fetchWithTimeout(
        "/ask",
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",

            Accept:
              "application/json"
          },

          body:
            JSON.stringify(
              {
                question,
                image: selectedImageBase64 || null
              }
            ),

          cache:
            "no-store"
        },
        4500000
      
      );

    const text =
      await response.text();

    console.log(
      "BORSACI AI HTTP STATUS:",
      response.status
    );

    console.log(
      "BORSACI AI RAW RESPONSE:",
      text
    );

    if (
      !text ||
      !text.trim()
    ) {

      throw new Error(
        `Render /ask boş cevap döndürdü. HTTP ${response.status}`
      );

    }

    let data;

    try {

      data =
        JSON.parse(
          text
        );

    } catch {

      throw new Error(
        `Render /ask JSON döndürmedi. HTTP ${response.status}. Cevap: ${text.slice(0, 300)}`
      );

    }

    if (
      !response.ok
    ) {

      throw new Error(
        data?.error ||
        data?.message ||
        data?.details ||
        `AI endpoint HTTP ${response.status}`
      );

    }

    const answer =
      data?.answer ??
      data?.response ??
      data?.result ??
      data?.text ??
      data?.message;

    if (
      answer === null ||
      answer === undefined ||
      String(answer).trim() === ""
    ) {

      throw new Error(
        "AI sunucusu başarılı HTTP cevabı verdi ancak analiz metni bulunamadı."
      );

    }

    renderAIResponse(
      answer
    );

    clearSelectedImage();

  } catch (error) {

    console.error(
      "BORSACI AI ERROR:",
      error
    );

    showAnalysisError(
      error?.message ||
      "Analiz sırasında bilinmeyen bir hata oluştu."
    );

  } finally {

    analysisRunning =
      false;

    setAnalyzeButtonState(
      false
    );

  }

}

/* ======================================================
   EVENT BINDING
====================================================== */

function bindEvents() {

  /*
   * EKLE
   */

  if (addSymbolBtn) {

    addSymbolBtn.addEventListener(
      "click",
      addSymbol
    );

  } else {

    console.error(
      "BORSACI: #addSymbolBtn bulunamadı."
    );

  }

  /*
   * ANALYZE
   */

  if (analyzeBtn) {

    analyzeBtn.addEventListener(
      "click",
      analyzeQuestion
    );

  } else {

    console.error(
      "BORSACI: #analyzeBtn bulunamadı."
    );

  }

  /*
   * ENTER
   */

  if (questionInput) {

    questionInput.addEventListener(
      "keydown",
      event => {

        if (
          event.key === "Enter" &&
          !event.shiftKey
        ) {

          event.preventDefault();

          analyzeQuestion();

        }

      }
    );

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

  async loadChart(
    range = "1y",
    interval = "1d"
  ) {

    const symbol =
      selectedSymbol;

    if (!symbol) {

      console.warn(
        "BORSACI CHART: Seçili sembol yok."
      );

      return;

    }

    chartRange =
      range;

    chartInterval =
      interval;

    const cacheKey =
      `${symbol}_${range}_${interval}`;

    delete chartCache[
      cacheKey
    ];

    await loadChartData(
      symbol,
      range,
      interval
    );

  },

  getHistory() {

    const cacheKey =
      `${selectedSymbol}_${chartRange}_${chartInterval}`;

    return (
      chartCache[
        cacheKey
      ]?.history ||
      chartHistory ||
      []
    );

  }

};

/* ======================================================
   CHART CONTROL EVENT
====================================================== */

window.addEventListener(
  "borsaci",
  async event => {

    const detail =
      event.detail || {};

    const range =
      detail.range ||
      "1y";

    const interval =
      detail.interval ||
      "1d";

    chartRange =
      range;

    chartInterval =
      interval;

    if (!selectedSymbol) {

      console.warn(
        "BORSACI: Chart change geldi ama seçili sembol yok."
      );

      return;

    }

    const cacheKey =
      `${selectedSymbol}_${range}_${interval}`;

    delete chartCache[
      cacheKey
    ];

    await loadChartData(
      selectedSymbol,
      range,
      interval
    );

  }
);

/* ======================================================
   INITIALIZATION
====================================================== */

async function initializeBorsaCI() {

  console.log(
    "BORSACI: Initialization started."
  );

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

  setInterval(
    updateClock,
    1000
  );

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

  if (
    symbols.length > 0
  ) {

    await selectSymbol(
      symbols[0]
    );

  } else {

    clearDashboard();

  }

  console.log(
    "BORSACI: Application initialized."
  );

}

/* ======================================================
   START
====================================================== */

async function startBorsaCIWhenAuthenticated() {
  if (!window.borsaciAuth?.authenticated) {
    await new Promise(
      resolve =>
        window.addEventListener(
          "borsaci:auth-ready",
          resolve,
          { once: true }
        )
    );
  }

  initializeBorsaCI();
}

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    startBorsaCIWhenAuthenticated,
    {
      once: true
    }
  );

} else {

  startBorsaCIWhenAuthenticated();

}

console.log(
  "BORSACI: APP.JS loaded."
);
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

    const clock =
      document.getElementById("clock");

    if (!clock) return;

    const now = new Date();

    clock.textContent =
      now.toLocaleTimeString(
        "tr-TR",
        {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit"
        }
      );

  }

  updateClock();

  setInterval(
    updateClock,
    1000
  );


  /* =======================================================
     DATA STATUS
  ======================================================= */

  function setVisualDataStatus(
    text,
    type = "waiting"
  ) {

    const el =
      document.getElementById(
        "dataStatus"
      );

    if (!el) return;

    el.textContent =
      text;

    el.dataset.status =
      type;

    if (type === "live") {
      el.style.color =
        "var(--borsaci-green)";
    }

    else if (type === "error") {
      el.style.color =
        "var(--borsaci-red)";
    }

    else {
      el.style.color =
        "";
    }

  }

  setVisualDataStatus(
    "LIVE",
    "live"
  );


  /* =======================================================
     PANEL LOAD EFFECT
  ======================================================= */

  function animatePanels() {

    const panels =
      document.querySelectorAll(
        ".panel, .command-panel"
      );

    panels.forEach(
      (panel, index) => {

        panel.style.opacity = "0";
        panel.style.transform =
          "translateY(5px)";

        setTimeout(
          () => {

            panel.style.transition =
              "opacity .35s ease, transform .35s ease";

            panel.style.opacity = "1";
            panel.style.transform =
              "translateY(0)";

          },
          index * 45
        );

      }
    );

  }

  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      animatePanels
    );

  } else {

    animatePanels();

  }


  /* =======================================================
     COMMAND SHORTCUTS
  ======================================================= */

  const question =
    document.getElementById(
      "question"
    );

  if (question) {

    question.addEventListener(
      "keydown",
      event => {

        /* ESC = CLEAR */

        if (
          event.key === "Escape"
        ) {

          question.value = "";

          question.focus();

        }

      }
    );

  }


  /* =======================================================
     NEWS HOVER SOURCE EFFECT
  ======================================================= */

  document.addEventListener(
    "mouseover",
    event => {

      const item =
        event.target.closest(
          ".news-item"
        );

      if (!item) return;

      const source =
        item.querySelector(
          ".news-source"
        );

      if (!source) return;

      source.style.transition =
        "text-shadow .2s ease";

      source.style.textShadow =
        "0 0 10px rgba(255,159,28,.35)";

    }
  );

  document.addEventListener(
    "mouseout",
    event => {

      const item =
        event.target.closest(
          ".news-item"
        );

      if (!item) return;

      const source =
        item.querySelector(
          ".news-source"
        );

      if (!source) return;

      source.style.textShadow =
        "";

    }
  );


  /* =======================================================
     COMMAND INPUT CHARACTER COUNTER
  ======================================================= */

  if (question) {

    const footer =
      document.querySelector(
        ".command-footer"
      );

    if (footer) {

      const counter =
        document.createElement(
          "span"
        );

      counter.id =
        "commandCounter";

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
      footer.insertBefore(
        counter,
        footer.querySelector(
          ".command-actions"
        )
      );

      function updateCounter() {

        counter.textContent =
          `${question.value.length} CHARS`;

      }

      question.addEventListener(
        "input",
        updateCounter
      );

      updateCounter();

    }

  }


  /* =======================================================
     AI RESPONSE AUTO SCROLL
  ======================================================= */

  const response =
    document.getElementById(
      "response"
    );

  if (response) {

    const observer =
      new MutationObserver(
        () => {

          response.scrollTop =
            response.scrollHeight;

        }
      );

    observer.observe(
      response,
      {
        childList: true,
        subtree: true,
        characterData: true
      }
    );

  }


  /* =======================================================
     TERMINAL READY
  ======================================================= */

  console.log(
    "%c BORSACI UI READY ",
    `
      background:#ff9f1c;
      color:#080808;
      font-weight:bold;
      padding:4px 8px;
    `
  );
/*
========================================================
AI TRADING SCANNER
========================================================
*/

const scannerStartButton =
  document.getElementById(
    "startScannerBtn"
  );

const scannerStopButton =
  document.getElementById(
    "stopScannerBtn"
  );

const scannerResults =
  document.getElementById(
    "scannerResults"
  );

const scannerStatus =
  document.getElementById(
    "scannerStatus"
  );

const tradingEngineStatus =
  document.getElementById(
    "tradingEngineStatus"
  );

const lastScanTime =
  document.getElementById(
    "lastScanTime"
  );


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
  const percent=Math.max(0,Math.min(100,Number(progress)||0));
  scannerResults.innerHTML=`<div class="trading-empty scanner-progress"><strong>${status === "ERROR" ? "TARAMA HATASI" : status === "COMPLETE" ? "TARAMA TAMAMLANDI" : "TARAMA ÇALIŞIYOR"}</strong><br><small>${escapeHtml(String(message||"Hazırlanıyor"))}</small><div style="height:8px;border:1px solid #2f6;background:#071008;margin:12px auto;max-width:480px"><div style="height:100%;width:${percent}%;background:#34ff75;transition:width .3s ease"></div></div><small>${percent}%</small></div>`;
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
    "AI PLAN": "YZ PLANI",
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
  const poll=async()=>{
    try {
      const response=await fetch(`/api/trading/scanner/status?jobId=${encodeURIComponent(jobId)}`,{cache:"no-store"});
      const job=await response.json();
      // Tarama sonucu ekrana basıldıktan veya kullanıcı durdurduktan sonra
      // geç gelen poll, eski progress/snapshot görünümünü geri getiremez.
      if (requestId !== scannerRequestId || generation !== scannerProgressGeneration) return;
      renderScannerProgress(job.progress,job.message,job.status);
      if (job.status === "COMPLETE" || job.status === "ERROR") stopScannerProgress();
    } catch { /* Ana scanner isteği sonucu hatayı gösterecek. */ }
  };
  void poll();
  scannerProgressTimer=setInterval(poll,700);
}


/*
--------------------------------------------------------
FORMAT
--------------------------------------------------------
*/

function formatPrice(
  value
) {

  if (
    value === null ||
    value === undefined ||
    value === "" ||
    !Number.isFinite(Number(value))
  ) {
    return "--";
  }

  return Number(value)
    .toFixed(2);

}


function formatPercent(
  value
) {

  if (
    value === null ||
    value === undefined ||
    value === "" ||
    !Number.isFinite(Number(value))
  ) {
    return "--";
  }

  return (
    Number(value)
      .toFixed(1) +
    "%"
  );

}


/*
--------------------------------------------------------
RENDER
--------------------------------------------------------
*/

function renderScannerResults(results) {
  if (!scannerResults) return;
  if (!Array.isArray(results) || !results.length) { scannerResults.innerHTML='<div class="trading-empty">VERİ YETERSİZ veya tarama sonucu yok.</div>'; return; }
  scannerResults.innerHTML=results.map((item,index)=>{
    const fib=item.fibonacci||{};
    return `<div class="scanner-card scanner-compact" data-symbol="${item.symbol}">
      <div class="scanner-head"><strong>#${index+1} · ${item.symbol}</strong><strong>₺${formatPrice(item.price)}</strong><span class="scanner-score">TEKNİK ${item.score??"--"}/100</span><span>${item.grade||item.decision}</span></div>
      <div class="scanner-metrics">RSI ${formatPrice(item.rsi)} · EMA20 ₺${formatPrice(item.ema20)} · EMA50 ₺${formatPrice(item.ema50)} · EMA200 ₺${formatPrice(item.ema200)} · MACD ${formatPrice(item.macd)} · ATR ₺${formatPrice(item.atr)}</div>
      <div class="scanner-metrics">Hacim oranı ${formatPrice(item.volumeRatio)} · Fibonacci ${fib.status||"YAPI YOK"} · Günlük teyit ${fib.confirmationPassed?"GEÇTİ":"BEKLİYOR"}</div>
      <small>${Array.isArray(item.reasons)&&item.reasons.length?item.reasons.join(" · "):item.dataStatus||"VERİ YETERSİZ"}</small>
    </div>`;
  }).join("");
}


/*
--------------------------------------------------------
SCAN
--------------------------------------------------------
*/

const aiDecisionFeed =
  document.getElementById(
    "aiDecisionFeed"
  );

const tradingActivity =
  document.getElementById(
    "tradingActivity"
  );


const TRADING_STATE_STORAGE_KEY =
  "borsaci_trading_state_v1";


function saveLocalTradingState(
  state
) {

  try {

    localStorage.setItem(
      TRADING_STATE_STORAGE_KEY,
      JSON.stringify(
        {
          decisions:
            Array.isArray(state?.decisions)
              ? state.decisions
              : [],
          paper:
            state?.paper || null,
          activity:
            Array.isArray(state?.activity)
              ? state.activity
              : [],
          history:
            Array.isArray(state?.history)
              ? state.history
              : [],
          lastScanAt:
            state?.lastScanAt || null,
          risk:
            state?.risk || null,
        }
      )
    );

  } catch (error) {

    console.error(
      "Trading state yerel kaydedilemedi:",
      error
    );

  }

}


function loadLocalTradingState() {

  try {

    const raw =
      localStorage.getItem(
        TRADING_STATE_STORAGE_KEY
      );

    if (!raw) {
      return null;
    }

    const state =
      JSON.parse(raw);

    if (
      !state ||
      typeof state !== "object"
    ) {
      return null;
    }

    return state;

  } catch (error) {

    console.error(
      "Trading state yerel yüklenemedi:",
      error
    );

    return null;

  }

}


function formatCurrency(
  value
) {

  if (
    value === null ||
    value === undefined ||
    value === "" ||
    !Number.isFinite(Number(value))
  ) {
    return "--";
  }

  return new Intl.NumberFormat(
    "tr-TR",
    {
      style: "currency",
      currency: "TRY",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  ).format(Number(value));

}


let renderedDecisionRecords = [];


function scoreValue(value, fallback = 0) {
  return Number.isFinite(Number(value))
    ? Number(value)
    : fallback;
}


function renderScoreFactors(bucket, type, decision) {
  const items = Array.isArray(bucket?.items)
    ? bucket.items
    : [];

  if (!items.length) {
    return '<span class="score-factor score-factor-muted">Kalem verisi yok</span>';
  }

  const isInitialTechnicalScreen =
    decision?.scoreBreakdown?.calculationStage ===
    "INITIAL_TECHNICAL_SCREEN";

  return items.map(item => {
    const points = scoreValue(item?.points);
    const maxPoints = Math.abs(scoreValue(item?.maxPoints));
    const fibonacciAddedLater =
      isInitialTechnicalScreen &&
      decision?.fibonacci?.valid &&
      [
        "valid_fibonacci",
        "fibonacci_confirmation",
        "volume_confirmation",
        "risk_reward",
      ].includes(item?.id);

    if (type === "penalty") {
      if (!item?.applied) {
        return '';
      }

      return `<span class="score-factor score-factor-penalty">${escapeHtml(`−${Math.abs(points)} ${item.label}`)}</span>`;
    }

    const stateClass = item?.passed
      ? "score-factor-pass"
      : fibonacciAddedLater
        ? "score-factor-info"
        : "score-factor-miss";

    const prefix = item?.passed
      ? `+${points}${item?.partial ? `/${maxPoints}` : ""}`
      : fibonacciAddedLater
        ? "PLAN"
        : `+0/${maxPoints}`;

    const message = fibonacciAddedLater
      ? `${item.label}: Fibonacci planında ayrı doğrulandı`
      : `${prefix} ${item.label}${item?.detail ? ` — ${item.detail}` : ""}`;

    return `<span class="score-factor ${stateClass}">${escapeHtml(message)}</span>`;
  }).join("");
}


function renderDecisionScoreBreakdown(item) {
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
  const validBreakdown =
    breakdown &&
    typeof breakdown === "object" &&
    ["trend", "momentum", "volumeLiquidity", "entryQuality"]
      .every(key => breakdown[key] && Array.isArray(breakdown[key].items));

  if (!validBreakdown) {
    content.innerHTML = `<div class="decision-score-empty"><strong>${escapeHtml(item.symbol || "BU KARAR")}</strong> için puan kalemleri eski tarama formatında kayıtlı. Scanner'ı yeniden çalıştırdığında Trend, Momentum, Hacim/Likidite, Giriş Kalitesi ve cezalar burada ayrı ayrı görünür.</div>`;
    return;
  }

  const total = scoreValue(
    item.indicators?.score,
    scoreValue(breakdown.total)
  );
  const grade = item.grade || item.action || "KARAR";
  const missingForBuy = Math.max(0, BUY_SETUP_SCORE_THRESHOLD - total);
  const fib = item.fibonacci || {};
  const rows = [
    ["Trend", breakdown.trend],
    ["Momentum", breakdown.momentum],
    ["Hacim & likidite", breakdown.volumeLiquidity],
    ["Giriş kalitesi", breakdown.entryQuality],
  ];

  const rowMarkup = rows.map(([label, bucket]) => {
    const points = scoreValue(bucket?.score);
    const maximum = scoreValue(bucket?.max);
    return `<tr><th scope="row">${escapeHtml(label)}</th><td><strong>${points}/${maximum}</strong></td><td>${renderScoreFactors(bucket, "positive", item)}</td></tr>`;
  }).join("");

  const penaltyPoints = scoreValue(breakdown.penalties?.score);
  const penaltyFactors = renderScoreFactors(
    breakdown.penalties,
    "penalty",
    item
  ) || '<span class="score-factor score-factor-pass">Ceza yok</span>';
  const fibStatus = fib.status || "FIBONACCI YOK";
  const fibNote = fib.valid
    ? `Fibonacci ${fibStatus}: işlem planı kapısı ayrı izlenir; ilk teknik puana geriye dönük eklenmez.`
    : `Fibonacci ${fibStatus}: teknik puan tablosundan ayrı değerlendirilir.`;
  const threshold = total >= BUY_SETUP_SCORE_THRESHOLD
    ? `AL eşiği (${BUY_SETUP_SCORE_THRESHOLD}) teknik olarak geçildi.`
    : `AL eşiğine ${missingForBuy} puan kaldı.`;

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
  const element=document.getElementById("aiDecisionDetail"); if(!element||!item)return;
  renderDecisionScoreBreakdown(item);
  const position=currentPaperState().positions.find(value =>
    value.status === "OPEN" &&
    (value.decisionId === item.id || (value.decisionIds || []).includes(item.id) || value.symbol === item.symbol)
  );
  const fib=item.fibonacci||{};
  const fibAvailable=Boolean(fib.pointA&&fib.pointB&&fib.pointC);
  const stop=fib.stopLoss??item.stop;
  const tp1=fib.tp1??item.target1;
  const tp2=fib.tp2??item.target2;
  const tp3=fib.tp3??item.target3;
  const chartStatus=fibAvailable
    ?`<div class="decision-chart-status"><strong>GRAFİK KATMANI</strong><span>A/B/C işaretleri ve sağa uzanan seviyeleri ile tetik, giriş, SL, hedefler ve varsa alçalan tepe trendi KARAR GRAFİĞİ üzerinde çizildi.</span><span class="decision-chart-key trigger">TETİK</span><span class="decision-chart-key entry">GİRİŞ</span><span class="decision-chart-key resistance">DİRENÇ TRENDİ</span><span class="decision-chart-key stop">SL</span><span class="decision-chart-key target">TP1–3</span></div>`
    :`<div class="decision-chart-status"><strong>GRAFİK KATMANI</strong><span>Geçerli A/B/C noktası olmadığı için grafiğe Fibonacci çizgisi eklenmedi.</span></div>`;
  const pendingOrderButton=item.status==="PENDING_APPROVAL"
    ?`<button type="button" class="trading-button" data-paper-order-focus="${escapeHtml(item.id)}">BEKLEYEN KÂĞIT EMRİNİ AÇ</button>`
    :(!position && !isManualPaperOrder(null,item)
      ?`<button type="button" class="trading-button" data-paper-action="queue" data-decision-id="${escapeHtml(item.id)}">BEKLEYEN EMİR OLUŞTUR</button>`
      :"");
  element.innerHTML=`<strong>${escapeHtml(item.symbol)} · ${escapeHtml(item.grade||translateTradingStatus(item.action)||"KARAR")} · ${escapeHtml(translateTradingStatus(fib.status||"FIBONACCI YOK"))}</strong><div class="decision-detail-grid"><span>Giriş: ${formatCurrency(item.entry?.low)}–${formatCurrency(item.entry?.high)}</span><span>A: ${formatCurrency(fib.pointA?.price)} · ${chartDateKey(fib.pointA?.date)||"--"}</span><span>B: ${formatCurrency(fib.pointB?.price)} · ${chartDateKey(fib.pointB?.date)||"--"}</span><span>C: ${formatCurrency(fib.pointC?.price)} · ${chartDateKey(fib.pointC?.date)||"--"}</span><span>Tetik: ${formatCurrency(fib.entryTriggerPrice)}</span><span>Stop: ${formatCurrency(stop)}</span><span>TP1: ${formatCurrency(tp1)} · R/R ${fib.riskRewardTp1??item.riskReward?.tp1??"--"}</span><span>TP2: ${formatCurrency(tp2)} · R/R ${fib.riskRewardTp2??item.riskReward?.tp2??"--"}</span><span>TP3: ${formatCurrency(tp3)} · R/R ${fib.riskRewardTp3??item.riskReward?.tp3??"--"}</span><span>Günlük teyit: ${fib.confirmationPassed?"GEÇTİ":"BEKLİYOR"} · ${escapeHtml(fib.confirmationCandleTime||fib.invalidReason||"VERİ YOK")}</span></div>${chartStatus}${item.aiReview?.newsComment?`<div class="ai-review-comment"><strong>HABER YORUMU</strong><br>${escapeHtml(item.aiReview.newsComment)}</div>`:""}${item.aiReview?.expertComment?`<div class="ai-review-comment"><strong>UZMAN YORUMU · YZ</strong><br>${escapeHtml(item.aiReview.expertComment)}</div>`:""}${item.aiReview?.summary?`<div class="ai-review-comment"><strong>ÖZET</strong><br>${escapeHtml(item.aiReview.summary)}</div>`:""}<small>${escapeHtml(item.reason||"")}</small><br>${position?`<button type="button" class="trading-button" data-paper-action="close" data-position-id="${escapeHtml(position.id)}">KÂĞIT POZİSYONU KAPAT</button>`:pendingOrderButton}`;
}


function renderAiDecisions(decisions) {
  if (!aiDecisionFeed) return;
  renderDecisionScoreBreakdown(null);
  const allRecords=uniqueDecisions(decisions);
  // Manuel emirler AI tarafından değerlendirilmiş bir karar değildir.
  // Onları yalnızca Pending Paper Orders kuyruğunda göster; aksi halde
  // boş Fibonacci/grafik alanlarıyla AI Decisions ekranını karıştırırlar.
  // AI karar ekranı sadece son taramanın teknik ilk üç adayını gösterir.
  // Önceki taramadan açık kalan pozisyonlar Open Positions bölümünde
  // izlenir; burada yeni seçilmiş gibi ikinci kez görünmez.
  const records=allRecords.filter(item=>!isManualPaperOrder(null,item)&&item.currentScan!==false);
  renderedDecisionRecords=records;
  const pendingState={
    ...(loadLocalTradingState()||latestPaperOrderState||{}),
    decisions:allRecords,
  };
  if (!records.length) {
    aiDecisionFeed.innerHTML='<div class="trading-empty">Detaylı teknik aday bulunamadı.</div>';
    renderPendingPaperOrders(pendingState);
    renderManualPendingOrders(pendingState);
    return;
  }
  aiDecisionFeed.innerHTML=records.map((item,index)=>`<article class="decision-item decision-card" data-decision-index="${index}"><header><strong>${item.symbol}</strong><span>${item.grade||translateTradingStatus(item.action)}</span><span>${translateTradingStatus(item.status)}</span><span class="ai-score-pill">TEKNİK ${item.indicators?.score??"--"}/100</span></header><div class="decision-price-grid"><span><small>GİRİŞ</small>${formatCurrency(item.entry?.low)} – ${formatCurrency(item.entry?.high)}</span><span><small>STOP</small>${formatCurrency(item.stop)}</span><span><small>TP1 / TP2 / TP3</small>${formatCurrency(item.target1)} / ${formatCurrency(item.target2)} / ${formatCurrency(item.target3)}</span></div><div class="decision-summary">${item.planMethod||"DESTEK / DİRENÇ + ATR"} · R/R TP2: ${item.riskReward?.tp2??"--"} · Garanti değildir.</div></article>`).join("");
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
    const time = quote.asOf
      ? new Date(quote.asOf).toLocaleTimeString("tr-TR", {hour: "2-digit", minute: "2-digit", second: "2-digit"})
      : "--";
    element.textContent = `SON DOĞRULANMIŞ FİYAT: ${formatCurrency(quote.price)} · ${time}`;
    element.title = "Sunucunun aldığı son tamamlanmış fiyat verisi";
  });
}

async function refreshPaperMonitorStatus() {
  if (paperMonitorRefreshInFlight) return;
  paperMonitorRefreshInFlight = true;
  try {
    const symbols = [...new Set(
      [...document.querySelectorAll("[data-order-market-price]")]
        .map(element => String(element.dataset.symbol || "").toUpperCase())
        .filter(Boolean)
    )];
    const response = await fetch(
      `/api/trading/paper/monitor-status?symbols=${encodeURIComponent(symbols.join(","))}`,
      {cache: "no-store"}
    );
    if (!response.ok) return;
    const payload = await response.json();
    paperMonitorUiState = payload?.monitor || paperMonitorUiState;
    renderPaperMonitorStatus(paperMonitorUiState, payload?.prices || {});

    (payload?.unavailable || []).forEach(symbol => {
      document.querySelectorAll(`[data-order-market-price][data-symbol="${String(symbol).replace(/"/g, "\\\"")}"]`).forEach(element => {
        element.textContent = "SON DOĞRULANMIŞ FİYAT: GEÇİCİ OLARAK ALINAMADI";
      });
    });
  } catch {
    // Ana emir kartını bozma; bir sonraki kısa yenilemede tekrar denenir.
  } finally {
    paperMonitorRefreshInFlight = false;
  }
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

  const local =
    loadLocalTradingState() || {};

  const paper =
    local.paper || {};

  return {
    initialCapital:
      Number(paper.initialCapital) || 100000,
    cash:
      Number(paper.cash) || 100000,
    equity:
      Number(paper.equity) || 100000,
    pnl:
      Number(paper.pnl) || 0,
    pnlPercent:
      Number(paper.pnlPercent) || 0,
    positions:
      Array.isArray(paper.positions)
        ? paper.positions
        : [],
  };

}


function paperOrderNumber(
  value,
  fallback = null
) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? number
    : fallback;
}


function firstPaperOrderNumber(
  ...values
) {
  for (const value of values) {
    const number = paperOrderNumber(value);
    if (number !== null) return number;
  }
  return null;
}


function paperOrderInputValue(
  value,
  decimals = 2
) {
  const number = paperOrderNumber(value);
  return number === null
    ? ""
    : number.toFixed(decimals);
}


function normalizePaperOrderType(
  value
) {
  return String(value || "LIMIT").toUpperCase() === "LIMIT"
    ? "LIMIT"
    : "MARKET";
}


function isManualPaperOrder(
  order,
  decision
) {
  return [
    order?.source,
    order?.origin,
    order?.type,
    decision?.source,
    decision?.origin,
    decision?.action,
  ].some(
    value => String(value || "").toUpperCase().includes("MANUAL")
  );
}


function buildPendingPaperOrder(
  rawOrder,
  linkedDecision
) {
  const order = rawOrder || {};
  const decision = linkedDecision || order.decision || {};
  const decisionId = String(
    order.decisionId ||
    decision.id ||
    ""
  ).trim();
  const orderId = String(
    order.id ||
    order.orderId ||
    decision.pendingOrderId ||
    decisionId ||
    ""
  ).trim();
  const entry = decision.entry || {};
  const riskPlan = decision.riskPlan || {};
  const pendingOrder = order.pendingOrder || decision.pendingOrder || {};
  const orderType = normalizePaperOrderType(
    order.orderType ?? order.type ?? pendingOrder.orderType ?? decision.orderType
  );

  return {
    orderId,
    decisionId,
    status: String(order.status || pendingOrder.status || decision.status || "PENDING_APPROVAL").toUpperCase(),
    symbol: String(
      order.symbol ||
      decision.symbol ||
      ""
    ).trim().toUpperCase(),
    quantity: firstPaperOrderNumber(
      order.quantity,
      order.lot,
      pendingOrder.quantity,
      pendingOrder.lot,
      riskPlan.quantity,
      decision.quantity
    ),
    entryPrice: orderType === "MARKET" ? null : firstPaperOrderNumber(
      order.entryPrice,
      order.limitPrice,
      order.entry,
      pendingOrder.entryPrice,
      pendingOrder.limitPrice,
      pendingOrder.entry,
      entry.reference,
      entry.low
    ),
    orderType,
    stop: firstPaperOrderNumber(order.stop, pendingOrder.stop, decision.stop),
    target1: firstPaperOrderNumber(
      order.target1,
      order.tp1,
      pendingOrder.target1,
      pendingOrder.tp1,
      decision.target1
    ),
    target2: firstPaperOrderNumber(
      order.target2,
      order.tp2,
      pendingOrder.target2,
      pendingOrder.tp2,
      decision.target2
    ),
    target3: firstPaperOrderNumber(
      order.target3,
      order.tp3,
      pendingOrder.target3,
      pendingOrder.tp3,
      decision.target3
    ),
    createdAt: order.createdAt || pendingOrder.createdAt || decision.timestamp || decision.lifecycle?.createdAt || "",
    source: isManualPaperOrder(order, decision)
      ? "MANUAL"
      : "AI PLAN",
  };
}


function pendingPaperOrdersFromState(
  state,
  sourceFilter = "ALL"
) {
  const source = state && typeof state === "object"
    ? state
    : {};
  const decisions = Array.isArray(source.decisions)
    ? source.decisions
    : [];
  const byDecisionId = new Map(
    decisions
      .filter(item => item?.id)
      .map(item => [String(item.id), item])
  );
  const orders = [];
  const seen = new Set();
  const append = (rawOrder, linkedDecision) => {
    const order = buildPendingPaperOrder(rawOrder, linkedDecision);
    if (!order.symbol) return;
    const key = order.decisionId
      ? `decision:${order.decisionId}`
      : `order:${order.orderId}:${order.symbol}`;
    if (seen.has(key)) return;
    seen.add(key);
    orders.push(order);
  };

  const explicitOrders = [
    ...(Array.isArray(source.paper?.pendingOrders)
      ? source.paper.pendingOrders
      : []),
    ...(Array.isArray(source.pendingOrders)
      ? source.pendingOrders
      : []),
  ];

  explicitOrders
    .filter(order => {
      const status = String(order?.status || "PENDING_APPROVAL").toUpperCase();
      return status === "PENDING" || status === "PENDING_APPROVAL" || status === "PENDING_LIMIT";
    })
    .forEach(order => {
      append(order, byDecisionId.get(String(order?.decisionId || "")));
    });

  decisions
    .filter(item => ["PENDING_APPROVAL", "PENDING_LIMIT"].includes(item?.status))
    .forEach(item => append(item, item));

  const filtered = orders.filter(order => sourceFilter === "ALL" || order.source === sourceFilter);
  // Manuel tarafta aynı sembol için tek taslak tutulur. Eski istemci
  // sürümlerinin aynı kaydı birden çok kez yansıtması, ekranda boş kartlar
  // oluşturmamalı; en güncel taslak kazanır.
  if (sourceFilter !== "MANUAL") return filtered;
  const latestBySymbol = new Map();
  for (const order of filtered) {
    const previous = latestBySymbol.get(order.symbol);
    const orderTime = Date.parse(order.updatedAt || order.createdAt || "") || 0;
    const previousTime = Date.parse(previous?.updatedAt || previous?.createdAt || "") || 0;
    if (!previous || orderTime >= previousTime) latestBySymbol.set(order.symbol, order);
  }
  return [...latestBySymbol.values()];
}


function renderPendingPaperOrders(
  state,
  options = {}
) {
  const container = document.getElementById(options.containerId || "pendingPaperOrders");
  const status = document.getElementById(options.statusId || "pendingPaperOrderStatus");
  const source = state && typeof state === "object"
    ? state
    : (latestPaperOrderState || loadLocalTradingState() || {});

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
    const created = order.createdAt
      ? new Date(order.createdAt).toLocaleString("tr-TR", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "ONAY BEKLİYOR";
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
  renderPaperMonitorStatus(source.paper?.monitor || paperMonitorUiState);
  void refreshPaperMonitorStatus();
}


function readPaperOrderForm(
  form,
  options = {}
) {
  const manual = Boolean(options.manual);
  const field = name => form.elements.namedItem(name);
  const readNumber = (name, label, required) => {
    const raw = String(field(name)?.value || "").trim().replace(",", ".");
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
  const symbol = manual
    ? String(field("symbol")?.value || "").trim().toUpperCase()
    : String(card?.dataset.symbol || "").trim().toUpperCase();

  if (!/^[A-Z0-9]{1,12}$/.test(symbol)) {
    throw new Error("Geçerli bir BIST sembolü girin.");
  }

  const quantity = readNumber("quantity", "Lot", true);
  if (!Number.isInteger(quantity)) {
    throw new Error("Lot tam sayı olmalı.");
  }

  const orderType = normalizePaperOrderType(field("orderType")?.value);
  const payload = {
    symbol,
    quantity,
    entryPrice: orderType === "MARKET" ? null : readNumber("entryPrice", "Giriş fiyatı", true),
    orderType,
    stop: readNumber("stop", "Stop", false),
    target1: readNumber("target1", "TP1", false),
    target2: readNumber("target2", "TP2", false),
    target3: readNumber("target3", "TP3", false),
  };

  if (!manual) {
    payload.orderId = String(card?.dataset.orderId || "").trim();
    payload.decisionId = String(card?.dataset.decisionId || "").trim();
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
    emptyMessage: "Onay bekleyen manuel emir yok. Aşağıdaki formdan emir oluşturabilirsin.",
  });
}

function syncOrderPriceField(form) {
  const orderType = normalizePaperOrderType(form.elements.namedItem("orderType")?.value);
  const price = form.elements.namedItem("entryPrice");
  const label = form.querySelector("[data-order-price-label]") || price?.closest("label");
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


async function readPaperOrderResponse(
  response,
  fallbackMessage
) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error || fallbackMessage);
  }

  const state = body?.state && typeof body.state === "object"
    ? body.state
    : body;
  if (!state || typeof state !== "object" || !Array.isArray(state.decisions)) {
    throw new Error("Sunucudan güncel paper işlem durumu alınamadı.");
  }
  return state;
}


function renderPaperOrderState(
  state,
  selectedDecisionId = ""
) {
  latestPaperOrderState = state;
  saveLocalTradingState(state);
  renderAiDecisions(state.decisions || []);
  renderPaperPortfolio(state.paper);
  renderOpenPositions(state.paper?.positions || []);
  renderTradingActivity(state.activity || []);
  renderSignalHistory(state.history || []);
  renderPerformance(state);
  renderPendingPaperOrders(state);
  renderManualPendingOrders(state);
  renderPaperMonitorStatus(state.paper?.monitor || paperMonitorUiState);

  if (state.risk) {
    renderRiskSettings(state.risk);
  }

  const selected = (state.decisions || []).find(
    item => item.id === selectedDecisionId
  );
  if (selected) {
    renderAiDecisionDetail(selected);
  }
}


function setPaperOrderFormBusy(
  form,
  busy
) {
  form.querySelectorAll("input, select, button").forEach(element => {
    element.disabled = busy;
  });
}


async function savePendingPaperOrder(
  form
) {
  const payload = readPaperOrderForm(form);
  const response = await fetch("/api/trading/paper/order/update", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload),
  });
  const state = await readPaperOrderResponse(
    response,
    "Paper emir ayarları kaydedilemedi."
  );
  renderPaperOrderState(state, payload.decisionId);
  return {state, payload};
}


async function approvePendingPaperOrder(
  form
) {
  const payload = readPaperOrderForm(form);
  const saved = await savePendingPaperOrder(form);
  const updatedDecision =
    (saved.state?.decisions || []).find(
      item =>
        item.symbol === payload.symbol &&
        ["PENDING_APPROVAL", "PENDING_LIMIT"].includes(item.status)
    );

  const decisionId = updatedDecision?.id || payload.decisionId;
  if (!decisionId && !payload.symbol) {
    throw new Error("Onay için karar kimliği bulunamadı.");
  }

  const response = await fetch("/api/trading/paper/approve", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      decisionId,
      orderId: payload.orderId,
      symbol: payload.symbol,
    }),
  });
  const nextState = await readPaperOrderResponse(
    response,
    "Paper emir onaylanamadı."
  );
  renderPaperOrderState(nextState, decisionId);
}


async function rejectPendingPaperOrder(
  form
) {
  const card = form.closest("[data-pending-paper-order-card]");
  const decisionId = String(card?.dataset.decisionId || "").trim();
  const orderId = String(card?.dataset.orderId || "").trim();
  if (!decisionId && !orderId) {
    throw new Error("Reddedilecek emir kimliği bulunamadı.");
  }

  const response = await fetch("/api/trading/paper/reject", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({decisionId, orderId, symbol: String(card?.dataset.symbol || "").trim().toUpperCase()}),
  });
  const state = await readPaperOrderResponse(
    response,
    "Paper emir reddedilemedi."
  );
  renderPaperOrderState(state, decisionId);
}


async function createManualPaperOrder(
  form
) {
  const payload = readPaperOrderForm(form, {manual: true});
  const response = await fetch("/api/trading/paper/order/manual", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload),
  });
  const state = await readPaperOrderResponse(
    response,
    "Manuel paper emir oluşturulamadı."
  );
  renderPaperOrderState(state);
  form.reset();
}


function focusPendingPaperOrder(
  decisionId
) {
  const container = document.getElementById("pendingPaperOrders");
  const panel = document.querySelector(".pending-paper-orders-panel");
  const card = container?.querySelector(
    `[data-decision-id="${String(decisionId || "").replace(/"/g, "\\\"")}"]`
  );

  panel?.scrollIntoView({behavior: "smooth", block: "center"});
  if (!card) return;

  card.classList.add("is-focused");
  card.querySelector("input")?.focus({preventScroll: true});
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

    orderContainer.addEventListener("submit", async event => {
      const form = event.target.closest("[data-pending-paper-order-form]");
      if (!form) return;
      event.preventDefault();
      setPaperOrderFormBusy(form, true);
      try {
        await savePendingPaperOrder(form);
      } catch (error) {
        alert(`Paper emir ayarları kaydedilemedi: ${error.message}`);
      } finally {
        setPaperOrderFormBusy(form, false);
      }
    });

    orderContainer.addEventListener("click", async event => {
      const button = event.target.closest("[data-paper-order-action]");
      if (!button) return;
      const form = button.closest("[data-pending-paper-order-form]");
      if (!form) return;
      const action = button.dataset.paperOrderAction;
      setPaperOrderFormBusy(form, true);
      try {
        if (action === "approve") {
          await approvePendingPaperOrder(form);
        } else if (action === "reject") {
          await rejectPendingPaperOrder(form);
        }
      } catch (error) {
        const message = action === "approve"
          ? "Paper emir onaylanamadı"
          : "Paper emir reddedilemedi";
        alert(`${message}: ${error.message}`);
      } finally {
        setPaperOrderFormBusy(form, false);
      }
    });
    orderContainer.addEventListener("change", event => {
      if (event.target.matches('select[name="orderType"]')) {
        syncOrderPriceField(event.target.closest("form"));
      }
    });
  });

  if (manualForm && manualForm.dataset.paperOrdersBound !== "true") {
    manualForm.dataset.paperOrdersBound = "true";
    manualForm.addEventListener("submit", async event => {
      event.preventDefault();
      setPaperOrderFormBusy(manualForm, true);
      try {
        await createManualPaperOrder(manualForm);
      } catch (error) {
        alert(`Manuel paper emir oluşturulamadı: ${error.message}`);
      } finally {
        setPaperOrderFormBusy(manualForm, false);
      }
    });
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


function savePaperState(
  nextPaper,
  message
) {

  const state =
    loadLocalTradingState() || {};

  const activity = [
    {
      timestamp: new Date().toISOString(),
      type: "PAPER",
      message,
    },
    ...(
      Array.isArray(state.activity)
        ? state.activity
        : []
    ),
  ].slice(0, 100);

  const nextState = {
    ...state,
    paper: nextPaper,
    activity,
  };

  saveLocalTradingState(nextState);
  renderPaperPortfolio(nextPaper);
  renderOpenPositions(nextPaper.positions);
  renderTradingActivity(activity);
  renderPerformance(nextState);

  return nextState;

}


async function approvePaperPosition(
  decision
) {
  if (!decision?.id) return;
  try {
    const response = await fetch("/api/trading/paper/approve", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({decisionId: decision.id}),
    });
    const state = await response.json();
    if (!response.ok) throw new Error(state.error || "Paper işlem onaylanamadı.");

    saveLocalTradingState(state);
    renderAiDecisions(state.decisions || []);
    renderPaperPortfolio(state.paper);
    renderOpenPositions(state.paper?.positions || []);
    renderTradingActivity(state.activity || []);
    renderSignalHistory(state.history || []);
    renderPerformance(state);
    renderAiDecisionDetail((state.decisions || []).find(item => item.id === decision.id) || decision);
  } catch (error) {
    alert(`Paper işlem onaylanamadı: ${error.message}`);
  }
}

async function rejectPaperPosition(decision) {
  if (!decision?.id) return;
  try {
    const response = await fetch("/api/trading/paper/reject", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({decisionId: decision.id}),
    });
    const state = await response.json();
    if (!response.ok) throw new Error(state.error || "Paper işlem reddedilemedi.");
    saveLocalTradingState(state);
    renderAiDecisions(state.decisions || []);
    renderPaperPortfolio(state.paper);
    renderOpenPositions(state.paper?.positions || []);
    renderTradingActivity(state.activity || []);
    renderSignalHistory(state.history || []);
    renderPerformance(state);
    renderAiDecisionDetail((state.decisions || []).find(item => item.id === decision.id) || decision);
  } catch (error) {
    alert(`Paper işlem reddedilemedi: ${error.message}`);
  }
}

function takePaperProfit1(
  decisionId
) {

  const paper =
    currentPaperState();

  const position =
    paper.positions.find(
      item =>
        item.decisionId === decisionId &&
        item.status === "OPEN"
    );

  if (!position || position.tp1Hit) return;

  const current =
    Number(position.current) ||
    Number(position.entry);

  const closeQuantity =
    Math.floor(
      Number(position.quantity) / 2
    );

  const realizedPnl =
    closeQuantity > 0
      ? (current - Number(position.entry)) *
        closeQuantity
      : 0;

  const remainingQuantity =
    Number(position.quantity) - closeQuantity;

  const nextPaper = {
    ...paper,
    cash:
      paper.cash + current * closeQuantity,
    pnl:
      paper.pnl + realizedPnl,
    positions:
      paper.positions.map(
        item =>
          item.id === position.id
            ? {
                ...item,
                quantity: remainingQuantity,
                current,
                stop: Number(position.entry),
                tp1Hit: true,
                realizedPnl:
                  Number(position.realizedPnl || 0) +
                  realizedPnl,
                pnl:
                  (current - Number(position.entry)) *
                  remainingQuantity,
              }
            : item
      ),
  };

  nextPaper.equity =
    nextPaper.cash +
    nextPaper.positions
      .filter(
        item => item.status === "OPEN"
      )
      .reduce(
        (sum, item) =>
          sum +
          Number(item.current) *
          Number(item.quantity),
        0
      );

  nextPaper.pnlPercent =
    (nextPaper.pnl /
      nextPaper.initialCapital) * 100;

  savePaperState(
    nextPaper,
    `${position.symbol} TP1: ${closeQuantity} lot kapatıldı, SL maliyete çekildi.`
  );

}

async function closePaperPosition(payload) {
  const positionId = typeof payload === "string" ? payload : payload?.positionId;
  if (!positionId) return;
  try {
    const response = await fetch("/api/trading/paper/close", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(typeof payload === "string" ? {positionId} : payload),
    });
    const state = await response.json();
    if (!response.ok) throw new Error(state.error || "Paper pozisyon kapatılamadı.");

    saveLocalTradingState(state);
    renderAiDecisions(state.decisions || []);
    renderPaperPortfolio(state.paper);
    renderOpenPositions(state.paper?.positions || []);
    renderTradingActivity(state.activity || []);
    renderSignalHistory(state.history || []);
    renderPerformance(state.history || []);
  } catch (error) {
    alert(`Paper pozisyon kapatılamadı: ${error.message}`);
    throw error;
  }
}

async function refreshTradingState() {
  const response = await fetch("/api/trading/state");
  const state = await readPaperOrderResponse(response, "Güncel işlem durumu alınamadı.");
  renderPaperOrderState(state);
  return state;
}

async function openCloseOrderDialog(positionId) {
  const hintedSymbol = currentPaperState().positions.find(item => item.id === positionId)?.symbol;
  let state;
  try {
    state = await refreshTradingState();
  } catch (error) {
    alert(`Güncel açık pozisyon alınamadı: ${error.message}`);
    return;
  }
  const position = (state.paper?.positions || []).find(item =>
    item.status === "OPEN" && (item.id === positionId || item.symbol === hintedSymbol)
  );
  if (!position) return alert("Bu pozisyon artık açık değil. Ekran güncel sunucu durumuyla yenilendi.");
  document.getElementById("paperCloseDialog")?.remove();
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
  dialog.addEventListener("click", event => { if (event.target.closest("[data-close-dialog]") || event.target === dialog) dialog.remove(); });
  dialog.querySelector("form").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const orderType = form.elements.orderType.value;
    try {
      await closePaperPosition({positionId, symbol: position.symbol, quantity: Number(form.elements.quantity.value), orderType, limitPrice: orderType === "LIMIT" ? Number(form.elements.limitPrice.value) : null});
      dialog.remove();
    } catch { /* closePaperPosition already reports the error */ }
  });
  document.body.appendChild(dialog);
}

async function queueAiDecision(decision) {
  try {
    const response = await fetch("/api/trading/paper/decision/pending", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({decisionId: decision.id, symbol: decision.symbol})});
    const state = await readPaperOrderResponse(response, "AI kararı bekleyen emre eklenemedi.");
    renderPaperOrderState(state, decision.id);
    focusPendingPaperOrder(decision.id);
  } catch (error) {
    alert(`AI kararı bekleyen emre eklenemedi: ${error.message}`);
  }
}

function renderOpenPositions(
  positions
) {

  const element =
    document.getElementById(
      "openPositions"
    );

  const status =
    document.getElementById(
      "openPositionStatus"
    );

  const open =
    (Array.isArray(positions)
      ? positions
      : [])
      .filter(
        item => item.status === "OPEN"
      );

  if (status) {
    status.textContent =
      `${open.length} POZİSYON`;
  }

  if (!element) return;

  if (open.length === 0) {
    element.innerHTML =
      '<tr><td colspan="12" class="table-empty">No open positions</td></tr>';
    return;
  }

  element.innerHTML =
    open.map(
      item => `
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
      `
    ).join("");

}

function updatePaperPricesFromScan(
  results
) {

  /*
   * Paper pozisyonlarının kapatılması ve TP yönetimi
   * sunucu tarafındaki monitörün yetkisindedir. Tarayıcı
   * yalnızca son scan fiyatını ekranda gösterir.
   */
  const prices =
    new Map(
      (Array.isArray(results)
        ? results
        : [])
        .map(
          item => [
            item.symbol,
            Number(item.price),
          ]
        )
    );

  const paper =
    currentPaperState();

  const positions =
    paper.positions.map(
      position => {

        const current =
          prices.get(position.symbol);

        if (
          !Number.isFinite(current) ||
          position.status !== "OPEN"
        ) {
          return position;
        }

        return {
          ...position,
          current,
          pnl:
            (current - Number(position.entry)) *
            Number(position.quantity),
        };

      }
    );

  if (
    positions.some(
      (item, index) =>
        item.current !== paper.positions[index]?.current
    )
  ) {
    savePaperState(
      {
        ...paper,
        positions,
      },
      "Açık paper pozisyonları ekranda güncel fiyatla yenilendi."
    );
  }

}

function bindDecisionBoard() {

  if (
    !aiDecisionFeed ||
    aiDecisionFeed.dataset.boardBound === "true"
  ) {
    return;
  }

  aiDecisionFeed.dataset.boardBound = "true";

  aiDecisionFeed.addEventListener(
    "click",
    event => {

      const card =
        event.target.closest(
          "[data-decision-index]"
        );

      if (!card) return;

      const item =
        renderedDecisionRecords[
          Number(card.dataset.decisionIndex)
        ];

      if (item) {
        renderAiDecisionDetail(item);
        void focusDecisionOnChart(item);
      }

    }
  );

  document.addEventListener(
    "click",
    event => {

      const action =
        event.target.closest(
          "[data-paper-action]"
        );

      if (action) {

        if (action.dataset.paperAction === "close") {
          openCloseOrderDialog(action.dataset.positionId);
          return;
        }

        const decision =
          renderedDecisionRecords.find(
            item =>
              item.id ===
              action.dataset.decisionId
          );

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

      const closeButton =
        event.target.closest(
          "[data-position-close]"
        );

      if (closeButton) {
        openCloseOrderDialog(closeButton.dataset.positionClose);
      }

    }
  );

}


let renderedHistoryRecords = [];


function decisionSignature(
  item
) {

  return [
    item?.symbol,
    item?.action,
    Number(item?.entry?.reference || 0).toFixed(2),
    Number(item?.stop || 0).toFixed(2),
    Number(item?.target1 || 0).toFixed(2),
    Number(item?.target2 || 0).toFixed(2),
  ].join("|");

}


function uniqueDecisions(
  records
) {

  const seen = new Set();

  return (
    Array.isArray(records)
      ? records
      : []
  ).filter(
    item => {

      const signature =
        decisionSignature(item);

      if (seen.has(signature)) {
        return false;
      }

      seen.add(signature);
      return true;

    }
  );

}


function detailMarkup(
  item
) {

  return `
    <strong>${item.symbol} · ${item.action} · ${item.status}</strong>
    <div>Giriş ${formatCurrency(item.entry?.low)}–${formatCurrency(item.entry?.high)}</div>
    <div>SL ${formatCurrency(item.stop)} · TP1 ${formatCurrency(item.target1)} · TP2 ${formatCurrency(item.target2)}</div>
    <div>Risk: ${item.riskPlan?.quantity ?? "--"} lot · ${formatCurrency(item.riskPlan?.positionValue)} · azami zarar ${formatCurrency(item.riskPlan?.actualRisk)}</div>
    <div>Filtreler: Trend ${item.filters?.trend ? "✓" : "—"} · Hacim ${item.filters?.volume ? "✓" : "—"} · Momentum ${item.filters?.momentum ? "✓" : "—"} · RSI ${item.filters?.rsi ? "✓" : "—"}</div>
    <small>${item.reason || ""}</small>
  `;

}


function renderSignalHistory(
  history
) {

  const element =
    document.getElementById("signalHistory");

  const status =
    document.getElementById("signalHistoryStatus");

  const records =
    uniqueDecisions(history);

  renderedHistoryRecords = records;

  if (status) {
    status.textContent =
      `${records.length} KAYIT`;
  }

  if (!element) return;

  if (records.length === 0) {
    element.innerHTML =
      '<div class="trading-empty">Henüz arşivlenmiş sinyal yok.</div>';
    return;
  }

  element.innerHTML =
    records.slice(0, 12).map(
      (item, index) => `
        <button
          type="button"
          class="history-row"
          data-history-index="${index}"
        >
          <span>${item.symbol}</span>
          <span>${item.action}</span>
          <span>${item.status}</span>
          <small>${new Date(
            item.lifecycle?.closedAt ||
            item.timestamp
          ).toLocaleString("tr-TR")}</small>
        </button>
      `
    ).join("");

}


function bindSignalHistoryDetails() {

  const element =
    document.getElementById("signalHistory");

  const detail =
    document.getElementById("signalDetail");

  if (
    !element ||
    !detail ||
    element.dataset.detailsBound === "true"
  ) {
    return;
  }

  element.dataset.detailsBound = "true";

  element.addEventListener(
    "click",
    event => {

      const row =
        event.target.closest(
          "[data-history-index]"
        );

      if (!row) return;

      const item =
        renderedHistoryRecords[
          Number(row.dataset.historyIndex)
        ];

      if (item) {
        detail.innerHTML =
          detailMarkup(item);
      }

    }
  );

}


function performanceRecordDate(
  item
) {
  const value =
    item?.closedAt ||
    item?.lifecycle?.closedAt ||
    item?.openedAt ||
    item?.lifecycle?.openedAt ||
    item?.timestamp;

  const date =
    new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : date;
}


function matchesPerformanceRange(
  item,
  start,
  end
) {
  const date =
    performanceRecordDate(item);

  return Boolean(date) &&
    (!start || date >= start) &&
    (!end || date <= end);
}


function performanceRangeBounds() {
  const customStart =
    document.getElementById(
      "performanceStartDate"
    )?.value;

  const customEnd =
    document.getElementById(
      "performanceEndDate"
    )?.value;

  if (
    performanceRange === "CUSTOM" &&
    (customStart || customEnd)
  ) {
    return {
      start: customStart
        ? new Date(`${customStart}T00:00:00`)
        : null,
      end: customEnd
        ? new Date(`${customEnd}T23:59:59.999`)
        : null,
      label: "ÖZEL TARİH ARALIĞI",
    };
  }

  const months =
    {
      "1M": 1,
      "3M": 3,
      "6M": 6,
    }[performanceRange];

  if (!months) {
    return {
      start: null,
      end: null,
      label: "TÜM ZAMANLAR",
    };
  }

  const start = new Date();
  start.setMonth(start.getMonth() - months);

  return {
    start,
    end: null,
    label: `LAST ${months} MONTH${months > 1 ? "S" : ""}`,
  };
}


function renderPerformance(
  state
) {

  if (
    state &&
    !Array.isArray(state)
  ) {
    performanceState = state;
  }

  const source =
    performanceState || {};

  const bounds =
    performanceRangeBounds();

  const active =
    (Array.isArray(source.decisions)
      ? source.decisions
      : [])
      .filter(
        item =>
          matchesPerformanceRange(
            item,
            bounds.start,
            bounds.end
          )
      );

  const history =
    (Array.isArray(source.history)
      ? source.history
      : [])
      .filter(
        item =>
          matchesPerformanceRange(
            item,
            bounds.start,
            bounds.end
          )
      );

  const allSignals =
    uniqueDecisions(
      [
        ...active,
        ...history,
      ]
    );

  const closedPositions =
    (Array.isArray(source.paper?.positions)
      ? source.paper.positions
      : [])
      .filter(
        item =>
          (item.status === "CLOSED" ||
            item.status === "STOPPED") &&
          matchesPerformanceRange(
            item,
            bounds.start,
            bounds.end
          )
      );

  const averageConfidence =
    allSignals.length
      ? Math.round(
          allSignals.reduce(
            (sum, item) =>
              sum + Number(item.confidence || 0),
            0
          ) / allSignals.length
        )
      : null;

  const realizedPnl =
    closedPositions.reduce(
      (sum, item) =>
        sum + Number(item.pnl || 0),
      0
    );

  const wins =
    closedPositions.filter(
      item => Number(item.pnl || 0) > 0
    ).length;

  const fields = {
    performanceTotalSignals:
      allSignals.length,
    performanceActiveSignals:
      active.filter(
        item =>
          item.status === "PENDING" ||
          item.status === "OPEN"
      ).length,
    performanceAvgConfidence:
      averageConfidence === null
        ? "--"
        : `%${averageConfidence}`,
    performanceResolved:
      closedPositions.length,
    performanceWinRate:
      closedPositions.length
        ? `%${Math.round(
            wins / closedPositions.length * 100
          )}`
        : "--",
    performanceRealizedPnL:
      formatCurrency(realizedPnl),
  };

  Object.entries(fields).forEach(
    ([id, value]) => {
      const element =
        document.getElementById(id);
      if (element) {
        element.textContent = String(value);
      }
    }
  );

  const label =
    document.getElementById(
      "performanceRangeLabel"
    );

  if (label) {
    label.textContent = bounds.label;
  }

  const note =
    document.getElementById(
      "performanceNote"
    );

  if (note) {
    note.textContent =
      closedPositions.length > 0
        ? `${bounds.label}: ${closedPositions.length} kapanan paper işlem · ${wins} kârlı işlem.`
        : `${bounds.label}: seçilen aralıkta kapanan paper işlem yok.`;
  }

}


function bindPerformanceRange() {
  const range =
    document.getElementById(
      "performanceRange"
    );

  const start =
    document.getElementById(
      "performanceStartDate"
    );

  const end =
    document.getElementById(
      "performanceEndDate"
    );

  if (!range || range.dataset.bound === "true") {
    return;
  }

  range.dataset.bound = "true";

  const refresh = () => {
    performanceRange = range.value || "ALL";
    renderPerformance();
  };

  range.addEventListener("change", refresh);

  [start, end].forEach(
    input => {
      if (input) {
        input.addEventListener(
          "change",
          () => {
            performanceRange = "CUSTOM";
            range.value = "CUSTOM";
            renderPerformance();
          }
        );
      }
    }
  );
}

function reconcileScanDecisions(
  previous,
  incoming,
  timestamp
) {

  const prior =
    uniqueDecisions(previous);

  const next =
    uniqueDecisions(incoming);

  const nextKeys =
    new Set(
      next.map(decisionSignature)
    );

  const retained =
    prior.filter(
      item =>
        nextKeys.has(
          decisionSignature(item)
        )
    );

  const archived =
    prior
      .filter(
        item =>
          !nextKeys.has(
            decisionSignature(item)
          )
      )
      .map(
        item => ({
          ...item,
          status: "EXPIRED",
          lifecycle: {
            ...(item.lifecycle || {}),
            stage: "EXPIRED",
            closedAt: timestamp,
          },
          outcome: "SUPERSEDED_BY_NEW_SCAN",
        })
      );

  const retainedKeys =
    new Set(
      retained.map(decisionSignature)
    );

  return {
    decisions: [
      ...retained,
      ...next.filter(
        item =>
          !retainedKeys.has(
            decisionSignature(item)
          )
      ),
    ],
    archived,
  };

}


function renderPaperPortfolio(
  paper
) {

  if (!paper) {
    return;
  }

  const fields = {
    paperInitialCapital:
      paper.initialCapital,
    paperCash:
      paper.cash,
    paperEquity:
      paper.equity,
    paperPnL:
      paper.pnl,
  };

  Object.entries(fields).forEach(
    ([id, value]) => {

      const element =
        document.getElementById(id);

      if (element) {
        element.textContent =
          formatCurrency(value);
      }

    }
  );

  const pnlPercent =
    document.getElementById(
      "paperPnLPct"
    );

  if (pnlPercent) {
    pnlPercent.textContent =
      formatPercent(
        paper.pnlPercent
      );
  }

  const positionCount =
    document.getElementById(
      "paperPositionCount"
    );

  if (positionCount) {
    const closedPositions =
      (Array.isArray(paper.positions)
        ? paper.positions
        : [])
        .filter(
          item =>
            item.status === "CLOSED" ||
            item.status === "STOPPED"
        );

    positionCount.textContent =
      String(closedPositions.length);
  }

  const costs = document.getElementById("paperCostSummary");
  if (costs) {
    const totalEntryFees = (paper.positions || []).reduce((sum, item) => sum + Number(item.entryCommission || 0), 0);
    costs.textContent = `KOMİSYON: ‰1 · GİRİŞ KOMİSYONU: ${formatCurrency(totalEntryFees)} · BIST FİYAT BANTI: ±10%`;
  }

}


function renderTradingActivity(
  activity
) {

  if (!tradingActivity) {
    return;
  }

  if (
    !Array.isArray(activity) ||
    activity.length === 0
  ) {
    return;
  }

  tradingActivity.innerHTML =
    activity.slice(0, 8).map(
      item => `
        <div class="log-line">
          <span class="log-time">
            ${new Date(item.timestamp).toLocaleTimeString("tr-TR")}
          </span>
          <span>${item.message}</span>
        </div>
      `
    ).join("");

  const journal = document.getElementById("tradeJournal");
  if (journal) {
    journal.innerHTML = activity.slice(0, 100).map(item => `<details><summary>${escapeHtml(item.type || "EVENT")} · ${escapeHtml(new Date(item.timestamp).toLocaleString("tr-TR"))}</summary><p>${escapeHtml(item.message || "")}</p></details>`).join("") || '<div class="trading-empty">İşlem günlüğü bekleniyor.</div>';
  }

}


async function loadTradingState() {

  const localState =
    loadLocalTradingState();

  if (localState) {

    renderAiDecisions(
      localState.decisions
    );

    renderPaperPortfolio(
      localState.paper
    );

    renderOpenPositions(
      localState.paper?.positions
    );

    renderTradingActivity(
      localState.activity
    );

    renderSignalHistory(
      localState.history
    );

    renderPerformance(
      localState
    );

    renderKillSwitch(
      localState.killSwitch
    );

    renderPendingPaperOrders(
      localState
    );

  }

  try {

    const response =
      await fetch(
        "/api/trading/state",
        {
          cache: "no-store"
        }
      );

    if (!response.ok) {
      return;
    }

    const state =
      await response.json();

    const hasRemoteDecisions =
      Array.isArray(
        state.decisions
      ) &&
      state.decisions.length > 0;

    /*
     * Sunucudaki boş varsayılan durum,
     * tarayıcıda saklanan son tarama sonucunu
     * yenileme sırasında ezmemelidir.
     */
    if (
      !localState ||
      hasRemoteDecisions
    ) {

      renderAiDecisions(
        state.decisions
      );

      renderPaperPortfolio(
        state.paper
      );

      renderOpenPositions(
        state.paper?.positions
      );

      renderTradingActivity(
        state.activity
      );

      renderSignalHistory(
        state.history
      );

      renderPerformance(
        state
      );

      renderKillSwitch(
        state.killSwitch
      );

      saveLocalTradingState(
        state
      );

      renderPendingPaperOrders(
        state
      );

    }

    // Karar listesi boş olsa bile Kill Switch sunucudaki gerçek
    // durumunu her yüklemede ekrana yansıt.
    renderKillSwitch(
      state.killSwitch
    );

    if (localState) {
      saveLocalTradingState(
        {
          ...localState,
          killSwitch: state.killSwitch,
        }
      );
    }

  } catch (error) {

    console.error(
      "Trading state yüklenemedi:",
      error
    );

  }

}


function normalizeRiskSettings(
  value
) {

  return {
    capital:
      Math.max(
        1000,
        Number(value?.capital) || 100000
      ),
    maxPositionPercent:
      Math.max(
        1,
        Number(value?.maxPositionPercent) || 31
      ),
    maxPositions:
      Math.max(
        1,
        Math.floor(
          Number(value?.maxPositions) || 3
        )
      ),
    capitalSource:
      value?.capitalSource === "BROKER"
        ? "BROKER"
        : "MANUAL",
  };

}


function currentRiskSettings() {

  const state =
    loadLocalTradingState() || {};

  return normalizeRiskSettings(
    state.risk
  );

}


function renderRiskSettings(
  settings
) {

  const risk =
    normalizeRiskSettings(settings);

  const reservePercent =
    Math.max(
      0,
      100 -
      risk.maxPositionPercent *
      risk.maxPositions
    );

  const display = {
    maxPositions: risk.maxPositions,
    targetPositionSize:
      `%${risk.maxPositionPercent.toFixed(2)}`,
    cashReserve:
      `%${reservePercent.toFixed(2)}`,
    stopRule: "YZ KARARI",
  };

  Object.entries(display).forEach(
    ([id, value]) => {
      const element =
        document.getElementById(id);
      if (element) {
        element.textContent = String(value);
      }
    }
  );

  const inputs = {
    riskCapitalInput: risk.capital,
    maxPositionInput:
      risk.maxPositionPercent,
    maxPositionsInput:
      risk.maxPositions,
    capitalSourceInput:
      risk.capitalSource,
  };

  Object.entries(inputs).forEach(
    ([id, value]) => {
      const input =
        document.getElementById(id);
      if (input) {
        input.value = String(value);
      }
    }
  );

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


async function saveRiskSettingsFromForm(
  event
) {

  event.preventDefault();

  const risk =
    normalizeRiskSettings(
      {
        capital:
          document.getElementById(
            "riskCapitalInput"
          )?.value,
        maxPositionPercent:
          document.getElementById(
            "maxPositionInput"
          )?.value,
        maxPositions:
          document.getElementById(
            "maxPositionsInput"
          )?.value,
        capitalSource:
          document.getElementById(
            "capitalSourceInput"
          )?.value,
      }
    );

  try {
    const response = await fetch(
      "/api/trading/risk-settings",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(risk),
      }
    );
    const state = await response.json();

    if (!response.ok) {
      throw new Error(
        state?.error ||
        "Risk Engine ayarları kaydedilemedi."
      );
    }

    /*
     * Sunucu kalıcı kaynaktır: aynı anda Risk Engine,
     * Paper Portfolio ve activity kayıtlarını günceller.
     */
    saveLocalTradingState(state);
    renderRiskSettings(state.risk);
    renderPaperPortfolio(state.paper);
    renderAiDecisions(state.decisions || []);
    renderOpenPositions(state.paper?.positions || []);
    renderTradingActivity(state.activity || []);
    renderSignalHistory(state.history || []);
    renderPerformance(state);

  } catch (error) {
    alert(
      `Risk Engine ayarları kaydedilemedi: ${error.message}`
    );
  }

}

function bindRiskSettings() {

  const form =
    document.getElementById(
      "riskSettingsForm"
    );

  if (
    !form ||
    form.dataset.riskBound === "true"
  ) {
    return;
  }

  form.dataset.riskBound = "true";

  form.addEventListener(
    "submit",
    saveRiskSettingsFromForm
  );

  form.addEventListener("input", () => {
    renderRiskAllocationGauge({
      capital: document.getElementById("riskCapitalInput")?.value,
      maxPositionPercent: document.getElementById("maxPositionInput")?.value,
      maxPositions: document.getElementById("maxPositionsInput")?.value,
    });
  });

  renderRiskSettings(
    currentRiskSettings()
  );

}


async function runTradingScanner() {

  if (
    scannerRunning
  ) {
    return;
  }

  scannerRunning = true;
  const requestId = ++scannerRequestId;
  scannerAbortController = new AbortController();
  const jobId = window.crypto?.randomUUID?.() || `scan-${Date.now()}-${Math.random().toString(36).slice(2)}`;


  if (scannerStatus) {
    scannerStatus.textContent =
      "TARANIYOR";
  }


  if (tradingEngineStatus) {
    tradingEngineStatus.textContent =
      "TARANIYOR";
  }


  if (scannerStartButton) {
    scannerStartButton.disabled =
      true;

    scannerStartButton.textContent =
      "SCANNING...";
  }


  renderScannerProgress(1,"Teknik tarama başlatılıyor");
  startScannerProgress(jobId, requestId);


  try {

    const risk =
      currentRiskSettings();

    const scannerQuery =
      new URLSearchParams(
        {
          capital:
            String(risk.capital),
          maxPositionPercent:
            String(risk.maxPositionPercent),
          maxPositions:
            String(risk.maxPositions),
          // Kullanıcı "Taramayı Başlat" dediğinde eski kapanış snapshot'ı
          // döndürülmez; yeni tarama sonucunun arayüzde kalıcı kalması gerekir.
          force: "1",
          jobId,
        }
      );

    const response =
      await fetch(
        `/api/trading/scanner?${scannerQuery}`,
        {
          method: "GET",
          cache: "no-store",
          signal: scannerAbortController.signal
        }
      );


    const data =
      await response.json();

    stopScannerProgress();

    // STOP'a basılmış ya da yeni bir tarama başlatılmışsa eski yanıt
    // ekrandaki yeni durumu geri yazamaz.
    if (requestId !== scannerRequestId) return;


    if (
      !response.ok ||
      !data.success
    ) {

      throw new Error(
        data?.error ||
        "Scanner başarısız."
      );

    }


    renderScannerResults(
      data.results
    );

    renderAiDecisions(
      data.decisions
    );

    renderPaperPortfolio(
      data.paper
    );

    renderTradingActivity(
      data.activity
    );

    const previousState =
      loadLocalTradingState() || {};

    /*
     * Scanner yanıtı sunucuda kalıcı hale gelen tek
     * kaynak durumdur. Eski localStorage OPEN etiketleri
     * yeni PENDING kararlarını ezemez.
     */
    const nextState = {
      decisions:
        Array.isArray(data.decisions)
          ? data.decisions
          : [],
      paper:
        data.paper ||
        previousState.paper,
      activity:
        Array.isArray(data.activity)
          ? data.activity
          : [],
      history:
        Array.isArray(data.history)
          ? data.history
          : (
              Array.isArray(previousState.history)
                ? previousState.history
                : []
            ),
      lastScanAt:
        data.timestamp,
      risk:
        data.risk || risk,
    };

    renderAiDecisions(
      nextState.decisions
    );

    renderSignalHistory(
      nextState.history
    );

    renderPerformance(
      nextState
    );

    saveLocalTradingState(
      nextState
    );

    renderPaperPortfolio(
      nextState.paper
    );

    renderOpenPositions(
      nextState.paper?.positions
    );

    renderPendingPaperOrders(
      nextState
    );

    updatePaperPricesFromScan(
      data.results
    );


    if (scannerStatus) {
      scannerStatus.textContent =
        "TAMAMLANDI";
    }


    if (tradingEngineStatus) {
      tradingEngineStatus.textContent =
        "HAZIR";
    }


    if (lastScanTime) {

      lastScanTime.textContent =
        new Date(
          data.timestamp
        ).toLocaleTimeString(
          "tr-TR",
          {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
          }
        );

    }


  } catch (error) {

    stopScannerProgress();

    if (
      error?.name === "AbortError" ||
      requestId !== scannerRequestId
    ) {
      return;
    }

    console.error(
      "AI Trading Scanner:",
      error
    );


    if (scannerStatus) {
      scannerStatus.textContent =
        "HATA";
    }


    if (tradingEngineStatus) {
      tradingEngineStatus.textContent =
        "HATA";
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

    scannerRunning =
      false;

    scannerAbortController = null;


    if (scannerStartButton) {

      scannerStartButton.disabled =
        false;

      scannerStartButton.textContent =
        "TARAMAYI BAŞLAT";

    }

  }

}


/*
--------------------------------------------------------
STOP
--------------------------------------------------------
*/

function stopTradingScanner() {

  // Tarayıcıdaki gerçek ağ isteğini iptal et. Sunucu tarafında işlem
  // sürse bile sonucu tekrar arayüze yazamaz.
  scannerRequestId += 1;
  scannerAbortController?.abort();
  scannerAbortController = null;
  stopScannerProgress();
  scannerRunning = false;

  if (scannerStatus) {
    scannerStatus.textContent =
      "HAZIR";
  }

  if (tradingEngineStatus) {
    tradingEngineStatus.textContent =
      "HAZIR";
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

function renderKillSwitch(
  killSwitch
) {

  const active =
    Boolean(killSwitch?.active);

  const status =
    document.getElementById(
      "killSwitchStatus"
    );

  const button =
    document.getElementById(
      "killSwitchToggle"
    );

  if (status) {
    status.textContent =
      active
        ? "ACTIVE · NEW PAPER TRADES BLOCKED"
        : "SAFE · NEW PAPER TRADES ENABLED";
  }

  if (button) {
    button.textContent =
      active
        ? "ACİL DURDURMAYI KAPAT"
        : "ACİL DURDURMAYI ETKİNLEŞTİR";

    button.classList.toggle(
      "is-active",
      active
    );

    // İşlem yönü, eski localStorage kaydından değil ekranda
    // sunucunun son bildirdiği durumdan türetilir.
    button.dataset.killSwitchActive =
      active ? "true" : "false";

    button.setAttribute(
      "aria-pressed",
      active ? "true" : "false"
    );
  }

}


async function toggleKillSwitch() {

  const passwordInput =
    document.getElementById(
      "killSwitchPassword"
    );

  const button =
    document.getElementById(
      "killSwitchToggle"
    );

  // Buton, /api/trading/state veya son başarılı işlemden gelen
  // güncel Kill Switch durumunu taşır. Eski tarayıcı kaydı
  // deaktif etme isteğini yanlışlıkla tekrar aktive etmemelidir.
  const active =
    button?.dataset.killSwitchActive === "true";

  const password =
    String(passwordInput?.value || "");

  if (!password) {
    alert("Kill Switch şifresini girin.");
    return;
  }

  if (button) {
    button.disabled = true;
  }

  try {
    const response = await fetch(
      "/api/trading/kill-switch",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          {
            action:
              active
                ? "deactivate"
                : "activate",
            password,
          }
        ),
      }
    );

    const state =
      await response.json();

    if (!response.ok) {
      throw new Error(
        state?.error ||
        "Kill Switch güncellenemedi."
      );
    }

    if (passwordInput) {
      passwordInput.value = "";
    }

    saveLocalTradingState(state);
    renderKillSwitch(state.killSwitch);
    renderAiDecisions(state.decisions || []);
    renderPaperPortfolio(state.paper);
    renderOpenPositions(state.paper?.positions || []);
    renderTradingActivity(state.activity || []);
    renderSignalHistory(state.history || []);
    renderPerformance(state);

  } catch (error) {
    alert(
      "Kill Switch güncellenemedi: " +
      error.message
    );
  } finally {
    if (button) {
      button.disabled = false;
    }
  }

}


function bindKillSwitch() {

  const button =
    document.getElementById(
      "killSwitchToggle"
    );

  if (
    !button ||
    button.dataset.killSwitchBound === "true"
  ) {
    return;
  }

  button.dataset.killSwitchBound = "true";

  button.addEventListener(
    "click",
    toggleKillSwitch
  );

  renderKillSwitch(
    (loadLocalTradingState() || {}).killSwitch
  );

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
    const parentTag = node.parentElement?.tagName;
    if (["SCRIPT", "STYLE"].includes(parentTag)) return;
    node.nodeValue = String(node.nodeValue)
      .replaceAll("₺", "$")
      .replace(/\bTL\b/g, "USD")
      .replace(/BIST FİYAT BANTI/gi, "NASDAQ FİYAT BANTI");
  });
  nasdaqTab.dataset.nasdaqIsolated = "true";
}
isolateNasdaqDom();
const ns = name => nasdaqTab?.querySelector(`#nasdaq-${name}`) || null;

function placeNasdaqManualOrderForm() {
  const mount = ns("manualOrderMount");
  const wrap = ns("manualPaperOrderForm")?.closest(".manual-paper-order-wrap");
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
  return new Intl.NumberFormat("tr-TR", {style:"currency", currency:"USD", maximumFractionDigits:number < 10 ? 4 : 2}).format(number);
}
function nasdaqText(name, value) { const element = ns(name); if (element) element.textContent = value; }
function nasdaqPlan(item) { const fib=item?.fibonacci || {}; return fib.valid ? fib : (item?.fallbackPlan || {}); }
function nasdaqEntry(item) { const fib=item?.fibonacci || {}; const plan=nasdaqPlan(item); return {low:fib.valid ? fib.entryZoneLow : plan.entryPrice, high:fib.valid ? fib.entryZoneHigh : plan.entryPrice}; }
function nasdaqLocalTime(value) { return value ? new Date(value).toLocaleString("tr-TR") : "—"; }

function renderNasdaqScannerResults(data, records) {
  const results = ns("scannerResults");
  if (results) results.innerHTML = `<div class="trading-empty">${Number(data.scanned || 0)} aktif NASDAQ hissesi tarandı · ${Number(data.successful || 0)} geçerli günlük veri · Kaynak: ${escapeHtml(String(data.source || latestNasdaqPaperState?.scanner?.source || "ALPACA"))}</div>`;
  const history = ns("signalHistory");
  const status = ns("signalHistoryStatus");
  if (status) status.textContent = `${(latestNasdaqPaperState?.signals || records || []).length} KAYIT`;
  if (history) {
    const signals = latestNasdaqPaperState?.signals?.length ? latestNasdaqPaperState.signals : records;
    history.innerHTML = signals?.length ? signals.slice(0,80).map((item,index) => `<button type="button" class="signal-history-item" data-nasdaq-history-index="${index}"><strong>${escapeHtml(item.symbol || "SEMBOL")}</strong><span>${escapeHtml(item.grade || "KARAR")} · TEKNİK ${Number(item.score || 0)}/100</span><small>${escapeHtml(translateTradingStatus(item.status || item.fibonacci?.status || "NO_VALID_STRUCTURE"))} · ${nasdaqLocalTime(item.timestamp)}</small></button>`).join("") : '<div class="trading-empty">İlk NASDAQ taraması sonrası sinyal geçmişi burada oluşur.</div>';
    bindNasdaqInteractions();
  }
}

function renderNasdaqDecisionCards(records) {
  const feed = ns("aiDecisionFeed");
  if (!feed) return;
  feed.innerHTML = (records || []).map((item,index) => {
    const plan=nasdaqPlan(item), entry=nasdaqEntry(item), fib=item.fibonacci || {};
    return `<article class="decision-item decision-card" tabindex="0" role="button" data-nasdaq-decision-index="${index}"><header><strong>${escapeHtml(item.symbol)}</strong><span>${escapeHtml(item.grade || "KARAR")}</span><span>TEKNİK ${Number(item.score || 0)}/100</span></header><div class="decision-price-grid"><span><small>FİYAT</small>${formatNasdaqUsd(item.price)}</span><span><small>RSI / ATR</small>${formatPrice(item.rsi)} / ${formatNasdaqUsd(item.atr)}</span><span><small>FIBONACCI</small>${escapeHtml(translateTradingStatus(fib.status || "NO_VALID_STRUCTURE"))}</span></div><p>${escapeHtml((item.reasons || []).slice(0,4).join(" · ") || item.reason || "Teknik veriler günlük Alpaca OHLCV kaynağından hesaplandı.")}</p><small>Giriş: ${formatNasdaqUsd(entry.low)} – ${formatNasdaqUsd(entry.high)} · SL: ${formatNasdaqUsd(plan.stopLoss)} · TP1/2/3: ${formatNasdaqUsd(plan.tp1)} / ${formatNasdaqUsd(plan.tp2)} / ${formatNasdaqUsd(plan.tp3)}</small></article>`;
  }).join("") || '<div class="trading-empty">Henüz NASDAQ AI kararı yok.</div>';
  bindNasdaqInteractions();
}

function renderNasdaqChart(item) {
  const container=ns("market_chart"); const empty=ns("chartEmpty");
  if (!container || typeof LightweightCharts === "undefined" || !item?.history?.length) { if (empty) { empty.hidden=false; empty.textContent = item ? "Grafik, yeni NASDAQ taramasında tamamlanmış günlük verilerle hazırlanır." : "Bir karar seçin."; } return; }
  try {
    nasdaqMarketChart?.remove(); container.innerHTML="";
    nasdaqMarketChart=LightweightCharts.createChart(container,{width:Math.max(280,container.clientWidth||320),height:300,layout:{background:{color:"#101922"},textColor:"#d5e5ef"},grid:{vertLines:{color:"rgba(91,169,255,.13)"},horzLines:{color:"rgba(91,169,255,.13)"}},rightPriceScale:{borderColor:"rgba(125,202,255,.42)"},timeScale:{borderColor:"rgba(125,202,255,.42)",timeVisible:false}});
    const candles=nasdaqMarketChart.addSeries(LightweightCharts.CandlestickSeries,{upColor:"#42d392",downColor:"#f05b6b",borderVisible:false,wickUpColor:"#42d392",wickDownColor:"#f05b6b"});
    candles.setData(item.history.slice(-150).map(c=>({time:Number(c.time),open:Number(c.open),high:Number(c.high),low:Number(c.low),close:Number(c.close)})).filter(c=>Number.isFinite(c.time)&&[c.open,c.high,c.low,c.close].every(Number.isFinite)));
    const fib=item.fibonacci||{},plan=nasdaqPlan(item), style=LightweightCharts.LineStyle||{};
    [[fib.valid?fib.entryTriggerPrice:null,"FIB TETİK","#76a9ff",style.Dashed??2],[fib.valid?fib.entryZoneLow:plan.entryPrice,"GİRİŞ","#72dddd",style.Dotted??1],[fib.valid?fib.entryZoneHigh:null,"GİRİŞ ÜST","#72dddd",style.Dotted??1],[plan.stopLoss,"SL","#ff6b6b",style.Solid??0],[plan.tp1,"TP1","#78e58b",style.Solid??0],[plan.tp2,"TP2","#78e58b",style.Solid??0],[plan.tp3,"TP3","#78e58b",style.Solid??0]].forEach(([price,title,color,lineStyle])=>{if(Number.isFinite(Number(price))&&Number(price)>0)candles.createPriceLine({price:Number(price),title,color,lineWidth:1,lineStyle,axisLabelVisible:true});});
    const markers=[[fib.pointA,"A","belowBar","#f8c35a"],[fib.pointB,"B","aboveBar","#76a9ff"],[fib.pointC,"C","belowBar","#ff7a7a"]].filter(([point])=>point?.date&&Number.isFinite(Number(point.price))).map(([point,text,position,color])=>({time:Math.floor(new Date(point.date).getTime()/1000),position,color,shape:"circle",text}));
    if (markers.length && typeof LightweightCharts.createSeriesMarkers === "function") LightweightCharts.createSeriesMarkers(candles,markers);
    nasdaqMarketChart.timeScale().fitContent(); if(empty) { empty.textContent=""; empty.hidden=true; }
  } catch (error) { if(empty) { empty.hidden=false; empty.textContent="NASDAQ grafik katmanı oluşturulamadı."; } }
}

function renderNasdaqScore(item) {
  const content=ns("decisionScoreContent"); nasdaqText("decisionScoreSymbol",item?.symbol || "KARAR YOK");
  if (!content) return;
  if (!item) { content.textContent="Bir NASDAQ kararına tıklayarak teknik puan kalemlerini burada gör."; return; }
  const score=item.scoreBreakdown || {}; const rows=[["Trend",score.trend],["Momentum",score.momentum],["Hacim / likidite",score.volumeLiquidity],["Giriş kalitesi",score.entryQuality]].map(([label,bucket])=>`<tr><th>${label}</th><td><strong>${Number(bucket?.score || 0)}/${Number(bucket?.max || 0)}</strong></td><td>${escapeHtml((bucket?.items || []).map(entry=>entry?.label || entry).join(" · ") || "—")}</td></tr>`).join("");
  content.innerHTML=`<div class="decision-score-summary"><strong>TEKNİK ${Number(item.score || 0)}/100 · ${escapeHtml(item.grade || "KARAR")}</strong><span>Bu puan başarı olasılığı değildir.</span></div><div class="crypto-score-table-wrap"><table class="crypto-score-table"><thead><tr><th>BAŞLIK</th><th>PUAN</th><th>KANITLAR</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderNasdaqDetail(item) {
  const detail=ns("aiDecisionDetail"); if(!detail || !item) return;
  const fib=item.fibonacci||{},plan=nasdaqPlan(item),entry=nasdaqEntry(item),review=item.aiReview||{};
  nasdaqText("chartSymbol",item.symbol || "SEMBOL YOK"); renderNasdaqChart(item); renderNasdaqScore(item);
  const index=nasdaqAiRecords.indexOf(item);
  detail.innerHTML=`<strong>${escapeHtml(item.symbol)} · ${escapeHtml(item.grade || "KARAR")} · ${escapeHtml(translateTradingStatus(fib.status || "NO_VALID_STRUCTURE"))}</strong><div class="decision-detail-grid"><span>Giriş: ${formatNasdaqUsd(entry.low)} – ${formatNasdaqUsd(entry.high)}</span><span>Stop: ${formatNasdaqUsd(plan.stopLoss)}</span><span>TP1: ${formatNasdaqUsd(plan.tp1)} · R/R ${plan.riskRewardTp1 ?? "—"}</span><span>TP2: ${formatNasdaqUsd(plan.tp2)} · R/R ${plan.riskRewardTp2 ?? "—"}</span><span>TP3: ${formatNasdaqUsd(plan.tp3)} · R/R ${plan.riskRewardTp3 ?? "—"}</span><span>A/B/C: ${formatNasdaqUsd(fib.pointA?.price)} / ${formatNasdaqUsd(fib.pointB?.price)} / ${formatNasdaqUsd(fib.pointC?.price)}</span></div><div class="ai-comment"><strong>HABER YORUMU</strong><p>${escapeHtml(review.newsComment || "Doğrulanmış haber başlığı alınamadı.")}</p><strong>UZMAN / ANALİST BİLGİSİ</strong><p>${escapeHtml(review.expertComment || "Analist görüşü veya hedef fiyat, doğrulanmış kaynak olmadan gösterilmez.")}</p><strong>AI ÖZETİ</strong><p>${escapeHtml(review.summary || "Teknik plan backend günlük verisinden oluşturuldu.")}</p></div><small>${escapeHtml(item.reason || plan.message || "Fibonacci seviyeleri günlük Alpaca OHLCV verisi ile hesaplandı.")}</small>${index>=0?`<br><button type="button" class="trading-button" data-nasdaq-action="queue" data-nasdaq-index="${index}">BEKLEYEN NASDAQ EMRİ OLUŞTUR</button>`:""}`;
  bindNasdaqPaperActions();
}

function renderNasdaqHistoryDetail(index) {
  const source=latestNasdaqPaperState?.signals?.length ? latestNasdaqPaperState.signals : nasdaqRecords; const item=source?.[index]; const target=ns("signalDetail"); if(!target || !item) return;
  const fib=item.fibonacci||{},plan=nasdaqPlan(item); target.innerHTML=`<strong>${escapeHtml(item.symbol || "SEMBOL")} · ${escapeHtml(item.grade || "KARAR")} · ${escapeHtml(translateTradingStatus(item.status || fib.status || "NO_VALID_STRUCTURE"))}</strong><div class="decision-detail-grid"><span>Fiyat: ${formatNasdaqUsd(item.price)}</span><span>Giriş: ${formatNasdaqUsd(nasdaqEntry(item).low)} – ${formatNasdaqUsd(nasdaqEntry(item).high)}</span><span>SL: ${formatNasdaqUsd(plan.stopLoss)}</span><span>TP1/TP2/TP3: ${formatNasdaqUsd(plan.tp1)} / ${formatNasdaqUsd(plan.tp2)} / ${formatNasdaqUsd(plan.tp3)}</span></div>`;
}

function renderNasdaqPerformance(paper) {
  const all=[...(paper.signals||[]),...(paper.history||[])]; const range=ns("performanceRange")?.value || "ALL"; const now=Date.now(); const days={"1M":31,"3M":92,"6M":184}; const active=range==="ALL"?all:range==="CUSTOM"?all.filter(item=>{const time=new Date(item.timestamp||item.closedAt||0).getTime();const start=ns("performanceStartDate")?.value?new Date(ns("performanceStartDate").value).getTime():-Infinity;const end=ns("performanceEndDate")?.value?new Date(`${ns("performanceEndDate").value}T23:59:59`).getTime():Infinity;return time>=start&&time<=end;}):all.filter(item=>new Date(item.timestamp||item.closedAt||0).getTime()>=now-(days[range]||0)*86400000); const closed=(paper.history||[]).filter(item=>item.status==="CLOSED"); const wins=closed.filter(item=>Number(item.realizedPnl)>0); nasdaqText("performanceTotalSignals",String(active.length));nasdaqText("performanceActiveSignals",String((paper.positions||[]).length));nasdaqText("performanceAvgConfidence","—");nasdaqText("performanceResolved",String(closed.length));nasdaqText("performanceWinRate",closed.length?`${(wins.length*100/closed.length).toFixed(1)}%`:"—");nasdaqText("performanceRealizedPnL",formatNasdaqUsd(closed.reduce((sum,item)=>sum+Number(item.realizedPnl||0),0)));nasdaqText("performanceRangeLabel",range==="ALL"?"TÜM ZAMANLAR":range==="CUSTOM"?"ÖZEL ARALIK":`SON ${days[range]} GÜN`);
}

function nasdaqPendingCard(decision) {
  const order=decision.pendingOrder||{}; const market=order.orderType === "MARKET";
  const waiting=decision.status === "PENDING_LIMIT";
  const source = String(order.source || "NASDAQ AI").toUpperCase() === "MANUAL" ? "MANUEL" : "NASDAQ AI";
  return `<article class="pending-paper-order-card${source === "MANUEL" ? " is-manual" : ""}" data-nasdaq-pending-card data-nasdaq-decision-id="${escapeHtml(decision.id)}"><div class="pending-paper-order-head"><strong>${escapeHtml(decision.symbol)} · ${source}</strong><span class="pending-paper-order-badge">${waiting ? "LİMİT BEKLİYOR" : "ONAY BEKLİYOR"}</span></div><div class="paper-order-live-price">SON TAMAMLANMIŞ GÜNLÜK FİYAT: ${formatNasdaqUsd(order.lastMarketPrice || decision.price)}</div><form class="paper-order-form" data-nasdaq-pending-form><label>MİKTAR<input name="quantity" type="number" min="1" step="1" value="${Number(order.quantity || 1)}" required${waiting ? " disabled" : ""}></label><label>GİRİŞ FİYATI ($)<input name="entryPrice" type="number" min="0.0001" step="0.0001" value="${market?"":Number(order.entryPrice || "")}" ${market || waiting ? "disabled" : "required"}></label><label>EMİR TÜRÜ<select name="orderType"${waiting ? " disabled" : ""}><option value="MARKET" ${market?"selected":""}>PİYASA</option><option value="LIMIT" ${!market?"selected":""}>LİMİT</option></select></label><label>STOP<input name="stop" type="number" min="0.0001" step="0.0001" value="${Number(order.stop || "")}"${waiting ? " disabled" : ""}></label><label>TP1<input name="target1" type="number" min="0.0001" step="0.0001" value="${Number(order.target1 || "")}"${waiting ? " disabled" : ""}></label><label>TP2<input name="target2" type="number" min="0.0001" step="0.0001" value="${Number(order.target2 || "")}"${waiting ? " disabled" : ""}></label><label>TP3<input name="target3" type="number" min="0.0001" step="0.0001" value="${Number(order.target3 || "")}"${waiting ? " disabled" : ""}></label><div class="paper-order-form-actions">${waiting ? "<small>Limit fiyatına gelince sunucu tarafındaki işlem monitörü emri açar.</small>" : `<button type="submit" class="trading-button">AYARLARI KAYDET</button><button type="button" class="trading-button success" data-nasdaq-action="approve" data-nasdaq-decision-id="${escapeHtml(decision.id)}">KÂĞIT EMRİ ONAYLA</button>`}<button type="button" class="trading-button danger" data-nasdaq-action="reject" data-nasdaq-decision-id="${escapeHtml(decision.id)}">REDDET</button></div></form><small>Fiyat, miktar, emir türü, stop ve hedefler onaydan önce düzenlenebilir.</small></article>`;
}

function renderNasdaqPaperState(payload) {
  const paper=payload?.nasdaqPaper || payload || {}; latestNasdaqPaperState=paper;
  nasdaqText("paperInitialCapital",formatNasdaqUsd(paper.initialCapital));nasdaqText("paperCash",formatNasdaqUsd(paper.cash));nasdaqText("paperEquity",formatNasdaqUsd(paper.equity));nasdaqText("paperPnL",formatNasdaqUsd(paper.pnl));nasdaqText("paperPnLPct",Number.isFinite(Number(paper.pnlPercent))?`${Number(paper.pnlPercent).toFixed(2)}%`:"—");nasdaqText("paperPositionCount",String((paper.history||[]).filter(item=>item.status==="CLOSED").length));nasdaqText("paperCostSummary",`ALPACA · ${paper.broker?.dataFeed || "SIP"} GÜNLÜK VERİ · ${paper.broker?.mode || "PAPER"} ${paper.broker?.orderSubmissionEnabled ? "EMİR HATTI AÇIK" : "KÂĞIT MOD"} · 60 SN İŞLEM MONİTÖRÜ`);
  nasdaqText("maxPositions",String(paper.risk?.maxPositions || 5));nasdaqText("targetPositionSize",`${Number(paper.risk?.maxPositionPercent || 20).toFixed(0)}%`);nasdaqText("cashReserve",`${Math.max(0,100-Number(paper.risk?.maxPositionPercent||20)*Number(paper.risk?.maxPositions||5)).toFixed(0)}%`);nasdaqText("stopRule","YZ KARARI");
  const allocation=ns("maxPositionInput"), max=ns("maxPositionsInput"), capital=ns("riskCapitalInput"); if(allocation)allocation.value=Number(paper.risk?.maxPositionPercent || 20);if(max)max.value=Number(paper.risk?.maxPositions || 5);if(capital)capital.value=Number(paper.initialCapital || 10000); const gauge=ns("riskAllocationGauge");if(gauge){const total=Number(allocation?.value||0)*Number(max?.value||0);gauge.textContent=`${total}% TAHSİS`;gauge.classList.toggle("risk-overallocated",total>100);}
  // Eski kayıtlardan kalmış tekrarlar olsa bile her onay panelinde yalnız son
  // taslak görünür. Sunucu yeni emir geldiğinde diğer taslakları da temizler.
  const pending=(paper.decisions||[]).filter(item=>["PENDING_APPROVAL","PENDING_LIMIT"].includes(item.status)&&String(item.pendingOrder?.source||"").toUpperCase()!=="MANUAL").slice(0,1);const manual=(paper.decisions||[]).filter(item=>["PENDING_APPROVAL","PENDING_LIMIT"].includes(item.status)&&String(item.pendingOrder?.source||"").toUpperCase()==="MANUAL").slice(0,1); const pendingBox=ns("pendingPaperOrders"),manualBox=ns("manualPendingOrders");nasdaqText("pendingPaperOrderStatus",`${pending.length} EMİR`);nasdaqText("manualOrderStatus",`${manual.length} EMİR`);if(pendingBox)pendingBox.innerHTML=pending.map(nasdaqPendingCard).join("")||'<div class="trading-empty">Bekleyen NASDAQ AI emri yok.</div>';if(manualBox)manualBox.innerHTML=manual.map(nasdaqPendingCard).join("")||'<div class="trading-empty">Bekleyen manuel NASDAQ emri yok.</div>';
  const positions=paper.positions||[];const tbody=ns("openPositions");nasdaqText("openPositionStatus",`${positions.length} POZİSYON`);if(tbody)tbody.innerHTML=positions.length?positions.map(position=>`<tr><td>${escapeHtml(position.symbol)}</td><td>LONG</td><td>${formatNasdaqUsd(position.entry)}</td><td>${formatNasdaqUsd(position.current)}</td><td>${Number(position.quantity)}</td><td>${formatNasdaqUsd(Number(position.current||position.entry)*Number(position.quantity||0))}</td><td>${formatNasdaqUsd(position.stop)}</td><td>${formatNasdaqUsd(position.target1)}</td><td>${formatNasdaqUsd(position.target2)}</td><td>${formatNasdaqUsd((Number(position.current)-Number(position.entry))*Number(position.quantity))}</td><td>AÇIK</td><td><button class="trading-button danger" data-nasdaq-action="close" data-nasdaq-position-id="${escapeHtml(position.id)}">KAPAT</button></td></tr>`).join(""):'<tr><td colspan="12" class="table-empty">Açık NASDAQ pozisyon yok</td></tr>';
  const activity=ns("tradingActivity"),journal=ns("tradeJournal");const activityRows=(paper.activity||[]).slice(0,100).map(item=>`<div class="log-line"><span class="log-time">${new Date(item.timestamp).toLocaleTimeString("tr-TR")}</span><span>${escapeHtml(item.type || "İŞLEM")} · ${escapeHtml(item.message || "")}</span></div>`).join("")||'<div class="trading-empty">İşlem hareketi yok.</div>';if(activity)activity.innerHTML=activityRows;if(journal)journal.innerHTML=(paper.history||[]).slice(0,40).map(item=>`<details><summary>${escapeHtml(item.symbol || "SEMBOL")} · ${escapeHtml(item.status || "KAYIT")} · ${nasdaqLocalTime(item.closedAt || item.timestamp)}</summary><p>Giriş: ${formatNasdaqUsd(item.entry)} · K/Z: ${formatNasdaqUsd(item.realizedPnl)}</p></details>`).join("")||'<div class="trading-empty">İşlem günlüğü bekleniyor.</div>';
  renderNasdaqKillSwitch(paper.killSwitch);renderNasdaqPerformance(paper);renderNasdaqScannerResults({scanned:paper.scanner?.scanned,successful:paper.scanner?.successful,source:paper.scanner?.source},nasdaqRecords);bindNasdaqPaperActions();
}

async function nasdaqRequest(endpoint, body = null) { const response=await fetch(endpoint,{method:body?"POST":"GET",headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined,cache:"no-store"});const payload=await response.json();if(!response.ok)throw new Error(payload?.error||"NASDAQ işlemi tamamlanamadı.");return payload; }
function composeNasdaqAiRecords(records, decisions) {
  const bySymbol = new Map((records || []).map(item => [item.symbol, item]));
  return (decisions || []).slice(0, 3).map(decision => ({...(bySymbol.get(decision.symbol) || {}), ...decision, history: bySymbol.get(decision.symbol)?.history || decision.history}));
}
async function loadNasdaqPaperState(){
  if(!nasdaqTab)return;
  const generation=++nasdaqStateLoadGeneration;
  try{
    const data=await nasdaqRequest("/api/nasdaq/state");
    // Manuel tarama bu istek sürerken tamamlanmış olabilir. Bu eski state
    // cevabının yeni sonuçları geri almasına kesinlikle izin verme.
    if(generation!==nasdaqStateLoadGeneration)return;
    renderNasdaqPaperState(data);
    // Sayfa açılışında son kalıcı özet gösterilebilir; kullanıcı aynı sayfada
    // yeni tarama yaptıysa ayrıntılı mum/AI kartları sadece o taramanın
    // snapshot'ından çizilir. Böylece 10-15 sn sonra eski sonuç dönmez.
    if(nasdaqLocalScannerSnapshotActive)return;
    nasdaqRecords=Array.isArray(data.nasdaqPaper?.scanner?.results)?data.nasdaqPaper.scanner.results:[];
    nasdaqAiRecords=composeNasdaqAiRecords(nasdaqRecords,data.nasdaqPaper?.decisions);
    renderNasdaqDecisionCards(nasdaqAiRecords);
    if(nasdaqAiRecords[0])renderNasdaqDetail(nasdaqAiRecords[0]);
  }catch(error){
    const target=ns("scannerResults");
    if(target)target.innerHTML=`<div class="trading-empty">NASDAQ yapılandırması bekleniyor: ${escapeHtml(error.message)}</div>`;
  }
}

// Capture aşamasında çalışır; mevcut click handler API çağrısına başlamadan
// önce eski state yenilemelerini geçersiz sayar.
document.addEventListener("click", event => {
  const start = ns("startScannerBtn");
  if (start && (event.target === start || start.contains(event.target))) {
    nasdaqLocalScannerSnapshotActive = true;
    nasdaqStateLoadGeneration += 1;
  }
}, true);

async function queueNasdaqDecision(item){const plan=nasdaqPlan(item);const entry=nasdaqEntry(item);if(!Number.isFinite(Number(entry.low))||!Number.isFinite(Number(plan.stopLoss))){throw new Error("Bu NASDAQ adayında doğrulanmış giriş ve stop seviyesi yok.");}const paper=latestNasdaqPaperState||{};const quantity=Math.max(1,Math.floor(Number(paper.initialCapital||10000)*Number(paper.risk?.maxPositionPercent||20)/100/Number(entry.low)));const data=await nasdaqRequest("/api/nasdaq/paper/queue",{symbol:item.symbol,quantity,entryPrice:entry.low,orderType:"LIMIT",stop:plan.stopLoss,target1:plan.tp1,target2:plan.tp2,target3:plan.tp3,score:item.score,grade:item.grade,fibonacci:item.fibonacci,source:"NASDAQ AI"});renderNasdaqPaperState(data);}

async function openNasdaqCloseDialog(position) {
  document.getElementById("nasdaqPaperCloseDialog")?.remove();
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
  const sync = () => { const market = orderType.value === "MARKET"; limitPrice.disabled = market; limitPrice.required = !market; };
  orderType.addEventListener("change", sync);
  dialog.addEventListener("click", event => { if (event.target === dialog || event.target.closest("[data-nasdaq-close-dialog]")) dialog.remove(); });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    try {
      const data = await nasdaqRequest("/api/nasdaq/paper/close", {positionId:position.id, quantity:Number(form.elements.quantity.value), orderType:orderType.value, limitPrice:orderType.value === "LIMIT" ? Number(limitPrice.value) : null});
      dialog.remove(); renderNasdaqPaperState(data);
    } catch (error) { window.alert(error.message); }
  });
  document.body.append(dialog); sync();
  try {
    const quote = await nasdaqRequest(`/api/nasdaq/quotes?symbols=${encodeURIComponent(position.symbol)}`);
    const latest = quote?.quotes?.[position.symbol];
    if (latest?.price) { currentPrice.value = Number(latest.price); if (orderType.value === "MARKET") limitPrice.value = Number(latest.price); livePrice.textContent = `SON TAMAMLANMIŞ GÜNLÜK FİYAT: ${formatNasdaqUsd(latest.price)}`; }
    else livePrice.textContent = "SON TAMAMLANMIŞ GÜNLÜK FİYAT: GEÇİCİ OLARAK ALINAMADI";
  } catch { livePrice.textContent = "SON TAMAMLANMIŞ GÜNLÜK FİYAT: GEÇİCİ OLARAK ALINAMADI"; }
}

function bindNasdaqInteractions(){nasdaqTab?.querySelectorAll("[data-nasdaq-decision-index],[data-nasdaq-history-index]").forEach(element=>{if(element.dataset.nasdaqDetailBound)return;element.dataset.nasdaqDetailBound="true";element.addEventListener("click",()=>{const historyIndex=element.dataset.nasdaqHistoryIndex;if(historyIndex!==undefined)return renderNasdaqHistoryDetail(Number(historyIndex));const item=nasdaqAiRecords[Number(element.dataset.nasdaqDecisionIndex)];if(item)renderNasdaqDetail(item);});});}
function bindNasdaqPaperActions(){nasdaqTab?.querySelectorAll("[data-nasdaq-action]").forEach(button=>{if(button.dataset.nasdaqActionBound)return;button.dataset.nasdaqActionBound="true";button.addEventListener("click",async()=>{try{const action=button.dataset.nasdaqAction;if(action==="queue"){const item=nasdaqAiRecords[Number(button.dataset.nasdaqIndex)];if(item)await queueNasdaqDecision(item);return;}if(action==="close"){const position=(latestNasdaqPaperState?.positions||[]).find(item=>item.id===button.dataset.nasdaqPositionId);if(position)openNasdaqCloseDialog(position);return;}const data=await nasdaqRequest(`/api/nasdaq/paper/${action}`,{decisionId:button.dataset.nasdaqDecisionId});renderNasdaqPaperState(data);}catch(error){window.alert(error.message);}});});nasdaqTab?.querySelectorAll("[data-nasdaq-pending-form]").forEach(form=>{if(form.dataset.nasdaqBound)return;form.dataset.nasdaqBound="true";const type=form.elements.orderType,price=form.elements.entryPrice;type?.addEventListener("change",()=>{const market=type.value==="MARKET";price.disabled=market;price.required=!market;if(market)price.value="";});form.addEventListener("submit",async event=>{event.preventDefault();try{const card=form.closest("[data-nasdaq-pending-card]"),data=Object.fromEntries(new FormData(form));if(data.orderType==="MARKET")data.entryPrice=null;const payload=await nasdaqRequest("/api/nasdaq/paper/update",{...data,decisionId:card?.dataset.nasdaqDecisionId});renderNasdaqPaperState(payload);}catch(error){window.alert(error.message);}});});}

function bindNasdaqWorkspaceControls(){if(!nasdaqTab)return;const start=ns("startScannerBtn"),stop=ns("stopScannerBtn");if(start&&!start.dataset.nasdaqBound){start.dataset.nasdaqBound="true";start.addEventListener("click",async()=>{if(start.disabled)return;const requestId=++nasdaqScannerRequestId,jobId=`nasdaq-${Date.now()}`;nasdaqScannerAbortController=new AbortController();start.disabled=true;start.textContent="TARANIYOR…";nasdaqText("scannerStatus","TARANIYOR");nasdaqText("tradingEngineStatus","TARANIYOR");nasdaqScannerPollTimer=window.setInterval(async()=>{try{const job=await nasdaqRequest(`/api/trading/scanner/status?jobId=${encodeURIComponent(jobId)}`);if(requestId!==nasdaqScannerRequestId)return;const results=ns("scannerResults");if(results&&job.status!=="COMPLETE")results.innerHTML=`<div class="trading-empty scanner-progress"><strong>NASDAQ TARAMASI ÇALIŞIYOR</strong><br><small>${escapeHtml(job.message||"Hazırlanıyor")}</small><div style="height:8px;border:1px solid #2f6;background:#071008;margin:12px auto;max-width:480px"><div style="height:100%;width:${Math.max(0,Math.min(100,Number(job.progress)||0))}%;background:#34ff75"></div></div></div>`;}catch{}},700);try{const data=await nasdaqRequest(`/api/nasdaq/scanner?jobId=${encodeURIComponent(jobId)}`);nasdaqRecords=Array.isArray(data.results)?data.results:[];nasdaqAiRecords=composeNasdaqAiRecords(nasdaqRecords,data.decisions);renderNasdaqPaperState(data);renderNasdaqDecisionCards(nasdaqAiRecords);renderNasdaqScannerResults(data,nasdaqRecords);if(nasdaqAiRecords[0])renderNasdaqDetail(nasdaqAiRecords[0]);nasdaqText("scannerStatus","TAMAMLANDI");nasdaqText("tradingEngineStatus","HAZIR");nasdaqText("lastScanTime",new Date(data.timestamp).toLocaleTimeString("tr-TR"));}catch(error){const results=ns("scannerResults");if(results)results.innerHTML=`<div class="trading-empty">NASDAQ tarama hatası: ${escapeHtml(error.message)}</div>`;nasdaqText("scannerStatus","HATA");nasdaqText("tradingEngineStatus","HATA");}finally{window.clearInterval(nasdaqScannerPollTimer);nasdaqScannerPollTimer=null;if(requestId===nasdaqScannerRequestId){start.disabled=false;start.textContent="TARAMAYI BAŞLAT";nasdaqScannerAbortController=null;}}});}if(stop&&!stop.dataset.nasdaqBound){stop.dataset.nasdaqBound="true";stop.addEventListener("click",()=>{nasdaqScannerRequestId++;nasdaqScannerAbortController?.abort();window.clearInterval(nasdaqScannerPollTimer);nasdaqText("scannerStatus","DURDURULDU");nasdaqText("tradingEngineStatus","HAZIR");if(start){start.disabled=false;start.textContent="TARAMAYI BAŞLAT";}});}const risk=ns("riskSettingsForm");if(risk&&!risk.dataset.nasdaqBound){risk.dataset.nasdaqBound="true";risk.addEventListener("submit",async event=>{event.preventDefault();try{const data=await nasdaqRequest("/api/nasdaq/risk-settings",{capital:ns("riskCapitalInput")?.value,maxPositionPercent:ns("maxPositionInput")?.value,maxPositions:ns("maxPositionsInput")?.value});renderNasdaqPaperState(data);}catch(error){window.alert(error.message);}});["maxPositionInput","maxPositionsInput"].forEach(name=>ns(name)?.addEventListener("input",()=>{const gauge=ns("riskAllocationGauge"),total=Number(ns("maxPositionInput")?.value||0)*Number(ns("maxPositionsInput")?.value||0);if(gauge){gauge.textContent=`${total}% TAHSİS`;gauge.classList.toggle("risk-overallocated",total>100);}}));}const manual=ns("manualPaperOrderForm");if(manual&&!manual.dataset.nasdaqBound){manual.dataset.nasdaqBound="true";const type=manual.elements.orderType,price=manual.elements.entryPrice,symbol=manual.elements.symbol;const quote=async()=>{const value=String(symbol?.value||"").trim().toUpperCase();if(!/^[A-Z]{1,8}$/.test(value))return;try{const data=await nasdaqRequest(`/api/nasdaq/quotes?symbols=${encodeURIComponent(value)}`);const current=data.quotes?.[value];let label=manual.querySelector(".manual-market-price");if(!label){label=document.createElement("small");label.className="manual-market-price";manual.prepend(label);}label.textContent=current?`SON TAMAMLANMIŞ GÜNLÜK FİYAT: ${formatNasdaqUsd(current.price)} · ${current.source}`:"Fiyat alınamadı";}catch{}};const sync=()=>{const market=type?.value==="MARKET";price.disabled=market;price.required=!market;if(market)price.value="";};type?.addEventListener("change",sync);symbol?.addEventListener("change",quote);symbol?.addEventListener("input",()=>{window.clearTimeout(manual._quoteTimer);manual._quoteTimer=window.setTimeout(quote,400);});sync();manual.addEventListener("submit",async event=>{event.preventDefault();try{const data=Object.fromEntries(new FormData(manual));if(data.orderType==="MARKET")data.entryPrice=null;const payload=await nasdaqRequest("/api/nasdaq/paper/queue",{...data,source:"MANUAL",grade:"MANUEL"});renderNasdaqPaperState(payload);manual.reset();sync();}catch(error){window.alert(error.message);}});} ["performanceRange","performanceStartDate","performanceEndDate"].forEach(name=>ns(name)?.addEventListener("change",()=>renderNasdaqPerformance(latestNasdaqPaperState||{})));if(!nasdaqQuoteTimer)nasdaqQuoteTimer=window.setInterval(()=>{if(latestNasdaqPaperState)renderNasdaqPaperState({nasdaqPaper:latestNasdaqPaperState});},30000);}

function bindNasdaqKillSwitch() {
  const button = ns("killSwitchToggle");
  if (!button || button.dataset.nasdaqKillBound === "true") return;
  button.dataset.nasdaqKillBound = "true";
  button.addEventListener("click", async () => {
    const password = ns("killSwitchPassword")?.value || "";
    const active = button.dataset.nasdaqKillActive === "true";
    if (!password) return window.alert("Acil durdurma şifresini girin.");
    button.disabled = true;
    try {
      const data = await nasdaqRequest("/api/nasdaq/kill-switch", {password, action: active ? "deactivate" : "activate"});
      if (ns("killSwitchPassword")) ns("killSwitchPassword").value = "";
      renderNasdaqPaperState(data);
    } catch (error) {
      window.alert(`NASDAQ acil durdurma güncellenemedi: ${error.message}`);
    } finally {
      button.disabled = false;
    }
  });
}

function bindNasdaqLogout() {
  const button = ns("logoutButton");
  if (!button || button.dataset.nasdaqLogoutBound === "true") return;
  button.hidden = false;
  button.dataset.nasdaqLogoutBound = "true";
  button.addEventListener("click", async () => {
    try { await fetch("/api/auth/logout", {method:"POST"}); }
    finally { window.location.reload(); }
  });
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
  return { type: "price", precision, minMove: 10 ** -precision };
}

function formatCryptoUsd(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "—";
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cryptoPricePrecision(number),
  }).format(number);
}

function renderCryptoDecisionCards(records) {
  const feed = document.getElementById("cryptoDecisionFeed");
  if (!feed) return;
  feed.innerHTML = (records || []).map((item, index) => {
    const fib = item.fibonacci || {};
    const plan = fib.valid ? fib : (item.fallbackPlan || {});
    const entryLow = fib.valid ? fib.entryZoneLow : plan.entryPrice;
    const entryHigh = fib.valid ? fib.entryZoneHigh : plan.entryPrice;
    return `<article class="decision-item decision-card" role="button" tabindex="0" data-crypto-decision-index="${index}"><header><strong>${escapeHtml(item.symbol)}</strong><span>TEKNİK ${Number(item.score || 0)}/100</span><span>${escapeHtml(translateTradingStatus(fib.status || "NO_VALID_STRUCTURE"))}</span></header><div class="decision-price-grid"><span><small>FİYAT</small>${formatCryptoUsd(item.price)}</span><span><small>RSI / ATR</small>${formatPrice(item.rsi)} / ${formatCryptoUsd(item.atr)}</span><span><small>FIBONACCI</small>${fib.valid ? "GEÇERLİ" : "YAPI YOK · ATR PLAN"}</span></div><div class="decision-summary">Giriş: ${formatCryptoUsd(entryLow)} – ${formatCryptoUsd(entryHigh)} · SL: ${formatCryptoUsd(plan.stopLoss)} · TP1/2/3: ${formatCryptoUsd(plan.tp1)} / ${formatCryptoUsd(plan.tp2)} / ${formatCryptoUsd(plan.tp3)}</div><button type="button" class="trading-button" data-crypto-live-action="prefill" data-crypto-decision-index="${index}">CANLI EMİR FORMUNA AKTAR</button></article>`;
  }).join("") || '<div class="trading-empty">Uygun kripto adayı bulunamadı.</div>';
  bindCryptoDecisionInteractions();
  bindCryptoPaperActions();
  bindCryptoLiveDecisionActions();
}

function restoreCryptoSavedScan(paper) {
  const scanner = paper?.scanner || {};
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
  if (time && timestamp && !Number.isNaN(timestamp.getTime())) time.textContent = timestamp.toLocaleTimeString("tr-TR", {hour:"2-digit", minute:"2-digit", second:"2-digit"});
}

function renderCryptoPaperState(payload) {
  const paper = payload?.cryptoPaper || payload || {};
  latestCryptoPaperState = paper;
  renderCryptoKillSwitch(paper.killSwitch || {});
  restoreCryptoSavedScan(paper);
  const setText = (id, value) => { const element = document.getElementById(id); if (element) element.textContent = value; };
  setText("cryptoPaperInitial", formatCryptoUsd(paper.initialCapital));
  setText("cryptoPaperCash", formatCryptoUsd(paper.cash));
  setText("cryptoPaperEquity", formatCryptoUsd(paper.equity));
  setText("cryptoPaperPnl", formatCryptoUsd(paper.pnl));
  setText("cryptoPaperPnlPct", Number.isFinite(Number(paper.pnlPercent)) ? `${Number(paper.pnlPercent).toFixed(2)}%` : "—");
  setText("cryptoPaperPositionCount", `${(paper.positions || []).filter(item => item.status === "OPEN").length} / ${Number(paper.risk?.maxPositions || 5)}`);
  setText("cryptoPaperMonitorStatus", "BAĞLI · 60 SN İŞLEM MONİTÖRÜ");
  setText("cryptoRiskMax", Number(paper.risk?.maxPositions || 5));
  setText("cryptoRiskAllocation", `${Number(paper.risk?.maxPositionPercent || 20)}%`);
  const riskCapital = document.getElementById("cryptoRiskCapital"); if (riskCapital) riskCapital.value = Number(paper.initialCapital || 10000);
  const riskAllocation = document.getElementById("cryptoRiskAllocationInput"); if (riskAllocation) riskAllocation.value = Number(paper.risk?.maxPositionPercent || 20);
  const riskMax = document.getElementById("cryptoRiskMaxInput"); if (riskMax) riskMax.value = Number(paper.risk?.maxPositions || 5);
  renderCryptoRiskGauge();
  const allPending = (paper.decisions || []).filter(item => ["PENDING_APPROVAL", "PENDING_LIMIT"].includes(item.status));
  renderCryptoLegacyPendingPlans(allPending);
  const pending = allPending.filter(item => String(item.pendingOrder?.source || item.source || "").toUpperCase() !== "MANUAL");
  const manualPending = allPending.filter(item => String(item.pendingOrder?.source || item.source || "").toUpperCase() === "MANUAL");
  const pendingMount = document.getElementById("cryptoPendingOrders");
  const renderPendingCards = items => items.slice(0, 1).map(item => {
    const order = item.pendingOrder || {};
    const waiting = item.status === "PENDING_LIMIT";
    return `<article class="pending-paper-order-card${String(order.source || "").toUpperCase() === "MANUAL" ? " is-manual" : ""}" data-crypto-pending-card data-crypto-decision-id="${escapeHtml(item.id)}"><div class="pending-paper-order-head"><strong>${escapeHtml(item.symbol)} · ${String(order.source || "").toUpperCase() === "MANUAL" ? "MANUEL" : "YZ PLANI"}</strong><span class="pending-paper-order-badge">${waiting ? "LİMİT BEKLİYOR" : "ONAY BEKLİYOR"}</span></div><div class="paper-order-live-price" data-crypto-market-price data-crypto-symbol="${escapeHtml(item.symbol)}">CANLI PİYASA FİYATI: YÜKLENİYOR…</div><form class="paper-order-form" data-crypto-pending-form><label>MİKTAR<input name="quantity" type="number" min="0.00000001" step="any" value="${Number(order.quantity || 1)}" required${waiting ? " disabled" : ""}></label><label data-crypto-price-label>GİRİŞ FİYATI ($)<input name="entryPrice" type="number" min="0.00000001" step="any" value="${order.entryPrice ?? ""}"${order.orderType === "MARKET" || waiting ? " disabled" : " required"}></label><label>EMİR TÜRÜ<select name="orderType"${waiting ? " disabled" : ""}><option value="MARKET"${order.orderType === "MARKET" ? " selected" : ""}>PİYASA</option><option value="LIMIT"${order.orderType === "LIMIT" ? " selected" : ""}>LİMİT</option></select></label><label>STOP<input name="stop" type="number" min="0.00000001" step="any" value="${order.stop ?? ""}"${waiting ? " disabled" : ""}></label><label>TP1<input name="target1" type="number" min="0.00000001" step="any" value="${order.target1 ?? ""}"${waiting ? " disabled" : ""}></label><label>TP2<input name="target2" type="number" min="0.00000001" step="any" value="${order.target2 ?? ""}"${waiting ? " disabled" : ""}></label><label>TP3<input name="target3" type="number" min="0.00000001" step="any" value="${order.target3 ?? ""}"${waiting ? " disabled" : ""}></label><div class="paper-order-form-actions">${waiting ? "<small>Limit fiyatına gelince sunucu tarafındaki işlem monitörü emri açar.</small>" : `<button type="submit" class="trading-button">AYARLARI KAYDET</button><button type="button" class="trading-button" data-crypto-paper-action="approve" data-crypto-decision-id="${escapeHtml(item.id)}">KÂĞIT EMRİ ONAYLA</button>`}<button type="button" class="trading-button danger" data-crypto-paper-action="reject" data-crypto-decision-id="${escapeHtml(item.id)}">REDDET</button><small>YALNIZCA KÂĞIT · Fiyat, miktar, emir türü, SL ve hedefler onaydan önce düzenlenebilir.</small></div></form></article>`;
  }).join("");
  setText("cryptoPendingStatus", `${pending.length} EMİR`);
  setText("cryptoManualOrderStatus", `${manualPending.length} EMİR`);
  if (pendingMount) pendingMount.innerHTML = pending.length ? renderPendingCards(pending) : '<div class="trading-empty">Bekleyen kripto YZ emri yok.</div>';
  const manualPendingMount = document.getElementById("cryptoManualPendingOrders");
  if (manualPendingMount) manualPendingMount.innerHTML = manualPending.length ? renderPendingCards(manualPending) : '<div class="trading-empty">Bekleyen manuel kripto emri yok.</div>';
  const positions = (paper.positions || []).filter(item => item.status === "OPEN");
  const tbody = document.getElementById("cryptoOpenPositions");
  setText("cryptoOpenStatus", `${positions.length} POZİSYON`);
  if (tbody) tbody.innerHTML = positions.length ? positions.map(item => { const pnl = (Number(item.current || item.entry) - Number(item.entry)) * Number(item.quantity); return `<tr><td>${escapeHtml(item.symbol)}</td><td>LONG</td><td>${formatCryptoUsd(item.entry)}</td><td>${formatCryptoUsd(item.current)}</td><td>${Number(item.quantity)}</td><td>${formatCryptoUsd(Number(item.entry) * Number(item.quantity))}</td><td>${formatCryptoUsd(item.stop)}</td><td>${formatCryptoUsd(item.target1)}</td><td>${formatCryptoUsd(item.target2)}</td><td>${formatCryptoUsd(pnl)}</td><td>AÇIK</td><td><button type="button" class="trading-button danger" data-crypto-paper-action="close" data-crypto-position-id="${escapeHtml(item.id)}">KAPAT</button></td></tr>`; }).join("") : '<tr><td colspan="12" class="table-empty">Açık kripto pozisyon yok</td></tr>';
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
    const order = item.pendingOrder || {};
    const source = String(order.source || item.source || "KRİPTO PLANI").toUpperCase();
    const stage = item.status === "PENDING_LIMIT" ? "LİMİT PLAN" : "ONAY BEKLİYOR";
    return `<article class="pending-paper-order-card crypto-paper-pending-plan-card"><div class="pending-paper-order-head"><strong>${escapeHtml(item.symbol || "KRİPTO")} · ${escapeHtml(source)}</strong><span class="pending-paper-order-badge">${stage}</span></div><div class="decision-detail-grid"><span>Tür: ${escapeHtml(order.orderType || "MARKET")}</span><span>Miktar: ${escapeHtml(String(order.quantity ?? "—"))}</span><span>Planlanan fiyat: ${formatCryptoUsd(order.entryPrice)}</span></div><button type="button" class="trading-button danger" data-crypto-legacy-plan-cancel data-crypto-decision-id="${escapeHtml(item.id)}">PLANI İPTAL ET</button></article>`;
  }).join("");
  document.querySelectorAll("[data-crypto-legacy-plan-cancel]").forEach(button => {
    if (button.dataset.cryptoLegacyCancelBound === "true") return;
    button.dataset.cryptoLegacyCancelBound = "true";
    button.addEventListener("click", async () => {
      const decisionId = button.dataset.cryptoDecisionId;
      if (!decisionId || !window.confirm("Bu kâğıt plan iptal edilsin mi? Binance'e gerçek emir gönderilmez veya iptal edilmez.")) return;
      button.disabled = true;
      try {
        const response = await fetch("/api/crypto/paper/reject", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({decisionId})});
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error || "Bekleyen kripto planı iptal edilemedi.");
        renderCryptoPaperState(payload);
        await loadControlCenter();
      } catch (error) {
        window.alert(error.message);
      } finally {
        button.disabled = false;
      }
    });
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
  button.addEventListener("click", async () => {
    const password = String(passwordInput?.value || "");
    if (!password) return window.alert("Acil durdurma şifresini gir.");
    const active = Boolean(latestCryptoPaperState?.killSwitch?.active);
    const confirmed = window.confirm(active ? "Yalnız kripto emir takibini yeniden açmak istiyor musun?" : "Yalnız kripto açık pozisyonlar kapatılacak ve kripto bekleyen emirleri iptal edilecek. Devam edilsin mi?");
    if (!confirmed) return;
    button.disabled = true;
    try {
      const response = await fetch("/api/crypto/kill-switch", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({password, action:active ? "deactivate" : "activate"})});
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Kripto acil durdurma uygulanamadı.");
      if (passwordInput) passwordInput.value = "";
      renderCryptoPaperState(payload);
    } catch (error) { window.alert(error.message); }
    finally { button.disabled = false; }
  });
}

function cryptoRangeStart() {
  const range = document.getElementById("cryptoPerformanceRange")?.value || "ALL";
  const custom = document.getElementById("cryptoPerformanceStart")?.value;
  if (range === "CUSTOM") return custom ? new Date(`${custom}T00:00:00`).getTime() : null;
  const months = {"1M": 1, "3M": 3, "6M": 6}[range]; if (!months) return null;
  const date = new Date(); date.setMonth(date.getMonth() - months); return date.getTime();
}

function renderCryptoPersistentSignals(paper) {
  const range = document.getElementById("cryptoPerformanceRange")?.value || "ALL";
  const start = cryptoRangeStart(); const endText = document.getElementById("cryptoPerformanceEnd")?.value; const end = range === "CUSTOM" && endText ? new Date(`${endText}T23:59:59`).getTime() : null;
  const signals = (paper.signals || []).filter(item => { const time = new Date(item.timestamp || 0).getTime(); return (!start || time >= start) && (!end || time <= end); });
  cryptoVisibleSignals = signals;
  const history = document.getElementById("cryptoSignalHistory"); const status = document.getElementById("cryptoHistoryStatus");
  const average = signals.length ? signals.reduce((sum, item) => sum + Number(item.score || 0), 0) / signals.length : 0;
  const active = (paper.decisions || []).filter(item => ["PENDING_APPROVAL", "OPEN"].includes(item.status)).length;
  const closed = (paper.history || []).filter(item => item.status === "CLOSED");
  const wins = closed.filter(item => Number(item.realizedPnl || 0) > 0).length;
  const realized = closed.reduce((sum, item) => sum + Number(item.realizedPnl || 0), 0);
  const update = (id, value) => { const element = document.getElementById(id); if (element) element.textContent = value; };
  update("cryptoPerformanceScanned", signals.length); update("cryptoPerformanceValid", active); update("cryptoPerformanceBest", signals.length ? `${average.toFixed(1)}/100` : "—"); update("cryptoPerformanceSelected", closed.length); update("cryptoPerformanceWinRate", closed.length ? `%${(wins * 100 / closed.length).toFixed(1)}` : "—"); update("cryptoPerformanceRealized", formatCryptoUsd(realized));
  if (status) status.textContent = `${signals.length} KAYIT`;
  if (history) history.innerHTML = signals.length ? signals.slice(0, 50).map((item, index) => `<button type="button" class="signal-history-item" data-crypto-signal-index="${index}"><strong>${escapeHtml(item.symbol)}</strong><span>${escapeHtml(item.grade || "KARAR")} · TEKNİK ${Number(item.score || 0)}/100</span><small>${escapeHtml(translateTradingStatus(item.status || "NO_VALID_STRUCTURE"))} · ${escapeHtml(new Date(item.timestamp).toLocaleString("tr-TR"))}</small></button>`).join("") : '<div class="trading-empty">Bu tarih aralığında kayıtlı kripto sinyali yok.</div>';
  bindCryptoSignalHistoryDetails();
}

function cryptoHistoryDetailMarkup(item) {
  const fib = item?.fibonacci || {};
  const plan = fib.valid ? fib : (item?.fallbackPlan || {});
  const entryLow = fib.valid ? fib.entryZoneLow : plan.entryPrice;
  const entryHigh = fib.valid ? fib.entryZoneHigh : plan.entryPrice;
  return `<strong>${escapeHtml(item?.symbol || "KRİPTO")} · ${escapeHtml(item?.grade || "KARAR")} · ${escapeHtml(translateTradingStatus(item?.status || fib.status || "NO_VALID_STRUCTURE"))}</strong>
    <div>Fiyat: ${formatCryptoUsd(item?.price)} · Teknik puan: ${Number(item?.score || 0)}/100</div>
    <div>Giriş: ${formatCryptoUsd(entryLow)}–${formatCryptoUsd(entryHigh)} · SL: ${formatCryptoUsd(plan.stopLoss)}</div>
    <div>TP1: ${formatCryptoUsd(plan.tp1)} · TP2: ${formatCryptoUsd(plan.tp2)} · TP3: ${formatCryptoUsd(plan.tp3)}</div>
    <div>A/B/C: ${formatCryptoUsd(fib.pointA?.price)} / ${formatCryptoUsd(fib.pointB?.price)} / ${formatCryptoUsd(fib.pointC?.price)} · Tetik: ${formatCryptoUsd(fib.entryTriggerPrice)}</div>
    <small>${escapeHtml(item?.reason || (fib.valid ? "Fibonacci seviyeleri Binance günlük verisinden hesaplandı." : (plan.message || "Geçerli Fibonacci yapısı bulunamadı; seviyeler destek/direnç ve ATR ile hesaplandı.")))}</small>`;
}

async function loadCryptoPaperState() {
  try {
    const response = await fetch("/api/crypto/state", {cache: "no-store"});
    if (!response.ok) return;
    renderCryptoPaperState(await response.json());
  } catch {}
}

async function queueCryptoPaperDecision(item) {
  const fib = item?.fibonacci || {};
  const plan = fib.valid ? fib : (item?.fallbackPlan || {});
  const price = Number(plan.entryPrice || fib.entryPrice || item?.price);
  if (!item || !Number.isFinite(price) || price <= 0) return window.alert("Bu aday için doğrulanmış giriş fiyatı yok.");
  const quantity = Math.max(1, Math.floor((Number(latestCryptoPaperState?.initialCapital || 10000) * Number(latestCryptoPaperState?.risk?.maxPositionPercent || 20) / 100) / price));
  try {
    const response = await fetch("/api/crypto/paper/queue", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({symbol: item.symbol, quantity, entryPrice: price, orderType: "MARKET", stop: plan.stopLoss, target1: plan.tp1, target2: plan.tp2, target3: plan.tp3, score: item.score, grade: item.grade, fibonacci: item.fibonacci, source: "CRYPTO AI"})});
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || "Kripto emri oluşturulamadı.");
    renderCryptoPaperState(payload);
  } catch (error) { window.alert(error.message); }
}

async function refreshCryptoQuotes() {
  const priceNodes = [...document.querySelectorAll("[data-crypto-market-price]")];
  const symbols = [...new Set(priceNodes.map(node => node.dataset.cryptoSymbol).filter(Boolean))];
  if (!symbols.length) return;
  try {
    const response = await fetch(`/api/crypto/quotes?symbols=${encodeURIComponent(symbols.join(","))}`, {cache: "no-store"});
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || "Canlı fiyat alınamadı.");
    priceNodes.forEach(node => {
      const quote = payload.quotes?.[node.dataset.cryptoSymbol];
      node.textContent = quote ? `CANLI PİYASA FİYATI: ${formatCryptoUsd(quote.price)}` : "CANLI PİYASA FİYATI: GEÇİCİ OLARAK ALINAMADI";
    });
  } catch {
    priceNodes.forEach(node => { node.textContent = "CANLI PİYASA FİYATI: GEÇİCİ OLARAK ALINAMADI"; });
  }
}

async function refreshCryptoManualPrice() {
  const form = document.getElementById("cryptoManualOrderForm");
  let target = document.getElementById("cryptoManualLivePrice");
  if (!target && form) {
    target = document.createElement("div");
    target.id = "cryptoManualLivePrice";
    target.className = "paper-order-live-price";
    form.querySelector(".paper-order-form-actions")?.before(target);
  }
  const symbol = String(form?.elements?.symbol?.value || "").trim().toUpperCase();
  if (!target) return;
  if (!/^[A-Z0-9]{2,12}$/.test(symbol)) {
    target.textContent = "CANLI PİYASA FİYATI: PARİTE GİRİLMESİ BEKLENİYOR";
    return;
  }
  target.textContent = "CANLI PİYASA FİYATI: YÜKLENİYOR…";
  try {
    const response = await fetch(`/api/crypto/quotes?symbols=${encodeURIComponent(symbol)}`, {cache: "no-store"});
    const payload = await response.json();
    const quote = payload?.quotes?.[symbol];
    if (!response.ok || !quote) throw new Error("Fiyat alınamadı.");
    target.textContent = `CANLI PİYASA FİYATI: ${formatCryptoUsd(quote.price)}`;
  } catch {
    target.textContent = "CANLI PİYASA FİYATI: GEÇİCİ OLARAK ALINAMADI";
  }
}

function bindCryptoSignalHistoryDetails() {
  document.querySelectorAll("#cryptoSignalHistory [data-crypto-signal-index]").forEach(button => {
    if (button.dataset.cryptoSignalBound === "true") return;
    button.dataset.cryptoSignalBound = "true";
    button.addEventListener("click", () => {
      const signal = cryptoVisibleSignals[Number(button.dataset.cryptoSignalIndex)];
      if (!signal) return;
      const liveRecord = cryptoRenderedRecords.find(record => record.symbol === signal.symbol);
      const record = liveRecord || {
        ...signal,
        price: signal.price || signal.fibonacci?.entryPrice || null,
        indicators: signal.indicators || {},
        history: signal.history || [],
      };
      const detail = document.getElementById("cryptoSignalDetail");
      if (detail) detail.innerHTML = cryptoHistoryDetailMarkup(record);
    });
  });
}

function bindCryptoPaperActions() {
  document.querySelectorAll("[data-crypto-paper-action]").forEach(button => {
    if (button.dataset.cryptoPaperBound === "true") return;
    button.dataset.cryptoPaperBound = "true";
    button.addEventListener("click", async () => {
      const action = button.dataset.cryptoPaperAction;
      if (action === "queue") { const item = cryptoRenderedRecords[Number(button.dataset.cryptoDecisionIndex)]; if (item) await queueCryptoPaperDecision(item); return; }
      if (action === "close") { openCryptoCloseOrder(button.dataset.cryptoPositionId); return; }
      const endpoint = action === "approve" ? "/api/crypto/paper/approve" : "/api/crypto/paper/reject";
      const body = {decisionId: button.dataset.cryptoDecisionId};
      try { const response = await fetch(endpoint, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)}); const payload = await response.json(); if (!response.ok) throw new Error(payload?.error || "İşlem yapılamadı."); renderCryptoPaperState(payload); } catch (error) { window.alert(error.message); }
    });
  });
  document.querySelectorAll("[data-crypto-pending-form]").forEach(form => {
    if (form.dataset.cryptoBound === "true") return;
    form.dataset.cryptoBound = "true";
    const sync = () => { const field = form.elements.namedItem("entryPrice"); const market = String(form.elements.namedItem("orderType")?.value || "").toUpperCase() === "MARKET"; if (field) { field.disabled = market; field.required = !market; if (market) field.value = ""; } };
    form.elements.namedItem("orderType")?.addEventListener("change", sync); sync();
    form.addEventListener("submit", async event => { event.preventDefault(); const card = form.closest("[data-crypto-pending-card]"); const data = Object.fromEntries(new FormData(form)); if (String(data.orderType).toUpperCase() === "MARKET") data.entryPrice = null; try { const response = await fetch("/api/crypto/paper/update", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({...data, decisionId: card?.dataset.cryptoDecisionId})}); const payload = await response.json(); if (!response.ok) throw new Error(payload?.error || "Emir güncellenemedi."); renderCryptoPaperState(payload); } catch (error) { window.alert(error.message); } });
  });
}

function openCryptoCloseOrder(positionId) {
  const position = (latestCryptoPaperState?.positions || []).find(item => item.id === positionId && item.status === "OPEN");
  if (!position) return window.alert("Bu pozisyon artık açık değil. Ekran güncel sunucu durumuyla yenilendi.");
  document.getElementById("cryptoPaperCloseDialog")?.remove();
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
    limit.disabled = market; limit.required = !market;
  };
  dialog.querySelector('[name="orderType"]').addEventListener("change", sync);
  dialog.addEventListener("click", event => { if (event.target === dialog || event.target.closest("[data-crypto-close-dialog]")) dialog.remove(); });
  dialog.querySelector("form").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget; const orderType = form.elements.orderType.value;
    try {
      const response = await fetch("/api/crypto/paper/close", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({positionId: position.id, quantity: Number(form.elements.quantity.value), orderType, limitPrice: orderType === "LIMIT" ? Number(form.elements.limitPrice.value) : null})});
      const payload = await response.json(); if (!response.ok) throw new Error(payload?.error || "Satış emri gerçekleştirilemedi.");
      renderCryptoPaperState(payload); dialog.remove();
    } catch (error) { window.alert(error.message); }
  });
  document.body.appendChild(dialog); sync(); void refreshCryptoQuotes();
}

function renderCryptoRiskGauge() {
  const gauge = document.getElementById("cryptoRiskAllocationGauge"); if (!gauge) return;
  const allocation = Number(document.getElementById("cryptoRiskAllocationInput")?.value || 0) * Number(document.getElementById("cryptoRiskMaxInput")?.value || 0);
  gauge.textContent = `${allocation.toFixed(0)}% TAHSİS`; gauge.classList.toggle("is-over", allocation > 100); gauge.classList.toggle("is-safe", allocation <= 100); gauge.title = `Hedef pozisyon × azami işlem: toplam ${allocation.toFixed(2)}%`;
}

function bindCryptoWorkspaceControls() {
  const riskForm = document.getElementById("cryptoRiskSettingsForm");
  if (riskForm && riskForm.dataset.cryptoBound !== "true") { riskForm.dataset.cryptoBound = "true"; riskForm.addEventListener("submit", async event => { event.preventDefault(); try { const response = await fetch("/api/crypto/risk-settings", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({capital: document.getElementById("cryptoRiskCapital")?.value, maxPositionPercent: document.getElementById("cryptoRiskAllocationInput")?.value, maxPositions: document.getElementById("cryptoRiskMaxInput")?.value})}); const payload = await response.json(); if (!response.ok) throw new Error(payload?.error || "Risk ayarı kaydedilemedi."); renderCryptoPaperState(payload); } catch (error) { window.alert(error.message); } }); }
  const manualForm = document.getElementById("cryptoManualOrderForm");
  const manualMount = document.getElementById("cryptoManualOrderMount");
  const manualWrap = document.querySelector("#cryptoTab .manual-paper-order-wrap");
  if (manualMount && manualWrap && manualWrap.parentElement !== manualMount) manualMount.appendChild(manualWrap);
  if (manualForm && manualForm.dataset.cryptoBound !== "true") {
    manualForm.dataset.cryptoBound = "true";
    const syncManualOrderType = () => {
      const market = String(manualForm.elements.orderType?.value || "").toUpperCase() === "MARKET";
      const price = manualForm.elements.entryPrice;
      const label = price?.closest("label");
      if (price) { price.disabled = market; price.required = !market; if (market) price.value = ""; }
      if (label) label.firstChild.textContent = market ? "PİYASA FİYATI ($)" : "LİMİT FİYAT ($)";
    };
    manualForm.elements.orderType?.addEventListener("change", syncManualOrderType);
    manualForm.elements.symbol?.addEventListener("input", () => {
      window.clearTimeout(cryptoManualQuoteTimer);
      cryptoManualQuoteTimer = window.setTimeout(() => { void refreshCryptoManualPrice(); }, 350);
    });
    manualForm.elements.symbol?.addEventListener("change", () => { void refreshCryptoManualPrice(); });
    syncManualOrderType(); void refreshCryptoManualPrice();
    manualForm.addEventListener("submit", async event => {
      event.preventDefault(); const data = Object.fromEntries(new FormData(manualForm));
      if (String(data.orderType).toUpperCase() === "MARKET") data.entryPrice = null;
      try {
        const response = await fetch("/api/crypto/paper/queue", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({...data, source: "MANUAL", grade: "MANUEL"})});
        const payload = await response.json(); if (!response.ok) throw new Error(payload?.error || "Manuel emir oluşturulamadı.");
        renderCryptoPaperState(payload); manualForm.reset(); syncManualOrderType(); void refreshCryptoManualPrice();
      } catch (error) { window.alert(error.message); }
    });
  }
  const performanceRange = document.getElementById("cryptoPerformanceRange");
  if (performanceRange && performanceRange.dataset.cryptoBound !== "true") { performanceRange.dataset.cryptoBound = "true"; performanceRange.addEventListener("change", () => renderCryptoPersistentSignals(latestCryptoPaperState || {})); }
  ["cryptoPerformanceStart", "cryptoPerformanceEnd"].forEach(id => {
    const element = document.getElementById(id);
    if (element && element.dataset.cryptoBound !== "true") {
      element.dataset.cryptoBound = "true";
      element.addEventListener("change", () => { if (performanceRange) performanceRange.value = "CUSTOM"; renderCryptoPersistentSignals(latestCryptoPaperState || {}); });
    }
  });
  ["cryptoRiskAllocationInput", "cryptoRiskMaxInput"].forEach(id => { const element = document.getElementById(id); if (element && element.dataset.cryptoGaugeBound !== "true") { element.dataset.cryptoGaugeBound = "true"; element.addEventListener("input", renderCryptoRiskGauge); } });
  renderCryptoRiskGauge();
  const closeForm = document.getElementById("cryptoCloseOrderForm");
  if (closeForm && closeForm.dataset.cryptoBound !== "true") { closeForm.dataset.cryptoBound = "true"; closeForm.addEventListener("submit", async event => { event.preventDefault(); const data = Object.fromEntries(new FormData(closeForm)); try { const response = await fetch("/api/crypto/paper/close", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(data)}); const payload = await response.json(); if (!response.ok) throw new Error(payload?.error || "Satış emri gerçekleştirilemedi."); renderCryptoPaperState(payload); document.getElementById("cryptoCloseOrderPanel").hidden = true; } catch (error) { window.alert(error.message); } }); }
  const cancel = document.getElementById("cryptoCloseOrderCancel"); if (cancel && cancel.dataset.cryptoBound !== "true") { cancel.dataset.cryptoBound = "true"; cancel.addEventListener("click", () => { document.getElementById("cryptoCloseOrderPanel").hidden = true; }); }
  if (!cryptoQuoteRefreshTimer) cryptoQuoteRefreshTimer = window.setInterval(() => { void refreshCryptoQuotes(); }, 15000);
}

function renderCryptoDecisionChart(item) {
  const container = document.getElementById("cryptoDecisionChart");
  if (!container || typeof LightweightCharts === "undefined") return;
  try {
    if (cryptoMarketChart) cryptoMarketChart.remove();
    container.innerHTML = "";
    const candles = (item.history || []).slice(-150).map(candle => ({
      time: Number(candle.time), open: Number(candle.open), high: Number(candle.high), low: Number(candle.low), close: Number(candle.close),
    })).filter(candle => Number.isFinite(candle.time) && [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite));
    const referencePrice = Number(item.price) || Number(candles.at(-1)?.close) || 1;
    cryptoMarketChart = LightweightCharts.createChart(container, {
      width: Math.max(280, container.clientWidth || 320), height: 300,
      layout: {background: {color: "#071008"}, textColor: "#b8d9c0"},
      grid: {vertLines: {color: "rgba(72,255,104,.08)"}, horzLines: {color: "rgba(72,255,104,.08)"}},
      rightPriceScale: {borderColor: "rgba(72,255,104,.25)"},
      timeScale: {borderColor: "rgba(72,255,104,.25)", timeVisible: false},
    });
    cryptoCandleSeries = cryptoMarketChart.addSeries(LightweightCharts.CandlestickSeries, {
      upColor: "#42d392", downColor: "#f05b6b", borderVisible: false,
      wickUpColor: "#42d392", wickDownColor: "#f05b6b",
      priceFormat: cryptoChartPriceFormat(referencePrice),
    });
    cryptoCandleSeries.setData(candles);
    const fib = item.fibonacci || {};
    const plan = fib.valid ? fib : (item.fallbackPlan || {});
    const lineStyle = LightweightCharts.LineStyle || {};
    [
      [fib.valid ? fib.entryTriggerPrice : null, "FIB TETİK", "#76a9ff", lineStyle.Dashed ?? 2],
      [fib.valid ? fib.entryZoneLow : plan.entryPrice, fib.valid ? "GİRİŞ ALT" : "GİRİŞ", "#72dddd", lineStyle.Dotted ?? 1],
      [fib.valid ? fib.entryZoneHigh : null, "GİRİŞ ÜST", "#72dddd", lineStyle.Dotted ?? 1],
      [plan.stopLoss, "SL", "#ff6b6b", lineStyle.Solid ?? 0],
      [plan.tp1, "TP1", "#78e58b", lineStyle.Solid ?? 0],
      [plan.tp2, "TP2", "#78e58b", lineStyle.Solid ?? 0],
      [plan.tp3, "TP3", "#78e58b", lineStyle.Solid ?? 0],
    ].forEach(([price, title, color, lineStyleValue]) => {
      if (Number.isFinite(Number(price)) && Number(price) > 0) cryptoCandleSeries.createPriceLine({price: Number(price), title, color, lineWidth: 1, lineStyle: lineStyleValue, axisLabelVisible: true});
    });
    const resistance = fib.valid ? fib.descendingResistance : null;
    if (resistance?.valid && resistance?.anchor1 && resistance?.anchor2 && resistance?.projectedPoint && LightweightCharts.LineSeries) {
      const trendLine = cryptoMarketChart.addSeries(LightweightCharts.LineSeries, {color: "#ff7979", lineWidth: 2, lineStyle: lineStyle.Dashed ?? 2, lastValueVisible: false, priceLineVisible: false});
      trendLine.setData([resistance.anchor1, resistance.anchor2, resistance.projectedPoint].map(point => ({
        time: Math.floor(new Date(point.date).getTime() / 1000), value: Number(point.price),
      })).filter(point => Number.isFinite(point.time) && Number.isFinite(point.value)));
    }
    const points = [[fib.pointA, "A", "belowBar", "#f8c35a"], [fib.pointB, "B", "aboveBar", "#76a9ff"], [fib.pointC, "C", "belowBar", "#ff7a7a"]]
      .filter(([point]) => Number.isFinite(Number(point?.price)) && point?.date)
      .map(([point, text, position, color]) => ({time: Math.floor(new Date(point.date).getTime() / 1000), position, color, shape: "circle", text}));
    if (points.length && typeof LightweightCharts.createSeriesMarkers === "function") cryptoChartMarkers = LightweightCharts.createSeriesMarkers(cryptoCandleSeries, points);
    cryptoMarketChart.timeScale().fitContent();
  } catch (error) {
    console.warn("CRYPTO CHART:", error.message);
    container.innerHTML = '<div class="trading-empty">Kripto grafik verisi oluşturulamadı.</div>';
  }
}

function renderCryptoScoreBreakdown(item) {
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
    const factors = Array.isArray(bucket?.items) ? bucket.items.map(entry => escapeHtml(String(entry?.label || entry))).join(" · ") : "Veri yok";
    return `<tr><th>${escapeHtml(label)}</th><td><strong>${Number(bucket?.score || 0)}/${Number(bucket?.max || 0)}</strong></td><td>${factors || "—"}</td></tr>`;
  }).join("");
  content.innerHTML = `<div class="decision-score-summary"><strong>TEKNİK ${Number(item.score || 0)}/100 · ${escapeHtml(item.grade || "KARAR")}</strong><span>Bu puan başarı olasılığı değildir.</span></div><div class="crypto-score-table-wrap"><table class="crypto-score-table"><thead><tr><th>BAŞLIK</th><th>PUAN</th><th>KANITLAR</th></tr></thead><tbody>${rows}<tr class="decision-score-penalty-row"><th>Cezalar</th><td><strong>${Number(breakdown.penalties?.score || 0)}</strong></td><td>${Array.isArray(breakdown.penalties?.items) ? breakdown.penalties.items.map(entry => escapeHtml(String(entry?.label || entry))).join(" · ") : "Ceza yok"}</td></tr></tbody></table></div>`;
}

function renderCryptoDecisionDetail(item) {
  const detail = document.getElementById("cryptoDecisionDetail");
  const symbol = document.getElementById("cryptoDecisionSymbol");
  const chart = document.getElementById("cryptoDecisionChart");
  const chartSymbol = document.getElementById("cryptoChartSymbol");
  if (!detail || !item) return;
  const fib = item.fibonacci || {};
  const plan = fib.valid ? fib : (item.fallbackPlan || {});
  const entryLow = fib.valid ? fib.entryZoneLow : plan.entryPrice;
  const entryHigh = fib.valid ? fib.entryZoneHigh : plan.entryPrice;
  if (symbol) symbol.textContent = item.symbol || "SEMBOL YOK";
  if (chartSymbol) chartSymbol.textContent = item.symbol || "SEMBOL YOK";
  if (chart) renderCryptoDecisionChart(item);
  renderCryptoScoreBreakdown(item);
  const index = cryptoRenderedRecords.indexOf(item);
  detail.innerHTML = `<strong>${escapeHtml(item.symbol)} · ${escapeHtml(item.grade || "KARAR")} · ${escapeHtml(translateTradingStatus(fib.status || "NO_VALID_STRUCTURE"))}</strong><div class="decision-detail-grid"><span>Son fiyat: ${formatCryptoUsd(item.price)}</span><span>RSI: ${formatPrice(item.rsi)} · ATR: ${formatCryptoUsd(item.atr)}</span><span>A: ${formatCryptoUsd(fib.pointA?.price)} · ${escapeHtml(chartDateKey(fib.pointA?.date) || "—")}</span><span>B: ${formatCryptoUsd(fib.pointB?.price)} · ${escapeHtml(chartDateKey(fib.pointB?.date) || "—")}</span><span>C: ${formatCryptoUsd(fib.pointC?.price)} · ${escapeHtml(chartDateKey(fib.pointC?.date) || "—")}</span><span>FIB TETİK: ${formatCryptoUsd(fib.entryTriggerPrice)}</span><span>Giriş bölgesi: ${formatCryptoUsd(entryLow)} – ${formatCryptoUsd(entryHigh)}</span><span>Stop: ${formatCryptoUsd(plan.stopLoss)}</span><span>TP1: ${formatCryptoUsd(plan.tp1)} · R/R ${plan.riskRewardTp1 ?? "—"}</span><span>TP2: ${formatCryptoUsd(plan.tp2)} · R/R ${plan.riskRewardTp2 ?? "—"}</span><span>TP3: ${formatCryptoUsd(plan.tp3)} · R/R ${plan.riskRewardTp3 ?? "—"}</span><span>Teyit: ${fib.valid ? (fib.confirmationPassed ? "GEÇTİ" : "BEKLİYOR") : "FIBONACCI YAPISI YOK"}</span></div><small>${escapeHtml(item.reason || (fib.valid ? "Fibonacci seviyeleri backend günlük OHLCV verisinden hesaplandı." : (plan.message || "Geçerli Fibonacci yapısı bulunamadı; seviyeler destek/direnç ve ATR ile hesaplandı.")))}</small>${index >= 0 ? `<br><button type="button" class="trading-button" data-crypto-live-action="prefill" data-crypto-decision-index="${index}">CANLI EMİR FORMUNA AKTAR</button>` : ""}`;
  bindCryptoPaperActions();
  bindCryptoLiveDecisionActions();
}

function renderCryptoScanSummary(data, records) {
  const history = document.getElementById("cryptoSignalHistory");
  const status = document.getElementById("cryptoHistoryStatus");
  const setText = (id, value) => { const element = document.getElementById(id); if (element) element.textContent = value; };
  setText("cryptoPerformanceScanned", Number(data.scanned || 0));
  setText("cryptoPerformanceValid", Number(data.successful || 0));
  setText("cryptoPerformanceBest", records.length ? `${Number(records[0].score || 0)}/100` : "—");
  setText("cryptoPerformanceSelected", records.length);
  if (status) status.textContent = `${records.length} KAYIT`;
  if (history && !latestCryptoPaperState) history.innerHTML = records.length ? records.map((item, index) => `<button type="button" class="signal-history-item" data-crypto-history-index="${index}"><strong>${escapeHtml(item.symbol)}</strong><span>${escapeHtml(item.grade || "KARAR")} · TEKNİK ${Number(item.score || 0)}/100</span><small>${escapeHtml(translateTradingStatus(item.fibonacci?.status || "NO_VALID_STRUCTURE"))} · ${new Date(data.timestamp).toLocaleString("tr-TR")}</small></button>`).join("") : '<div class="trading-empty">Kaydedilecek kripto adayı bulunamadı.</div>';
}

function bindCryptoDecisionInteractions() {
  document.querySelectorAll("#cryptoDecisionFeed [data-crypto-decision-index], [data-crypto-history-index]").forEach(element => {
    if (element.dataset.cryptoDetailBound === "true") return;
    element.dataset.cryptoDetailBound = "true";
    element.addEventListener("click", () => {
      const index = Number(element.dataset.cryptoDecisionIndex ?? element.dataset.cryptoHistoryIndex);
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
  if (!payload?.connected) {
    if (status) status.textContent = "BAĞLANTI HATASI";
    if (headerStatus) headerStatus.textContent = "BAĞLANTI HATASI";
    if (summary) {
      const error = payload?.error || {};
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
  if (balances) balances.innerHTML = rows.length
    ? `<div class="crypto-spot-balance-grid">${rows.map(item => `<div><strong>${escapeHtml(item.asset)}</strong><span>Kullanılabilir: ${escapeHtml(String(item.free))}</span><span>Bloke: ${escapeHtml(String(item.locked))}</span></div>`).join("")}</div>`
    : '<div class="trading-empty">Sıfırdan büyük Spot bakiye bulunamadı.</div>';
}

async function loadCryptoSpotAccount() {
  const status = document.getElementById("cryptoSpotConnectionStatus");
  if (status) status.textContent = "KONTROL EDİLİYOR";
  try {
    const response = await fetch("/api/trading/crypto/account", {cache: "no-store"});
    const payload = await response.json();
    renderCryptoSpotAccount(payload);
    return payload;
  } catch {
    renderCryptoSpotAccount({connected: false, error: {message: "Binance Spot hesap bağlantısı kontrol edilemedi."}});
    return null;
  }
}

function renderCryptoSpotOpenOrders(payload) {
  const status = document.getElementById("cryptoSpotOpenOrdersStatus");
  const mount = document.getElementById("cryptoSpotOpenOrders");
  const cancelAll = document.getElementById("cancelAllCryptoSpotOrders");
  if (!mount) return;
  if (!payload?.connected) {
    latestCryptoSpotOpenOrders = [];
    if (status) status.textContent = "BAĞLANTI HATASI";
    if (cancelAll) cancelAll.disabled = true;
    mount.innerHTML = `<div class="trading-empty">${escapeHtml(payload?.error?.message || "Binance açık emirleri alınamadı.")}</div>`;
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

async function loadCryptoSpotOpenOrders() {
  try {
    const response = await fetch("/api/trading/crypto/open-orders", {cache: "no-store"});
    const payload = await response.json();
    renderCryptoSpotOpenOrders(payload);
    return payload;
  } catch {
    renderCryptoSpotOpenOrders({connected: false, error: {message: "Binance açık emirleri alınamadı."}});
    return null;
  }
}

function formatCryptoSpotTimestamp(value) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp).toLocaleString("tr-TR") : "—";
}

function renderCryptoSpotActivity(payload) {
  const status = document.getElementById("cryptoSpotActivityStatus");
  const mount = document.getElementById("cryptoSpotActivity");
  if (!mount) return;
  if (!payload?.connected) {
    if (status) status.textContent = "BAĞLANTI HATASI";
    mount.innerHTML = `<div class="trading-empty">${escapeHtml(payload?.error?.message || "Binance işlem kaydı alınamadı.")}</div>`;
    return;
  }
  const orders = Array.isArray(payload.orders) ? payload.orders : [];
  const trades = Array.isArray(payload.trades) ? payload.trades : [];
  if (status) status.textContent = `${escapeHtml(payload.symbol || "SPOT")} · ${trades.length} İŞLEM`;
  const orderRows = orders.length
    ? orders.map(order => `<div class="crypto-spot-activity-row"><strong>${escapeHtml(order.side)} · ${escapeHtml(order.type)} · ${escapeHtml(order.status)}</strong><span>${escapeHtml(order.origQty)} @ ${escapeHtml(order.price)}</span><small>${escapeHtml(formatCryptoSpotTimestamp(order.transactTime))}</small></div>`).join("")
    : '<div class="trading-empty">Bu parite için emir kaydı bulunamadı.</div>';
  const tradeRows = trades.length
    ? trades.map(trade => `<div class="crypto-spot-activity-row"><strong>${escapeHtml(trade.side)} · ${escapeHtml(trade.quantity)} @ ${escapeHtml(trade.price)}</strong><span>Toplam: ${escapeHtml(trade.quoteQuantity)} · Komisyon: ${escapeHtml(trade.commission)} ${escapeHtml(trade.commissionAsset)}</span><small>${escapeHtml(formatCryptoSpotTimestamp(trade.time))}</small></div>`).join("")
    : '<div class="trading-empty">Bu parite için gerçekleşen işlem bulunamadı.</div>';
  mount.innerHTML = `<section class="crypto-spot-activity-column"><h4>SON EMİRLER</h4><div class="crypto-spot-activity-list">${orderRows}</div></section><section class="crypto-spot-activity-column"><h4>SON GERÇEKLEŞENLER</h4><div class="crypto-spot-activity-list">${tradeRows}</div></section>`;
}

async function loadCryptoSpotActivity(symbol) {
  const input = document.getElementById("cryptoSpotActivitySymbol");
  const selectedSymbol = String(symbol || input?.value || "BTCUSDT").trim().toUpperCase();
  if (input) input.value = selectedSymbol;
  try {
    const response = await fetch(`/api/trading/crypto/recent-activity?symbol=${encodeURIComponent(selectedSymbol)}`, {cache: "no-store"});
    const payload = await response.json();
    renderCryptoSpotActivity(payload);
    return payload;
  } catch {
    renderCryptoSpotActivity({connected: false, error: {message: "Binance işlem kaydı alınamadı."}});
    return null;
  }
}

function bindCryptoSpotActivity() {
  const button = document.getElementById("refreshCryptoSpotActivity");
  const input = document.getElementById("cryptoSpotActivitySymbol");
  if (button && button.dataset.cryptoSpotActivityBound !== "true") {
    button.dataset.cryptoSpotActivityBound = "true";
    button.addEventListener("click", () => { void loadCryptoSpotActivity(); });
  }
  if (input && input.dataset.cryptoSpotActivityBound !== "true") {
    input.dataset.cryptoSpotActivityBound = "true";
    input.addEventListener("change", () => { void loadCryptoSpotActivity(); });
  }
}

function bindCryptoSpotKillSwitch() {
  const button = document.getElementById("cryptoSpotKillSwitchButton");
  if (!button || button.dataset.cryptoSpotKillBound === "true") return;
  button.dataset.cryptoSpotKillBound = "true";
  button.addEventListener("click", async () => {
    const password = document.getElementById("cryptoSpotKillSwitchPassword")?.value || "";
    const confirmed = document.getElementById("cryptoSpotKillSwitchConfirm")?.checked === true;
    const result = document.getElementById("cryptoSpotKillSwitchResult");
    if (!password) { window.alert("Acil durdurma şifresini girin."); return; }
    if (!confirmed) { window.alert("Açık emirlerin iptali için onay kutusunu işaretleyin."); return; }
    if (!window.confirm("Binance Spot hesabındaki açık emirler iptal edilecek. Cüzdan varlıkları SATILMAYACAK. Devam edilsin mi?")) return;
    button.disabled = true;
    button.textContent = "AÇIK EMİRLER İPTAL EDİLİYOR…";
    if (result) result.textContent = "Binance Spot açık emirleri kontrol ediliyor…";
    try {
      const response = await fetch("/api/trading/crypto/kill-switch", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({password, confirm: true})});
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message || "Binance Spot acil durdurma tamamlanamadı.");
      const failed = Array.isArray(payload.failed) ? payload.failed : [];
      if (result) result.textContent = `${payload.message || "Acil durdurma tamamlandı."}${failed.length ? ` ${failed.length} emir iptal edilemedi; açık emirleri kontrol edin.` : ""}`;
      const passwordInput = document.getElementById("cryptoSpotKillSwitchPassword");
      const confirmInput = document.getElementById("cryptoSpotKillSwitchConfirm");
      if (passwordInput) passwordInput.value = "";
      if (confirmInput) confirmInput.checked = false;
      await Promise.all([loadCryptoSpotOpenOrders(), loadCryptoSpotAccount(), loadCryptoSpotActivity()]);
    } catch (error) {
      if (result) result.textContent = `ACİL DURDURMA BAŞARISIZ · ${error.message}`;
      window.alert(error.message);
    } finally {
      button.disabled = false;
      button.textContent = "AÇIK EMİRLERİ ACİLEN İPTAL ET";
    }
  });
}

async function refreshCryptoLivePrice() {
  const form = cryptoLiveOrderForm();
  const output = document.getElementById("cryptoLiveMarketPrice");
  const symbol = String(form?.elements?.symbol?.value || "").trim().toUpperCase();
  if (!output) return;
  if (!/^[A-Z0-9]{5,20}$/.test(symbol)) {
    output.textContent = "CANLI PİYASA FİYATI: GEÇERLİ PARİTE GİRİN";
    return;
  }
  output.textContent = "CANLI PİYASA FİYATI: YÜKLENİYOR…";
  try {
    const response = await fetch(`/api/crypto/quotes?symbols=${encodeURIComponent(symbol)}`, {cache: "no-store"});
    const payload = await response.json();
    const quote = payload?.quotes?.[symbol];
    if (!response.ok || !quote) throw new Error("Fiyat alınamadı.");
    output.textContent = `CANLI PİYASA FİYATI: ${formatCryptoUsd(quote.price)}`;
  } catch {
    output.textContent = "CANLI PİYASA FİYATI: GEÇİCİ OLARAK ALINAMADI";
  }
}

function syncCryptoLiveOrderType() {
  const form = cryptoLiveOrderForm();
  if (!form) return;
  const isMarket = String(form.elements.orderType?.value || "").toUpperCase() === "MARKET";
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
  const form = cryptoLiveOrderForm();
  if (!form || !item) return;
  const fib = item.fibonacci || {};
  const plan = fib.valid ? fib : (item.fallbackPlan || {});
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
  document.getElementById("cryptoLiveOrderPanel")?.scrollIntoView({behavior: "smooth", block: "center"});
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
    button.addEventListener("click", async () => {
      const symbol = String(button.dataset.cryptoSymbol || "");
      const orderId = String(button.dataset.cryptoOrderId || "");
      if (!window.confirm(`${symbol} emrini Binance Spot'ta gerçekten iptal etmek istiyor musun?`)) return;
      button.disabled = true;
      try {
        await cancelCryptoSpotOrder(symbol, orderId);
        await Promise.all([loadCryptoSpotOpenOrders(), loadCryptoSpotAccount(), loadCryptoSpotActivity(symbol)]);
      } catch (error) { window.alert(error.message); }
      finally { button.disabled = false; }
    });
  });
}

async function cancelCryptoSpotOrder(symbol, orderId) {
  const response = await fetch("/api/trading/crypto/order/cancel", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({symbol, orderId, confirm: true}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) {
    throw new Error(payload?.error?.message || "Binance emri iptal edilemedi.");
  }
  return payload;
}

function bindCryptoSpotCancelAllButton() {
  const button = document.getElementById("cancelAllCryptoSpotOrders");
  if (!button || button.dataset.cryptoCancelAllBound === "true") return;
  button.dataset.cryptoCancelAllBound = "true";
  button.addEventListener("click", async () => {
    const orders = latestCryptoSpotOpenOrders.slice();
    if (!orders.length) return;
    if (!window.confirm(`${orders.length} açık Binance Spot emrinin tamamı iptal edilecek. Devam edilsin mi?`)) return;
    button.disabled = true;
    const failures = [];
    for (const order of orders) {
      try {
        await cancelCryptoSpotOrder(String(order.symbol || ""), String(order.orderId || ""));
      } catch (error) {
        failures.push(`${order.symbol || "EMİR"}: ${error.message || "iptal edilemedi"}`);
      }
    }
    await Promise.all([loadCryptoSpotOpenOrders(), loadCryptoSpotAccount(), loadCryptoSpotActivity()]);
    if (failures.length) window.alert(`Bazı emirler iptal edilemedi:\n${failures.join("\n")}`);
  });
}

function bindCryptoLiveTrading() {
  const refresh = document.getElementById("refreshCryptoSpotAccount");
  if (refresh && refresh.dataset.cryptoLiveBound !== "true") {
    refresh.dataset.cryptoLiveBound = "true";
    refresh.addEventListener("click", () => { void Promise.all([loadCryptoSpotAccount(), loadCryptoSpotOpenOrders(), loadCryptoSpotActivity()]); });
  }
  const form = cryptoLiveOrderForm();
  if (!form || form.dataset.cryptoLiveBound === "true") return;
  form.dataset.cryptoLiveBound = "true";
  let quoteTimer = null;
  form.elements.orderType?.addEventListener("change", syncCryptoLiveOrderType);
  form.elements.symbol?.addEventListener("input", () => { window.clearTimeout(quoteTimer); quoteTimer = window.setTimeout(() => { void refreshCryptoLivePrice(); }, 350); });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const result = document.getElementById("cryptoLiveOrderResult");
    const data = Object.fromEntries(new FormData(form));
    const isMarket = String(data.orderType || "").toUpperCase() === "MARKET";
    if (isMarket) data.price = null;
    data.confirm = document.getElementById("cryptoLiveOrderConfirm")?.checked === true;
    if (!data.confirm) { window.alert("Gerçek emir için onay kutusunu işaretleyin."); return; }
    const readable = `${String(data.symbol || "").toUpperCase()} · ${data.side === "SELL" ? "SAT" : "AL"} · ${isMarket ? "PİYASA" : `LİMİT ${data.price}`} · miktar ${data.quantity}`;
    if (!window.confirm(`Bu gerçek Binance Spot emrini göndermek istiyor musun?\n\n${readable}`)) return;
    const submit = document.getElementById("submitCryptoLiveOrder");
    if (submit) { submit.disabled = true; submit.textContent = "BİNANCE’E GÖNDERİLİYOR…"; }
    if (result) result.textContent = "Emir Binance’e gönderiliyor…";
    try {
      const response = await fetch("/api/trading/crypto/order", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(data)});
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload?.error?.message || "Binance emri gönderilemedi.");
      const order = payload.order || {};
      if (result) result.textContent = `EMİR KAYDEDİLDİ · ${order.symbol} · ${order.side} · ${order.type} · ${order.status} · ID ${order.orderId}`;
      form.reset(); form.elements.symbol.value = order.symbol || "BTCUSDT"; form.elements.orderType.value = "MARKET"; form.elements.side.value = "BUY";
      syncCryptoLiveOrderType(); void refreshCryptoLivePrice();
      await Promise.all([loadCryptoSpotOpenOrders(), loadCryptoSpotAccount(), loadCryptoSpotActivity(order.symbol)]);
    } catch (error) { if (result) result.textContent = `EMİR GÖNDERİLEMEDİ · ${error.message}`; window.alert(error.message); }
    finally { if (submit) { submit.disabled = false; submit.textContent = "BİNANCE’E GERÇEK EMİR GÖNDER"; } }
  });
  syncCryptoLiveOrderType();
  void refreshCryptoLivePrice();
  void loadCryptoLiveSafety();
}

async function loadCryptoLiveSafety() {
  const mount = document.getElementById("cryptoLiveSafetyInfo");
  if (!mount) return;
  try {
    const response = await fetch("/api/trading/crypto/safety", {cache: "no-store"});
    const payload = await response.json();
    if (!response.ok || !payload?.connected) throw new Error("Canlı Spot güvenlik politikası alınamadı.");
    const policy = payload.policy || {};
    mount.textContent = `SUNUCU KORUMASI · Son onay zorunlu · Emir üst sınırı ${Number(policy.maxOrderNotionalUsdt || 0).toLocaleString("tr-TR", {maximumFractionDigits: 2})} USDT · Limit sapması en fazla %${Number(policy.maxLimitDeviationPercent || 0).toLocaleString("tr-TR")} · Aynı emir ${Number(policy.duplicateWindowSeconds || 0)} sn içinde tekrar gönderilmez.`;
  } catch {
    mount.textContent = "CANLI EMİR KORUMASI SUNUCUDAN DOĞRULANAMADI. Emir göndermeden önce bağlantıyı kontrol edin.";
  }
}

async function runCryptoScanner() {
  const button = document.getElementById("startCryptoScannerBtn");
  const status = document.getElementById("cryptoScannerStatus");
  const engine = document.getElementById("cryptoEngineStatus");
  const results = document.getElementById("cryptoScannerResults");
  const feed = document.getElementById("cryptoDecisionFeed");
  if (!button || button.disabled) return;
  const requestId = ++cryptoScannerRequestId;
  cryptoScannerAbortController = new AbortController();
  const jobId = window.crypto?.randomUUID?.() || `crypto-${Date.now()}`;
  button.disabled = true;
  button.textContent = "TARANIYOR…";
  if (status) status.textContent = "TARANIYOR";
  if (engine) engine.textContent = "TARANIYOR";
  cryptoScannerPollTimer = window.setInterval(async () => {
    try {
      const response = await fetch(`/api/trading/scanner/status?jobId=${encodeURIComponent(jobId)}`, {cache:"no-store"});
      const job = await response.json();
      if (requestId !== cryptoScannerRequestId) return;
      if (results && job.status !== "COMPLETE") results.innerHTML = `<div class="trading-empty scanner-progress"><strong>KRİPTO TARAMASI ÇALIŞIYOR</strong><br><small>${escapeHtml(String(job.message || "Hazırlanıyor"))}</small><div style="height:8px;border:1px solid #2f6;background:#071008;margin:12px auto;max-width:480px"><div style="height:100%;width:${Math.max(0, Math.min(100, Number(job.progress) || 0))}%;background:#34ff75"></div></div></div>`;
    } catch {}
  }, 700);
  try {
    const response = await fetch(`/api/crypto/scanner?jobId=${encodeURIComponent(jobId)}`, {cache:"no-store", signal: cryptoScannerAbortController.signal});
    const data = await response.json();
    if (requestId !== cryptoScannerRequestId) return;
    if (!response.ok || !data.success) throw new Error(data?.error || "Kripto taraması başarısız.");
    cryptoRenderedRecords = Array.isArray(data.results) ? data.results : [];
    if (results) results.innerHTML = `<div class="trading-empty">${data.scanned} Binance USDT paritesi tarandı · ${data.successful} geçerli günlük veri</div>`;
    if (feed) renderCryptoDecisionCards(cryptoRenderedRecords);
    renderCryptoScanSummary(data, cryptoRenderedRecords);
    if (data.cryptoPaper) renderCryptoPaperState({cryptoPaper: data.cryptoPaper});
    renderCryptoDecisionDetail(cryptoRenderedRecords[0]);
    if (status) status.textContent = "TAMAMLANDI";
    if (engine) engine.textContent = "HAZIR";
    const time = document.getElementById("cryptoLastScanTime");
    if (time) time.textContent = new Date(data.timestamp).toLocaleTimeString("tr-TR", {hour:"2-digit",minute:"2-digit",second:"2-digit"});
  } catch (error) {
    if (error?.name === "AbortError" || requestId !== cryptoScannerRequestId) return;
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
      cryptoScannerRequestId += 1;
      cryptoScannerAbortController?.abort(); cryptoScannerAbortController = null;
      if (cryptoScannerPollTimer) window.clearInterval(cryptoScannerPollTimer); cryptoScannerPollTimer = null;
      const status = document.getElementById("cryptoScannerStatus"); const engine = document.getElementById("cryptoEngineStatus");
      if (status) status.textContent = "DURDURULDU";
      if (engine) engine.textContent = "HAZIR";
      button.disabled = false; button.textContent = "KRİPTO TARAMASINI BAŞLAT";
    });
  }
}


function bindTradingScannerControls() {

  /*
   * Scanner arayüzü DOM tamamen hazır olduğunda bağlanır.
   * Böylece üstteki görsel/terminal kodlarından bağımsız kalır.
   */
  if (
    scannerStartButton &&
    scannerStartButton.dataset.scannerBound !== "true"
  ) {

    scannerStartButton.dataset.scannerBound =
      "true";

    scannerStartButton.addEventListener(
      "click",
      (event) => {

        event.preventDefault();

        runTradingScanner();

      }
    );

  }

  loadTradingState();

  bindRiskSettings();

  bindSignalHistoryDetails();

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

  if (
    scannerStopButton &&
    scannerStopButton.dataset.scannerBound !== "true"
  ) {

    scannerStopButton.dataset.scannerBound =
      "true";

    scannerStopButton.addEventListener(
      "click",
      (event) => {

        event.preventDefault();

        stopTradingScanner();

      }
    );

  }

}


window.runTradingScanner =
  runTradingScanner;

/* ======================================================
   ORTAK KONTROL MERKEZİ
====================================================== */

function controlCenterMarketSummary(label, tabId, paper, currency, extraStatus = "") {
  const positions = Array.isArray(paper?.positions) ? paper.positions.filter(item => {
    const status = String(item?.status || "").toUpperCase();
    const quantity = Number(item?.remainingQuantity ?? item?.quantity);
    return status === "OPEN" && !item?.closedAt && (!Number.isFinite(quantity) || quantity > 0);
  }) : [];
  const pending = Array.isArray(paper?.pendingOrders)
    ? paper.pendingOrders
    : (Array.isArray(paper?.decisions) ? paper.decisions.filter(item => ["PENDING_APPROVAL", "PENDING_LIMIT"].includes(item?.status)) : []);
  const activity = Array.isArray(paper?.activity) ? paper.activity : [];
  const stopped = Boolean(paper?.killSwitch?.active);
  const money = value => {
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    return new Intl.NumberFormat("tr-TR", {style: "currency", currency, maximumFractionDigits: currency === "TRY" ? 2 : 2}).format(number);
  };
  return {
    label,
    tabId,
    stopped,
    activity,
    html: `<article class="control-market-card${stopped ? " is-stopped" : ""}">
      <header><strong>${escapeHtml(label)}</strong><span>${stopped ? "ACİL DURDURMA AKTİF" : (extraStatus || "HAZIR")}</span></header>
      <div class="control-market-metrics">
        <span><small>AÇIK POZİSYON</small>${positions.length}</span>
        <span><small>BEKLEYEN EMİR</small>${pending.length}</span>
        <span><small>PORTFÖY DEĞERİ</small>${money(paper?.equity)}</span>
        <span><small>NAKİT</small>${money(paper?.cash)}</span>
      </div>
      <button type="button" class="trading-button" data-control-open="${escapeHtml(tabId)}">${escapeHtml(label)} ALANINI AÇ</button>
    </article>`
  };
}

function controlCenterTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("tr-TR", {hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit"});
}

async function loadControlCenter() {
  if (controlCenterRefreshInFlight || !document.getElementById("controlTab")) return;
  controlCenterRefreshInFlight = true;
  const refreshedAt = document.getElementById("controlCenterUpdated");
  const cards = document.getElementById("controlMarketCards");
  const recent = document.getElementById("controlRecentActivity");
  const healthGrid = document.getElementById("controlHealthGrid");
  const healthStatus = document.getElementById("controlHealthStatus");
  if (refreshedAt) refreshedAt.textContent = "YÜKLENİYOR";
  try {
    const cacheKey = `_=${Date.now()}`;
    const readFreshJson = (path, message) => fetch(`${path}${path.includes("?") ? "&" : "?"}${cacheKey}`, {
      cache: "no-store",
      headers: {"Cache-Control": "no-cache, no-store, max-age=0"},
    }).then(async response => { if (!response.ok) throw new Error(message); return response.json(); });
    const [bistResult, cryptoResult, nasdaqResult, healthResult] = await Promise.allSettled([
      readFreshJson("/api/trading/state", "BIST state alınamadı"),
      readFreshJson("/api/crypto/state", "Kripto state alınamadı"),
      readFreshJson("/api/nasdaq/state", "NASDAQ state alınamadı"),
      readFreshJson("/api/system/health", "Sağlık özeti alınamadı")
    ]);
    const bist = bistResult.status === "fulfilled" ? bistResult.value : null;
    const crypto = cryptoResult.status === "fulfilled" ? cryptoResult.value?.cryptoPaper : null;
    const nasdaq = nasdaqResult.status === "fulfilled" ? nasdaqResult.value?.nasdaqPaper : null;
    const summaries = [
      controlCenterMarketSummary("BIST100", "tradingTab", bist?.paper, "TRY", bist ? "KAĞIT İŞLEM" : "BAĞLANTI HATASI"),
      controlCenterMarketSummary("KRİPTO", "cryptoTab", crypto, "USD", crypto ? "SPOT / KAĞIT" : "BAĞLANTI HATASI"),
      controlCenterMarketSummary("NASDAQ", "nasdaqTab", nasdaq, "USD", nasdaq ? "ALPACA / KAĞIT" : "BAĞLANTI HATASI")
    ];
    if (cards) cards.innerHTML = summaries.map(item => item.html).join("");
    const activities = summaries.flatMap(summary => summary.activity.slice(0, 3).map(item => ({...item, market: summary.label})))
      .sort((left, right) => String(right.timestamp || "").localeCompare(String(left.timestamp || "")))
      .slice(0, 9);
    if (recent) recent.innerHTML = activities.length
      ? activities.map(item => `<article class="control-activity-item"><strong>${escapeHtml(item.market)} · ${escapeHtml(String(item.type || "HAREKET").replaceAll("_", " "))}</strong><span>${escapeHtml(item.message || "İşlem hareketi kaydedildi.")}</span><time>${controlCenterTime(item.timestamp)}</time></article>`).join("")
      : '<div class="trading-empty">Henüz gösterilecek işlem hareketi yok.</div>';
    const health = healthResult.status === "fulfilled" ? healthResult.value : null;
    if (healthGrid) healthGrid.innerHTML = Array.isArray(health?.items) && health.items.length
      ? health.items.map(item => `<article class="control-health-item ${item.status === "READY" ? "" : "needs-attention"}"><strong>${escapeHtml(item.label || "SERVİS")}</strong><span>${item.status === "READY" ? "HAZIR" : "DİKKAT GEREKİYOR"}</span><small>${escapeHtml(item.detail || "")}</small></article>`).join("")
      : '<div class="trading-empty">Sağlık özeti alınamadı.</div>';
    if (healthStatus) healthStatus.textContent = health ? `${health.healthy}/${health.total} HAZIR` : "BAĞLANTI HATASI";
    if (refreshedAt) refreshedAt.textContent = `GÜNCELLENDİ · ${new Date().toLocaleTimeString("tr-TR", {hour: "2-digit", minute: "2-digit"})}`;
  } catch (error) {
    if (cards) cards.innerHTML = `<div class="trading-empty">Kontrol merkezi verileri alınamadı: ${escapeHtml(error.message || "bilinmeyen hata")}</div>`;
    if (recent) recent.innerHTML = '<div class="trading-empty">İşlem hareketleri alınamadı.</div>';
    if (refreshedAt) refreshedAt.textContent = "BAĞLANTI HATASI";
  } finally {
    controlCenterRefreshInFlight = false;
  }
}

function bindControlCenter() {
  const refresh = document.getElementById("refreshControlCenter");
  if (refresh && !refresh.dataset.controlCenterBound) {
    refresh.dataset.controlCenterBound = "true";
    refresh.addEventListener("click", () => void loadControlCenter());
  }
  const cards = document.getElementById("controlMarketCards");
  if (cards && !cards.dataset.controlCenterBound) {
    cards.dataset.controlCenterBound = "true";
    cards.addEventListener("click", event => {
      const button = event.target.closest("[data-control-open]");
      const tabId = button?.dataset.controlOpen;
      if (!tabId) return;
      document.querySelector(`.main-tab[data-tab="${tabId}"]`)?.click();
    });
  }
  document.querySelector('.main-tab[data-tab="controlTab"]')?.addEventListener("click", () => void loadControlCenter());
  void loadControlCenter();
}


async function startTradingWhenAuthenticated() {
  if (!window.borsaciAuth?.authenticated) {
    await new Promise(
      resolve =>
        window.addEventListener(
          "borsaci:auth-ready",
          resolve,
          { once: true }
        )
    );
  }

  bindTradingScannerControls();
  // NASDAQ controller BIST akışından bağımsız state/DOM alanını kullanır.
  placeNasdaqManualOrderForm();
  // NASDAQ açık pozisyonlar ekranı eski istemci state'ini tekrar çizmek yerine
  // düzenli olarak sunucudan son tamamlanmış günlük fiyatı ister.
  if (!nasdaqQuoteTimer) {
    nasdaqQuoteTimer = window.setInterval(() => { void loadNasdaqPaperState(); }, 30000);
  }   
  bindNasdaqWorkspaceControls();
  bindNasdaqKillSwitch();
  bindNasdaqLogout();
  bindControlCenter();
  void loadNasdaqPaperState();
}

if (
  document.readyState === "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    startTradingWhenAuthenticated,
    { once: true }
  );

} else {

  startTradingWhenAuthenticated();

}
})();
