/*
========================================================
BORSACI // CHART CONTROLS
chart.js

app.js içindeki chart sistemine bridge üzerinden bağlanır.
========================================================
*/

"use strict";

(function () {

  let activeRange = "1y";

  let activeInterval = "1d";

  let controlsInitialized = false;


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
      document.getElementById(
        "market_chart"
      );


    if (!chartContainer) {

      console.error(
        "BORSACI CHART: #market_chart bulunamadı."
      );

      return;

    }


    /*
     * Bridge henüz yüklenmemişse
     * biraz bekle.
     */

    if (
      !window.BORSACI_CHART
    ) {

      console.warn(
        "BORSACI CHART: app.js bridge henüz hazır değil."
      );

      setTimeout(
        initChartControls,
        300
      );

      return;

    }


    /*
    ======================================================
    PANEL
    ======================================================
    */

    const panel =
      document.createElement(
        "div"
      );


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

          <button
            type="button"
            data-range="1d"
          >
            1D
          </button>

          <button
            type="button"
            data-range="5d"
          >
            5D
          </button>

          <button
            type="button"
            data-range="1mo"
          >
            1M
          </button>

          <button
            type="button"
            data-range="3mo"
          >
            3M
          </button>

          <button
            type="button"
            data-range="6mo"
          >
            6M
          </button>

          <button
            type="button"
            data-range="1y"
            class="active"
          >
            1Y
          </button>

          <button
            type="button"
            data-range="2y"
          >
            2Y
          </button>

          <button
            type="button"
            data-range="5y"
          >
            5Y
          </button>

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
    ======================================================
    RANGE
    ======================================================
    */

    panel
      .querySelectorAll(
        "[data-range]"
      )
      .forEach(
        button => {

          button.addEventListener(
            "click",
            async () => {

              activeRange =
                button.dataset.range;


              setActiveButton(
                panel,
                "[data-range]",
                activeRange
              );


              await reloadChart();

            }
          );

        }
      );


    /*
    ======================================================
    INTERVAL
    ======================================================
    */

    panel
      .querySelectorAll(
        "[data-interval]"
      )
      .forEach(
        button => {

          button.addEventListener(
            "click",
            async () => {

              activeInterval =
                button.dataset.interval;


              setActiveButton(
                panel,
                "[data-interval]",
                activeInterval
              );


              await reloadChart();

            }
          );

        }
      );


    /*
    ======================================================
    INDICATORS
    ======================================================
    */

    panel
      .querySelectorAll(
        "[data-indicator]"
      )
      .forEach(
        button => {

          button.addEventListener(
            "click",
            () => {

              const enabled =
                button.classList.toggle(
                  "active"
                );


              const indicator =
                button.dataset.indicator;


              toggleIndicator(
                indicator,
                enabled
              );

            }
          );

        }
      );


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
    value
  ) {

    panel
      .querySelectorAll(
        selector
      )
      .forEach(
        button => {

          const isActive =
            selector ===
            "[data-range]"
              ? button.dataset.range === value
              : button.dataset.interval === value;


          button.classList.toggle(
            "active",
            isActive
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

    /*
     * Bridge kontrolü.
     */

    if (
      !window.BORSACI_CHART
    ) {

      console.error(
        "BORSACI CHART: Bridge bulunamadı."
      );

      return;

    }


    /*
     * Symbol kontrolü.
     */

    const symbol =
      window.BORSACI_CHART
        .getSelectedSymbol();


    if (!symbol) {

      console.warn(
        "BORSACI CHART: Seçili sembol yok."
      );

      return;

    }


    console.log(
      "================================"
    );

    console.log(
      "BORSACI CHART CONTROL"
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
      "================================"
    );


    await window.BORSACI_CHART.loadChart(
      activeRange,
      activeInterval
    );

  }


  /*
  ========================================================
  INDICATORS
  ========================================================
  */

  function toggleIndicator(
    indicator,
    enabled
  ) {

    console.log(
      "BORSACI INDICATOR:",
      indicator,
      enabled
    );


    /*
     * Şimdilik gerçek hesaplama yok.
     *
     * Burada sadece state tutuluyor.
     *
     * SMA / EMA / BB / RSI / MACD
     * bir sonraki katmanda bağlanacak.
     */

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