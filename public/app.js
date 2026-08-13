/*
========================================================
BORSACI // AI TRADING TERMINAL
APP.JS
========================================================
*/

let symbols = [];
let selectedSymbol = null;
let marketCache = {};

let marketChart = null;
let candleSeries = null;
let volumeSeries = null;


/*
========================================================
ELEMENTS
========================================================
*/

const questionInput = document.getElementById("question");
const analyzeBtn = document.getElementById("analyzeBtn");
const responseBox = document.getElementById("response");
const addSymbolBtn = document.getElementById("addSymbolBtn");
const watchlist = document.getElementById("watchlist");
const chartSymbol = document.getElementById("chartSymbol");
const chartEmpty = document.getElementById("chartEmpty");
const newsFeed = document.getElementById("newsFeed");
const dataStatus = document.getElementById("dataStatus");
const newsImpact = document.getElementById("newsImpact");
const chartContainer = document.getElementById("tradingview_chart");


/*
========================================================
CLOCK
========================================================
*/

function updateClock() {

  const clock = document.getElementById("clock");

  if (!clock) return;

  clock.innerText = new Date().toLocaleTimeString(
    "tr-TR",
    {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }
  );
}

updateClock();
setInterval(updateClock, 1000);


/*
========================================================
FORMAT
========================================================
*/

function formatNumber(value, decimals = 2) {

  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
  ) {
    return "--";
  }

  return Number(value).toLocaleString(
    "tr-TR",
    {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }
  );
}


function formatCompact(value) {

  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
  ) {
    return "--";
  }

  const number = Number(value);

  if (number >= 1_000_000_000) {
    return (number / 1_000_000_000).toFixed(2) + "B";
  }

  if (number >= 1_000_000) {
    return (number / 1_000_000).toFixed(2) + "M";
  }

  if (number >= 1_000) {
    return (number / 1_000).toFixed(2) + "K";
  }

  return formatNumber(number, 0);
}


function setText(id, value) {

  const element = document.getElementById(id);

  if (element) {
    element.innerText = value;
  }
}


function escapeHtml(value) {

  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


/*
========================================================
SYMBOL
========================================================
*/

function normalizeSymbol(symbol) {

  if (!symbol) return null;

  return String(symbol)
    .trim()
    .toUpperCase()
    .replace(/^BIST:/, "");
}


/*
========================================================
WATCHLIST
========================================================
*/

function renderWatchlist() {

  if (!watchlist) return;

  if (symbols.length === 0) {

    watchlist.innerHTML = `
      <div class="watchlist-empty">
        <div class="empty-icon">+</div>
        <span>NO SYMBOLS LOADED</span>
        <small>Add a symbol to begin.</small>
      </div>
    `;

    return;
  }

  watchlist.innerHTML = "";

  symbols.forEach((symbol, index) => {

    const cached = marketCache[symbol];

    const price =
      cached?.quote?.price ??
      cached?.price;

    const change =
      cached?.quote?.changePercent ??
      cached?.changePercent;

    const row = document.createElement("div");

    row.className = "watch-row";

    row.innerHTML = `

      <button
        class="symbol-button ${
          selectedSymbol === symbol ? "active" : ""
        }"
        data-index="${index}"
      >

        <span>
          ${escapeHtml(symbol)}
        </span>

        <span class="watch-price">

          <strong>
            ${
              price !== undefined
                ? formatNumber(price, 2)
                : "--"
            }
          </strong>

          <small class="${
            change > 0
              ? "positive"
              : change < 0
                ? "negative"
                : ""
          }">

            ${
              change !== undefined
                ? (
                    change > 0 ? "+" : ""
                  ) +
                  formatNumber(change, 2) +
                  "%"
                : "--"
            }

          </small>

        </span>

      </button>

      <button
        class="remove-symbol"
        data-index="${index}"
      >
        ×
      </button>

    `;

    watchlist.appendChild(row);
  });


  document
    .querySelectorAll(".symbol-button")
    .forEach(button => {

      button.addEventListener("click", () => {

        const index =
          Number(button.dataset.index);

        selectSymbol(symbols[index]);

      });

    });


  document
    .querySelectorAll(".remove-symbol")
    .forEach(button => {

      button.addEventListener("click", event => {

        event.stopPropagation();

        const index =
          Number(button.dataset.index);

        const removed =
          symbols[index];

        symbols.splice(index, 1);

        delete marketCache[removed];

        if (selectedSymbol === removed) {

          selectedSymbol =
            symbols[0] || null;

          if (selectedSymbol) {
            selectSymbol(selectedSymbol);
          } else {
            clearDashboard();
          }

        }

        renderWatchlist();

      });

    });

}


/*
========================================================
ADD SYMBOL
========================================================
*/

function addSymbol() {

  const input = prompt(
    "BIST sembolünü gir:\n\nÖrnek: ASELS"
  );

  if (!input) return;

  const symbol = normalizeSymbol(input);

  if (!symbol) return;

  if (!symbols.includes(symbol)) {
    symbols.push(symbol);
  }

  renderWatchlist();

  selectSymbol(symbol);
}


if (addSymbolBtn) {
  addSymbolBtn.addEventListener(
    "click",
    addSymbol
  );
}


/*
========================================================
SELECT SYMBOL
========================================================
*/

async function selectSymbol(symbol) {

  const clean =
    normalizeSymbol(symbol);

  if (!clean) return;

  selectedSymbol = clean;

  if (chartSymbol) {
    chartSymbol.innerText = clean;
  }

  if (!symbols.includes(clean)) {
    symbols.push(clean);
  }

  renderWatchlist();

  /*
   * Chart temizle.
   */
  clearChartOnly();

  /*
   * Veriyi çek.
   */
  await loadMarketData(clean);
}


/*
========================================================
LOAD MARKET DATA
========================================================
*/

async function loadMarketData(symbol) {

  const clean =
    normalizeSymbol(symbol);

  if (!clean) return;

  if (dataStatus) {
    dataStatus.innerText = "LOADING";
    dataStatus.classList.add("loading");
  }

  try {

    /*
     * CACHE
     */

    const cached =
      marketCache[clean];

    if (
      cached &&
      cached.timestamp
    ) {

      const age =
        Date.now() -
        new Date(cached.timestamp).getTime();

      if (
        Number.isFinite(age) &&
        age < 20000
      ) {

        updateDashboard(cached);

        if (dataStatus) {
          dataStatus.innerText = "LIVE";
        }

        return;
      }
    }


    /*
     * BACKEND
     */

    const response =
      await fetch(
        `/market?symbol=${encodeURIComponent(clean)}`
      );


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data?.error ||
        "Market data error"
      );

    }


    marketCache[clean] = data;

    updateDashboard(data);


    if (dataStatus) {
      dataStatus.innerText = "LIVE";
    }

  } catch (error) {

    console.error(
      "Market data error:",
      error
    );

    if (dataStatus) {
      dataStatus.innerText = "ERROR";
    }

    showDashboardError(
      error.message
    );

  } finally {

    if (dataStatus) {
      dataStatus.classList.remove("loading");
    }

  }
}


/*
========================================================
UPDATE DASHBOARD
========================================================
*/

function updateDashboard(data) {

  if (!data) return;

  const backendSymbol =
    normalizeSymbol(data.symbol);

  if (backendSymbol) {

    selectedSymbol =
      backendSymbol;

    if (chartSymbol) {
      chartSymbol.innerText =
        backendSymbol;
    }

    if (!symbols.includes(backendSymbol)) {
      symbols.push(backendSymbol);
    }

  }


  updateWatchlistData(data);

  updateTechnical(data.technical);

  updateChart(data.history);

  updateNews(data.news);

  updateNewsImpact(data.news);

  renderWatchlist();
}


/*
========================================================
WATCHLIST DATA
========================================================
*/

function updateWatchlistData(data) {

  const symbol =
    normalizeSymbol(data?.symbol) ||
    selectedSymbol;

  if (!symbol) return;

  marketCache[symbol] = data;
}


/*
========================================================
TECHNICAL
========================================================
*/

function updateTechnical(technical) {

  if (!technical) {

    [
      "rsi",
      "macd",
      "ema20",
      "ema50",
      "volume",
      "atr"
    ].forEach(id => setText(id, "--"));

    return;
  }


  setText(
    "rsi",
    formatNumber(technical.rsi)
  );

  setText(
    "macd",
    formatNumber(technical.macd)
  );

  setText(
    "ema20",
    formatNumber(technical.ema20)
  );

  setText(
    "ema50",
    formatNumber(technical.ema50)
  );

  setText(
    "atr",
    formatNumber(technical.atr)
  );


  const volume =
    marketCache[selectedSymbol]
      ?.quote
      ?.volume;

  setText(
    "volume",
    formatCompact(volume)
  );
}


/*
========================================================
CHART INIT
========================================================
*/

function initMarketChart() {

  if (!chartContainer) {

    console.error(
      "tradingview_chart container yok."
    );

    return;

  }


  if (
    typeof LightweightCharts ===
    "undefined"
  ) {

    console.error(
      "LightweightCharts yüklenmemiş."
    );

    return;

  }


  /*
   * Eski chartı kaldır.
   */

  if (marketChart) {

    try {
      marketChart.remove();
    } catch {}

    marketChart = null;
    candleSeries = null;
    volumeSeries = null;
  }


  /*
   * Container temizle.
   */

  chartContainer.innerHTML = "";


  /*
   * CHART
   */

  marketChart =
    LightweightCharts.createChart(
      chartContainer,
      {

        width:
          chartContainer.clientWidth || 600,

        height:
          chartContainer.clientHeight || 400,

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

        }

      }
    );


  /*
   * CANDLE
   */

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


  /*
   * VOLUME
   */

  volumeSeries =
    marketChart.addSeries(
      LightweightCharts.HistogramSeries,
      {

        priceFormat: {
          type: "volume"
        },

        priceScaleId:
          "volume"

      }
    );


  marketChart
    .priceScale("volume")
    .applyOptions({

      scaleMargins: {

        top: 0.80,

        bottom: 0

      }

    });


  /*
   * ResizeObserver
   */

  if (
    typeof ResizeObserver !==
    "undefined"
  ) {

    const observer =
      new ResizeObserver(() => {

        if (!marketChart) return;

        const width =
          chartContainer.clientWidth;

        const height =
          chartContainer.clientHeight;

        if (
          width > 0 &&
          height > 0
        ) {

          marketChart.applyOptions({
            width,
            height
          });

        }

      });

    observer.observe(
      chartContainer
    );

  }

}


/*
========================================================
CHART TIME
========================================================
*/

function normalizeChartTime(value) {

  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }


  /*
   * Number timestamp
   */

  if (
    typeof value === "number" ||
    /^\d+$/.test(String(value))
  ) {

    let number =
      Number(value);

    if (!Number.isFinite(number)) {
      return null;
    }

    /*
     * milliseconds
     */

    if (number > 10000000000) {
      number =
        Math.floor(number / 1000);
    }

    return number;
  }


  const stringValue =
    String(value);


  /*
   * YYYY-MM-DD
   */

  if (
    /^\d{4}-\d{2}-\d{2}$/
      .test(stringValue)
  ) {

    return stringValue;
  }


  const date =
    new Date(stringValue);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return null;
  }


  return date
    .toISOString()
    .slice(0, 10);
}


/*
========================================================
GET VALUE
========================================================
*/

function getHistoryValue(
  item,
  names
) {

  for (const name of names) {

    if (
      item &&
      item[name] !== undefined &&
      item[name] !== null
    ) {

      return item[name];

    }

  }

  return null;
}


/*
========================================================
UPDATE CHART
========================================================
*/

function updateChart(history) {

  if (
    !marketChart ||
    !candleSeries
  ) {

    console.warn(
      "Chart hazır değil."
    );

    return;
  }


  if (
    !Array.isArray(history) ||
    history.length === 0
  ) {

    showEmptyChart(
      "MARKET DATA YOK",
      "Bu hisse için grafik geçmişi bulunamadı."
    );

    return;
  }


  /*
   * OHLC oluştur.
   */

  const candles = [];


  for (const item of history) {

    const rawTime =
      getHistoryValue(
        item,
        [
          "time",
          "date",
          "timestamp",
          "datetime"
        ]
      );


    const time =
      normalizeChartTime(
        rawTime
      );


    let open =
      Number(
        getHistoryValue(
          item,
          ["open", "o"]
        )
      );


    let high =
      Number(
        getHistoryValue(
          item,
          ["high", "h"]
        )
      );


    let low =
      Number(
        getHistoryValue(
          item,
          ["low", "l"]
        )
      );


    let close =
      Number(
        getHistoryValue(
          item,
          ["close", "c", "price"]
        )
      );


    /*
     * Backend sadece close gönderiyorsa
     * yine de grafik oluştur.
     */

    if (
      !Number.isFinite(close)
    ) {

      continue;

    }


    if (!Number.isFinite(open)) {
      open = close;
    }

    if (!Number.isFinite(high)) {
      high = close;
    }

    if (!Number.isFinite(low)) {
      low = close;
    }


    if (!time) {
      continue;
    }


    candles.push({

      time,

      open,

      high,

      low,

      close

    });

  }


  /*
   * Tarihe göre sırala.
   */

  candles.sort(
    (a, b) => {

      const ta =
        typeof a.time === "number"
          ? a.time
          : Date.parse(a.time);

      const tb =
        typeof b.time === "number"
          ? b.time
          : Date.parse(b.time);

      return ta - tb;

    }
  );


  /*
   * Duplicate temizle.
   */

  const unique = [];

  const seen = new Set();


  for (const candle of candles) {

    const key =
      String(candle.time);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    unique.push(candle);

  }


  if (unique.length === 0) {

    showEmptyChart(
      "CHART DATA YOK",
      "Backend history formatı okunamadı."
    );

    return;
  }


  /*
   * CANDLE DATA
   */

  try {

    candleSeries.setData(
      unique
    );

  } catch (error) {

    console.error(
      "Candle setData hatası:",
      error
    );

    showEmptyChart(
      "CHART ERROR",
      error.message
    );

    return;
  }


  /*
   * VOLUME
   */

  if (volumeSeries) {

    const volumes = [];


    for (const item of history) {

      const rawTime =
        getHistoryValue(
          item,
          [
            "time",
            "date",
            "timestamp",
            "datetime"
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
        Number.isFinite(volume)
      ) {

        volumes.push({

          time,

          value: volume,

          color:
            "#26a69a"

        });

      }

    }


    volumes.sort(
      (a, b) => {

        const ta =
          typeof a.time === "number"
            ? a.time
            : Date.parse(a.time);

        const tb =
          typeof b.time === "number"
            ? b.time
            : Date.parse(b.time);

        return ta - tb;

      }
    );


    const uniqueVolumes = [];

    const volumeSeen = new Set();


    for (const item of volumes) {

      const key =
        String(item.time);

      if (
        volumeSeen.has(key)
      ) {
        continue;
      }

      volumeSeen.add(key);

      uniqueVolumes.push(item);

    }


    if (uniqueVolumes.length > 0) {

      try {

        volumeSeries.setData(
          uniqueVolumes
        );

      } catch (error) {

        console.warn(
          "Volume hatası:",
          error
        );

      }

    }

  }


  /*
   * Fit.
   */

  marketChart
    .timeScale()
    .fitContent();


  /*
   * Empty kapat.
   */

  if (chartEmpty) {
    chartEmpty.style.display =
      "none";
  }

}


/*
========================================================
CLEAR CHART ONLY
========================================================
*/

function clearChartOnly() {

  if (candleSeries) {

    try {
      candleSeries.setData([]);
    } catch {}

  }

  if (volumeSeries) {

    try {
      volumeSeries.setData([]);
    } catch {}

  }

}


/*
========================================================
EMPTY CHART
========================================================
*/

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


/*
========================================================
NEWS
========================================================
*/

function updateNews(news) {

  if (!newsFeed) return;


  if (
    !Array.isArray(news) ||
    news.length === 0
  ) {

    newsFeed.innerHTML = `
      <div class="empty-state">
        <span>NO NEWS DATA</span>
        <small>No recent news found.</small>
      </div>
    `;

    return;
  }


  newsFeed.innerHTML =
    news
      .slice(0, 8)
      .map(item => {

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

          <div class="news-item">

            <div class="news-date">
              ${date}
            </div>

            <div class="news-title">
              ${title}
            </div>

            <div class="news-source">
              ${source}
            </div>

          </div>

        `;

      })
      .join("");
}


/*
========================================================
NEWS IMPACT
========================================================
*/

function updateNewsImpact(news) {

  if (!newsImpact) return;


  if (
    !Array.isArray(news) ||
    news.length === 0
  ) {

    newsImpact.innerHTML = `
      <span>NO NEWS DATA</span>
      <small>News impact will appear here.</small>
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
      ${
        escapeHtml(
          latest?.title ||
          "Haber"
        )
      }
    </strong>

    <small>
      ${
        escapeHtml(
          latest?.source ||
          ""
        )
      }
    </small>

  `;
}


/*
========================================================
ERROR
========================================================
*/

function showDashboardError(message) {

  showEmptyChart(
    "MARKET DATA ERROR",
    message
  );


  if (newsFeed) {

    newsFeed.innerHTML = `

      <div class="empty-state">

        <span>
          DATA ERROR
        </span>

        <small>
          ${escapeHtml(message)}
        </small>

      </div>

    `;

  }
}


/*
========================================================
CLEAR DASHBOARD
========================================================
*/

function clearDashboard() {

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
  ].forEach(id => {
    setText(id, "--");
  });


  showEmptyChart(
    "NO MARKET DATA",
    "Select a symbol to display the chart."
  );


  if (newsFeed) {

    newsFeed.innerHTML = `
      <div class="empty-state">
        <span>NO NEWS LOADED</span>
        <small>Select a symbol.</small>
      </div>
    `;

  }


  if (newsImpact) {

    newsImpact.innerHTML = `
      <span>NO NEWS DATA</span>
      <small>News impact will appear here.</small>
    `;

  }

}


/*
========================================================
AI
========================================================
*/

async function askBorsaCI() {

  const question =
    questionInput
      ? questionInput.value.trim()
      : "";


  if (!question) {

    if (responseBox) {
      responseBox.innerText =
        "ERROR: No input.";
    }

    return;
  }


  if (analyzeBtn) {

    analyzeBtn.disabled =
      true;

    analyzeBtn.innerText =
      "ANALYZING...";

  }


  if (responseBox) {

    responseBox.innerText =
      "Connecting to BorsaCI...\n\n" +
      "Collecting MCP data...\n\n" +
      "AI analysis in progress...";

  }


  try {

    const response =
      await fetch(
        "/ask",
        {

          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            question
          })

        }
      );


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data?.error ||
        "Server error."
      );

    }


    if (responseBox) {

      responseBox.innerText =
        data?.answer ||
        "No response.";

    }


    /*
     * Sorudaki hisseyi yakala.
     */

    const matches =
      question.match(
        /\b[A-Z]{3,6}\b/g
      );


    if (
      matches &&
      matches.length
    ) {

      const ignored =
        new Set([
          "BIST",
          "MCP",
          "RSI",
          "MACD",
          "EMA",
          "ATR",
          "GUNCEL",
          "GÜNCEL",
          "ANALIZ",
          "ANALİZ",
          "FIYAT",
          "FİYAT"
        ]);


      let found = null;


      for (
        let i = matches.length - 1;
        i >= 0;
        i--
      ) {

        const candidate =
          normalizeSymbol(
            matches[i]
          );

        if (
          candidate &&
          !ignored.has(candidate)
        ) {

          found =
            candidate;

          break;

        }

      }


      if (found) {

        if (
          !symbols.includes(found)
        ) {

          symbols.push(found);

        }

        renderWatchlist();

        await selectSymbol(found);

      }

    }

  } catch (error) {

    console.error(
      "AI error:",
      error
    );


    if (responseBox) {

      responseBox.innerText =
        "ERROR\n\n" +
        error.message;

    }

  } finally {

    if (analyzeBtn) {

      analyzeBtn.disabled =
        false;

      analyzeBtn.innerText =
        "ANALYZE";

    }

  }

}


/*
========================================================
BUTTON
========================================================
*/

if (analyzeBtn) {

  analyzeBtn.addEventListener(
    "click",
    askBorsaCI
  );

}


/*
========================================================
ENTER / ESC
========================================================
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

        askBorsaCI();

      }


      if (
        event.key === "Escape"
      ) {

        questionInput.value = "";

      }

    }
  );

}


/*
========================================================
INITIALIZATION
========================================================
*/

function initializeBorsaCI() {

  console.log(
    "BORSACI initializing..."
  );


  /*
   * Chart hazırla.
   */

  initMarketChart();


  /*
   * Varsayılan sembol:
   * BIST 100
   */

  selectedSymbol =
    "XU100";


  symbols = [
    "XU100"
  ];


  if (chartSymbol) {

    chartSymbol.innerText =
      "XU100";

  }


  renderWatchlist();


  /*
   * BIST 100 verisini çek.
   */

  loadMarketData(
    "XU100"
  );


  console.log(
    "BORSACI READY"
  );

}


/*
========================================================
DOM READY
========================================================
*/

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    initializeBorsaCI
  );

} else {

  initializeBorsaCI();

}