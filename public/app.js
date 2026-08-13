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
  timeout = 45000
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
                question
              }
            ),

          cache:
            "no-store"
        },
        45000
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
