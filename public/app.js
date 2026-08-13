
}

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

    if (
      Array.isArray(data.symbols)
    ) {

      symbols =
        data.symbols
          .map(symbol =>
            normalizeSymbol(symbol)
          )
          .filter(Boolean);

    }

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
renderWatchlist();


@@ -3132,12 +3183,11 @@ function clearDashboard() {
INIT
========================================================
*/

function initializeBorsaCI() {
async function initializeBorsaCI() {

initMarketChart();

  renderWatchlist();
  await loadWatchlist();

console.log(
"BORSACI: Application initialized."
