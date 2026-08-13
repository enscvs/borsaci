require("dotenv").config();

const http = require("http");
const path = require("path");
const fs = require("fs");

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
            (item) =>
              typeof item === "object"
                ? cleanSchema(item)
                : item
          );

      } else {

        result[key] =
          cleanSchema(value);

      }

    } else {

      result[key] = value;

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
    (tool) => ({

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

      version:
        "1.0.0",

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

      arguments:
        args,

    });


  console.log(
    `MCP ← ${name} tamamlandı`
  );


  return result;
}


/*
========================================================
MCP SONUCUNU NORMALLEŞTİR
========================================================
*/

function normalizeMcpResult(
  result
) {

  if (!result) {
    return null;
  }


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
RECURSIVE VALUE SEARCH
========================================================
*/

function findValue(
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
      (x) =>
        x.toLowerCase()
    );


  /*
   * Önce mevcut seviye
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
   * Sonra alt objeler
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
RECURSIVE ARRAY SEARCH
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
      (x) =>
        x.toLowerCase()
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


      if (found) {
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
    typeof value === "string"
  ) {

    let text =
      value.trim();


    /*
     * Türkçe / İngilizce sayı
     */

    text =
      text.replace(
        /[^\d.,-]/g,
        ""
      );


    /*
     * 1.234,56
     */

    if (
      text.includes(",") &&
      text.includes(".")
    ) {

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

    }


    /*
     * 123,45
     */

    else if (
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


  return null;
}


/*
========================================================
QUOTE NORMALIZER
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
TECHNICAL NORMALIZER
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


    sma20:
      toNumber(
        findValue(
          raw,
          [
            "sma20",
            "SMA20",
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
HISTORY NORMALIZER
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
      (item) => {

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
          typeof timestamp ===
          "number"
        ) {

          timeValue =
            timestamp >
            10000000000
              ? Math.floor(
                  timestamp / 1000
                )
              : timestamp;

        } else {

          const parsed =
            Math.floor(
              new Date(
                timestamp
              ).getTime() /
                1000
            );


          timeValue =
            parsed;

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
NEWS NORMALIZER
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
      (item) => {

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

  console.log(
    "========================================"
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
    ========================================
    QUOTE
    ========================================
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
    ========================================
    TECHNICAL
    ========================================
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
    ========================================
    HISTORY
    ========================================
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
    ========================================
    NEWS
    ========================================
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
    ========================================
    NORMALIZE
    ========================================
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


    /*
    ========================================
    LOG
    ========================================
    */

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


    /*
    ========================================
    RETURN
    ========================================
    */

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
        (tool) =>
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


    /*
    ========================================
    AI TOOL LOOP
    ========================================
    */

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


      /*
      ========================================
      FINAL RESPONSE
      ========================================
      */

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


      /*
      ========================================
      TOOL CALLS
      ========================================
      */

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
STATIC FILE
========================================================
*/

function serveFile(
  res,
  filePath,
  contentType
) {

  fs.readFile(
    filePath,
    (error, data) => {

      if (error) {

        console.error(
          "FILE ERROR:",
          filePath,
          error.message
        );


        res.writeHead(
          404,
          {
            "Content-Type":
              "text/plain; charset=utf-8",
          }
        );


        res.end(
          "File not found"
        );


        return;

      }


      res.writeHead(
        200,
        {
          "Content-Type":
            contentType,
        }
      );


      res.end(
        data
      );

    }
  );
}


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
      ROOT
      ========================================
      */

      if (
        req.method === "GET" &&
        req.url === "/"
      ) {

        serveFile(

          res,

          path.join(
            __dirname,
            "public",
            "index.html"
          ),

          "text/html; charset=utf-8"

        );

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

        let body =
          "";


        req.on(
          "data",
          (chunk) => {

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
      STYLE.CSS
      ========================================
      */

      if (
        req.method === "GET" &&
        req.url === "/style.css"
      ) {

        serveFile(

          res,

          path.join(
            __dirname,
            "public",
            "style.css"
          ),

          "text/css; charset=utf-8"

        );

        return;

      }


      /*
      ========================================
      APP.JS
      ========================================
      */

      if (
        req.method === "GET" &&
        req.url === "/app.js"
      ) {

        serveFile(

          res,

          path.join(
            __dirname,
            "public",
            "app.js"
          ),

          "application/javascript; charset=utf-8"

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