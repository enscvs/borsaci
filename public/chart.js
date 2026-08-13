/*
========================================================
BORSACI // ADVANCED CHART
chart.js

IMPORTANT:
- app.js'e dokunmaz.
- Mevcut chart'ı devralır.
- Zaman dilimi
- Interval
- EMA
- SMA
- Bollinger Bands
- RSI
- MACD
- Basit çizim araçları
========================================================
*/

"use strict";

(() => {

  /*
  ========================================================
  STATE
  ========================================================
  */

  let chart = null;

  let candleSeries = null;

  let volumeSeries = null;

  let indicatorSeries = {};

  let currentSymbol = null;

  let currentRange = "1y";

  let currentInterval = "1d";

  let chartData = [];

  let activeDrawing = null;

  let drawingMode = null;

  let drawings = [];

  let canvas = null;

  let canvasCtx = null;

  let resizeObserver = null;

  let loading = false;


  /*
  ========================================================
  ELEMENT
  ========================================================
  */

  const container =
    document.getElementById(
      "market_chart"
    );

  const symbolElement =
    document.getElementById(
      "chartSymbol"
    );


  if (!container) {

    console.warn(
      "BORSACI CHART.JS: #market_chart bulunamadı."
    );

    return;

  }


  /*
  ========================================================
  HELPERS
  ========================================================
  */

  function normalizeSymbol(symbol) {

    if (!symbol) return null;

    return String(symbol)
      .trim()
      .toUpperCase()
      .replace(/^BIST:/, "")
      .replace(/\.IS$/, "");

  }


  function escapeHtml(value) {

    return String(
      value ?? ""
    )
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  }


  /*
  ========================================================
  UI
  ========================================================
  */

  function createChartUI() {

    const parent =
      container.parentElement;

    if (!parent) return;


    /*
     * Daha önce oluşturulduysa tekrar oluşturma.
     */

    if (
      document.getElementById(
        "borsaciChartControls"
      )
    ) {

      return;

    }


    const controls =
      document.createElement(
        "div"
      );


    controls.id =
      "borsaciChartControls";


    controls.innerHTML = `

      <div class="bc-toolbar">

        <div class="bc-toolbar-group">

          <span class="bc-label">
            RANGE
          </span>

          <button data-range="1d">
            1D
          </button>

          <button data-range="5d">
            5D
          </button>

          <button data-range="1mo">
            1M
          </button>

          <button data-range="3mo">
            3M
          </button>

          <button data-range="6mo">
            6M
          </button>

          <button
            data-range="ytd"
          >
            YTD
          </button>

          <button
            data-range="1y"
            class="active"
          >
            1Y
          </button>

          <button data-range="5y">
            5Y
          </button>

          <button data-range="max">
            MAX
          </button>

        </div>


        <div class="bc-toolbar-group">

          <span class="bc-label">
            INTERVAL
          </span>

          <button
            data-interval="5m"
          >
            5m
          </button>

          <button
            data-interval="15m"
          >
            15m
          </button>

          <button
            data-interval="30m"
          >
            30m
          </button>

          <button
            data-interval="1h"
          >
            1H
          </button>

          <button
            data-interval="1d"
            class="active"
          >
            1D
          </button>

          <button
            data-interval="1wk"
          >
            1W
          </button>

          <button
            data-interval="1mo"
          >
            1MO
          </button>

        </div>


        <div class="bc-toolbar-group">

          <span class="bc-label">
            INDICATORS
          </span>

          <button
            data-indicator="ema20"
          >
            EMA20
          </button>

          <button
            data-indicator="ema50"
          >
            EMA50
          </button>

          <button
            data-indicator="ema200"
          >
            EMA200
          </button>

          <button
            data-indicator="sma20"
          >
            SMA20
          </button>

          <button
            data-indicator="sma50"
          >
            SMA50
          </button>

          <button
            data-indicator="bb"
          >
            BB
          </button>

          <button
            data-indicator="rsi"
          >
            RSI
          </button>

          <button
            data-indicator="macd"
          >
            MACD
          </button>

        </div>


        <div class="bc-toolbar-group">

          <span class="bc-label">
            DRAW
          </span>

          <button
            data-draw="trend"
          >
            TREND
          </button>

          <button
            data-draw="horizontal"
          >
            H-LINE
          </button>

          <button
            data-draw="vertical"
          >
            V-LINE
          </button>

          <button
            data-draw="clear"
          >
            CLEAR
          </button>

        </div>

      </div>

      <div
        id="borsaciChartStatus"
        class="bc-chart-status"
      >
        READY
      </div>

    `;


    parent.insertBefore(
      controls,
      container
    );


    /*
     * CSS
     */

    injectCSS();


    /*
     * RANGE
     */

    controls
      .querySelectorAll(
        "[data-range]"
      )
      .forEach(
        button => {

          button.addEventListener(
            "click",
            () => {

              currentRange =
                button.dataset.range;

              setActiveButton(
                "[data-range]",
                button
              );

              loadChart();

            }
          );

        }
      );


    /*
     * INTERVAL
     */

    controls
      .querySelectorAll(
        "[data-interval]"
      )
      .forEach(
        button => {

          button.addEventListener(
            "click",
            () => {

              currentInterval =
                button.dataset.interval;

              setActiveButton(
                "[data-interval]",
                button
              );

              loadChart();

            }
          );

        }
      );


    /*
     * INDICATORS
     */

    controls
      .querySelectorAll(
        "[data-indicator]"
      )
      .forEach(
        button => {

          button.addEventListener(
            "click",
            () => {

              toggleIndicator(
                button.dataset.indicator,
                button
              );

            }
          );

        }
      );


    /*
     * DRAWING
     */

    controls
      .querySelectorAll(
        "[data-draw]"
      )
      .forEach(
        button => {

          button.addEventListener(
            "click",
            () => {

              const type =
                button.dataset.draw;

              if (
                type === "clear"
              ) {

                clearDrawings();

                return;

              }

              activateDrawing(
                type,
                button
              );

            }
          );

        }
      );

  }


  function setActiveButton(
    selector,
    selected
  ) {

    document
      .querySelectorAll(
        `#borsaciChartControls ${selector}`
      )
      .forEach(
        button => {

          button.classList.remove(
            "active"
          );

        }
      );


    selected.classList.add(
      "active"
    );

  }


  /*
  ========================================================
  CSS
  ========================================================
  */

  function injectCSS() {

    if (
      document.getElementById(
        "borsaciChartJSStyle"
      )
    ) {

      return;

    }


    const style =
      document.createElement(
        "style"
      );


    style.id =
      "borsaciChartJSStyle";


    style.textContent = `

      #borsaciChartControls {
        width: 100%;
        margin-bottom: 8px;
      }

      .bc-toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
        align-items: center;
        padding: 8px;
        background: #0b0f14;
        border: 1px solid #1d2630;
        border-radius: 8px;
      }

      .bc-toolbar-group {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-wrap: wrap;
      }

      .bc-label {
        color: #697586;
        font-size: 9px;
        font-weight: 700;
        letter-spacing: .08em;
        margin-right: 3px;
      }

      .bc-toolbar button {
        appearance: none;
        border: 1px solid #252e39;
        background: #10161d;
        color: #8d99a8;
        border-radius: 4px;
        padding: 5px 8px;
        font-size: 10px;
        font-weight: 700;
        cursor: pointer;
        transition: .15s ease;
      }

      .bc-toolbar button:hover {
        border-color: #465260;
        color: #d7dde5;
      }

      .bc-toolbar button.active {
        background: #1b2632;
        color: #ffffff;
        border-color: #617080;
      }

      .bc-chart-status {
        font-size: 9px;
        color: #647181;
        padding: 4px 2px;
        min-height: 13px;
      }

      @media (max-width: 700px) {

        .bc-toolbar {
          gap: 5px;
        }

        .bc-toolbar-group {
          width: 100%;
        }

        .bc-toolbar button {
          padding: 6px 8px;
        }

        .bc-label {
          min-width: 48px;
        }

      }

    `;


    document.head.appendChild(
      style
    );

  }


  /*
  ========================================================
  STATUS
  ========================================================
  */

  function setStatus(text) {

    const element =
      document.getElementById(
        "borsaciChartStatus"
      );

    if (!element) return;

    element.innerText =
      text;

  }


  /*
  ========================================================
  DESTROY OLD CHART
  ========================================================
  */

  function destroyChart() {

    if (
      resizeObserver
    ) {

      try {
        resizeObserver.disconnect();
      } catch {}

      resizeObserver =
        null;

    }


    if (chart) {

      try {
        chart.remove();
      } catch {}

    }


    chart =
      null;

    candleSeries =
      null;

    volumeSeries =
      null;

    indicatorSeries =
      {};

  }


  /*
  ========================================================
  INIT CHART
  ========================================================
  */

  function initChart() {

    if (
      typeof LightweightCharts ===
      "undefined"
    ) {

      console.error(
        "BORSACI CHART.JS: LightweightCharts yok."
      );

      return false;

    }


    destroyChart();


    /*
     * Eski app.js chart DOM'unu
     * tamamen temizliyoruz.
     */

    container.innerHTML =
      "";


    const width =
      Math.max(
        container.clientWidth,
        300
      );


    const height =
      Math.max(
        container.clientHeight,
        420
      );


    chart =
      LightweightCharts.createChart(
        container,
        {

          width,

          height,

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
      chart.addSeries(
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
      chart.addSeries(
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


    chart
      .priceScale(
        "volume"
      )
      .applyOptions({

        scaleMargins: {

          top:
            0.82,

          bottom:
            0

        }

      });


    /*
     * Resize
     */

    if (
      typeof ResizeObserver !==
      "undefined"
    ) {

      resizeObserver =
        new ResizeObserver(
          entries => {

            const entry =
              entries[0];

            if (
              !entry ||
              !chart
            ) return;

            const rect =
              entry.contentRect;

            if (
              rect.width <= 0 ||
              rect.height <= 0
            ) {

              return;

            }

            try {

              chart.applyOptions({

                width:
                  Math.floor(
                    rect.width
                  ),

                height:
                  Math.floor(
                    rect.height
                  )

              });

              redrawCanvas();

            } catch {}

          }
        );


      resizeObserver.observe(
        container
      );

    }


    /*
     * Canvas drawing layer
     */

    createDrawingCanvas();


    return true;

  }


  /*
  ========================================================
  LOAD CHART
  ========================================================
  */

  async function loadChart() {

    if (loading) return;

    if (!currentSymbol) {

      currentSymbol =
        normalizeSymbol(
          symbolElement?.innerText
        );

    }


    if (!currentSymbol) {

      setStatus(
        "NO SYMBOL"
      );

      return;

    }


    loading =
      true;


    setStatus(
      `LOADING ${currentSymbol} • ${currentRange} • ${currentInterval}`
    );


    try {

      const url =
        `/chart?symbol=${encodeURIComponent(
          currentSymbol
        )}&range=${encodeURIComponent(
          currentRange
        )}&interval=${encodeURIComponent(
          currentInterval
        )}`;


      console.log(
        "BORSACI ADVANCED CHART →",
        url
      );


      const response =
        await fetch(
          url,
          {

            method:
              "GET",

            headers: {

              "Accept":
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
          `Chart JSON değil. HTTP ${response.status}`
        );

      }


      if (!response.ok) {

        throw new Error(
          data?.error ||
          `Chart HTTP ${response.status}`
        );

      }


      const history =
        extractHistory(
          data
        );


      if (
        history.length === 0
      ) {

        throw new Error(
          "Bu zaman dilimi için veri bulunamadı."
        );

      }


      chartData =
        normalizeHistory(
          history
        );


      drawChartData();


      setStatus(
        `${currentSymbol} • ${chartData.length} CANDLES • ${currentRange.toUpperCase()} • ${currentInterval}`
      );


    } catch (error) {

      console.error(
        "BORSACI ADVANCED CHART ERROR:",
        error
      );


      setStatus(
        `ERROR: ${error.message}`
      );


    } finally {

      loading =
        false;

    }

  }


  /*
  ========================================================
  EXTRACT HISTORY
  ========================================================
  */

  function extractHistory(data) {

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


    if (!result) {

      return [];

    }


    const timestamps =
      result.timestamp || [];


    const quote =
      result.indicators
        ?.quote?.[0];


    if (!quote) {

      return [];

    }


    const history =
      [];


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
  TIME
  ========================================================
  */

  function normalizeTime(value) {

    if (
      typeof value === "number"
    ) {

      if (
        value > 10000000000
      ) {

        return Math.floor(
          value / 1000
        );

      }

      return Math.floor(
        value
      );

    }


    const date =
      new Date(
        value
      );


    if (
      Number.isNaN(
        date.getTime()
      )
    ) {

      return null;

    }


    return Math.floor(
      date.getTime() / 1000
    );

  }


  /*
  ========================================================
  NORMALIZE HISTORY
  ========================================================
  */

  function normalizeHistory(
    history
  ) {

    const result =
      [];


    for (
      const item of history
    ) {

      const time =
        normalizeTime(
          item.time ??
          item.timestamp ??
          item.date ??
          item.datetime
        );


      const close =
        Number(
          item.close ??
          item.c
        );


      if (
        !time ||
        !Number.isFinite(close)
      ) {

        continue;

      }


      let open =
        Number(
          item.open ??
          item.o
        );


      let high =
        Number(
          item.high ??
          item.h
        );


      let low =
        Number(
          item.low ??
          item.l
        );


      if (
        !Number.isFinite(open)
      ) {

        open =
          close;

      }


      if (
        !Number.isFinite(high)
      ) {

        high =
          Math.max(
            open,
            close
          );

      }


      if (
        !Number.isFinite(low)
      ) {

        low =
          Math.min(
            open,
            close
          );

      }


      result.push({

        time,

        open,

        high:
          Math.max(
            high,
            open,
            close
          ),

        low:
          Math.min(
            low,
            open,
            close
          ),

        close,

        volume:
          Number(
            item.volume ??
            item.vol ??
            item.v
          ) || 0

      });

    }


    result.sort(
      (
        a,
        b
      ) =>
        a.time -
        b.time
    );


    /*
     * duplicate timestamp
     */

    const unique =
      [];

    const seen =
      new Set();


    for (
      const item of result
    ) {

      if (
        seen.has(
          item.time
        )
      ) {

        continue;

      }


      seen.add(
        item.time
      );

      unique.push(
        item
      );

    }


    return unique;

  }


  /*
  ========================================================
  DRAW CHART
  ========================================================
  */

  function drawChartData() {

    if (
      !chart ||
      !candleSeries
    ) {

      return;

    }


    candleSeries.setData(
      chartData.map(
        item => ({

          time:
            item.time,

          open:
            item.open,

          high:
            item.high,

          low:
            item.low,

          close:
            item.close

        })
      )
    );


    volumeSeries.setData(
      chartData.map(
        item => ({

          time:
            item.time,

          value:
            item.volume,

          color:
            item.close >= item.open
              ? "rgba(38,166,154,0.35)"
              : "rgba(239,83,80,0.35)"

        })
      )
    );


    rebuildIndicators();


    chart
      .timeScale()
      .fitContent();


    redrawCanvas();

  }


  /*
  ========================================================
  INDICATORS
  ========================================================
  */

  function sma(
    values,
    period
  ) {

    const result =
      new Array(
        values.length
      ).fill(
        null
      );


    let sum =
      0;


    for (
      let i = 0;
      i < values.length;
      i++
    ) {

      sum +=
        values[i];


      if (
        i >= period
      ) {

        sum -=
          values[
            i - period
          ];

      }


      if (
        i >= period - 1
      ) {

        result[i] =
          sum /
          period;

      }

    }


    return result;

  }


  function ema(
    values,
    period
  ) {

    const result =
      new Array(
        values.length
      ).fill(
        null
      );


    if (
      values.length <
      period
    ) {

      return result;

    }


    let sum =
      0;


    for (
      let i = 0;
      i < period;
      i++
    ) {

      sum +=
        values[i];

    }


    let previous =
      sum /
      period;


    result[
      period - 1
    ] =
      previous;


    const multiplier =
      2 /
      (period + 1);


    for (
      let i = period;
      i < values.length;
      i++
    ) {

      previous =
        (
          values[i] -
          previous
        ) *
          multiplier +
        previous;


      result[i] =
        previous;

    }


    return result;

  }


  function standardDeviation(
    values,
    period,
    index
  ) {

    if (
      index <
      period - 1
    ) {

      return null;

    }


    let sum =
      0;


    for (
      let i =
        index - period + 1;
      i <= index;
      i++
    ) {

      sum +=
        values[i];

    }


    const mean =
      sum /
      period;


    let variance =
      0;


    for (
      let i =
        index - period + 1;
      i <= index;
      i++
    ) {

      variance +=
        Math.pow(
          values[i] -
          mean,
          2
        );

    }


    return Math.sqrt(
      variance /
      period
    );

  }


  /*
  ========================================================
  INDICATOR TOGGLE
  ========================================================
  */

  function toggleIndicator(
    name,
    button
  ) {

    if (
      indicatorSeries[name]
    ) {

      removeIndicator(
        name
      );

      button.classList.remove(
        "active"
      );

      return;

    }


    addIndicator(
      name
    );

    button.classList.add(
      "active"
    );

  }


  function addIndicator(
    name
  ) {

    if (
      !chart ||
      chartData.length === 0
    ) {

      return;

    }


    const closes =
      chartData.map(
        x => x.close
      );


    /*
     * EMA
     */

    if (
      name === "ema20" ||
      name === "ema50" ||
      name === "ema200"
    ) {

      const period =
        Number(
          name.replace(
            "ema",
            ""
          )
        );


      const values =
        ema(
          closes,
          period
        );


      const series =
        chart.addSeries(
          LightweightCharts.LineSeries,
          {

            lineWidth:
              2,

            priceLineVisible:
              false,

            lastValueVisible:
              false

          }
        );


      series.setData(
        buildIndicatorData(
          values
        )
      );


      indicatorSeries[name] =
        series;


      return;

    }


    /*
     * SMA
     */

    if (
      name === "sma20" ||
      name === "sma50"
    ) {

      const period =
        Number(
          name.replace(
            "sma",
            ""
          )
        );


      const values =
        sma(
          closes,
          period
        );


      const series =
        chart.addSeries(
          LightweightCharts.LineSeries,
          {

            lineWidth:
              2,

            priceLineVisible:
              false,

            lastValueVisible:
              false

          }
        );


      series.setData(
        buildIndicatorData(
          values
        )
      );


      indicatorSeries[name] =
        series;


      return;

    }


    /*
     * Bollinger
     */

    if (
      name === "bb"
    ) {

      const middle =
        sma(
          closes,
          20
        );


      const upper =
        [];

      const lower =
        [];


      for (
        let i = 0;
        i < closes.length;
        i++
      ) {

        const sd =
          standardDeviation(
            closes,
            20,
            i
          );


        if (
          sd === null ||
          middle[i] === null
        ) {

          upper.push(
            null
          );

          lower.push(
            null
          );

        } else {

          upper.push(
            middle[i] +
            2 * sd
          );

          lower.push(
            middle[i] -
            2 * sd
          );

        }

      }


      const middleSeries =
        chart.addSeries(
          LightweightCharts.LineSeries,
          {

            lineWidth:
              1,

            priceLineVisible:
              false,

            lastValueVisible:
              false

          }
        );


      const upperSeries =
        chart.addSeries(
          LightweightCharts.LineSeries,
          {

            lineWidth:
              1,

            priceLineVisible:
              false,

            lastValueVisible:
              false

          }
        );


      const lowerSeries =
        chart.addSeries(
          LightweightCharts.LineSeries,
          {

            lineWidth:
              1,

            priceLineVisible:
              false,

            lastValueVisible:
              false

          }
        );


      middleSeries.setData(
        buildIndicatorData(
          middle
        )
      );


      upperSeries.setData(
        buildIndicatorData(
          upper
        )
      );


      lowerSeries.setData(
        buildIndicatorData(
          lower
        )
      );


      indicatorSeries.bb = [

        middleSeries,

        upperSeries,

        lowerSeries

      ];


      return;

    }


    /*
     * RSI
     *
     * Ayrı panel yerine
     * şimdilik ayrı fiyat ölçeği.
     */

    if (
      name === "rsi"
    ) {

      const values =
        calculateRSI(
          closes,
          14
        );


      const series =
        chart.addSeries(
          LightweightCharts.LineSeries,
          {

            priceScaleId:
              "rsi",

            lineWidth:
              2,

            priceLineVisible:
              false,

            lastValueVisible:
              false

          }
        );


      series.setData(
        buildIndicatorData(
          values
        )
      );


      chart
        .priceScale(
          "rsi"
        )
        .applyOptions({

          scaleMargins: {

            top:
              0.65,

            bottom:
              0.05

          },

          borderVisible:
            false

        });


      indicatorSeries.rsi =
        series;


      return;

    }


    /*
     * MACD
     */

    if (
      name === "macd"
    ) {

      const fast =
        ema(
          closes,
          12
        );


      const slow =
        ema(
          closes,
          26
        );


      const macd =
        closes.map(
          (
            _,
            i
          ) => {

            if (
              fast[i] === null ||
              slow[i] === null
            ) {

              return null;

            }

            return (
              fast[i] -
              slow[i]
            );

          }
        );


      const signal =
        ema(
          macd.map(
            x =>
              x === null
                ? 0
                : x
          ),
          9
        );


      const macdSeries =
        chart.addSeries(
          LightweightCharts.LineSeries,
          {

            priceScaleId:
              "macd",

            lineWidth:
              2,

            priceLineVisible:
              false,

            lastValueVisible:
              false

          }
        );


      const signalSeries =
        chart.addSeries(
          LightweightCharts.LineSeries,
          {

            priceScaleId:
              "macd",

            lineWidth:
              1,

            priceLineVisible:
              false,

            lastValueVisible:
              false

          }
        );


      macdSeries.setData(
        buildIndicatorData(
          macd
        )
      );


      signalSeries.setData(
        buildIndicatorData(
          signal
        )
      );


      chart
        .priceScale(
          "macd"
        )
        .applyOptions({

          scaleMargins: {

            top:
              0.70,

            bottom:
              0.05

          },

          borderVisible:
            false

        });


      indicatorSeries.macd = [

        macdSeries,

        signalSeries

      ];

    }

  }


  function removeIndicator(
    name
  ) {

    const series =
      indicatorSeries[name];


    if (!series) return;


    if (
      Array.isArray(
        series
      )
    ) {

      series.forEach(
        item => {

          try {

            chart.removeSeries(
              item
            );

          } catch {}

        }
      );

    } else {

      try {

        chart.removeSeries(
          series
        );

      } catch {}

    }


    delete indicatorSeries[
      name
    ];

  }


  function rebuildIndicators() {

    const active =
      Object.keys(
        indicatorSeries
      );


    active.forEach(
      name => {

        removeIndicator(
          name
        );

      }
    );


    /*
     * Butonların active
     * durumlarını koruyoruz.
     */

    document
      .querySelectorAll(
        "#borsaciChartControls [data-indicator].active"
      )
      .forEach(
        button => {

          addIndicator(
            button.dataset.indicator
          );

        }
      );

  }


  function buildIndicatorData(
    values
  ) {

    const result =
      [];


    for (
      let i = 0;
      i < values.length;
      i++
    ) {

      if (
        values[i] === null ||
        !Number.isFinite(
          Number(
            values[i]
          )
        )
      ) {

        continue;

      }


      result.push({

        time:
          chartData[i].time,

        value:
          Number(
            values[i]
          )

      });

    }


    return result;

  }


  function calculateRSI(
    values,
    period
  ) {

    const result =
      new Array(
        values.length
      ).fill(
        null
      );


    if (
      values.length <=
      period
    ) {

      return result;

    }


    let gains =
      0;

    let losses =
      0;


    for (
      let i = 1;
      i <= period;
      i++
    ) {

      const change =
        values[i] -
        values[i - 1];


      if (
        change >= 0
      ) {

        gains +=
          change;

      } else {

        losses -=
          change;

      }

    }


    let avgGain =
      gains /
      period;


    let avgLoss =
      losses /
      period;


    result[
      period
    ] =
      avgLoss === 0
        ? 100
        : 100 -
          (
            100 /
            (
              1 +
              avgGain /
              avgLoss
            )
          );


    for (
      let i =
        period + 1;
      i < values.length;
      i++
    ) {

      const change =
        values[i] -
        values[i - 1];


      const gain =
        Math.max(
          change,
          0
        );


      const loss =
        Math.max(
          -change,
          0
        );


      avgGain =
        (
          avgGain *
            (period - 1) +
          gain
        ) /
        period;


      avgLoss =
        (
          avgLoss *
            (period - 1) +
          loss
        ) /
        period;


      if (
        avgLoss === 0
      ) {

        result[i] =
          100;

      } else {

        const rs =
          avgGain /
          avgLoss;


        result[i] =
          100 -
          100 /
            (1 + rs);

      }

    }


    return result;

  }


  /*
  ========================================================
  DRAWING CANVAS
  ========================================================
  */

  function createDrawingCanvas() {

    canvas =
      document.createElement(
        "canvas"
      );


    canvas.style.position =
      "absolute";

    canvas.style.left =
      "0";

    canvas.style.top =
      "0";

    canvas.style.width =
      "100%";

    canvas.style.height =
      "100%";

    canvas.style.pointerEvents =
      "none";

    canvas.style.zIndex =
      "20";


    /*
     * container relative
     */

    if (
      getComputedStyle(
        container
      ).position ===
      "static"
    ) {

      container.style.position =
        "relative";

    }


    container.appendChild(
      canvas
    );


    canvasCtx =
      canvas.getContext(
        "2d"
      );


    resizeCanvas();


    canvas.addEventListener(
      "click",
      handleCanvasClick
    );


    canvas.addEventListener(
      "pointerdown",
      handlePointerDown
    );


    canvas.addEventListener(
      "pointermove",
      handlePointerMove
    );


    canvas.addEventListener(
      "pointerup",
      handlePointerUp
    );

  }


  function resizeCanvas() {

    if (!canvas) return;


    const rect =
      container.getBoundingClientRect();


    const ratio =
      window.devicePixelRatio ||
      1;


    canvas.width =
      Math.floor(
        rect.width *
        ratio
      );


    canvas.height =
      Math.floor(
        rect.height *
        ratio
      );


    canvasCtx.setTransform(
      ratio,
      0,
      0,
      ratio,
      0,
      0
    );


    redrawCanvas();

  }


  /*
  ========================================================
  DRAWING
  ========================================================
  */

  function activateDrawing(
    type,
    button
  ) {

    drawingMode =
      type;


    setActiveButton(
      "[data-draw]",
      button
    );


    canvas.style.pointerEvents =
      "auto";


    setStatus(
      `${type.toUpperCase()} DRAW MODE — click chart`
    );

  }


  function handleCanvasClick(
    event
  ) {

    if (!drawingMode) return;


    const point =
      getCanvasPoint(
        event
      );


    if (
      drawingMode ===
      "horizontal"
    ) {

      drawings.push({

        type:
          "horizontal",

        y:
          point.y

      });


      redrawCanvas();


      return;

    }


    if (
      drawingMode ===
      "vertical"
    ) {

      drawings.push({

        type:
          "vertical",

        x:
          point.x

      });


      redrawCanvas();


      return;

    }


    if (
      drawingMode ===
      "trend"
    ) {

      if (
        !activeDrawing
      ) {

        activeDrawing = {

          type:
            "trend",

          x1:
            point.x,

          y1:
            point.y,

          x2:
            point.x,

          y2:
            point.y

        };


      } else {

        activeDrawing.x2 =
          point.x;

        activeDrawing.y2 =
          point.y;


        drawings.push(
          activeDrawing
        );


        activeDrawing =
          null;

      }


      redrawCanvas();

    }

  }


  function handlePointerDown(
    event
  ) {

    if (
      drawingMode !==
      "trend"
    ) {

      return;

    }


    const point =
      getCanvasPoint(
        event
      );


    activeDrawing = {

      type:
        "trend",

      x1:
        point.x,

      y1:
        point.y,

      x2:
        point.x,

      y2:
        point.y

    };

  }


  function handlePointerMove(
    event
  ) {

    if (
      !activeDrawing
    ) {

      return;

    }


    const point =
      getCanvasPoint(
        event
      );


    activeDrawing.x2 =
      point.x;

    activeDrawing.y2 =
      point.y;


    redrawCanvas();

  }


  function handlePointerUp() {

    if (
      !activeDrawing
    ) {

      return;

    }


    drawings.push(
      activeDrawing
    );


    activeDrawing =
      null;


    redrawCanvas();

  }


  function getCanvasPoint(
    event
  ) {

    const rect =
      canvas.getBoundingClientRect();


    return {

      x:
        event.clientX -
        rect.left,

      y:
        event.clientY -
        rect.top

    };

  }


  function redrawCanvas() {

    if (
      !canvas ||
      !canvasCtx
    ) {

      return;

    }


    const rect =
      canvas.getBoundingClientRect();


    canvasCtx.clearRect(
      0,
      0,
      rect.width,
      rect.height
    );


    canvasCtx.lineWidth =
      1.5;


    canvasCtx.strokeStyle =
      "#f5c542";


    canvasCtx.fillStyle =
      "#f5c542";


    drawings.forEach(
      drawing => {

        if (
          drawing.type ===
          "horizontal"
        ) {

          canvasCtx.beginPath();

          canvasCtx.moveTo(
            0,
            drawing.y
          );

          canvasCtx.lineTo(
            rect.width,
            drawing.y
          );

          canvasCtx.stroke();

        }


        if (
          drawing.type ===
          "vertical"
        ) {

          canvasCtx.beginPath();

          canvasCtx.moveTo(
            drawing.x,
            0
          );

          canvasCtx.lineTo(
            drawing.x,
            rect.height
          );

          canvasCtx.stroke();

        }


        if (
          drawing.type ===
          "trend"
        ) {

          canvasCtx.beginPath();

          canvasCtx.moveTo(
            drawing.x1,
            drawing.y1
          );

          canvasCtx.lineTo(
            drawing.x2,
            drawing.y2
          );

          canvasCtx.stroke();

        }

      }
    );


    if (
      activeDrawing
    ) {

      canvasCtx.beginPath();

      canvasCtx.moveTo(
        activeDrawing.x1,
        activeDrawing.y1
      );

      canvasCtx.lineTo(
        activeDrawing.x2,
        activeDrawing.y2
      );

      canvasCtx.stroke();

    }

  }


  function clearDrawings() {

    drawings =
      [];

    activeDrawing =
      null;

    drawingMode =
      null;


    if (canvas) {

      canvas.style.pointerEvents =
        "none";

    }


    document
      .querySelectorAll(
        "#borsaciChartControls [data-draw]"
      )
      .forEach(
        button => {

          button.classList.remove(
            "active"
          );

        }
      );


    redrawCanvas();


    setStatus(
      "DRAWINGS CLEARED"
    );

  }


  /*
  ========================================================
  SYMBOL WATCHER
  ========================================================
  */

  function watchSymbol() {

    if (!symbolElement) {

      console.warn(
        "BORSACI CHART.JS: #chartSymbol bulunamadı."
      );

      return;

    }


    const observer =
      new MutationObserver(
        () => {

          const symbol =
            normalizeSymbol(
              symbolElement.innerText
            );


          if (
            !symbol ||
            symbol ===
              currentSymbol
          ) {

            return;

          }


          currentSymbol =
            symbol;


          clearDrawings();


          loadChart();

        }
      );


    observer.observe(
      symbolElement,
      {

        childList:
          true,

        subtree:
          true,

        characterData:
          true

      }
    );


    /*
     * İlk sembol
     */

    const initial =
      normalizeSymbol(
        symbolElement.innerText
      );


    if (initial) {

      currentSymbol =
        initial;

    }

  }


  /*
  ========================================================
  INIT
  ========================================================
  */

  function initialize() {

    createChartUI();


    /*
     * app.js önce kendi chart'ını
     * oluşturmuş olacak.
     *
     * Biz burada onun container'ını
     * devralıyoruz.
     */

    if (
      !initChart()
    ) {

      return;

    }


    watchSymbol();


    /*
     * İlk sembol yoksa bekle.
     */

    if (currentSymbol) {

      setTimeout(
        loadChart,
        150
      );

    }


    window.addEventListener(
      "resize",
      resizeCanvas
    );


    console.log(
      "BORSACI: Advanced chart.js ready."
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
      initialize
    );

  } else {

    /*
     * app.js'nin init işleminin
     * bitmesine kısa süre bırakıyoruz.
     */

    setTimeout(
      initialize,
      100
    );

  }

})();