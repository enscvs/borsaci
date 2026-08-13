require("dotenv").config();

const http = require("http");
const path = require("path");
const fs = require("fs");

const OpenAI = require("openai");

const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const {
  StreamableHTTPClientTransport,
} = require("@modelcontextprotocol/sdk/client/streamableHttp.js");

const PORT = process.env.PORT || 3000;

/*
========================================================
OPENROUTER
========================================================
*/

const ai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
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

Güncel veri gerekiyorsa MCP araçlarını kullan.

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
5. önemli haber varsa haber detayları
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
  if (!schema || typeof schema !== "object") {
    return schema;
  }

  const unsupported = [
    "examples",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "const",
  ];

  const result = {};

  for (const [key, value] of Object.entries(schema)) {
    if (unsupported.includes(key)) {
      continue;
    }

    if (value && typeof value === "object") {
      if (Array.isArray(value)) {
        result[key] = value.map((item) =>
          typeof item === "object"
            ? cleanSchema(item)
            : item
        );
      } else {
        result[key] = cleanSchema(value);
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

function convertMcpToolsToOpenAITools(tools) {
  return tools.map((tool) => ({
    type: "function",

    function: {
      name: tool.name,
      description: tool.description || "",

      parameters: cleanSchema(
        tool.inputSchema || {
          type: "object",
          properties: {},
        }
      ),
    },
  }));
}

/*
========================================================
MCP CLIENT
========================================================
*/

async function createMcpClient(name = "borsaci-client") {
  if (!process.env.MCP_URL) {
    throw new Error("MCP_URL environment variable bulunamadı.");
  }

  const transport =
    new StreamableHTTPClientTransport(
      new URL(process.env.MCP_URL)
    );

  const client =
    new Client({
      name,
      version: "1.0.0",
    });

  await client.connect(transport);

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

async function callMcpTool(client, name, args) {
  console.log(
    `MCP → ${name}`,
    args
  );

  return await client.callTool({
    name,
    arguments: args,
  });
}

/*
========================================================
MCP SONUCUNU NORMALLEŞTİR
========================================================
*/

function normalizeMcpResult(result) {
  if (!result) {
    return null;
  }

  /*
   * MCP bazen content[0].text içinde JSON döndürüyor.
   */

  if (
    result.content &&
    Array.isArray(result.content)
  ) {
    for (const item of result.content) {
      if (
        item &&
        item.type === "text" &&
        typeof item.text === "string"
      ) {
        const text = item.text.trim();

        try {
          return JSON.parse(text);
        } catch (_) {
          /*
           * JSON değilse text olarak sakla.
           */
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
RECURSIVE SEARCH HELPERS
========================================================
*/

function findValue(obj, possibleKeys) {
  if (!obj || typeof obj !== "object") {
    return undefined;
  }

  const wanted =
    possibleKeys.map((x) =>
      x.toLowerCase()
    );

  /*
   * Önce mevcut seviyeye bak.
   */

  for (const key of Object.keys(obj)) {
    if (
      wanted.includes(
        key.toLowerCase()
      )
    ) {
      return obj[key];
    }
  }

  /*
   * Sonra alt objelere bak.
   */

  for (const value of Object.values(obj)) {
    if (
      value &&
      typeof value === "object"
    ) {
      const found =
        findValue(
          value,
          possibleKeys
        );

      if (found !== undefined) {
        return found;
      }
    }
  }

  return undefined;
}

function findArray(obj, possibleKeys) {
  if (!obj || typeof obj !== "object") {
    return undefined;
  }

  const wanted =
    possibleKeys.map((x) =>
      x.toLowerCase()
    );

  for (const key of Object.keys(obj)) {
    if (
      wanted.includes(
        key.toLowerCase()
      ) &&
      Array.isArray(obj[key])
    ) {
      return obj[key];
    }
  }

  for (const value of Object.values(obj)) {
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

function toNumber(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value)
      ? value
      : null;
  }

  if (typeof value === "string") {
    const cleaned =
      value
        .replace(/[^\d.,-]/g, "")
        .replace(/\./g, "")
        .replace(",", ".");

    const number =
      Number(cleaned);

    return Number.isFinite(number)
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

function normalizeQuote(raw) {
  return {
    price: toNumber(
      findValue(raw, [
        "price",
        "currentPrice",
        "last",
        "lastPrice",
        "close",
      ])
    ),

    change: toNumber(
      findValue(raw, [
        "change",
        "dailyChange",
        "priceChange",
        "changePercent",
      ])
    ),

    changePercent: toNumber(
      findValue(raw, [
        "changePercent",
        "percentChange",
        "dailyChangePercent",
      ])
    ),

    volume: toNumber(
      findValue(raw, [
        "volume",
        "dailyVolume",
      ])
    ),

    marketCap: toNumber(
      findValue(raw, [
        "marketCap",
        "marketCapitalization",
      ])
    ),

    high52: toNumber(
      findValue(raw, [
        "52WeekHigh",
        "week52High",
        "high52",
        "fiftyTwoWeekHigh",
      ])
    ),

    low52: toNumber(
      findValue(raw, [
        "52WeekLow",
        "week52Low",
        "low52",
        "fiftyTwoWeekLow",
      ])
    ),

    raw,
  };
}

/*
========================================================
TECHNICAL NORMALIZER
========================================================
*/

function normalizeTechnical(raw) {
  return {
    rsi: toNumber(
      findValue(raw, [
        "rsi",
        "RSI",
        "rsi14",
      ])
    ),

    macd: toNumber(
      findValue(raw, [
        "macd",
        "MACD",
      ])
    ),

    macdHistogram: toNumber(
      findValue(raw, [
        "macdHistogram",
        "histogram",
        "MACDHistogram",
      ])
    ),

    ema20: toNumber(
      findValue(raw, [
        "ema20",
        "EMA20",
        "ema_20",
      ])
    ),

    ema50: toNumber(
      findValue(raw, [
        "ema50",
        "EMA50",
        "ema_50",
      ])
    ),

    sma20: toNumber(
      findValue(raw, [
        "sma20",
        "SMA20",
      ])
    ),

    atr: toNumber(
      findValue(raw, [
        "atr",
        "ATR",
      ])
    ),

    trend:
      findValue(raw, [
        "trend",
        "Trend",
      ]) || null,

    raw,
  };
}

/*
========================================================
HISTORICAL DATA NORMALIZER
========================================================
*/

function normalizeHistory(raw) {
  let array =
    findArray(raw, [
      "data",
      "history",
      "historical",
      "prices",
      "candles",
      "results",
    ]);

  if (!array && Array.isArray(raw)) {
    array = raw;
  }

  if (!Array.isArray(array)) {
    return [];
  }

  return array
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const timestamp =
        findValue(item, [
          "timestamp",
          "time",
          "date",
          "datetime",
        ]);

      const close =
        toNumber(
          findValue(item, [
            "close",
            "closingPrice",
            "price",
          ])
        );

      const open =
        toNumber(
          findValue(item, [
            "open",
          ])
        );

      const high =
        toNumber(
          findValue(item, [
            "high",
          ])
        );

      const low =
        toNumber(
          findValue(item, [
            "low",
          ])
        );

      const volume =
        toNumber(
          findValue(item, [
            "volume",
          ])
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
        /*
         * saniye veya milisaniye
         */

        timeValue =
          timestamp > 10000000000
            ? Math.floor(timestamp / 1000)
            : timestamp;
      } else {
        const parsed =
          Math.floor(
            new Date(timestamp).getTime() /
              1000
          );

        timeValue = parsed;
      }

      if (!Number.isFinite(timeValue)) {
        return null;
      }

      return {
        time: timeValue,
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
    })
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

function normalizeNews(raw) {
  let array =
    findArray(raw, [
      "news",
      "articles",
      "items",
      "results",
      "data",
    ]);

  if (!array && Array.isArray(raw)) {
    array = raw;
  }

  if (!Array.isArray(array)) {
    return [];
  }

  return array
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      return {
        id:
          findValue(item, [
            "id",
            "news_id",
            "newsId",
          ]) || null,

        title:
          findValue(item, [
            "title",
            "headline",
          ]) || "Başlık bulunamadı",

        summary:
          findValue(item, [
            "summary",
            "description",
          ]) || "",

        source:
          findValue(item, [
            "source",
            "publisher",
          ]) || "",

        url:
          findValue(item, [
            "url",
            "link",
          ]) || "",

        publishedDate:
          findValue(item, [
            "published_date",
            "publishedDate",
            "date",
          ]) || "",
      };
    })
    .filter(Boolean);
}

/*
========================================================
MARKET DATA
========================================================
*/

async function getMarketData(symbol) {
  const {
    client,
    transport,
  } =
    await createMcpClient(
      "borsaci-market-client"
    );

  try {
    const cleanSymbol =
      symbol
        .trim()
        .toUpperCase();

    /*
     * QUOTE
     */

    let quoteRaw = null;

    try {
      quoteRaw =
        normalizeMcpResult(
          await callMcpTool(
            client,
            "get_quote",
            {
              symbol: cleanSymbol,
              market: "bist",
            }
          )
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

    let technicalRaw = null;

    try {
      technicalRaw =
        normalizeMcpResult(
          await callMcpTool(
            client,
            "get_technical_analysis",
            {
              symbol: cleanSymbol,
              market: "bist",
              timeframe: "1d",
            }
          )
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

    let historyRaw = null;

    try {
      historyRaw =
        normalizeMcpResult(
          await callMcpTool(
            client,
            "get_historical_data",
            {
              symbol: cleanSymbol,
              market: "bist",
              timeframe: "1d",
              limit: 120,
            }
          )
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

    let newsRaw = null;

    try {
      newsRaw =
        normalizeMcpResult(
          await callMcpTool(
            client,
            "get_news",
            {
              symbol: cleanSymbol,
              limit: 10,
            }
          )
        );
    } catch (error) {
      console.error(
        "NEWS ERROR:",
        error.message
      );
    }

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
      `MARKET DATA → ${cleanSymbol}`,
      {
        price: quote.price,
        history: history.length,
        news: news.length,
        rsi: technical.rsi,
      }
    );

    return {
      symbol: cleanSymbol,

      quote,

      technical,

      history,

      news,

      timestamp:
        new Date().toISOString(),
    };

  } finally {
    try {
      await transport.close();
    } catch (_) {}
  }
}

/*
========================================================
AI ANALYSIS
========================================================
*/

async function analyze(question) {
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
        (tool) => tool.name
      )
    );

    const tools =
      convertMcpToolsToOpenAITools(
        toolResult.tools
      );

    const messages = [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },

      {
        role: "user",
        content: question,
      },
    ];

    /*
     * Maksimum 6 AI turu
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
          model: MODEL,
          messages,
          tools,
          tool_choice: "auto",
          temperature: 0.2,
        });

      const message =
        response.choices?.[0]?.message;

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

      messages.push(message);

      for (
        const toolCall
        of message.tool_calls
      ) {
        const functionName =
          toolCall.function.name;

        let argumentsObject = {};

        try {
          argumentsObject =
            JSON.parse(
              toolCall.function.arguments ||
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
            role: "tool",

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
            role: "tool",

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
HTTP SERVER
========================================================
*/

const server =
  http.createServer(
    async (req, res) => {

      /*
      ==================================================
      CORS
      ==================================================
      */

      res.setHeader(
        "Access-Control-Allow-Origin",
        "*"
      );

      /*
      ==================================================
      /market?symbol=ASELS
      ==================================================
      */

      if (
        req.method === "GET" &&
        req.url.startsWith("/market")
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
      ==================================================
      ROOT
      ==================================================
      */

      if (
        req.method === "GET" &&
        req.url === "/"
      ) {
        const filePath =
          path.join(
            __dirname,
            "public",
            "index.html"
          );

        fs.readFile(
          filePath,
          (error, data) => {
            if (error) {
              res.writeHead(
                500,
                {
                  "Content-Type":
                    "text/plain; charset=utf-8",
                }
              );

              res.end(
                "Internal Server Error"
              );

              return;
            }

            res.writeHead(
              200,
              {
                "Content-Type":
                  "text/html; charset=utf-8",
              }
            );

            res.end(data);
          }
        );

        return;
      }

      /*
      ==================================================
      /ask
      ==================================================
      */

      if (
        req.method === "POST" &&
        req.url === "/ask"
      ) {
        let body = "";

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
                JSON.parse(body);

              if (!data.question) {
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
      ==================================================
      STATIC FILES
      ==================================================
      */

      const staticFiles = {
        "/style.css": {
          file: "style.css",
          type: "text/css; charset=utf-8",
        },

        "/app.js": {
          file: "app.js",
          type:
            "application/javascript; charset=utf-8",
        },
      };

      if (
        req.method === "GET" &&
        staticFiles[req.url]
      ) {
        const item =
          staticFiles[req.url];

        const filePath =
          path.join(
            __dirname,
            "public",
            item.file
          );

        fs.readFile(
          filePath,
          (error, data) => {
            if (error) {
              res.writeHead(
                404
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
                  item.type,
              }
            );

            res.end(data);
          }
        );

        return;
      }

      /*
      ==================================================
      404
      ==================================================
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
  }
);