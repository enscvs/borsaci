/*
========================================================
WATCHLIST
========================================================
*/

async function loadWatchlist() {

  try {

    const response =
      await fetch(
        "/api/watchlist",
        {
          method: "GET",
          cache: "no-store"
        }
      );

    if (!response.ok) {

      throw new Error(
        `Watchlist HTTP ${response.status}`
      );

    }

    const data =
      await response.json();

    symbols =
      Array.isArray(data.symbols)
        ? data.symbols
            .map(symbol =>
              normalizeSymbol(symbol)
            )
            .filter(Boolean)
        : [];

    renderWatchlist();

    console.log(
      "BORSACI WATCHLIST LOADED:",
      symbols
    );

  } catch (error) {

    console.error(
      "BORSACI WATCHLIST LOAD ERROR:",
      error
    );

  }

}


/*
========================================================
ADD SYMBOL
========================================================
*/

async function addSymbol() {

  const input =
    prompt(
      "BIST sembolünü gir:\n\nÖrnek: ASELS"
    );

  if (!input) {

    return;

  }

  const symbol =
    normalizeSymbol(
      input
    );

  if (!symbol) {

    return;

  }

  if (
    symbols.includes(symbol)
  ) {

    await selectSymbol(
      symbol
    );

    return;

  }

  try {

    const response =
      await fetch(
        "/api/watchlist",
        {

          method:
            "POST",

          headers: {

            "Content-Type":
              "application/json"

          },

          body:
            JSON.stringify({
              symbol
            })

        }
      );

    const data =
      await response.json();

    if (!response.ok) {

      throw new Error(
        data?.error ||
        `Watchlist HTTP ${response.status}`
      );

    }

    symbols =
      Array.isArray(
        data.symbols
      )
        ? data.symbols
        : symbols;

    renderWatchlist();

    await selectSymbol(
      symbol
    );

    console.log(
      "BORSACI WATCHLIST ADD:",
      symbol
    );

  } catch (error) {

    console.error(
      "BORSACI WATCHLIST ADD ERROR:",
      error
    );

    alert(
      "Hisse watchlist'e eklenemedi."
    );

  }

}


/*
========================================================
RENDER WATCHLIST
========================================================
*/

function renderWatchlist() {

  if (!watchlist) {

    return;

  }

  watchlist.innerHTML = "";

  symbols.forEach(
    (symbol, index) => {

      const button =
        document.createElement(
          "button"
        );

      button.type =
        "button";

      button.className =
        "watchlist-item";

      button.dataset.symbol =
        symbol;

      button.innerHTML = `
        <span>${symbol}</span>
        <span
          class="watchlist-remove"
          title="Sil"
        >×</span>
      `;

      button.addEventListener(
        "click",
        async event => {

          event.stopPropagation();

          if (
            event.target.classList.contains(
              "watchlist-remove"
            )
          ) {

            try {

              const response =
                await fetch(
                  `/api/watchlist?symbol=${encodeURIComponent(symbol)}`,
                  {
                    method:
                      "DELETE"
                  }
                );

              const data =
                await response.json();

              if (!response.ok) {

                throw new Error(
                  data?.error ||
                  `Watchlist HTTP ${response.status}`
                );

              }

              symbols =
                Array.isArray(
                  data.symbols
                )
                  ? data.symbols
                  : symbols.filter(
                      item =>
                        item !== symbol
                    );

              renderWatchlist();

              console.log(
                "BORSACI WATCHLIST DELETE:",
                symbol
              );

            } catch (error) {

              console.error(
                "BORSACI WATCHLIST DELETE ERROR:",
                error
              );

              alert(
                "Hisse watchlist'ten silinemedi."
              );

            }

            return;

          }

          await selectSymbol(
            symbol
          );

        }
      );

      watchlist.appendChild(
        button
      );

    }
  );

}


/*
========================================================
ADD BUTTON
========================================================
*/

if (addSymbolBtn) {

  addSymbolBtn.addEventListener(
    "click",
    addSymbol
  );

}


/*
========================================================
INITIALIZE
========================================================
*/

async function initializeBorsaCI() {

  initMarketChart();

  await loadWatchlist();

  console.log(
    "BORSACI: Application initialized."
  );

}
