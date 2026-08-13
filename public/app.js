function loadTradingViewChart(symbol = "XU100") {

  const container = document.getElementById("tradingview_chart");

  if (!container) return;

  container.innerHTML = "";

  const script = document.createElement("script");

  script.src =
    "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";

  script.type = "text/javascript";
  script.async = true;

  script.innerHTML = JSON.stringify({
    autosize: true,
    symbol: symbol.startsWith("BIST:")
  ? symbol
  : `BIST:${symbol}`,
    interval: "D",
    timezone: "Europe/Istanbul",
    theme: "dark",
    style: "1",
    locale: "tr",
    enable_publishing: false,
    allow_symbol_change: false,
    hide_top_toolbar: false,
    hide_legend: false,
    save_image: false,
    hide_volume: false,
    support_host: "https://www.tradingview.com"
  });

  container.appendChild(script);
}
/*
========================================================
ELEMENTS
========================================================
*/

const questionInput =
  document.getElementById("question");

const analyzeBtn =
  document.getElementById("analyzeBtn");

const responseBox =
  document.getElementById("response");

const addSymbolBtn =
  document.getElementById("addSymbolBtn");

const watchlist =
  document.getElementById("watchlist");

const chartSymbol =
  document.getElementById("chartSymbol");

const chartCanvas =
  document.getElementById("priceChart");

const chartEmpty =
  document.getElementById("chartEmpty");

const newsFeed =
  document.getElementById("newsFeed");

const dataStatus =
  document.getElementById("dataStatus");

const newsImpact =
  document.getElementById("newsImpact");


/*
========================================================
CLOCK
========================================================
*/

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
        second: "2-digit",
      }
    );
}

updateClock();

setInterval(
  updateClock,
  1000
);


/*
========================================================
WATCHLIST
========================================================
*/

let symbols = [];

let selectedSymbol = null;

let marketCache = {};


/*
========================================================
FORMAT NUMBER
========================================================
*/

function formatNumber(
  value,
  decimals = 2
) {

  if (
    value === null ||
    value === undefined ||
    Number.isNaN(Number(value))
  ) {
    return "--";
  }

  return Number(value).toLocaleString(
    "tr-TR",
    {
      minimumFractionDigits:
        decimals,

      maximumFractionDigits:
        decimals,
    }
  );
}


/*
========================================================
FORMAT BIG NUMBER
========================================================
*/

function formatCompact(value) {

  if (
    value === null ||
    value === undefined
  ) {
    return "--";
  }

  const number =
    Number(value);

  if (!Number.isFinite(number)) {
    return "--";
  }

  if (number >= 1_000_000_000) {
    return (
      (number / 1_000_000_000)
        .toFixed(2)
      + "B"
    );
  }

  if (number >= 1_000_000) {
    return (
      (number / 1_000_000)
        .toFixed(2)
      + "M"
    );
  }

  if (number >= 1_000) {
    return (
      (number / 1_000)
        .toFixed(2)
      + "K"
    );
  }

  return formatNumber(
    number,
    0
  );
}


/*
========================================================
WATCHLIST RENDER
========================================================
*/

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


  symbols.forEach(
    (symbol, index) => {

      const row =
        document.createElement(
          "div"
        );

      row.className =
        "watch-row";


      const cached =
        marketCache[symbol];

      const price =
        cached?.quote?.price;

      const change =
        cached?.quote?.changePercent;


      row.innerHTML = `

        <button
          class="symbol-button ${
            selectedSymbol === symbol
              ? "active"
              : ""
          }"
          data-index="${index}"
        >

          <span>
            ${symbol}
          </span>

          <span class="watch-price">

            <strong>
              ${
                price !== null &&
                price !== undefined
                  ? formatNumber(
                      price,
                      2
                    )
                  : "--"
              }
            </strong>

            <small
              class="${
                change > 0
                  ? "positive"
                  : change < 0
                    ? "negative"
                    : ""
              }"
            >
              ${
                change !== null &&
                change !== undefined
                  ? (
                      change > 0
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


  document
    .querySelectorAll(
      ".symbol-button"
    )
    .forEach(
      (button) => {

        button.addEventListener(
          "click",
          () => {

            const index =
              Number(
                button.dataset.index
              );

            selectSymbol(
              symbols[index]
            );

          }
        );

      }
    );


  document
    .querySelectorAll(
      ".remove-symbol"
    )
    .forEach(
      (button) => {

        button.addEventListener(
          "click",
          (event) => {

            event.stopPropagation();

            const index =
              Number(
                button.dataset.index
              );

            const removed =
              symbols[index];

            symbols.splice(
              index,
              1
            );

            delete marketCache[
              removed
            ];

            if (
              selectedSymbol ===
              removed
            ) {

              selectedSymbol =
                symbols[0] ||
                null;

              if (selectedSymbol) {
                loadMarketData(
                  selectedSymbol
                );
              } else {
                clearDashboard();
              }

            }

            renderWatchlist();

          }
        );

      }
    );
}


/*
========================================================
ADD SYMBOL
========================================================
*/

function addSymbol() {

  const symbol =
    prompt(
      "BIST sembolünü gir:\n\nÖrnek: ASELS"
    );

  if (!symbol) return;


  const clean =
    symbol
      .trim()
      .toUpperCase();


  if (!clean) return;


  if (
    symbols.includes(clean)
  ) {

    selectSymbol(
      clean
    );

    return;
  }


  symbols.push(
    clean
  );

  renderWatchlist();

  selectSymbol(
    clean
  );
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

  selectedSymbol =
    symbol;

  chartSymbol.innerText =
    symbol;

  renderWatchlist();

  await loadMarketData(
    symbol
  );
}


/*
========================================================
LOAD MARKET DATA
========================================================
*/

async function loadMarketData(symbol) {

  if (!symbol) return;


  dataStatus.innerText =
    "LOADING";


  dataStatus.classList.add(
    "loading"
  );


  try {

    /*
     * Aynı veri varsa kısa süre
     * cache kullan.
     */

    const cached =
      marketCache[symbol];

    if (
      cached &&
      cached.timestamp
    ) {

      const age =
        Date.now() -
        new Date(
          cached.timestamp
        ).getTime();

      /*
       * 20 saniye cache.
       */

      if (
        age < 20000
      ) {

        updateDashboard(
          cached
        );

        dataStatus.innerText =
          "LIVE";

        return;
      }
    }


    const response =
      await fetch(
        `/market?symbol=${encodeURIComponent(
          symbol
        )}`
      );


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data.error ||
        "Market data error"
      );

    }


    marketCache[symbol] =
      data;


    updateDashboard(
      data
    );


    dataStatus.innerText =
      "LIVE";


  } catch (error) {

    console.error(
      "Market data error:",
      error
    );


    dataStatus.innerText =
      "ERROR";


    showDashboardError(
      error.message
    );

  } finally {

    dataStatus.classList.remove(
      "loading"
    );

  }
}


/*
========================================================
UPDATE DASHBOARD
========================================================
*/

function updateDashboard(
  data
) {

  updateWatchlistData(
    data
  );

  updateTechnical(
    data.technical
  );

  updateChart(
    data.history
  );

  updateNews(
    data.news
  );

  updateNewsImpact(
    data.news
  );

  renderWatchlist();
}


/*
========================================================
WATCHLIST DATA
========================================================
*/

function updateWatchlistData(
  data
) {

  if (!data?.symbol) return;

  marketCache[
    data.symbol
  ] = data;
}


/*
========================================================
TECHNICAL
========================================================
*/

function updateTechnical(
  technical
) {

  if (!technical) return;


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


  const volume =
    marketCache[
      selectedSymbol
    ]?.quote?.volume;


  setText(
    "volume",
    formatCompact(
      volume
    )
  );


  setText(
    "atr",
    formatNumber(
      technical.atr
    )
  );
}


/*
========================================================
SET TEXT
========================================================
*/

function setText(
  id,
  value
) {

  const element =
    document.getElementById(
      id
    );

  if (!element) return;

  element.innerText =
    value;
}


/*
========================================================
CHART
========================================================
*/

function updateChart(
  history
) {

  if (!chartCanvas) return;


  if (
    !history ||
    history.length < 2
  ) {

    chartCanvas.style.display =
      "none";

    chartEmpty.style.display =
      "flex";

    return;
  }


  chartCanvas.style.display =
    "block";

  chartEmpty.style.display =
    "none";


  drawChart(
    history
  );
}


/*
========================================================
CANVAS CHART
========================================================
*/

function drawChart(
  history
) {

  const canvas =
    chartCanvas;

  const container =
    canvas.parentElement;

  const width =
    container.clientWidth;

  const height =
    container.clientHeight;


  const ratio =
    window.devicePixelRatio ||
    1;


  canvas.width =
    width * ratio;

  canvas.height =
    height * ratio;

  canvas.style.width =
    width + "px";

  canvas.style.height =
    height + "px";


  const ctx =
    canvas.getContext(
      "2d"
    );


  ctx.scale(
    ratio,
    ratio
  );


  ctx.clearRect(
    0,
    0,
    width,
    height
  );


  /*
   * Fiyatlar
   */

  const prices =
    history.map(
      item =>
        Number(
          item.close
        )
    ).filter(
      Number.isFinite
    );


  if (
    prices.length < 2
  ) {
    return;
  }


  let min =
    Math.min(
      ...prices
    );

  let max =
    Math.max(
      ...prices
    );


  const padding =
    (max - min) *
    0.08;


  min -= padding;
  max += padding;


  const left =
    45;

  const right =
    15;

  const top =
    20;

  const bottom =
    25;


  const chartWidth =
    width -
    left -
    right;

  const chartHeight =
    height -
    top -
    bottom;


  /*
   * GRID
   */

  ctx.lineWidth =
    1;


  for (
    let i = 0;
    i <= 4;
    i++
  ) {

    const y =
      top +
      (
        chartHeight *
        i /
        4
      );


    ctx.beginPath();

    ctx.moveTo(
      left,
      y
    );

    ctx.lineTo(
      width - right,
      y
    );

    ctx.strokeStyle =
      "rgba(255,255,255,0.08)";

    ctx.stroke();


    const value =
      max -
      (
        (max - min) *
        i /
        4
      );


    ctx.fillStyle =
      "rgba(255,255,255,0.55)";

    ctx.font =
      "11px monospace";

    ctx.fillText(
      value.toFixed(2),
      5,
      y + 4
    );

  }


  /*
   * PRICE LINE
   */

  ctx.beginPath();


  prices.forEach(
    (price, index) => {

      const x =
        left +
        (
          index /
          (prices.length - 1)
        ) *
        chartWidth;


      const y =
        top +
        (
          (max - price) /
          (max - min)
        ) *
        chartHeight;


      if (
        index === 0
      ) {

        ctx.moveTo(
          x,
          y
        );

      } else {

        ctx.lineTo(
          x,
          y
        );

      }

    }
  );


  ctx.strokeStyle =
    "#00ff88";

  ctx.lineWidth =
    2;

  ctx.stroke();


  /*
   * CURRENT PRICE
   */

  const lastPrice =
    prices[
      prices.length - 1
    ];


  const lastX =
    width - right;


  const lastY =
    top +
    (
      (max - lastPrice) /
      (max - min)
    ) *
    chartHeight;


  ctx.beginPath();

  ctx.arc(
    lastX,
    lastY,
    4,
    0,
    Math.PI * 2
  );

  ctx.fillStyle =
    "#00ff88";

  ctx.fill();


  /*
   * CURRENT PRICE LABEL
   */

  ctx.fillStyle =
    "#00ff88";

  ctx.font =
    "bold 12px monospace";

  ctx.fillText(
    lastPrice.toFixed(2),
    Math.max(
      5,
      lastX - 65
    ),
    lastY - 10
  );
}


/*
========================================================
NEWS
========================================================
*/

function updateNews(
  news
) {

  if (!newsFeed) return;


  if (
    !news ||
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
        item => `

          <div
            class="news-item"
            ${
              item.url
                ? `onclick="window.open('${escapeAttribute(
                    item.url
                  )}', '_blank')"`
                : ""
            }
          >

            <div class="news-date">
              ${
                item.publishedDate ||
                ""
              }
            </div>

            <div class="news-title">
              ${
                escapeHtml(
                  item.title
                )
              }
            </div>

            <div class="news-source">
              ${
                escapeHtml(
                  item.source ||
                  ""
                )
              }
            </div>

          </div>

        `
      )
      .join("");
}


/*
========================================================
NEWS IMPACT
========================================================
*/

function updateNewsImpact(
  news
) {

  if (!newsImpact) return;


  if (
    !news ||
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
      ${
        escapeHtml(
          latest.title ||
          "Haber"
        )
      }
    </strong>

    <small>
      ${
        escapeHtml(
          latest.source ||
          ""
        )
      }
    </small>

  `;
}


/*
========================================================
HTML ESCAPE
========================================================
*/

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


function escapeAttribute(
  value
) {

  return String(
    value ?? ""
  )
    .replace(
      /'/g,
      "\\'"
    );
}


/*
========================================================
DASHBOARD ERROR
========================================================
*/

function showDashboardError(
  message
) {

  chartEmpty.style.display =
    "flex";

  chartEmpty.innerHTML = `
    <span>
      MARKET DATA ERROR
    </span>

    <small>
      ${
        escapeHtml(
          message
        )
      }
    </small>
  `;


  newsFeed.innerHTML = `
    <div class="empty-state">

      <span>
        DATA ERROR
      </span>

      <small>
        ${
          escapeHtml(
            message
          )
        }
      </small>

    </div>
  `;
}


/*
========================================================
CLEAR DASHBOARD
========================================================
*/

function clearDashboard() {

  chartSymbol.innerText =
    "NO SYMBOL";

  chartCanvas.style.display =
    "none";

  chartEmpty.style.display =
    "flex";

  chartEmpty.innerHTML = `
    <span>
      NO MARKET DATA
    </span>

    <small>
      Select a symbol to display the chart.
    </small>
  `;


  [
    "rsi",
    "macd",
    "ema20",
    "ema50",
    "volume",
    "atr",
  ].forEach(
    id =>
      setText(
        id,
        "--"
      )
  );


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


/*
========================================================
AI ANALYSIS
========================================================
*/

async function askBorsaCI() {

  const question =
    questionInput.value.trim();


  if (!question) {

    responseBox.innerText =
      "ERROR: No input.";

    return;
  }


  analyzeBtn.disabled =
    true;

  analyzeBtn.innerText =
    "ANALYZING...";


  responseBox.innerText =
    "Connecting to BorsaCI...\n\n" +
    "Collecting MCP data...\n\n" +
    "AI analysis in progress...";


  try {

    const response =
      await fetch(
        "/ask",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              question,
            }),
        }
      );


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data.error ||
        "Server error."
      );
    }


    responseBox.innerText =
      data.answer ||
      "No response.";


    /*
     * Soru içinde sembol varsa
     * dashboard'u da güncelle.
     */

    const match =
      question.match(
        /\b[A-Z]{3,6}\b/i
      );


    if (match) {

      const symbol =
        match[0]
          .toUpperCase();

      if (
        !symbols.includes(
          symbol
        )
      ) {

        symbols.push(
          symbol
        );

      }

      renderWatchlist();

      await selectSymbol(
        symbol
      );
    }


  } catch (error) {

    console.error(
      error
    );


    responseBox.innerText =
      "ERROR\n\n" +
      error.message;

  } finally {

    analyzeBtn.disabled =
      false;

    analyzeBtn.innerText =
      "ANALYZE";
  }
}
/*
========================================================
ANALYZE BUTTON
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
ENTER
========================================================
*/

if (questionInput) {

  questionInput.addEventListener(
    "keydown",
    (event) => {

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
RESIZE CHART
========================================================
*/

window.addEventListener(
  "resize",
  () => {

    if (
      selectedSymbol &&
      marketCache[
        selectedSymbol
      ]
    ) {

      updateChart(
        marketCache[
          selectedSymbol
        ].history
      );

    }

  }
);


/*
========================================================
INITIAL
========================================================
*/

renderWatchlist();
/* ========================================================
   BORSACI MARKET CHART
   ======================================================== */

let marketChart = null;
let candleSeries = null;
let volumeSeries = null;

function initMarketChart() {

  const container = document.getElementById("tradingview_chart");

  if (!container) {
    console.error("Chart container bulunamadı.");
    return;
  }

  // Eski chart varsa temizle
  container.innerHTML = "";

  marketChart = LightweightCharts.createChart(container, {

    width: container.clientWidth,
    height: container.clientHeight,

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
      timeVisible: false
    }

  });


  candleSeries = marketChart.addSeries(
    LightweightCharts.CandlestickSeries,
    {

      upColor: "#26a69a",

      downColor: "#ef5350",

      borderUpColor: "#26a69a",

      borderDownColor: "#ef5350",

      wickUpColor: "#26a69a",

      wickDownColor: "#ef5350"

    }
  );


  volumeSeries = marketChart.addSeries(
    LightweightCharts.HistogramSeries,
    {

      priceFormat: {
        type: "volume"
      },

      priceScaleId: ""

    }
  );


  marketChart.priceScale("").applyOptions({

    scaleMargins: {
      top: 0.8,
      bottom: 0
    }

  });


  // TEST VERİSİ
  candleSeries.setData([

    {
      time: "2026-07-20",
      open: 170,
      high: 176,
      low: 168,
      close: 174
    },

    {
      time: "2026-07-21",
      open: 174,
      high: 179,
      low: 172,
      close: 177
    },

    {
      time: "2026-07-22",
      open: 177,
      high: 181,
      low: 175,
      close: 176
    },

    {
      time: "2026-07-23",
      open: 176,
      high: 178,
      low: 170,
      close: 172
    },

    {
      time: "2026-07-24",
      open: 172,
      high: 180,
      low: 171,
      close: 179
    },

    {
      time: "2026-07-27",
      open: 179,
      high: 183,
      low: 177,
      close: 181
    },

    {
      time: "2026-07-28",
      open: 181,
      high: 185,
      low: 179,
      close: 184
    },

    {
      time: "2026-07-29",
      open: 184,
      high: 186,
      low: 180,
      close: 182
    },

    {
      time: "2026-07-30",
      open: 182,
      high: 188,
      low: 181,
      close: 187
    },

    {
      time: "2026-07-31",
      open: 187,
      high: 190,
      low: 184,
      close: 189
    }

  ]);


  volumeSeries.setData([

    {
      time: "2026-07-20",
      value: 1200000
    },

    {
      time: "2026-07-21",
      value: 1800000
    },

    {
      time: "2026-07-22",
      value: 1500000
    },

    {
      time: "2026-07-23",
      value: 2100000
    },

    {
      time: "2026-07-24",
      value: 1900000
    },

    {
      time: "2026-07-27",
      value: 2500000
    },

    {
      time: "2026-07-28",
      value: 2200000
    },

    {
      time: "2026-07-29",
      value: 1700000
    },

    {
      time: "2026-07-30",
      value: 2800000
    },

    {
      time: "2026-07-31",
      value: 3100000
    }

  ]);


  marketChart.timeScale().fitContent();


  // Ekran boyutu değişince chart da büyüsün
  const resizeObserver =
    new ResizeObserver(() => {

      marketChart.applyOptions({

        width: container.clientWidth,

        height: container.clientHeight

      });

    });


  resizeObserver.observe(container);

}


/* Sayfa açıldığında chart oluştur */

document.addEventListener(
  "DOMContentLoaded",
  function () {

    initMarketChart();

  }
);