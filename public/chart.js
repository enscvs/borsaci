/*
========================================================
BORSACI // CHART CONTROLS
chart.js

app.js'ye DOKUNMAZ.
Chart kontrollerini kendi oluşturur.
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
      document.getElementById("market_chart");

    if (!chartContainer) {

      console.error(
        "BORSACI CHART: #market_chart bulunamadı."
      );

      return;
    }


    /*
     * Chart'ın üstüne kontrol paneli
     */

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


    /*
     * Chart container'ın ÖNÜNE koy.
     */

    chartContainer.parentNode.insertBefore(
      panel,
      chartContainer
    );


    /*
     * RANGE
     */

    panel
      .querySelectorAll(
        "[data-range]"
      )
      .forEach(
        button => {

          button.addEventListener(
            "click",
            () => {

              activeRange =
                button.dataset.range;

              setActiveButton(
                panel,
                "[data-range]",
                activeRange
              );

              reloadChart();

            }
          );

        }
      );


    /*
     * INTERVAL
     */

    panel
      .querySelectorAll(
        "[data-interval]"
      )
      .forEach(
        button => {

          button.addEventListener(
            "click",
            () => {

              activeInterval =
                button.dataset.interval;

              setActiveButton(
                panel,
                "[data-interval]",
                activeInterval
              );

              reloadChart();

            }
          );

        }
      );


    /*
     * INDICATORS
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

              button.classList.toggle(
                "active"
              );

              const indicator =
                button.dataset.indicator;

              toggleIndicator(
                indicator,
                button.classList.contains(
                  "active"
                )
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

          button.classList.toggle(
            "active",
            button.dataset.range === value ||
            button.dataset.interval === value
          );

        }
      );

  }


  /*
  ========================================================
  RELOAD CHART
  ========================================================
  */

  function reloadChart() {

    if (
      typeof window.loadChartData !==
      "function"
    ) {

      console.warn(
        "BORSACI CHART: loadChartData bulunamadı."
      );

      return;
    }


    const symbol =
      window.selectedSymbol;


    if (!symbol) {

      console.warn(
        "BORSACI CHART: Seçili sembol yok."
      );

      return;

    }


    /*
     * Burada mevcut app.js'nin
     * chart cache'ini kullanmıyoruz.
     *
     * Çünkü farklı range / interval
     * istediğimizde yeni veri lazım.
     */


    const url =
      `/chart?symbol=${encodeURIComponent(
        symbol
      )}&range=${encodeURIComponent(
        activeRange
      )}&interval=${encodeURIComponent(
        activeInterval
      )}`;


    console.log(
      "BORSACI CHART REQUEST:",
      url
    );


    /*
     * Şimdilik doğrudan endpoint'i
     * test ediyoruz.
     *
     * Bir sonraki aşamada gelen veriyi
     * mevcut LightweightCharts serisine
     * bağlayacağız.
     */

    fetch(
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
    )
      .then(
        response => {

          if (!response.ok) {

            throw new Error(
              `Chart HTTP ${response.status}`
            );

          }

          return response.json();

        }
      )
      .then(
        data => {

          console.log(
            "BORSACI CHART DATA:",
            data
          );


          /*
           * Global app.js fonksiyonları
           */

          if (
            typeof window.extractChartHistory ===
            "function" &&
            typeof window.updateChartData ===
            "function"
          ) {

            const history =
              window.extractChartHistory(
                data
              );

            window.updateChartData(
              history
            );

          }

        }
      )
      .catch(
        error => {

          console.error(
            "BORSACI CHART ERROR:",
            error
          );

        }
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
      `BORSACI INDICATOR: ${indicator}`,
      enabled
    );


    /*
     * Şimdilik altyapıyı hazırlıyoruz.
     *
     * SMA / EMA / Bollinger /
     * RSI / MACD hesaplamalarını
     * bir sonraki katmanda ekleyeceğiz.
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