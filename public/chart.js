/*
========================================================
BORSACI // CHART MODULE
========================================================
*/

"use strict";

let chartTimeframe = "1d";
let chartIndicator = "none";

let chartToolbar = null;


/*
========================================================
WAIT FOR APP CHART
========================================================
*/

function waitForMarketChart() {

  if (
    typeof marketChart !== "undefined" &&
    marketChart
  ) {

    createChartToolbar();

    return;

  }

  setTimeout(
    waitForMarketChart,
    300
  );

}


/*
========================================================
CREATE TOOLBAR
========================================================
*/

function createChartToolbar() {

  if (chartToolbar) return;

  const chartContainer =
    document.getElementById(
      "market_chart"
    );

  if (!chartContainer) {

    console.error(
      "CHART.JS: #market_chart bulunamadı."
    );

    return;

  }


  /*
   * Toolbar
   */

  chartToolbar =
    document.createElement(
      "div"
    );


  chartToolbar.id =
    "chartToolbar";


  chartToolbar.innerHTML = `

    <div class="chart-toolbar-section">

      <span class="chart-toolbar-label">
        TIMEFRAME
      </span>

      <button
        class="chart-tool active"
        data-range="1d"
      >
        1D
      </button>

      <button
        class="chart-tool"
        data-range="5d"
      >
        5D
      </button>

      <button
        class="chart-tool"
        data-range="1mo"
      >
        1M
      </button>

      <button
        class="chart-tool"
        data-range="3mo"
      >
        3M
      </button>

      <button
        class="chart-tool"
        data-range="6mo"
      >
        6M
      </button>

      <button
        class="chart-tool"
        data-range="1y"
      >
        1Y
      </button>

      <button
        class="chart-tool"
        data-range="5y"
      >
        5Y
      </button>

    </div>


    <div class="chart-toolbar-divider"></div>


    <div class="chart-toolbar-section">

      <span class="chart-toolbar-label">
        INDICATOR
      </span>

      <button
        class="chart-indicator active"
        data-indicator="none"
      >
        NONE
      </button>

      <button
        class="chart-indicator"
        data-indicator="sma20"
      >
        SMA 20
      </button>

      <button
        class="chart-indicator"
        data-indicator="ema20"
      >
        EMA 20
      </button>

      <button
        class="chart-indicator"
        data-indicator="ema50"
      >
        EMA 50
      </button>

      <button
        class="chart-indicator"
        data-indicator="ema200"
      >
        EMA 200
      </button>

      <button
        class="chart-indicator"
        data-indicator="bb"
      >
        BB
      </button>

    </div>

  `;


  /*
   * Chart'ın üstüne koy
   */

  chartContainer.parentElement.insertBefore(
    chartToolbar,
    chartContainer
  );


  /*
   * CSS
   */

  injectChartCSS();


  /*
   * Events
   */

  bindChartToolbar();


  console.log(
    "BORSACI: Chart toolbar initialized."
  );

}


/*
========================================================
TIMEFRAME EVENTS
========================================================
*/

function bindChartToolbar() {

  chartToolbar
    .querySelectorAll(
      ".chart-tool"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            const range =
              button.dataset.range;

            if (!range) return;


            chartTimeframe =
              range;


            chartToolbar
              .querySelectorAll(
                ".chart-tool"
              )
              .forEach(
                item => {

                  item.classList.remove(
                    "active"
                  );

                }
              );


            button.classList.add(
              "active"
            );


            reloadChart();

          }
        );

      }
    );


  /*
   * INDICATORS
   */

  chartToolbar
    .querySelectorAll(
      ".chart-indicator"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            const indicator =
              button.dataset.indicator;


            chartIndicator =
              indicator;


            chartToolbar
              .querySelectorAll(
                ".chart-indicator"
              )
              .forEach(
                item => {

                  item.classList.remove(
                    "active"
                  );

                }
              );


            button.classList.add(
              "active"
            );


            applyIndicator();

          }
        );

      }
    );

}


/*
========================================================
RELOAD CHART
========================================================
*/

async function reloadChart() {

  if (
    typeof selectedSymbol ===
    "undefined" ||
    !selectedSymbol
  ) {

    return;

  }


  const container =
    document.getElementById(
      "market_chart"
    );


  if (!container) return;


  showChartLoading();


  try {

    const url =
      `/chart?symbol=${encodeURIComponent(
        selectedSymbol
      )}&range=${encodeURIComponent(
        chartTimeframe
      )}&interval=1d`;


    console.log(
      "CHART.JS REQUEST:",
      url
    );


    const response =
      await fetch(
        url,
        {
          cache:
            "no-store"
        }
      );


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data?.error ||
        `HTTP ${response.status}`
      );

    }


    const history =
      extractChartHistoryLocal(
        data
      );


    if (
      !history ||
      history.length === 0
    ) {

      throw new Error(
        "Chart verisi boş."
      );

    }


    drawChartHistory(
      history
    );


  } catch (error) {

    console.error(
      "CHART.JS ERROR:",
      error
    );

  }

}


/*
========================================================
EXTRACT HISTORY
========================================================
*/

function extractChartHistoryLocal(
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


  const result =
    data.chart?.result?.[0];


  if (!result) return [];


  const timestamps =
    result.timestamp || [];


  const quote =
    result.indicators
      ?.quote?.[0];


  if (!quote) return [];


  const history = [];


  for (
    let i = 0;
    i < timestamps.length;
    i++
  ) {

    const close =
      Number(
        quote.close?.[i]
      );


    if (
      !Number.isFinite(
        close
      )
    ) {

      continue;

    }


    history.push({

      time:
        timestamps[i],

      open:
        Number(
          quote.open?.[i]
        ),

      high:
        Number(
          quote.high?.[i]
        ),

      low:
        Number(
          quote.low?.[i]
        ),

      close,

      volume:
        Number(
          quote.volume?.[i]
        ) || 0

    });

  }


  return history;

}


/*
========================================================
DRAW
========================================================
*/

function drawChartHistory(
  history
) {

  if (
    typeof candleSeries ===
    "undefined" ||
    !candleSeries
  ) {

    console.warn(
      "CHART.JS: candleSeries hazır değil."
    );

    return;

  }


  const candles =
    history
      .map(
        item => {

          const timestamp =
            Number(
              item.time ??
              item.timestamp
            );


          if (
            !Number.isFinite(
              timestamp
            )
          ) {

            return null;

          }


          const time =
            timestamp > 10000000000
              ? Math.floor(
                  timestamp / 1000
                )
              : timestamp;


          const close =
            Number(
              item.close ??
              item.c
            );


          if (
            !Number.isFinite(
              close
            )
          ) {

            return null;

          }


          return {

            time,

            open:
              Number(
                item.open
              ) || close,

            high:
              Number(
                item.high
              ) || close,

            low:
              Number(
                item.low
              ) || close,

            close

          };

        }
      )
      .filter(
        Boolean
      );


  candles.sort(
    (a, b) =>
      a.time -
      b.time
  );


  /*
   * Duplicate timestamps
   */

  const unique = [];


  const seen =
    new Set();


  for (
    const candle of candles
  ) {

    if (
      seen.has(
        candle.time
      )
    ) {

      continue;

    }


    seen.add(
      candle.time
    );


    unique.push(
      candle
    );

  }


  candleSeries.setData(
    unique
  );


  /*
   * Volume
   */

  if (
    typeof volumeSeries !==
      "undefined" &&
    volumeSeries
  ) {

    const volumes =
      history
        .map(
          item => {

            const timestamp =
              Number(
                item.time ??
                item.timestamp
              );


            const volume =
              Number(
                item.volume ??
                item.vol ??
                0
              );


            if (
              !Number.isFinite(
                timestamp
              ) ||
              !Number.isFinite(
                volume
              )
            ) {

              return null;

            }


            const time =
              timestamp > 10000000000
                ? Math.floor(
                    timestamp / 1000
                  )
                : timestamp;


            return {

              time,

              value:
                volume

            };

          }
        )
        .filter(
          Boolean
        );


    volumeSeries.setData(
      volumes
    );

  }


  if (
    typeof marketChart !==
      "undefined" &&
    marketChart
  ) {

    marketChart
      .timeScale()
      .fitContent();

  }


  applyIndicator();

}


/*
========================================================
INDICATOR
========================================================
*/

function applyIndicator() {

  if (
    typeof marketChart ===
      "undefined" ||
    !marketChart ||
    typeof candleSeries ===
      "undefined" ||
    !candleSeries
  ) {

    return;

  }


  /*
   * Eski indicator çizgilerini
   * kaldır.
   */

  removeIndicatorSeries();


  if (
    chartIndicator ===
    "none"
  ) {

    return;

  }


  const data =
    getCurrentCandleData();


  if (
    data.length === 0
  ) {

    return;

  }


  if (
    chartIndicator ===
    "sma20"
  ) {

    createLine(
      calculateSMA(
        data,
        20
      ),
      "SMA 20"
    );

  }


  if (
    chartIndicator ===
    "ema20"
  ) {

    createLine(
      calculateEMA(
        data,
        20
      ),
      "EMA 20"
    );

  }


  if (
    chartIndicator ===
    "ema50"
  ) {

    createLine(
      calculateEMA(
        data,
        50
      ),
      "EMA 50"
    );

  }


  if (
    chartIndicator ===
    "ema200"
  ) {

    createLine(
      calculateEMA(
        data,
        200
      ),
      "EMA 200"
    );

  }


  if (
    chartIndicator ===
    "bb"
  ) {

    createBollingerBands(
      data,
      20,
      2
    );

  }

}


/*
========================================================
CURRENT CANDLES
========================================================
*/

function getCurrentCandleData() {

  if (
    !candleSeries
  ) {

    return [];

  }


  /*
   * Lightweight Charts'tan
   * doğrudan data çekemiyoruz.
   *
   * Bu nedenle son yüklenen
   * dataset'i saklıyoruz.
   */

  return window.__borsaciChartData ||
    [];

}


/*
========================================================
STORE DATA
========================================================
*/

const originalDrawChartHistory =
  drawChartHistory;


/*
 * Wrapper
 */

drawChartHistory =
  function(history) {

    window.__borsaciChartData =
      history
        .map(
          item => {

            const timestamp =
              Number(
                item.time ??
                item.timestamp
              );


            const time =
              timestamp > 10000000000
                ? Math.floor(
                    timestamp / 1000
                  )
                : timestamp;


            return {

              time,

              open:
                Number(
                  item.open
                ),

              high:
                Number(
                  item.high
                ),

              low:
                Number(
                  item.low
                ),

              close:
                Number(
                  item.close
                )

            };

          }
        )
        .filter(
          item =>
            Number.isFinite(
              item.close
            )
        );


    originalDrawChartHistory(
      history
    );

  };


/*
========================================================
SMA
========================================================
*/

function calculateSMA(
  data,
  period
) {

  const result = [];


  for (
    let i = period - 1;
    i < data.length;
    i++
  ) {

    let sum = 0;


    for (
      let j = i - period + 1;
      j <= i;
      j++
    ) {

      sum +=
        data[j].close;

    }


    result.push({

      time:
        data[i].time,

      value:
        sum / period

    });

  }


  return result;

}


/*
========================================================
EMA
========================================================
*/

function calculateEMA(
  data,
  period
) {

  if (
    data.length <
    period
  ) {

    return [];

  }


  const result = [];


  let sum = 0;


  for (
    let i = 0;
    i < period;
    i++
  ) {

    sum +=
      data[i].close;

  }


  let ema =
    sum / period;


  result.push({

    time:
      data[period - 1].time,

    value:
      ema

  });


  const multiplier =
    2 /
    (period + 1);


  for (
    let i = period;
    i < data.length;
    i++
  ) {

    ema =
      (
        data[i].close -
        ema
      ) *
      multiplier +
      ema;


    result.push({

      time:
        data[i].time,

      value:
        ema

    });

  }


  return result;

}


/*
========================================================
LINE SERIES
========================================================
*/

let indicatorSeries = [];


function createLine(
  data,
  title
) {

  if (
    !marketChart ||
    !data.length
  ) {

    return;

  }


  const series =
    marketChart.addSeries(
      LightweightCharts
        .LineSeries,
      {

        lineWidth:
          2

      }
    );


  series.setData(
    data
  );


  indicatorSeries.push(
    series
  );

}


/*
========================================================
BOLLINGER
========================================================
*/

function createBollingerBands(
  data,
  period,
  multiplier
) {

  if (
    !marketChart
  ) {

    return;

  }


  const middle =
    calculateSMA(
      data,
      period
    );


  const upper = [];


  const lower = [];


  for (
    let i = period - 1;
    i < data.length;
    i++
  ) {

    const values =
      [];


    for (
      let j =
        i - period + 1;
      j <= i;
      j++
    ) {

      values.push(
        data[j].close
      );

    }


    const mean =
      values.reduce(
        (a, b) =>
          a + b,
        0
      ) /
      period;


    const variance =
      values.reduce(
        (sum, value) =>
          sum +
          Math.pow(
            value -
            mean,
            2
          ),
        0
      ) /
      period;


    const std =
      Math.sqrt(
        variance
      );


    upper.push({

      time:
        data[i].time,

      value:
        mean +
        multiplier *
        std

    });


    lower.push({

      time:
        data[i].time,

      value:
        mean -
        multiplier *
        std

    });

  }


  createLine(
    middle,
    "BB Middle"
  );


  createLine(
    upper,
    "BB Upper"
  );


  createLine(
    lower,
    "BB Lower"
  );

}


/*
========================================================
REMOVE INDICATORS
========================================================
*/

function removeIndicatorSeries() {

  if (
    !marketChart
  ) return;


  indicatorSeries
    .forEach(
      series => {

        try {

          marketChart.removeSeries(
            series
          );

        } catch {}

      }
    );


  indicatorSeries = [];

}


/*
========================================================
LOADING
========================================================
*/

function showChartLoading() {

  const empty =
    document.getElementById(
      "chartEmpty"
    );


  if (!empty) return;


  empty.style.display =
    "flex";


  empty.innerHTML = `

    <span>
      LOADING CHART
    </span>

    <small>
      Loading ${chartTimeframe.toUpperCase()} market data...
    </small>

  `;

}


/*
========================================================
CSS
========================================================
*/

function injectChartCSS() {

  if (
    document.getElementById(
      "borsaciChartCSS"
    )
  ) {

    return;

  }


  const style =
    document.createElement(
      "style"
    );


  style.id =
    "borsaciChartCSS";


  style.innerHTML = `

    #chartToolbar {

      width: 100%;

      min-height: 42px;

      display: flex;

      align-items: center;

      gap: 12px;

      padding: 8px 10px;

      box-sizing: border-box;

      background: #0b0f14;

      border: 1px solid #202733;

      border-bottom: 0;

      border-radius: 8px 8px 0 0;

      overflow-x: auto;

      white-space: nowrap;

      font-family:
        Inter,
        Arial,
        sans-serif;

    }


    .chart-toolbar-section {

      display: flex;

      align-items: center;

      gap: 5px;

    }


    .chart-toolbar-label {

      font-size: 10px;

      color: #6f7b8c;

      letter-spacing: 1px;

      margin-right: 4px;

      font-weight: 700;

    }


    .chart-tool,
    .chart-indicator {

      border: 1px solid #29313d;

      background: #111720;

      color: #8e99a8;

      border-radius: 5px;

      padding: 5px 9px;

      font-size: 11px;

      font-weight: 700;

      cursor: pointer;

      transition:
        background .15s ease,
        color .15s ease,
        border-color .15s ease;

    }


    .chart-tool:hover,
    .chart-indicator:hover {

      background: #18202b;

      color: #ffffff;

    }


    .chart-tool.active,
    .chart-indicator.active {

      background: #1d2937;

      color: #ffffff;

      border-color: #3b4858;

    }


    .chart-toolbar-divider {

      width: 1px;

      height: 22px;

      background: #29313d;

      flex-shrink: 0;

    }


    #market_chart {

      border-radius:
        0 0 8px 8px;

    }


    @media (
      max-width: 700px
    ) {

      #chartToolbar {

        gap: 7px;

        padding:
          7px 6px;

      }


      .chart-toolbar-label {

        font-size: 9px;

      }


      .chart-tool,
      .chart-indicator {

        padding:
          5px 7px;

        font-size: 10px;

      }

    }

  `;


  document.head.appendChild(
    style
  );

}


/*
========================================================
START
========================================================
*/

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    waitForMarketChart
  );

} else {

  waitForMarketChart();

}


console.log(
  "BORSACI: chart.js loaded."
);