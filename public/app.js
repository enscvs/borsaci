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

let analysisRunning = false;

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
  symbol
) {

  const clean =
    normalizeSymbol(
      symbol
    );

  if (!clean) return;

  selectedSymbol =
    clean;

  if (chartSymbol) {

    chartSymbol.innerText =
      clean;

  }

  if (
    !symbols.includes(
      clean
    )
  ) {

    symbols.push(
      clean
    );

  }

  saveWatchlist();

  renderWatchlist();

  clearChartOnly();

  await loadMarketData(
    clean
  );

  await loadChartData(
    clean,
    chartRange,
    chartInterval
  );

}

/* ======================================================
   MARKET DATA
====================================================== */

async function loadMarketData(
  symbol
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

        updateDashboard(
          cached,
          false
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

    updateDashboard(
      data,
      false
    );

    if (dataStatus) {

      dataStatus.innerText =
        "LIVE";

    }

  } catch (error) {

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

    if (dataStatus) {

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
  updateChart = false
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
  interval = chartInterval
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

      updateChartData(
        cached.history
      );

      return;

    }

  }

  showEmptyChart(
    "LOADING CHART",
    `${range.toUpperCase()} / ${interval.toUpperCase()}`
  );

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

    chartHistory =
      history;

    updateChartData(
      history
    );

  } catch (error) {

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
      "CHART DATA ERROR",
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
      "NO CHART DATA",
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
      "CHART DATA ERROR",
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
      "CHART ERROR",
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

}

/* ======================================================
   CLEAR CHART
====================================================== */

function clearChartOnly() {

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
    "MARKET DATA ERROR",
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
      "NO SYMBOL";

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
    "NO MARKET DATA",
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

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    initializeBorsaCI,
    {
      once: true
    }
  );

} else {

  initializeBorsaCI();

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


/*
--------------------------------------------------------
FORMAT
--------------------------------------------------------
*/

function formatPrice(
  value
) {

  if (
    !Number.isFinite(
      Number(value)
    )
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
    !Number.isFinite(
      Number(value)
    )
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

function renderScannerResults(
  results
) {

  if (!scannerResults) return;

  if (
    !Array.isArray(results) ||
    results.length === 0
  ) {
    scannerResults.innerHTML =
      '<div class="trading-empty">Uygun setup bulunamadı.</div>';
    return;
  }

  scannerResults.innerHTML =
    results.map(
      (item, index) => `
        <div class="scanner-card scanner-compact" data-symbol="${item.symbol}">
          <div class="scanner-head">
            <strong>#${index + 1} · ${item.symbol}</strong>
            <strong>₺${formatPrice(item.price)}</strong>
            <span class="scanner-score">${item.score}</span>
            <span>${item.decision}</span>
          </div>
          <div class="scanner-metrics">
            RSI ${formatPrice(item.rsi)} ·
            EMA20 ₺${formatPrice(item.ema20)} ·
            EMA50 ₺${formatPrice(item.ema50)} ·
            ATR ₺${formatPrice(item.atr)}
          </div>
          <small>${
            Array.isArray(item.signals)
              ? item.signals.slice(0, 4).join(" · ")
              : ""
          }</small>
        </div>
      `
    ).join("");

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
    !Number.isFinite(
      Number(value)
    )
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


function renderAiDecisions(
  decisions
) {

  if (!aiDecisionFeed) return;

  if (
    !Array.isArray(decisions) ||
    decisions.length === 0
  ) {
    aiDecisionFeed.innerHTML =
      '<div class="trading-empty">Uygun AI kararı bulunamadı.</div>';
    return;
  }

  aiDecisionFeed.innerHTML =
    decisions.map(
      item => `
        <article class="decision-item decision-card">
          <header>
            <strong>${item.symbol}</strong>
            <span>${item.action}</span>
            <span>${item.status}</span>
            <span>GÜVEN %${item.confidence}</span>
          </header>
          <div class="decision-price-grid">
            <span><small>GİRİŞ</small>${formatCurrency(item.entry?.low)} – ${formatCurrency(item.entry?.high)}</span>
            <span><small>STOP</small>${formatCurrency(item.stop)}</span>
            <span><small>TP1 / TP2</small>${formatCurrency(item.target1)} / ${formatCurrency(item.target2)}</span>
          </div>
          <div class="decision-risk-line">
            <b>RİSK PLANI</b>
            ${item.riskPlan?.quantity ?? "--"} lot ·
            ${formatCurrency(item.riskPlan?.positionValue)} pozisyon ·
            azami zarar ${formatCurrency(item.riskPlan?.actualRisk)}
          </div>
          <div class="decision-filter-line">
            Trend ${item.filters?.trend ? "✓" : "—"} ·
            Hacim ${item.filters?.volume ? "✓" : "—"} ·
            Momentum ${item.filters?.momentum ? "✓" : "—"} ·
            RSI ${item.filters?.rsi ? "✓" : "—"}
          </div>
          <small>${item.reason}</small>
        </article>
      `
    ).join("");

}


function renderSignalHistory(
  history
) {

  const element =
    document.getElementById(
      "signalHistory"
    );

  const status =
    document.getElementById(
      "signalHistoryStatus"
    );

  const records =
    Array.isArray(history)
      ? history
      : [];

  if (status) {
    status.textContent =
      `${records.length} RECORDS`;
  }

  if (!element) {
    return;
  }

  if (records.length === 0) {

    element.innerHTML =
      '<div class="trading-empty">Henüz arşivlenmiş sinyal yok.</div>';

    return;

  }

  element.innerHTML =
    records.slice(0, 8).map(
      item => `
        <div class="log-line">
          <span class="log-time">
            ${new Date(
              item.lifecycle?.closedAt ||
              item.timestamp
            ).toLocaleTimeString("tr-TR")}
          </span>
          <span>
            ${item.symbol} · ${item.action} ·
            ${item.status}
          </span>
        </div>
      `
    ).join("");

}


function renderPerformance(
  state
) {

  const active =
    Array.isArray(state?.decisions)
      ? state.decisions
      : [];

  const history =
    Array.isArray(state?.history)
      ? state.history
      : [];

  const allSignals = [
    ...active,
    ...history,
  ];

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

  const fields = {
    performanceTotalSignals:
      allSignals.length,
    performanceActiveSignals:
      active.filter(
        item => item.status === "PENDING"
      ).length,
    performanceAvgConfidence:
      averageConfidence === null
        ? "--"
        : `%${averageConfidence}`,
    performanceResolved:
      history.filter(
        item =>
          item.status === "CLOSED" ||
          item.status === "STOPPED"
      ).length,
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

  const note =
    document.getElementById(
      "performanceNote"
    );

  if (note) {

    note.textContent =
      fields.performanceResolved > 0
        ? "Kapanan paper işlemlerin sonuçları hesaplandı."
        : "Kazanma oranı ve getiri, paper pozisyon açma/kapatma aşamasında ölçülecek.";

  }

}


function archiveLocalDecisions(
  decisions,
  timestamp
) {

  return (
    Array.isArray(decisions)
      ? decisions
      : []
  ).filter(
    item =>
      item?.status === "PENDING"
  ).map(
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
    positionCount.textContent =
      String(
        Array.isArray(
          paper.positions
        )
          ? paper.positions.length
          : 0
      );
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

    renderTradingActivity(
      localState.activity
    );

    renderSignalHistory(
      localState.history
    );

    renderPerformance(
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

      renderTradingActivity(
        state.activity
      );

      renderSignalHistory(
        state.history
      );

      renderPerformance(
        state
      );

      saveLocalTradingState(
        state
      );

    }

  } catch (error) {

    console.error(
      "Trading state yüklenemedi:",
      error
    );

  }

}


async function runTradingScanner() {

  if (
    scannerRunning
  ) {
    return;
  }

  scannerRunning = true;


  if (scannerStatus) {
    scannerStatus.textContent =
      "SCANNING";
  }


  if (tradingEngineStatus) {
    tradingEngineStatus.textContent =
      "SCANNING";
  }


  if (scannerStartButton) {
    scannerStartButton.disabled =
      true;

    scannerStartButton.textContent =
      "SCANNING...";
  }


  if (scannerResults) {

    scannerResults.innerHTML = `
      <div class="trading-empty">
        BIST100 taranıyor...
        <br>
        <small>
          Teknik veriler hesaplanıyor.
        </small>
      </div>
    `;

  }


  try {

    const response =
      await fetch(
        "/api/trading/scanner",
        {
          method: "GET",
          cache: "no-store"
        }
      );


    const data =
      await response.json();


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

    const archived =
      archiveLocalDecisions(
        previousState.decisions,
        data.timestamp
      );

    const nextState = {
      decisions:
        data.decisions,
      paper:
        data.paper,
      activity:
        data.activity,
      history: [
        ...archived,
        ...(
          Array.isArray(previousState.history)
            ? previousState.history
            : []
        ),
      ].slice(0, 100),
      lastScanAt:
        data.timestamp,
    };

    renderSignalHistory(
      nextState.history
    );

    renderPerformance(
      nextState
    );

    saveLocalTradingState(
      nextState
    );


    if (scannerStatus) {
      scannerStatus.textContent =
        "COMPLETE";
    }


    if (tradingEngineStatus) {
      tradingEngineStatus.textContent =
        "READY";
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

    console.error(
      "AI Trading Scanner:",
      error
    );


    if (scannerStatus) {
      scannerStatus.textContent =
        "ERROR";
    }


    if (tradingEngineStatus) {
      tradingEngineStatus.textContent =
        "ERROR";
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

    scannerRunning =
      false;


    if (scannerStartButton) {

      scannerStartButton.disabled =
        false;

      scannerStartButton.textContent =
        "START SCANNER";

    }

  }

}


/*
--------------------------------------------------------
STOP
--------------------------------------------------------
*/

function stopTradingScanner() {

  /*
   * İlk sürümde server tarafındaki
   * mevcut request'i öldürmüyoruz.
   * STOP sadece UI durumunu değiştiriyor.
   *
   * Gerçek cancellation'ı sonraki
   * aşamada AbortController ile ekleyeceğiz.
   */

  scannerRunning = false;

  if (scannerStatus) {
    scannerStatus.textContent =
      "IDLE";
  }

  if (tradingEngineStatus) {
    tradingEngineStatus.textContent =
      "READY";
  }

}


/*
--------------------------------------------------------
BUTTONS
--------------------------------------------------------
*/

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


if (
  document.readyState === "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    bindTradingScannerControls,
    { once: true }
  );

} else {

  bindTradingScannerControls();

}
})();
