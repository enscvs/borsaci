require("dotenv").config();

const http = require("http");
const OpenAI = require("openai");

const {
  Client,
} = require("@modelcontextprotocol/sdk/client/index.js");

const {
  StreamableHTTPClientTransport,
} = require("@modelcontextprotocol/sdk/client/streamableHttp.js");


const PORT =
  process.env.PORT || 3000;


/*
========================================================
OPENROUTER
========================================================
*/

const ai = new OpenAI({
  apiKey:
    process.env.OPENROUTER_API_KEY,

  baseURL:
    "https://openrouter.ai/api/v1",
});


const MODEL =
  process.env.OPENROUTER_MODEL ||
  "openrouter/free";


/*
========================================================
SYSTEM PROMPT
========================================================
*/

const SYSTEM_PROMPT = `
Sen BorsaCI adlı profesyonel BIST ve finansal piyasa analiz asistanısın.

Gerçek piyasa verisi olmadan hiçbir fiyat, RSI, MACD, trend,
destek, direnç, analist hedefi, bilanço veya haber bilgisi uydurma.

Güncel veri gerekiyorsa mutlaka MCP araçlarını kullan.

MCP verisi ile kendi yorumunu birbirinden ayır.

Veri bulunamazsa "veri bulunamadı" de.

Haber başlığından haber içeriği uydurma.

Haber detayına ihtiyaç varsa get_news aracını news_id ile kullan.

Analist hedef fiyatı için get_analyst_data kullan.

Teknik analiz için mümkün olduğunda:

- get_quote
- get_technical_analysis
- get_historical_data

kullan.

Geniş analizlerde mümkün olduğunca:

1. search_symbol
2. get_quote
3. get_technical_analysis
4. get_news
5. önemli haberlerin detayları
6. get_analyst_data
7. gerekliyse temel analiz

kullan.

Türkçe, net ve profesyonel yaz.

Veri yoksa tahmin etme.
`;


/*
========================================================
SCHEMA TEMİZLEYİCİ
========================================================
*/

function cleanSchema(schema) {

  if (
    !schema ||
    typeof schema !== "object"
  ) {
    return schema;
  }

  const unsupported = [
    "examples",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "const",
  ];

  const result = {};

  for (
    const [key, value]
    of Object.entries(schema)
  ) {

    if (
      unsupported.includes(key)
    ) {
      continue;
    }

    if (
      value &&
      typeof value === "object"
    ) {

      if (
        Array.isArray(value)
      ) {

        result[key] =
          value.map(
            item =>
              typeof item === "object"
                ? cleanSchema(item)
                : item
          );

      } else {

        result[key] =
          cleanSchema(value);

      }

    } else {

      result[key] =
        value;

    }
  }

  return result;
}


/*
========================================================
MCP → OPENROUTER TOOLS
========================================================
*/

function convertMcpToolsToOpenAITools(
  tools
) {

  return tools.map(
    tool => ({

      type:
        "function",

      function: {

        name:
          tool.name,

        description:
          tool.description || "",

        parameters:
          cleanSchema(
            tool.inputSchema || {
              type: "object",
              properties: {},
            }
          ),

      },

    })
  );
}


/*
========================================================
MCP CLIENT
========================================================
*/

async function createMcpClient(
  name = "borsaci-client"
) {

  if (
    !process.env.MCP_URL
  ) {

    throw new Error(
      "MCP_URL environment variable bulunamadı."
    );

  }

  console.log(
    "========================================"
  );

  console.log(
    "MCP BAĞLANTI BAŞLIYOR"
  );

  console.log(
    "MCP CLIENT:",
    name
  );

  console.log(
    "MCP URL:",
    process.env.MCP_URL
  );

  console.log(
    "========================================"
  );


  const transport =
    new StreamableHTTPClientTransport(
      new URL(
        process.env.MCP_URL
      )
    );


  const client =
    new Client({
      name,
      version: "1.0.0",
    });


  await client.connect(
    transport
  );


  console.log(
    "MCP BAĞLANTI BAŞARILI"
  );


  return {
    client,
    transport,
  };
}


/*
========================================================
MCP TOOL
========================================================
*/

async function callMcpTool(
  client,
  name,
  args
) {

  console.log(
    `MCP → ${name}`,
    args
  );


  const result =
    await client.callTool({
      name,
      arguments: args,
    });


  console.log(
    `MCP ← ${name} tamamlandı`
  );


  return result;
}


/*
========================================================
MCP RESULT
========================================================
*/

function normalizeMcpResult(
  result
) {

  if (!result) {
    return null;
  }


  /*
   * structuredContent
   */

  if (
    result.structuredContent &&
    typeof result.structuredContent === "object"
  ) {

    return result.structuredContent;

  }


  /*
   * content
   */

  if (
    result.content &&
    Array.isArray(
      result.content
    )
  ) {

    for (
      const item
      of result.content
    ) {

      if (
        item &&
        item.type === "text" &&
        typeof item.text === "string"
      ) {

        const text =
          item.text.trim();


        try {

          return JSON.parse(
            text
          );

        } catch (_) {

          return {
            text,
          };

        }

      }

    }

  }


  return result;
}


/*
========================================================
RECURSIVE VALUE
========================================================
*/

function findValue(
  obj,
  possibleKeys
) {

  if (
    obj === null ||
    obj === undefined
  ) {
    return undefined;
  }


  if (
    typeof obj !== "object"
  ) {
    return undefined;
  }


  const wanted =
    possibleKeys.map(
      key =>
        String(key)
          .toLowerCase()
    );


  /*
   * Direkt seviye
   */

  for (
    const key
    of Object.keys(obj)
  ) {

    if (
      wanted.includes(
        key.toLowerCase()
      )
    ) {

      return obj[key];

    }

  }


  /*
   * Recursive
   */

  for (
    const value
    of Object.values(obj)
  ) {

    if (
      value &&
      typeof value === "object"
    ) {

      const found =
        findValue(
          value,
          possibleKeys
        );


      if (
        found !== undefined
      ) {

        return found;

      }

    }

  }


  return undefined;
}


/*
========================================================
RECURSIVE ARRAY
========================================================
*/

function findArray(
  obj,
  possibleKeys
) {

  if (
    !obj ||
    typeof obj !== "object"
  ) {
    return undefined;
  }


  const wanted =
    possibleKeys.map(
      key =>
        String(key)
          .toLowerCase()
    );


  for (
    const key
    of Object.keys(obj)
  ) {

    if (
      wanted.includes(
        key.toLowerCase()
      ) &&
      Array.isArray(
        obj[key]
      )
    ) {

      return obj[key];

    }

  }


  for (
    const value
    of Object.values(obj)
  ) {

    if (
      value &&
      typeof value === "object"
    ) {

      const found =
        findArray(
          value,
          possibleKeys
        );


      if (
        found !== undefined
      ) {

        return found;

      }

    }

  }


  return undefined;
}


/*
========================================================
NUMBER
========================================================
*/

function toNumber(
  value
) {

  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }


  if (
    typeof value === "number"
  ) {

    return Number.isFinite(
      value
    )
      ? value
      : null;

  }


  if (
    typeof value !== "string"
  ) {
    return null;
  }


  let text =
    value
      .trim()
      .replace(
        /[^\d.,-]/g,
        ""
      );


  if (
    text.includes(",") &&
    text.includes(".")
  ) {

    /*
     * 1.234,56
     */

    text =
      text.replace(
        /\./g,
        ""
      );

    text =
      text.replace(
        ",",
        "."
      );

  } else if (
    text.includes(",")
  ) {

    text =
      text.replace(
        ",",
        "."
      );

  }


  const number =
    Number(text);


  return Number.isFinite(
    number
  )
    ? number
    : null;
}


/*
========================================================
QUOTE
========================================================
*/

function normalizeQuote(
  raw
) {

  return {

    price:
      toNumber(
        findValue(
          raw,
          [
            "price",
            "currentPrice",
            "last",
            "lastPrice",
            "close",
            "latestPrice",
            "value",
          ]
        )
      ),

    change:
      toNumber(
        findValue(
          raw,
          [
            "change",
            "dailyChange",
            "priceChange",
          ]
        )
      ),

    changePercent:
      toNumber(
        findValue(
          raw,
          [
            "changePercent",
            "percentChange",
            "dailyChangePercent",
            "changePct",
            "percentageChange",
          ]
        )
      ),

    volume:
      toNumber(
        findValue(
          raw,
          [
            "volume",
            "dailyVolume",
          ]
        )
      ),

    marketCap:
      toNumber(
        findValue(
          raw,
          [
            "marketCap",
            "marketCapitalization",
          ]
        )
      ),

    high52:
      toNumber(
        findValue(
          raw,
          [
            "52WeekHigh",
            "week52High",
            "high52",
            "fiftyTwoWeekHigh",
          ]
        )
      ),

    low52:
      toNumber(
        findValue(
          raw,
          [
            "52WeekLow",
            "week52Low",
            "low52",
            "fiftyTwoWeekLow",
          ]
        )
      ),

    raw,
  };
}


/*
========================================================
TECHNICAL
========================================================
*/

function normalizeTechnical(
  raw
) {

  return {

    rsi:
      toNumber(
        findValue(
          raw,
          [
            "rsi",
            "RSI",
            "rsi14",
          ]
        )
      ),

    macd:
      toNumber(
        findValue(
          raw,
          [
            "macd",
            "MACD",
          ]
        )
      ),

    macdHistogram:
      toNumber(
        findValue(
          raw,
          [
            "macdHistogram",
            "histogram",
            "MACDHistogram",
          ]
        )
      ),

    ema20:
      toNumber(
        findValue(
          raw,
          [
            "ema20",
            "EMA20",
            "ema_20",
          ]
        )
      ),

    ema50:
      toNumber(
        findValue(
          raw,
          [
            "ema50",
            "EMA50",
            "ema_50",
          ]
        )
      ),

    atr:
      toNumber(
        findValue(
          raw,
          [
            "atr",
            "ATR",
          ]
        )
      ),

    trend:
      findValue(
        raw,
        [
          "trend",
          "Trend",
        ]
      ) || null,

    raw,
  };
}


/*
========================================================
HISTORY
========================================================
*/

function normalizeHistory(
  raw
) {

  let array =
    findArray(
      raw,
      [
        "data",
        "history",
        "historical",
        "prices",
        "candles",
        "results",
      ]
    );


  if (
    !array &&
    Array.isArray(raw)
  ) {
    array = raw;
  }


  if (
    !Array.isArray(array)
  ) {
    return [];
  }


  return array
    .map(
      item => {

        if (
          !item ||
          typeof item !== "object"
        ) {
          return null;
        }


        const timestamp =
          findValue(
            item,
            [
              "timestamp",
              "time",
              "date",
              "datetime",
              "datetime_utc",
            ]
          );


        const close =
          toNumber(
            findValue(
              item,
              [
                "close",
                "closingPrice",
                "price",
              ]
            )
          );


        const open =
          toNumber(
            findValue(
              item,
              [
                "open",
              ]
            )
          );


        const high =
          toNumber(
            findValue(
              item,
              [
                "high",
              ]
            )
          );


        const low =
          toNumber(
            findValue(
              item,
              [
                "low",
              ]
            )
          );


        const volume =
          toNumber(
            findValue(
              item,
              [
                "volume",
              ]
            )
          );


        if (
          timestamp === undefined ||
          close === null
        ) {
          return null;
        }


        let timeValue;


        if (
          typeof timestamp === "number"
        ) {

          timeValue =
            timestamp > 10000000000
              ? Math.floor(
                  timestamp / 1000
                )
              : timestamp;

        } else {

          timeValue =
            Math.floor(
              new Date(
                timestamp
              ).getTime() / 1000
            );

        }


        if (
          !Number.isFinite(
            timeValue
          )
        ) {
          return null;
        }


        return {

          time:
            timeValue,

          open:
            open ?? close,

          high:
            high ?? close,

          low:
            low ?? close,

          close,

          volume:
            volume ?? 0,

        };

      }
    )
    .filter(Boolean)
    .sort(
      (a, b) =>
        a.time - b.time
    );
}


/*
========================================================
NEWS
========================================================
*/

function normalizeNews(
  raw
) {

  let array =
    findArray(
      raw,
      [
        "news",
        "articles",
        "items",
        "results",
        "data",
      ]
    );


  if (
    !array &&
    Array.isArray(raw)
  ) {
    array = raw;
  }


  if (
    !Array.isArray(array)
  ) {
    return [];
  }


  return array
    .map(
      item => {

        if (
          !item ||
          typeof item !== "object"
        ) {
          return null;
        }


        return {

          id:
            findValue(
              item,
              [
                "id",
                "news_id",
                "newsId",
              ]
            ) || null,

          title:
            findValue(
              item,
              [
                "title",
                "headline",
              ]
            ) ||
            "Başlık bulunamadı",

          summary:
            findValue(
              item,
              [
                "summary",
                "description",
              ]
            ) || "",

          source:
            findValue(
              item,
              [
                "source",
                "publisher",
              ]
            ) || "",

          url:
            findValue(
              item,
              [
                "url",
                "link",
              ]
            ) || "",

          publishedDate:
            findValue(
              item,
              [
                "published_date",
                "publishedDate",
                "date",
              ]
            ) || "",

        };

      }
    )
    .filter(Boolean);
}


/*
========================================================
MARKET DATA
========================================================
*/

async function getMarketData(
  symbol
) {

  console.log(
    "========================================"
  );

  console.log(
    `MARKET REQUEST → ${symbol}`
  );

  console.log(
    "MCP MARKET CLIENT BAĞLANIYOR..."
  );


  const {
    client,
    transport,
  } =
    await createMcpClient(
      "borsaci-market-client"
    );


  try {

    console.log(
      "MCP MARKET CLIENT BAĞLANDI"
    );


    const cleanSymbol =
      symbol
        .trim()
        .toUpperCase();


    /*
     * QUOTE
     */

    let quoteRaw =
      null;


    try {

      console.log(
        `MARKET → get_quote başlıyor: ${cleanSymbol}`
      );


      quoteRaw =
        normalizeMcpResult(
          await callMcpTool(
            client,
            "get_quote",
            {
              symbol:
                cleanSymbol,

              market:
                "bist",
            }
          )
        );


      console.log(
        "MARKET → get_quote tamamlandı"
      );

    } catch (error) {

      console.error(
        "QUOTE ERROR:",
        error.message
      );

    }


    /*
     * TECHNICAL
     */

    let technicalRaw =
      null;


    try {

      console.log(
        "MARKET → get_technical_analysis başlıyor"
      );


      technicalRaw =
        normalizeMcpResult(
          await callMcpTool(
            client,
            "get_technical_analysis",
            {
              symbol:
                cleanSymbol,

              market:
                "bist",

              timeframe:
                "1d",
            }
          )
        );


      console.log(
        "MARKET → technical tamamlandı"
      );

    } catch (error) {

      console.error(
        "TECHNICAL ERROR:",
        error.message
      );

    }


    /*
     * HISTORY
     */

    let historyRaw =
      null;


    try {

      console.log(
        "MARKET → get_historical_data başlıyor"
      );


      historyRaw =
        normalizeMcpResult(
          await callMcpTool(
            client,
            "get_historical_data",
            {
              symbol:
                cleanSymbol,

              market:
                "bist",

              timeframe:
                "1d",

              limit:
                120,
            }
          )
        );


      console.log(
        "MARKET → history tamamlandı"
      );

    } catch (error) {

      console.error(
        "HISTORY ERROR:",
        error.message
      );

    }


    /*
     * NEWS
     */

    let newsRaw =
      null;


    try {

      console.log(
        "MARKET → get_news başlıyor"
      );


      newsRaw =
        normalizeMcpResult(
          await callMcpTool(
            client,
            "get_news",
            {
              symbol:
                cleanSymbol,

              limit:
                10,
            }
          )
        );


      console.log(
        "MARKET → news tamamlandı"
      );

    } catch (error) {

      console.error(
        "NEWS ERROR:",
        error.message
      );

    }


    /*
     * NORMALIZE
     */

    const quote =
      normalizeQuote(
        quoteRaw
      );


    const technical =
      normalizeTechnical(
        technicalRaw
      );


    const history =
      normalizeHistory(
        historyRaw
      );


    const news =
      normalizeNews(
        newsRaw
      );


    console.log(
      "========================================"
    );

    console.log(
      `MARKET DATA → ${cleanSymbol}`
    );

    console.log(
      "PRICE:",
      quote.price
    );

    console.log(
      "HISTORY:",
      history.length
    );

    console.log(
      "NEWS:",
      news.length
    );

    console.log(
      "RSI:",
      technical.rsi
    );

    console.log(
      "========================================"
    );


    return {

      symbol:
        cleanSymbol,

      quote,

      technical,

      history,

      news,

      timestamp:
        new Date().toISOString(),

    };

  } finally {

    console.log(
      "MCP MARKET CLIENT KAPATILIYOR..."
    );


    try {
      await transport.close();
    } catch (_) {}


    console.log(
      "MCP MARKET CLIENT KAPANDI"
    );

  }
}


/*
========================================================
AI ANALYSIS
========================================================
*/

async function analyze(
  question
) {

  const {
    client,
    transport,
  } =
    await createMcpClient(
      "openrouter-borsaci-server"
    );


  try {

    const toolResult =
      await client.listTools();


    console.log(
      "MCP TOOLS:",
      toolResult.tools.map(
        tool =>
          tool.name
      )
    );


    const tools =
      convertMcpToolsToOpenAITools(
        toolResult.tools
      );


    const messages = [

      {
        role:
          "system",

        content:
          SYSTEM_PROMPT,
      },

      {
        role:
          "user",

        content:
          question,
      },

    ];


    for (
      let step = 0;
      step < 6;
      step++
    ) {

      console.log(
        `AI STEP → ${step + 1}`
      );


      const response =
        await ai.chat.completions.create({

          model:
            MODEL,

          messages,

          tools,

          tool_choice:
            "auto",

          temperature:
            0.2,

        });


      const message =
        response
          .choices?.[0]
          ?.message;


      if (!message) {

        throw new Error(
          "OpenRouter cevap üretmedi."
        );

      }


      if (
        !message.tool_calls ||
        message.tool_calls.length === 0
      ) {

        return (
          message.content ||
          "Analiz sonucu alınamadı."
        );

      }


      messages.push(
        message
      );


      for (
        const toolCall
        of message.tool_calls
      ) {

        const functionName =
          toolCall.function.name;


        let argumentsObject =
          {};


        try {

          argumentsObject =
            JSON.parse(
              toolCall
                .function
                .arguments ||
              "{}"
            );

        } catch (error) {

          console.error(
            "Tool arguments JSON hatası:",
            error.message
          );

        }


        try {

          const result =
            await callMcpTool(
              client,
              functionName,
              argumentsObject
            );


          messages.push({

            role:
              "tool",

            tool_call_id:
              toolCall.id,

            content:
              JSON.stringify(
                result
              ),

          });

        } catch (error) {

          console.error(
            `MCP ${functionName} hatası:`,
            error.message
          );


          messages.push({

            role:
              "tool",

            tool_call_id:
              toolCall.id,

            content:
              JSON.stringify({
                error:
                  error.message,
              }),

          });

        }

      }

    }


    throw new Error(
      "Maksimum MCP adımına ulaşıldı."
    );

  } finally {

    try {
      await transport.close();
    } catch (_) {}

  }
}


/*
========================================================
FRONTEND
========================================================
*/

const HTML = `

<!DOCTYPE html>

<html lang="tr">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<title>
BORSACI // AI TRADING TERMINAL
</title>


<style>

* {
  box-sizing: border-box;
}

body {

  margin: 0;

  background: #050807;

  color: #d8ffe8;

  font-family:
    "Courier New",
    monospace;

}

button,
textarea {

  font-family:
    inherit;

}

.terminal {

  width: 100%;

  max-width: 1500px;

  margin: auto;

  padding: 15px;

}

.topbar {

  display: grid;

  grid-template-columns:
    1fr auto auto;

  gap: 30px;

  padding: 15px;

  border:
    1px solid #183d2a;

  background: #08100c;

}

.brand {

  font-size: 20px;

  font-weight: bold;

}

.brand span {

  font-size: 11px;

  opacity: .5;

}

.system-status {

  color: #55ff99;

}

.status-dot {

  display: inline-block;

  width: 8px;

  height: 8px;

  border-radius: 50%;

  background: #55ff99;

}

.market-bar {

  display: grid;

  grid-template-columns:
    repeat(3, 1fr);

  margin-top: 10px;

  border:
    1px solid #183d2a;

}

.market-bar > div {

  padding: 12px;

  border-right:
    1px solid #183d2a;

}

.market-bar strong {

  display: block;

  margin-top: 5px;

}

.online {

  color: #55ff99;

}

.dashboard {

  display: grid;

  grid-template-columns:
    280px
    1fr
    320px;

  gap: 10px;

  margin-top: 10px;

}

.panel {

  border:
    1px solid #183d2a;

  background: #08100c;

  min-width: 0;

}

.panel-title {

  display: flex;

  justify-content: space-between;

  padding: 12px;

  border-bottom:
    1px solid #183d2a;

  font-size: 12px;

}

.panel-status {

  opacity: .5;

}

.watchlist {

  grid-row:
    span 2;

}

.watchlist-body {

  min-height: 300px;

}

.watchlist-empty,
.chart-empty,
.empty-state,
.ai-empty,
.portfolio-empty {

  display: flex;

  flex-direction: column;

  align-items: center;

  justify-content: center;

  min-height: 220px;

  gap: 8px;

  opacity: .6;

  text-align: center;

}

.watchlist-empty small,
.chart-empty small,
.empty-state small,
.ai-empty small,
.portfolio-empty small {

  font-size: 10px;

}

.empty-icon {

  font-size: 25px;

}

.mini-button,
#analyzeBtn {

  background: #0b2115;

  color: #65ff9d;

  border:
    1px solid #285b3c;

  padding: 7px 10px;

  cursor: pointer;

}

.watch-row {

  display: grid;

  grid-template-columns:
    1fr 30px;

  border-bottom:
    1px solid #10291c;

}

.symbol-button {

  display: flex;

  justify-content: space-between;

  align-items: center;

  background: transparent;

  color: #d8ffe8;

  border: 0;

  padding: 12px;

  cursor: pointer;

  text-align: left;

}

.symbol-button:hover {

  background: #0c1c13;

}

.symbol-price {

  display: flex;

  flex-direction: column;

  align-items: flex-end;

  color: #55ff99;

}

.symbol-price small {

  font-size: 9px;

  opacity: .7;

}

.remove-symbol {

  background: transparent;

  color: #777;

  border: 0;

  cursor: pointer;

  font-size: 18px;

}

.chart {

  min-height: 420px;

}

.chart-area {

  position: relative;

  min-height: 365px;

  overflow: hidden;

}

.chart-grid {

  position: absolute;

  inset: 0;

  background-image:
    linear-gradient(
      rgba(80,255,150,.05) 1px,
      transparent 1px
    ),
    linear-gradient(
      90deg,
      rgba(80,255,150,.05) 1px,
      transparent 1px
    );

  background-size:
    50px 50px;

}

.market-svg {

  position: absolute;

  inset: 0;

  width: 100%;

  height: 100%;

  color: #55ff99;

}

.chart-last-price {

  position: absolute;

  right: 15px;

  top: 15px;

  color: #55ff99;

  font-size: 18px;

  font-weight: bold;

}

.news {

  grid-row:
    span 2;

}

.news-list {

  padding: 10px;

}

.news-item {

  padding: 10px;

  border-bottom:
    1px solid #10291c;

}

.news-item strong {

  display: block;

  font-size: 12px;

}

.news-item small {

  display: block;

  margin-top: 5px;

  opacity: .5;

}

.technical {

  grid-column:
    2;

}

.technical-grid {

  display: grid;

  grid-template-columns:
    repeat(3, 1fr);

}

.indicator {

  padding: 20px;

  border-right:
    1px solid #183d2a;

  border-bottom:
    1px solid #183d2a;

}

.indicator span {

  display: block;

  opacity: .5;

  font-size: 10px;

}

.indicator strong {

  display: block;

  margin-top: 7px;

  font-size: 18px;

}

.ai-analysis {

  grid-column:
    1 / 3;

}

.ai-result {

  display: grid;

  grid-template-columns:
    1fr 1fr;

  border-top:
    1px solid #183d2a;

}

.ai-result > div {

  padding: 20px;

}

.ai-result span {

  display: block;

  opacity: .5;

  font-size: 10px;

}

.ai-result strong {

  font-size: 20px;

}

.news-impact {

  grid-column:
    1 / 3;

}

.portfolio {

  grid-column:
    1 / 4;

}

.command-panel {

  margin-top: 10px;

  border:
    1px solid #183d2a;

  background: #08100c;

}

.command-header {

  display: flex;

  justify-content: space-between;

  padding: 12px;

  border-bottom:
    1px solid #183d2a;

}

.command-title span {

  color: #55ff99;

}

.command-status {

  color: #55ff99;

}

#question {

  width: 100%;

  min-height: 100px;

  resize: vertical;

  padding: 15px;

  background: #030604;

  color: #d8ffe8;

  border: 0;

  outline: none;

}

.command-footer {

  display: flex;

  justify-content: space-between;

  align-items: center;

  padding: 10px;

  border-top:
    1px solid #183d2a;

}

.shortcuts {

  opacity: .4;

  font-size: 10px;

}

.response-panel {

  margin-top: 10px;

}

#response {

  padding: 15px;

  min-height: 150px;

  white-space: pre-wrap;

  overflow-x: auto;

}

.footer {

  padding: 20px;

  text-align: center;

  opacity: .4;

  font-size: 10px;

}

@media (
  max-width: 1000px
) {

  .dashboard {

    grid-template-columns:
      1fr 1fr;

  }

  .watchlist,
  .news {

    grid-row: auto;

  }

  .technical,
  .ai-analysis,
  .news-impact,
  .portfolio {

    grid-column:
      auto;

  }

}

@media (
  max-width: 650px
) {

  .dashboard {

    grid-template-columns:
      1fr;

  }

  .topbar {

    grid-template-columns:
      1fr;

  }

}

</style>

</head>


<body>

<div class="terminal">


<header class="topbar">

  <div class="brand">

    BORSACI
    <span>v1.0.0</span>

  </div>

  <div class="system-status">

    <span class="status-dot"></span>

    SYSTEM READY

  </div>

  <div
    class="clock"
    id="clock"
  >
    --:--:--
  </div>

</header>


<div class="market-bar">

  <div>
    MARKET
    <strong>BIST</strong>
  </div>

  <div>
    STATUS
    <strong class="online">
      ● ONLINE
    </strong>
  </div>

  <div>
    DATA
    <strong id="dataStatus">
      WAITING
    </strong>
  </div>

</div>


<main class="dashboard">


<section class="panel watchlist">

  <div class="panel-title">

    <span>
      WATCHLIST
    </span>

    <button
      class="mini-button"
      id="addSymbolBtn"
    >
      + ADD
    </button>

  </div>


  <div
    class="watchlist-body"
    id="watchlist"
  >

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

  </div>

</section>


<section class="panel chart">

  <div class="panel-title">

    <span>
      MARKET CHART
    </span>

    <span
      class="panel-status"
      id="chartSymbol"
    >
      NO SYMBOL
    </span>

  </div>


  <div
    class="chart-area"
    id="chartArea"
  >

    <div class="chart-grid"></div>

    <div class="chart-empty">

      <span>
        NO MARKET DATA
      </span>

      <small>
        Select a symbol to display the chart.
      </small>

    </div>

  </div>

</section>


<section class="panel news">

  <div class="panel-title">

    <span>
      NEWS FEED
    </span>

    <span class="panel-status">
      LIVE
    </span>

  </div>


  <div
    class="empty-state"
    id="newsContent"
  >

    <span>
      NO NEWS LOADED
    </span>

    <small>
      Waiting for news source...
    </small>

  </div>

</section>


<section class="panel technical">

  <div class="panel-title">

    TECHNICAL ANALYSIS

  </div>


  <div class="technical-grid">

    <div class="indicator">

      <span>RSI</span>

      <strong id="rsi">
        --
      </strong>

    </div>


    <div class="indicator">

      <span>MACD</span>

      <strong id="macd">
        --
      </strong>

    </div>


    <div class="indicator">

      <span>EMA 20</span>

      <strong id="ema20">
        --
      </strong>

    </div>


    <div class="indicator">

      <span>EMA 50</span>

      <strong id="ema50">
        --
      </strong>

    </div>


    <div class="indicator">

      <span>VOLUME</span>

      <strong id="volume">
        --
      </strong>

    </div>


    <div class="indicator">

      <span>ATR</span>

      <strong id="atr">
        --
      </strong>

    </div>

  </div>

</section>


<section class="panel ai-analysis">

  <div class="panel-title">

    <span>
      AI ANALYSIS
    </span>

    <span class="panel-status">
      AI
    </span>

  </div>


  <div
    class="ai-empty"
    id="aiEmpty"
  >

    <div class="ai-symbol">
      AI
    </div>

    <span>
      WAITING FOR ANALYSIS
    </span>

    <small>
      Ask BorsaCI to analyze a symbol.
    </small>

  </div>


  <div class="ai-result">

    <div>

      <span>
        SIGNAL
      </span>

      <strong id="signal">
        --
      </strong>

    </div>


    <div>

      <span>
        CONFIDENCE
      </span>

      <strong id="confidence">
        --
      </strong>

    </div>

  </div>

</section>


<section class="panel news-impact">

  <div class="panel-title">

    NEWS IMPACT

  </div>


  <div
    class="empty-state"
    id="newsImpact"
  >

    <span>
      NO NEWS DATA
    </span>

    <small>
      News impact will appear here.
    </small>

  </div>

</section>


<section class="panel portfolio">

  <div class="panel-title">

    <span>
      PORTFOLIO
    </span>

    <span class="panel-status">
      EMPTY
    </span>

  </div>


  <div class="portfolio-empty">

    <span>
      NO PORTFOLIO DATA
    </span>

    <small>
      Portfolio positions will appear here.
    </small>

  </div>

</section>


</main>


<section class="command-panel">

  <div class="command-header">

    <div class="command-title">

      <span>&gt;</span>
      BORSACI TERMINAL

    </div>

    <div class="command-status">
      READY
    </div>

  </div>


  <textarea
    id="question"
    placeholder="Type your command or question..."
    spellcheck="false"
  ></textarea>


  <div class="command-footer">

    <div class="shortcuts">

      [ENTER] ANALYZE
      &nbsp;&nbsp;
      [SHIFT+ENTER] NEW LINE
      &nbsp;&nbsp;
      [ESC] CLEAR

    </div>


    <button id="analyzeBtn">
      ANALYZE
    </button>

  </div>

</section>


<section
  class="response-panel panel"
>

  <div class="panel-title">

    <span>
      AI RESPONSE
    </span>

    <span class="panel-status">
      OUTPUT
    </span>

  </div>


  <pre id="response">
Waiting for input...
  </pre>

</section>


<footer class="footer">

  BORSACI AI TERMINAL
  <span>•</span>
  MCP DATA ENGINE
  <span>•</span>
  SYSTEM READY

</footer>


</div>


<script>

const questionInput =
  document.getElementById(
    "question"
  );

const analyzeBtn =
  document.getElementById(
    "analyzeBtn"
  );

const responseBox =
  document.getElementById(
    "response"
  );

const addSymbolBtn =
  document.getElementById(
    "addSymbolBtn"
  );

const watchlist =
  document.getElementById(
    "watchlist"
  );

const chartSymbol =
  document.getElementById(
    "chartSymbol"
  );

const chartArea =
  document.getElementById(
    "chartArea"
  );


/*
========================================================
STATE
========================================================
*/

let symbols = [];

const marketCache = {};


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
    new Date()
      .toLocaleTimeString(
        "tr-TR"
      );

}

updateClock();

setInterval(
  updateClock,
  1000
);


/*
========================================================
FORMAT
========================================================
*/

function formatNumber(
  value,
  decimals = 2
) {

  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(
      Number(value)
    )
  ) {

    return "--";

  }

  return Number(value)
    .toLocaleString(
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
LOAD MARKET
========================================================
*/

async function loadMarket(
  symbol
) {

  console.log(
    "FRONTEND → MARKET:",
    symbol
  );


  try {

    const response =
      await fetch(
        `/market?symbol=${encodeURIComponent(symbol)}`
      );


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data.error ||
        "Market verisi alınamadı."
      );

    }


    console.log(
      "FRONTEND ← MARKET:",
      data
    );


    marketCache[symbol] =
      data;


    return data;

  } catch (error) {

    console.error(
      "MARKET LOAD ERROR:",
      error
    );

    return null;

  }

}


/*
========================================================
WATCHLIST
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


  watchlist.innerHTML =
    "";


  symbols.forEach(
    (symbol, index) => {

      const data =
        marketCache[
          symbol
        ];


      const price =
        data?.quote?.price;


      const change =
        data?.quote?.changePercent;


      const row =
        document.createElement(
          "div"
        );


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

            ${
              price !== undefined &&
              price !== null
                ? formatNumber(
                    price
                  )
                : "--"
            }

            <small>

              ${
                change !== undefined &&
                change !== null
                  ? formatNumber(
                      change
                    ) + "%"
                  : ""
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
      button => {

        button.onclick =
          async () => {

            const index =
              Number(
                button.dataset.index
              );


            await selectSymbol(
              symbols[index]
            );

          };

      }
    );


  document
    .querySelectorAll(
      ".remove-symbol"
    )
    .forEach(
      button => {

        button.onclick =
          event => {

            event.stopPropagation();


            const index =
              Number(
                button.dataset.index
              );


            symbols.splice(
              index,
              1
            );


            renderWatchlist();

          };

      }
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

  chartSymbol.innerText =
    `${symbol} / LOADING`;


  let data =
    marketCache[
      symbol
    ];


  if (!data) {

    data =
      await loadMarket(
        symbol
      );

  }


  if (!data) {

    chartSymbol.innerText =
      `${symbol} / ERROR`;

    return;

  }


  chartSymbol.innerText =
    symbol;


  updateDashboard(
    data
  );


  renderWatchlist();

}


/*
========================================================
DASHBOARD
========================================================
*/

function updateDashboard(
  data
) {

  const quote =
    data.quote || {};

  const technical =
    data.technical || {};


  document.getElementById(
    "rsi"
  ).innerText =
    formatNumber(
      technical.rsi
    );


  document.getElementById(
    "macd"
  ).innerText =
    formatNumber(
      technical.macd
    );


  document.getElementById(
    "ema20"
  ).innerText =
    formatNumber(
      technical.ema20
    );


  document.getElementById(
    "ema50"
  ).innerText =
    formatNumber(
      technical.ema50
    );


  document.getElementById(
    "volume"
  ).innerText =
    formatNumber(
      quote.volume,
      0
    );


  document.getElementById(
    "atr"
  ).innerText =
    formatNumber(
      technical.atr
    );


  const status =
    document.getElementById(
      "dataStatus"
    );


  if (status) {

    status.innerText =
      quote.price !== null &&
      quote.price !== undefined
        ? "LIVE"
        : "ERROR";

  }


  renderChart(
    data.history || []
  );


  renderNews(
    data.news || []
  );

}


/*
========================================================
CHART
========================================================
*/

function renderChart(
  history
) {

  if (!chartArea) return;


  if (
    !Array.isArray(history) ||
    history.length < 2
  ) {

    chartArea.innerHTML = `

      <div class="chart-grid"></div>

      <div class="chart-empty">

        <span>
          NO HISTORICAL DATA
        </span>

        <small>
          MCP historical data bulunamadı.
        </small>

      </div>

    `;

    return;

  }


  const points =
    history
      .slice(-120)
      .filter(
        item =>
          Number.isFinite(
            Number(
              item.close
            )
          )
      );


  if (
    points.length < 2
  ) {
    return;
  }


  const width = 1000;

  const height = 360;

  const padding = 30;


  const values =
    points.map(
      item =>
        Number(
          item.close
        )
    );


  const min =
    Math.min(
      ...values
    );

  const max =
    Math.max(
      ...values
    );


  const range =
    max - min || 1;


  const coords =
    points
      .map(
        (item, index) => {

          const x =
            padding +
            (
              index /
              (
                points.length - 1
              )
            ) *
            (
              width -
              padding * 2
            );


          const y =
            height -
            padding -
            (
              (
                Number(
                  item.close
                ) -
                min
              ) /
              range
            ) *
            (
              height -
              padding * 2
            );


          return `${x},${y}`;

        }
      )
      .join(" ");


  const last =
    values[
      values.length - 1
    ];


  chartArea.innerHTML = `

    <div class="chart-grid"></div>

    <svg
      class="market-svg"
      viewBox="0 0 ${width} ${height}"
      preserveAspectRatio="none"
    >

      <polyline
        points="${coords}"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
        vector-effect="non-scaling-stroke"
      />

    </svg>


    <div class="chart-last-price">

      ${formatNumber(last)}

    </div>

  `;

}


/*
========================================================
NEWS
========================================================
*/

function renderNews(
  news
) {

  const box =
    document.getElementById(
      "newsContent"
    );


  if (!box) return;


  if (
    !Array.isArray(news) ||
    news.length === 0
  ) {

    box.innerHTML = `

      <span>
        NO NEWS LOADED
      </span>

      <small>
        No MCP news data.
      </small>

    `;

    return;

  }


  box.outerHTML = `

    <div
      class="news-list"
      id="newsContent"
    >

      ${
        news
          .slice(0, 5)
          .map(
            item => `

              <div class="news-item">

                <strong>
                  ${
                    item.title ||
                    "Başlık bulunamadı"
                  }
                </strong>

                <small>
                  ${
                    item.source ||
                    ""
                  }
                </small>

              </div>

            `
          )
          .join("")
      }

    </div>

  `;

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
    input
      .trim()
      .toUpperCase();


  if (!symbol) {
    return;
  }


  if (
    symbols.includes(
      symbol
    )
  ) {

    alert(
      `${symbol} zaten watchlist'te.`
    );

    return;

  }


  symbols.push(
    symbol
  );


  renderWatchlist();


  /*
   * MCP'DEN HEMEN VERİ ÇEK
   */

  const data =
    await loadMarket(
      symbol
    );


  if (data) {

    renderWatchlist();

    await selectSymbol(
      symbol
    );

  }

}


addSymbolBtn.onclick =
  addSymbol;


/*
========================================================
ENTER / ESC
========================================================
*/

questionInput.addEventListener(
  "keydown",
  event => {

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

      questionInput.value =
        "";

    }

  }
);


/*
========================================================
AI
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
          method:
            "POST",

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
INITIAL
========================================================
*/

renderWatchlist();


</script>

</body>

</html>

`;


/*
========================================================
HTTP SERVER
========================================================
*/

const server =
  http.createServer(
    async (
      req,
      res
    ) => {

      /*
      ========================================
      CORS
      ========================================
      */

      res.setHeader(
        "Access-Control-Allow-Origin",
        "*"
      );


      /*
      ========================================
      ROOT
      ========================================
      */

      if (
        req.method === "GET" &&
        req.url === "/"
      ) {

        res.writeHead(
          200,
          {
            "Content-Type":
              "text/html; charset=utf-8",
          }
        );


        res.end(
          HTML
        );


        return;

      }


      /*
      ========================================
      MARKET
      ========================================
      */

      if (
        req.method === "GET" &&
        req.url.startsWith(
          "/market"
        )
      ) {

        try {

          const url =
            new URL(
              req.url,
              `http://${req.headers.host}`
            );


          const symbol =
            url.searchParams
              .get("symbol")
              ?.trim()
              .toUpperCase();


          if (!symbol) {

            res.writeHead(
              400,
              {
                "Content-Type":
                  "application/json; charset=utf-8",
              }
            );


            res.end(
              JSON.stringify({
                error:
                  "symbol parametresi gerekli.",
              })
            );


            return;

          }


          console.log(
            `MARKET REQUEST → ${symbol}`
          );


          const data =
            await getMarketData(
              symbol
            );


          res.writeHead(
            200,
            {
              "Content-Type":
                "application/json; charset=utf-8",
            }
          );


          res.end(
            JSON.stringify(
              data
            )
          );


        } catch (error) {

          console.error(
            "MARKET ERROR:",
            error
          );


          res.writeHead(
            500,
            {
              "Content-Type":
                "application/json; charset=utf-8",
            }
          );


          res.end(
            JSON.stringify({
              error:
                error.message,
            })
          );

        }


        return;

      }


      /*
      ========================================
      ASK
      ========================================
      */

      if (
        req.method === "POST" &&
        req.url === "/ask"
      ) {

        let body = "";


        req.on(
          "data",
          chunk => {

            body += chunk;

          }
        );


        req.on(
          "end",
          async () => {

            try {

              const data =
                JSON.parse(
                  body
                );


              if (
                !data.question
              ) {

                throw new Error(
                  "question alanı gerekli."
                );

              }


              console.log(
                `Soru: ${data.question}`
              );


              const answer =
                await analyze(
                  data.question
                );


              res.writeHead(
                200,
                {
                  "Content-Type":
                    "application/json; charset=utf-8",
                }
              );


              res.end(
                JSON.stringify({
                  answer,
                })
              );


            } catch (error) {

              console.error(
                "Analiz hatası:",
                error
              );


              res.writeHead(
                500,
                {
                  "Content-Type":
                    "application/json; charset=utf-8",
                }
              );


              res.end(
                JSON.stringify({
                  error:
                    error.message,
                })
              );

            }

          }
        );


        return;

      }


      /*
      ========================================
      404
      ========================================
      */

      res.writeHead(
        404,
        {
          "Content-Type":
            "text/plain; charset=utf-8",
        }
      );


      res.end(
        "Not Found"
      );

    }
  );


/*
========================================================
SERVER START
========================================================
*/

server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `BorsaCI server ${PORT} portunda çalışıyor.`
    );

    console.log(
      `OpenRouter model: ${MODEL}`
    );

    console.log(
      "MCP_URL:",
      process.env.MCP_URL
        ? "DEFINED"
        : "MISSING"
    );

  }
);