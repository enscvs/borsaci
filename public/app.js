/*
========================================================
BORSACI // AI TRADING TERMINAL
APP.JS
========================================================
*/

/*
========================================================
GLOBAL STATE
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

const chartContainer =
  document.getElementById(
    "tradingview_chart"
  );


/*
========================================================
CLOCK
========================================================
*/

function updateClock() {

  const clock =
    document.getElementById(
      "clock"
    );

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

updateClock();

setInterval(
  updateClock,
  1000
);


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
        decimals
    }
  );
}


/*
========================================================
FORMAT COMPACT NUMBER
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

  if (
    number >=
    1_000_000_000
  ) {

    return (
      (
        number /
        1_000_000_000
      ).toFixed(2) +
      "B"
    );

  }

  if (
    number >=
    1_000_000
  ) {

    return (
      (
        number /
        1_000_000
      ).toFixed(2) +
      "M"
    );

  }

  if (
    number >=
    1_000
  ) {

    return (
      (
        number /
        1_000
      ).toFixed(2) +
      "K"
    );

  }

  return formatNumber(
    number,
    0
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
    document.getElementById(id);

  if (!element) return;

  element.innerText =
    value;
}


/*
========================================================
HTML ESCAPE
========================================================
*/

function escapeHtml(value) {

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


function escapeAttribute(value) {

  return String(
    value ?? ""
  )
    .replace(
      /\\/g,
      "\\\\"
    )
    .replace(
      /'/g,
      "\\'"
    );
}


/*
========================================================
WATCHLIST RENDER
========================================================
*/

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

      const row =
        document.createElement(
          "div"
        );

      row.className =
        "watch-row";


      const cached =
        marketCache[
          symbol
        ];


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
            ${escapeHtml(symbol)}
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
      .toUpperCase()
      .replace(
        "BIST:",
        ""
      );


  if (!clean) return;


  if (
    symbols.includes(
      clean
    )
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
NORMALIZE SYMBOL
========================================================
*/

function normalizeSymbol(
  symbol
) {

  if (!symbol) {

    return null;

  }


  return symbol
    .toString()
    .trim()
    .toUpperCase()
    .replace(
      "BIST:",
      ""
    );

}


/*
========================================================
SELECT SYMBOL
========================================================
*/

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


  renderWatchlist();


  await loadMarketData(
    clean
  );

}


/*
========================================================
LOAD MARKET DATA
========================================================
*/

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

    /*
     * CACHE
     */

    const cached =
      marketCache[
        clean
      ];


    if (
      cached &&
      cached.timestamp
    ) {

      const age =
        Date.now() -
        new Date(
          cached.timestamp
        ).getTime();


      if (
        Number.isFinite(age) &&
        age < 20000
      ) {

        updateDashboard(
          cached
        );


        if (dataStatus) {

          dataStatus.innerText =
            "LIVE";

        }


        return;

      }

    }


    /*
     * MARKET ENDPOINT
     */

    const response =
      await fetch(
        `/market?symbol=${encodeURIComponent(
          clean
        )}`
      );


    let data;


    try {

      data =
        await response.json();

    } catch {

      throw new Error(
        "Sunucudan geçersiz JSON döndü."
      );

    }


    if (!response.ok) {

      throw new Error(
        data?.error ||
        "Market data error."
      );

    }


    if (!data) {

      throw new Error(
        "Market verisi boş."
      );

    }


    /*
     * Cache'e kaydet
     */

    marketCache[
      clean
    ] = data;


    /*
     * Dashboard
     */

    updateDashboard(
      data
    );


    if (dataStatus) {

      dataStatus.innerText =
        "LIVE";

    }

  } catch (error) {

    console.error(
      "Market data error:",
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


/*
========================================================
UPDATE DASHBOARD
========================================================
*/

function updateDashboard(
  data
) {

  if (!data) return;


  /*
   * Backend başka sembol döndürmüşse
   * onu normalize et.
   */

  const backendSymbol =
    normalizeSymbol(
      data.symbol
    );


  if (
    backendSymbol &&
    !selectedSymbol
  ) {

    selectedSymbol =
      backendSymbol;

  }


  if (
    backendSymbol &&
    chartSymbol
  ) {

    chartSymbol.innerText =
      backendSymbol;

  }


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

  if (!data) return;


  const symbol =
    normalizeSymbol(
      data.symbol
    ) ||
    selectedSymbol;


  if (!symbol) return;


  marketCache[
    symbol
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

  if (!technical) {

    [
      "rsi",
      "macd",
      "ema20",
      "ema50",
      "atr"
    ].forEach(
      (id) =>
        setText(
          id,
          "--"
        )
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
    ]?.quote?.volume;


  setText(
    "volume",
    formatCompact(
      volume
    )
  );

}


/*
========================================================
CHART INITIALIZATION
========================================================
*/

function initMarketChart() {

  const container =
    document.getElementById(
      "tradingview_chart"
    );


  if (!container) {

    console.error(
      "Chart container bulunamadı."
    );

    return;

  }


  if (
    typeof LightweightCharts ===
    "undefined"
  ) {

    console.error(
      "Lightweight Charts yüklenmedi."
    );

    return;

  }


  /*
   * Eski chart
   */

  if (marketChart) {

    try {

      marketChart.remove();

    } catch {

      // ignore

    }


    marketChart =
      null;

  }


  container.innerHTML =
    "";


  /*
   * CHART
   */

  marketChart =
    LightweightCharts.createChart(
      container,
      {

        autoSize: true,


        layout: {

          background: {

            type:
              "solid",

            color:
              "#0b0f14"

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
            true,

          secondsVisible:
            false

        }

      }
    );


  /*
   * CANDLE SERIES
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
   * VOLUME SERIES
   */

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


  /*
   * Volume scale
   */

  marketChart
    .priceScale(
      "volume"
    )
    .applyOptions({

      scaleMargins: {

        top:
          0.80,

        bottom:
          0

      }

    });


  /*
   * İLK AÇILIŞ:
   * BIST 100
   */

  selectedSymbol =
    "XU100";


  if (
    !symbols.includes(
      "XU100"
    )
  ) {

    symbols.push(
      "XU100"
    );

  }


  if (chartSymbol) {

    chartSymbol.innerText =
      "XU100";

  }


  renderWatchlist();


  /*
   * Market verisini çek.
   */

  loadMarketData(
    "XU100"
  );

}


/*
========================================================
NORMALIZE HISTORY TIME
========================================================
*/

function normalizeChartTime(
  value
) {

  if (
    value === null ||
    value === undefined
  ) {

    return null;

  }


  /*
   * Unix timestamp
   */

  if (
    typeof value ===
      "number" ||
    /^\d+$/.test(
      String(value)
    )
  ) {

    const number =
      Number(value);


    if (
      !Number.isFinite(
        number
      )
    ) {

      return null;

    }


    /*
     * Milliseconds -> seconds
     */

    if (
      number >
      10000000000
    ) {

      return Math.floor(
        number / 1000
      );

    }


    return number;

  }


  /*
   * Tarih stringi
   */

  const stringValue =
    String(value);


  /*
   * YYYY-MM-DD
   */

  if (
    /^\d{4}-\d{2}-\d{2}$/.test(
      stringValue
    )
  ) {

    return stringValue;

  }


  /*
   * ISO tarih
   */

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


  return (
    date
      .toISOString()
      .slice(
        0,
        10
      )
  );

}


/*
========================================================
GET HISTORY VALUE
========================================================
*/

function getHistoryValue(
  item,
  names
) {

  for (
    const name of names
  ) {

    if (
      item &&
      item[name] !==
        undefined &&
      item[name] !==
        null
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

function updateChart(
  history
) {

  if (
    !marketChart ||
    !candleSeries
  ) {

    console.warn(
      "Chart henüz hazır değil."
    );

    return;

  }


  if (
    !Array.isArray(
      history
    ) ||
    history.length === 0
  ) {

    console.warn(
      "History verisi yok:",
      history
    );


    if (chartEmpty) {

      chartEmpty.style.display =
        "flex";

      chartEmpty.innerHTML = `
        <span>
          NO CHART DATA
        </span>

        <small>
          Market history bulunamadı.
        </small>
      `;

    }


    return;

  }


  /*
   * Candlestick
   */

  const candles =
    history
      .map(
        (item) => {

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


          const open =
            Number(
              getHistoryValue(
                item,
                ["open", "o"]
              )
            );


          const high =
            Number(
              getHistoryValue(
                item,
                ["high", "h"]
              )
            );


          const low =
            Number(
              getHistoryValue(
                item,
                ["low", "l"]
              )
            );


          const close =
            Number(
              getHistoryValue(
                item,
                ["close", "c"]
              )
            );


          const time =
            normalizeChartTime(
              rawTime
            );


          if (
            !time ||
            !Number.isFinite(
              open
            ) ||
            !Number.isFinite(
              high
            ) ||
            !Number.isFinite(
              low
            ) ||
            !Number.isFinite(
              close
            )
          ) {

            return null;

          }


          return {

            time,

            open,

            high,

            low,

            close

          };

        }
      )
      .filter(Boolean);


  /*
   * Tarihe göre sırala.
   */

  candles.sort(
    (a, b) => {

      const ta =
        typeof a.time ===
        "number"
          ? a.time
          : new Date(
              a.time
            ).getTime();


      const tb =
        typeof b.time ===
        "number"
          ? b.time
          : new Date(
              b.time
            ).getTime();


      return ta - tb;

    }
  );


  /*
   * Duplicate zamanları temizle.
   */

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
      seen.has(
        key
      )
    ) {

      continue;

    }


    seen.add(
      key
    );


    uniqueCandles.push(
      candle
    );

  }


  if (
    uniqueCandles.length < 2
  ) {

    console.warn(
      "Yeterli candle verisi yok:",
      uniqueCandles
    );


    return;

  }


  /*
   * CHART'A VER
   */

  try {

    candleSeries.setData(
      uniqueCandles
    );

  } catch (error) {

    console.error(
      "Candle chart hatası:",
      error,
      uniqueCandles
    );

    return;

  }


  /*
   * VOLUME
   */

  if (volumeSeries) {

    const volumes =
      history
        .map(
          (item) => {

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


            const time =
              normalizeChartTime(
                rawTime
              );


            if (
              !time ||
              !Number.isFinite(
                volume
              )
            ) {

              return null;

            }


            return {

              time,

              value:
                volume

            };

          }
        )
        .filter(Boolean);


    volumes.sort(
      (a, b) => {

        const ta =
          typeof a.time ===
          "number"
            ? a.time
            : new Date(
                a.time
              ).getTime();


        const tb =
          typeof b.time ===
          "number"
            ? b.time
            : new Date(
                b.time
              ).getTime();


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

        console.error(
          "Volume chart hatası:",
          error
        );

      }

    }

  }


  /*
   * Görünümü ayarla.
   */

  try {

    marketChart
      .timeScale()
      .fitContent();

  } catch (error) {

    console.warn(
      "Chart fit hatası:",
      error
    );

  }


  /*
   * Eski canvas artık kullanılmıyor.
   */

  if (chartCanvas) {

    chartCanvas.style.display =
      "none";

  }


  if (chartEmpty) {

    chartEmpty.style.display =
      "none";

  }

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
    !Array.isArray(
      news
    ) ||
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
        (item) => {

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


          const url =
            item?.url
              ? escapeAttribute(
                  item.url
                )
              : "";


          return `

            <div
              class="news-item"
              ${
                url
                  ? `onclick="window.open('${url}', '_blank')"`
                  : ""
              }
            >

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

        }
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
    !Array.isArray(
      news
    ) ||
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
DASHBOARD ERROR
========================================================
*/

function showDashboardError(
  message
) {

  if (chartEmpty) {

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

  }


  if (newsFeed) {

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


  if (candleSeries) {

    try {

      candleSeries.setData(
        []
      );

    } catch {

      // ignore

    }

  }


  if (volumeSeries) {

    try {

      volumeSeries.setData(
        []
      );

    } catch {

      // ignore

    }

  }


  if (chartCanvas) {

    chartCanvas.style.display =
      "none";

  }


  if (chartEmpty) {

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

  }


  [
    "rsi",
    "macd",
    "ema20",
    "ema50",
    "volume",
    "atr"
  ].forEach(
    (id) =>
      setText(
        id,
        "--"
      )
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
        News impact will appear here.
      </small>

    `;

  }

}


/*
========================================================
AI ANALYSIS
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

          method:
            "POST",

          headers: {

            "Content-Type":
              "application/json"

          },

          body:
            JSON.stringify(
              {
                question
              }
            )

        }
      );


    let data;


    try {

      data =
        await response.json();

    } catch {

      throw new Error(
        "Sunucudan geçersiz cevap geldi."
      );

    }


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
     * Sorunun içinde BIST sembolü
     * yakalamaya çalış.
     */

    const match =
      question.match(
        /\b[A-Z]{3,6}\b/g
      );


    if (
      match &&
      match.length > 0
    ) {

      /*
       * Son sembolü kullan.
       */

      const symbol =
        normalizeSymbol(
          match[
            match.length - 1
          ]
        );


      /*
       * Bazı genel kelimeleri
       * sembol olarak kabul etme.
       */

      const ignoredSymbols =
        new Set(
          [
            "IÇIN",
            "ICIN",
            "GÜNCEL",
            "GUNCEL",
            "ANALİZ",
            "ANALIZ",
            "FİYAT",
            "FIYAT",
            "RSI",
            "MACD",
            "MCP",
            "BIST"
          ]
        );


      if (
        symbol &&
        !ignoredSymbols.has(
          symbol
        )
      ) {

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

      /*
       * Enter = analyze
       */

      if (
        event.key === "Enter" &&
        !event.shiftKey
      ) {

        event.preventDefault();

        askBorsaCI();

      }


      /*
       * Shift + Enter
       * = yeni satır
       */

      /*
       * Escape = temizle
       */

      if (
        event.key === "Escape"
      ) {

        questionInput.value =
          "";

      }

    }
  );

}


/*
========================================================
RESIZE
========================================================
*/

window.addEventListener(
  "resize",
  () => {

    if (
      marketChart
    ) {

      /*
       * autoSize aktif olduğu için
       * normalde gerekmez.
       * Ancak bazı mobil browserlarda
       * manuel resize yardımcı olur.
       */

      const container =
        document.getElementById(
          "tradingview_chart"
        );


      if (
        container &&
        container.clientWidth > 0 &&
        container.clientHeight > 0
      ) {

        try {

          marketChart.applyOptions(
            {

              width:
                container.clientWidth,

              height:
                container.clientHeight

            }
          );

        } catch {

          // ignore

        }

      }

    }

  }
);


/*
========================================================
INITIALIZATION
========================================================
*/

document.addEventListener(
  "DOMContentLoaded",
  () => {

    renderWatchlist();

    initMarketChart();

  }
);