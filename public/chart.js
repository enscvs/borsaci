/*
========================================================
BORSACI // CHART CONTROLS
chart.js

APP.JS'YE DOKUNMAZ.

FEATURES
- Range
- Interval
- 4H aggregation
- SMA
- EMA
- Bollinger Bands
- RSI
- MACD
========================================================
*/

"use strict";

(function () {

  let activeRange = "1y";
  let activeInterval = "1d";

  let controlsInitialized = false;

  /*
   * Indicator state
   */

  const indicators = {
    sma: false,
    ema: false,
    bollinger: false,
    rsi: false,
    macd: false
  };

  /*
   * Local chart data
   */

  let currentHistory = [];


  /*
  ========================================================
  INIT
  ========================================================
  */

  function initChartControls() {

    if (controlsInitialized) {
      return;
    }

    const chartContainer =
      document.getElementById("market_chart");

    if (!chartContainer) {

      console.error(
        "BORSACI CHART: #market_chart bulunamadı."
      );

      return;
    }


    const panel =
      document.createElement("div");

    panel.id =
      "borsaciChartControls";

    panel.className =
      "borsaci-chart-controls";


    panel.innerHTML = `

      <div class="chart-control-group">

        <span class="chart-control-label">
          RANGE
        </span>

        <div class="chart-buttons">

          ${[
            ["1d", "1D"],
            ["5d", "5D"],
            ["1mo", "1M"],
            ["3mo", "3M"],
            ["6mo", "6M"],
            ["1y", "1Y"],
            ["2y", "2Y"],
            ["5y", "5Y"]
          ].map(
            ([value, label]) => `
              <button
                type="button"
                data-range="${value}"
                class="${value === "1y" ? "active" : ""}"
              >
                ${label}
              </button>
            `
          ).join("")}

        </div>

      </div>


      <div class="chart-control-group">

        <span class="chart-control-label">
          INTERVAL
        </span>

        <div class="chart-buttons">

          <button
            type="button"
            data-interval="15m"
          >
            15M
          </button>

          <button
            type="button"
            data-interval="1h"
          >
            1H
          </button>

          <button
            type="button"
            data-interval="4h"
          >
            4H
          </button>

          <button
            type="button"
            data-interval="1d"
            class="active"
          >
            1D
          </button>

          <button
            type="button"
            data-interval="1wk"
          >
            1W
          </button>

        </div>

      </div>


      <div class="chart-control-group">

        <span class="chart-control-label">
          INDICATORS
        </span>

        <div class="chart-buttons">

          <button
            type="button"
            data-indicator="sma"
          >
            SMA
          </button>

          <button
            type="button"
            data-indicator="ema"
          >
            EMA
          </button>

          <button
            type="button"
            data-indicator="bollinger"
          >
            BB
          </button>

          <button
            type="button"
            data-indicator="rsi"
          >
            RSI
          </button>

          <button
            type="button"
            data-indicator="macd"
          >
            MACD
          </button>

        </div>

      </div>

    `;


    chartContainer.parentNode.insertBefore(
      panel,
      chartContainer
    );


    /*
    ========================================================
    RANGE
    ========================================================
    */

    panel
      .querySelectorAll("[data-range]")
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            activeRange =
              button.dataset.range;

            setActiveButton(
              panel,
              "[data-range]",
              activeRange,
              "range"
            );

            reloadChart();

          }
        );

      });


    /*
    ========================================================
    INTERVAL
    ========================================================
    */

    panel
      .querySelectorAll("[data-interval]")
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            activeInterval =
              button.dataset.interval;

            setActiveButton(
              panel,
              "[data-interval]",
              activeInterval,
              "interval"
            );

            reloadChart();

          }
        );

      });


    /*
    ========================================================
    INDICATORS
    ========================================================
    */

    panel
      .querySelectorAll("[data-indicator]")
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            const indicator =
              button.dataset.indicator;

            indicators[indicator] =
              !indicators[indicator];

            button.classList.toggle(
              "active",
              indicators[indicator]
            );

            redrawChart();

          }
        );

      });


    controlsInitialized =
      true;


    console.log(
      "BORSACI CHART: Controls initialized."
    );

  }


  /*
  ========================================================
  ACTIVE BUTTON
  ========================================================
  */

  function setActiveButton(
    panel,
    selector,
    value,
    type
  ) {

    panel
      .querySelectorAll(selector)
      .forEach(button => {

        button.classList.toggle(
          "active",
          type === "range"
            ? button.dataset.range === value
            : button.dataset.interval === value
        );

      });

  }


  /*
  ========================================================
  GET SELECTED SYMBOL
  ========================================================
  */

  function getSelectedSymbol() {

    /*
     * app.js'deki selectedSymbol
     * window'a bağlı değil.
     *
     * chartSymbol DOM elementinden
     * güvenli şekilde alıyoruz.
     */

    const element =
      document.getElementById(
        "chartSymbol"
      );

    if (element) {

      const text =
        element.innerText
          ?.trim();

      if (
        text &&
        text !== "NO SYMBOL"
      ) {

        return text
          .toUpperCase()
          .replace(/^BIST:/, "")
          .replace(/\.IS$/, "");

      }

    }

    return null;

  }


  /*
  ========================================================
  INTERVAL COMPATIBILITY
  ========================================================
  */

  function getRequestParams() {

    let range =
      activeRange;

    let interval =
      activeInterval;


    /*
     * 15M
     *
     * Yahoo intraday limitation.
     */

    if (
      interval === "15m"
    ) {

      const allowed =
        [
          "1d",
          "5d",
          "1mo"
        ];

      if (
        !allowed.includes(range)
      ) {

        range =
          "1mo";

      }

    }


    /*
     * 1H
     *
     * 1y kullanılabilir.
     */

    if (
      interval === "1h"
    ) {

      const allowed =
        [
          "1d",
          "5d",
          "1mo",
          "3mo",
          "6mo",
          "1y"
        ];

      if (
        !allowed.includes(range)
      ) {

        range =
          "1y";

      }

    }


    /*
     * 4H
     *
     * Server'a 1H istiyoruz.
     * Sonra frontend'de 4H aggregate ediyoruz.
     */

    if (
      interval === "4h"
    ) {

      interval =
        "1h";


      const allowed =
        [
          "1d",
          "5d",
          "1mo",
          "3mo",
          "6mo",
          "1y"
        ];

      if (
        !allowed.includes(range)
      ) {

        range =
          "1y";

      }

    }


    return {
      range,
      interval
    };

  }


  /*
  ========================================================
  RELOAD CHART
  ========================================================
  */

  async function reloadChart() {

  const symbol =
    getSelectedSymbol();

  if (!symbol) {

    console.warn(
      "BORSACI CHART: Seçili sembol yok."
    );

    return;

  }


  const url =
    `/chart?symbol=${encodeURIComponent(symbol)}` +
    `&range=${encodeURIComponent(activeRange)}` +
    `&interval=${encodeURIComponent(activeInterval)}`;


  console.log(
    "========================================"
  );

  console.log(
    "BORSACI CHART RELOAD"
  );

  console.log(
    "Symbol:",
    symbol
  );

  console.log(
    "Range:",
    activeRange
  );

  console.log(
    "Interval:",
    activeInterval
  );

  console.log(
    "URL:",
    url
  );

  console.log(
    "========================================"
  );


  try {

    const response =
      await fetch(
        url,
        {
          method: "GET",

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
        JSON.parse(text);

    } catch {

      throw new Error(
        `Chart JSON değil. HTTP ${response.status}: ${text.slice(0, 300)}`
      );

    }


    if (!response.ok) {

      throw new Error(
        data?.error ||
        `Chart HTTP ${response.status}`
      );

    }


    const history =
      extractChartHistory(data);


    console.log(
      "BORSACI CHART CANDLE COUNT:",
      history.length
    );


    console.log(
      "BORSACI CHART FIRST:",
      history[0]
    );


    console.log(
      "BORSACI CHART LAST:",
      history[history.length - 1]
    );


    if (
      !Array.isArray(history) ||
      history.length === 0
    ) {

      throw new Error(
        "Chart verisi boş."
      );

    }


    /*
     * ÇOK ÖNEMLİ:
     *
     * Yeni range/interval verisini
     * eski cache ile karıştırma.
     */

    chartCache[symbol] = {

      timestamp:
        Date.now(),

      history

    };


    /*
     * Gelen bütün mumları çiz.
     */

    updateChartData(
      history
    );


  } catch (error) {

    console.error(
      "BORSACI CHART RELOAD ERROR:",
      error
    );

  }

}
  /*
  ========================================================
  EXTRACT HISTORY
  ========================================================
  */

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
        !Number.isFinite(close)
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
  NORMALIZE TIME
  ========================================================
  */

  function getTimestamp(
    item
  ) {

    const raw =
      item?.time ??
      item?.timestamp ??
      item?.date;


    const number =
      Number(raw);


    if (
      Number.isFinite(number)
    ) {

      return number > 10000000000
        ? Math.floor(number / 1000)
        : number;

    }


    const parsed =
      new Date(raw)
        .getTime();


    if (
      !Number.isFinite(parsed)
    ) {

      return null;

    }


    return Math.floor(
      parsed / 1000
    );

  }


  /*
  ========================================================
  4H AGGREGATION
  ========================================================
  */

  function aggregate4Hour(
    history
  ) {

    if (
      !Array.isArray(history) ||
      history.length === 0
    ) {

      return [];

    }


    const sorted =
      [...history]
        .sort(
          (
            a,
            b
          ) =>
            getTimestamp(a) -
            getTimestamp(b)
        );


    const result =
      [];


    let bucket = null;


    for (
      const candle of sorted
    ) {

      const timestamp =
        getTimestamp(candle);


      if (
        !Number.isFinite(timestamp)
      ) {

        continue;

      }


      const bucketStart =
        Math.floor(
          timestamp /
          (4 * 60 * 60)
        ) *
        (4 * 60 * 60);


      if (
        !bucket ||
        bucket.time !== bucketStart
      ) {

        if (bucket) {

          result.push(
            bucket
          );

        }


        bucket = {

          time:
            bucketStart,

          open:
            Number(candle.open),

          high:
            Number(candle.high),

          low:
            Number(candle.low),

          close:
            Number(candle.close),

          volume:
            Number(candle.volume) || 0

        };

      } else {

        bucket.high =
          Math.max(
            bucket.high,
            Number(candle.high)
          );

        bucket.low =
          Math.min(
            bucket.low,
            Number(candle.low)
          );

        bucket.close =
          Number(candle.close);

        bucket.volume +=
          Number(candle.volume) || 0;

      }

    }


    if (bucket) {

      result.push(
        bucket
      );

    }


    return result;

  }


  /*
  ========================================================
  REDRAW
  ========================================================
  */

  function redrawChart() {

    /*
     * Önce normal candle chart'ı
     * app.js çizmiş oluyor.
     *
     * Indicator için ayrı Lightweight
     * Charts series oluşturmak gerekiyor.
     *
     * Bu bölüm mevcut chart'a
     * indicator series ekler.
     */

    if (
      !currentHistory.length
    ) {

      return;

    }


    console.log(
      "BORSACI INDICATORS:",
      indicators
    );


    /*
     * Şimdilik hesaplamaları yap.
     *
     * app.js'nin candleSeries'ine
     * doğrudan erişemediğimiz için
     * indicator hesaplarının doğruluğunu
     * burada hazırlıyoruz.
     */

    if (indicators.sma) {

      console.log(
        "SMA:",
        calculateSMA(
          currentHistory,
          20
        )
      );

    }


    if (indicators.ema) {

      console.log(
        "EMA:",
        calculateEMA(
          currentHistory,
          20
        )
      );

    }


    if (indicators.bollinger) {

      console.log(
        "BB:",
        calculateBollinger(
          currentHistory,
          20,
          2
        )
      );

    }


    if (indicators.rsi) {

      console.log(
        "RSI:",
        calculateRSI(
          currentHistory,
          14
        )
      );

    }


    if (indicators.macd) {

      console.log(
        "MACD:",
        calculateMACD(
          currentHistory
        )
      );

    }

  }


  /*
  ========================================================
  SMA
  ========================================================
  */

  function calculateSMA(
    history,
    period
  ) {

    const result = [];


    for (
      let i = period - 1;
      i < history.length;
      i++
    ) {

      let sum = 0;


      for (
        let j = i - period + 1;
        j <= i;
        j++
      ) {

        sum +=
          Number(
            history[j].close
          );

      }


      result.push({

        time:
          getTimestamp(
            history[i]
          ),

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
    history,
    period
  ) {

    const result = [];


    if (
      history.length < period
    ) {

      return result;

    }


    const multiplier =
      2 /
      (period + 1);


    let ema = 0;


    for (
      let i = 0;
      i < period;
      i++
    ) {

      ema +=
        Number(
          history[i].close
        );

    }


    ema /=
      period;


    result.push({

      time:
        getTimestamp(
          history[period - 1]
        ),

      value:
        ema

    });


    for (
      let i = period;
      i < history.length;
      i++
    ) {

      ema =
        (
          Number(
            history[i].close
          ) -
          ema
        ) *
        multiplier +
        ema;


      result.push({

        time:
          getTimestamp(
            history[i]
          ),

        value:
          ema

      });

    }


    return result;

  }


  /*
  ========================================================
  BOLLINGER
  ========================================================
  */

  function calculateBollinger(
    history,
    period = 20,
    multiplier = 2
  ) {

    const result = [];


    for (
      let i = period - 1;
      i < history.length;
      i++
    ) {

      const values =
        [];


      for (
        let j = i - period + 1;
        j <= i;
        j++
      ) {

        values.push(
          Number(
            history[j].close
          )
        );

      }


      const mean =
        values.reduce(
          (
            a,
            b
          ) => a + b,
          0
        ) /
        period;


      const variance =
        values.reduce(
          (
            sum,
            value
          ) =>
            sum +
            Math.pow(
              value - mean,
              2
            ),
          0
        ) /
        period;


      const std =
        Math.sqrt(
          variance
        );


      result.push({

        time:
          getTimestamp(
            history[i]
          ),

        middle:
          mean,

        upper:
          mean +
          multiplier * std,

        lower:
          mean -
          multiplier * std

      });

    }


    return result;

  }


  /*
  ========================================================
  RSI
  ========================================================
  */

  function calculateRSI(
    history,
    period = 14
  ) {

    const result = [];


    if (
      history.length <= period
    ) {

      return result;

    }


    let gains = 0;
    let losses = 0;


    for (
      let i = 1;
      i <= period;
      i++
    ) {

      const diff =
        Number(
          history[i].close
        ) -
        Number(
          history[i - 1].close
        );


      if (diff >= 0) {

        gains += diff;

      } else {

        losses -= diff;

      }

    }


    let avgGain =
      gains / period;


    let avgLoss =
      losses / period;


    function getRSI() {

      if (
        avgLoss === 0
      ) {

        return 100;

      }


      const rs =
        avgGain /
        avgLoss;


      return (
        100 -
        (
          100 /
          (1 + rs)
        )
      );

    }


    result.push({

      time:
        getTimestamp(
          history[period]
        ),

      value:
        getRSI()

    });


    for (
      let i = period + 1;
      i < history.length;
      i++
    ) {

      const diff =
        Number(
          history[i].close
        ) -
        Number(
          history[i - 1].close
        );


      const gain =
        diff > 0
          ? diff
          : 0;


      const loss =
        diff < 0
          ? -diff
          : 0;


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


      result.push({

        time:
          getTimestamp(
            history[i]
          ),

        value:
          getRSI()

      });

    }


    return result;

  }


  /*
  ========================================================
  MACD
  ========================================================
  */

  function calculateMACD(
    history
  ) {

    const ema12 =
      calculateEMA(
        history,
        12
      );


    const ema26 =
      calculateEMA(
        history,
        26
      );


    const result =
      [];


    const map26 =
      new Map();


    ema26.forEach(
      item => {

        map26.set(
          item.time,
          item.value
        );

      }
    );


    ema12.forEach(
      item => {

        const slow =
          map26.get(
            item.time
          );


        if (
          slow === undefined
        ) {

          return;

        }


        result.push({

          time:
            item.time,

          value:
            item.value -
            slow

        });

      }
    );


    return result;

  }


  /*
  ========================================================
  START
  ========================================================
  */

  function start() {

    initChartControls();

  }


  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      start
    );

  } else {

    start();

  }


})();