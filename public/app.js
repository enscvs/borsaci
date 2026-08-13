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


/*
 * CLOCK
 */

function updateClock() {

  const clock =
    document.getElementById("clock");

  if (!clock) return;

  const now = new Date();

  const time =
    now.toLocaleTimeString(
      "tr-TR",
      {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }
    );

  clock.innerText = time;
}

updateClock();

setInterval(
  updateClock,
  1000
);


/*
 * WATCHLIST
 */

let symbols = [];


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


  symbols.forEach((symbol, index) => {

    const row =
      document.createElement("div");

    row.className =
      "watch-row";


    row.innerHTML = `

      <button
        class="symbol-button"
        data-index="${index}"
      >
        <span>
          ${symbol}
        </span>

        <span class="symbol-price">
          --
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


  /*
   * SYMBOL SEÇİMİ
   */

  document
    .querySelectorAll(".symbol-button")
    .forEach((button) => {

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

    });


  /*
   * SYMBOL SİLME
   */

  document
    .querySelectorAll(".remove-symbol")
    .forEach((button) => {

      button.addEventListener(
        "click",
        () => {

          const index =
            Number(
              button.dataset.index
            );

          symbols.splice(
            index,
            1
          );

          renderWatchlist();

        }
      );

    });

}


/*
 * SYMBOL SEÇ
 */

function selectSymbol(symbol) {

  if (!chartSymbol) return;

  chartSymbol.innerText =
    symbol;

  /*
   * Şimdilik veri yok.
   * Daha sonra MCP burayı dolduracak.
   */

}


/*
 * SYMBOL EKLE
 */

function addSymbol() {

  const symbol =
    prompt(
      "BIST sembolünü gir:\n\nÖrnek: ASELS"
    );


  if (!symbol) {
    return;
  }


  const cleanSymbol =
    symbol
      .trim()
      .toUpperCase();


  if (!cleanSymbol) {
    return;
  }


  /*
   * Aynı hisseyi iki kere ekleme
   */

  if (
    symbols.includes(
      cleanSymbol
    )
  ) {

    alert(
      `${cleanSymbol} zaten watchlist'te.`
    );

    return;
  }


  symbols.push(
    cleanSymbol
  );


  renderWatchlist();

}


/*
 * ADD BUTONU
 */

if (addSymbolBtn) {

  addSymbolBtn.addEventListener(
    "click",
    addSymbol
  );

}


/*
 * ENTER = ANALİZ
 */

if (questionInput) {

  questionInput.addEventListener(
    "keydown",
    (event) => {

      /*
       * Enter
       */
      if (
        event.key === "Enter" &&
        !event.shiftKey
      ) {

        event.preventDefault();

        askBorsaCI();

      }


      /*
       * ESC = TEMİZLE
       */

      if (
        event.key === "Escape"
      ) {

        questionInput.value = "";

      }

    }
  );

}


/*
 * ANALİZ
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

          body: JSON.stringify({
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

  }


  catch (error) {

    console.error(
      error
    );


    responseBox.innerText =
      "ERROR\n\n" +
      error.message;

  }


  finally {

    analyzeBtn.disabled =
      false;

    analyzeBtn.innerText =
      "ANALYZE";

  }

}


/*
 * İLK RENDER
 */

renderWatchlist();