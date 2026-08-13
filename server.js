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
 * =====================================
 * OPENROUTER
 * =====================================
 */

const ai = new OpenAI({
  apiKey:
    process.env.GROQ_API_KEY,

  baseURL:
    "https://api.groq.com/openai/v1",
});


const MODEL =
  process.env.GROQ_MODEL ||
  "openai/gpt-oss-120b";

/*
 * =====================================
 * SYSTEM PROMPT
 * =====================================
 */

const SYSTEM_PROMPT = `
Sen BorsaCI adlı profesyonel bir BIST ve finansal piyasa analiz asistanısın.
========================================
SEMBOL TESPİTİ
========================================

Kullanıcı bir hisse adını veya BIST kodunu açıkça yazdıysa
sembolü kullanıcıdan tekrar isteme.

Örneğin:

"Doas"
"Doas teknik analiz"
"ASELS"
"Aselsan analiz"
"Tuprs ne durumda?"

ifadelerinde ilgili hisseyi tespit et.

Şirket adı yazılmışsa önce search_symbol aracını kullanarak
doğru BIST sembolünü bul.

BIST sembolü zaten açıkça verilmişse doğrudan ilgili MCP araçlarını kullan.

Kullanıcı "Doas teknik analiz" dediğinde:
1. DOAS sembolünü tespit et.
2. Gerekirse search_symbol kullan.
3. get_quote kullan.
4. get_technical_analysis kullan.
5. Gerekliyse get_historical_data kullan.
6. MCP verilerini aldıktan sonra teknik analizi oluştur.

Sembol belirsiz değilse kullanıcıdan tekrar sembol isteme.
========================================
ANA KURAL
========================================

SADECE MCP araçlarından gelen gerçek verileri kullan.

MCP verisinde olmayan:

- fiyat
- destek
- direnç
- RSI
- MACD
- trend
- hedef fiyat
- bilanço
- haber detayı
- hacim
- analist görüşü

UYDURMA.

Bir veri MCP'den gelmediyse:

"Veri bulunamadı."

de.

Özellikle teknik analizde kendi kafandan fiyat seviyesi üretmek YASAKTIR.


========================================
HABER KURALI
========================================

Haber verisi MCP tarafından sağlanmışsa bunu kullan.

Haber başlığından detay UYDURMA.

Haber detayında açıkça bulunmayan:

- finansal etki
- kâr etkisi
- fiyat etkisi
- kataliz
- pozitif/negatif sonuç

iddialarında bulunma.

Bir haber yalnızca kurumsal veya prosedürel bir KAP açıklamasıysa bunu
otomatik olarak hisse için pozitif kataliz olarak değerlendirme.


========================================
TEKNİK ANALİZ
========================================

MCP tarafından verilen teknik verileri olduğu gibi değerlendir.

Özellikle:

- fiyat
- trend
- RSI
- MACD
- histogram
- hareketli ortalamalar
- destek
- direnç
- hacim
- momentum

verilerini kullan.

Destek veya direnç MCP'den gelmiyorsa sayı verme.


========================================
ANALİST VERİSİ
========================================

Analist hedef fiyatı veya kurum görüşü MCP'den gelirse:

- kurum hedefi
- konsensüs
- analist görüşü

olarak açıkça ayır.

Analist verisi yoksa hedef fiyat verme.


========================================
TEMEL ANALİZ
========================================

Gerekirse:

get_financial_ratios
get_financial_statements
get_earnings
get_profile

kullan.

Birimleri doğru ifade et.

P/B = PD/DD
P/E = F/K
Dividend Yield = Temettü Verimi
Market Cap = Piyasa Değeri


========================================
SONUÇ
========================================

Geniş analizlerde şu formatı kullan:

## 📊 Güncel Durum

- Fiyat:
- Günlük değişim:
- Hacim:

## 📈 Teknik Görünüm

- Trend:
- RSI:
- MACD:
- Destek:
- Direnç:
- Momentum:

## 📰 Haber / KAP

Önemli haberleri ve haber detaylarını özetle.

Haberin tarihini belirt.

Haber ile fiyat arasında doğrudan nedensellik kurma.

## 🎯 Analist Görüşleri

- Konsensüs:
- Hedef fiyat:
- Öne çıkan kurum görüşleri:

Veri yoksa açıkça belirt.

## 💰 Temel Görünüm

Sadece mevcut MCP verilerini kullan.

## 🎯 BorsaCI Yorumu

Sonucu:

- POZİTİF
- NÖTR
- NEGATİF

olarak sınıflandır.

Sonuç için kısa ve mantıksal gerekçe ver.


========================================
İŞLEM SENARYOSU
========================================

Kullanıcı işlem senaryosu isterse:

Senaryo:
Giriş:
Stop:
TP1:
TP2:
Risk:

formatını kullan.

Ancak gerçek MCP verisi olmadan hiçbir fiyat seviyesi üretme.

Kesin kazanç veya kesin fiyat garantisi verme.


========================================
DİL
========================================

Türkçe yaz.

Net, profesyonel ve işlem odaklı ol.

Gereksiz uzunlukta cevap verme.
`;


/*
 * =====================================
 * SCHEMA CLEANER
 * =====================================
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
 * =====================================
 * MCP → OPENAI TOOL
 * =====================================
 */

function convertMcpToolsToOpenAITools(
  tools
) {

  return tools.map(
    (tool) => ({
      type: "function",

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
 * =====================================
 * MCP CONNECTION
 * =====================================
 */

async function createMcpClient() {

  const transport =
    new StreamableHTTPClientTransport(
      new URL(
        process.env.MCP_URL
      )
    );

  const client =
    new Client({
      name:
        "openrouter-borsaci",

      version:
        "1.0.0",
    });

  await client.connect(
    transport
  );

  return {
    client,
    transport,
  };
}


/*
 * =====================================
 * ANALYZE
 * =====================================
 */

async function analyze(question) {

  const {
    client,
    transport,
  } = await createMcpClient();

  try {

    /*
     * =====================================
     * MCP TOOLS
     * =====================================
     */

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


    /*
     * =====================================
     * MESSAGES
     * =====================================
     */

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
     * =====================================
     * TOOL LOOP
     * =====================================
     */

    for (
      let step = 0;
      step < 20;
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
            0.1,

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
       * =====================================
       * FINAL RESPONSE
       * =====================================
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


      /*
       * AI MESSAGE
       */

      messages.push(
        message
      );


      /*
       * =====================================
       * TOOL CALLS
       * =====================================
       */

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
              toolCall
                .function
                .arguments || "{}"
            );

        } catch (error) {

          console.error(
            "Tool arguments JSON hatası:",
            error.message
          );

          argumentsObject = {};

        }


        console.log(
          `MCP → ${functionName}`,
          argumentsObject
        );


        try {

          const result =
            await client.callTool({

              name:
                functionName,

              arguments:
                argumentsObject,

            });


          /*
           * TOOL SONUCUNU MODELE VER
           */

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
 * =====================================
 * HTTP SERVER
 * =====================================
 */

const server =
  http.createServer(
    async (req, res) => {

      /*
       * =====================================
       * QUOTE / MCP TOOL TEST
       * =====================================
       */

      if (
        req.method === "GET" &&
        req.url.startsWith(
          "/quote"
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
            `QUOTE TEST → ${symbol}`
          );


          const {
            client,
            transport,
          } =
            await createMcpClient();


          try {

            const tools =
              await client.listTools();


            res.writeHead(
              200,
              {
                "Content-Type":
                  "application/json; charset=utf-8",
              }
            );


            res.end(
              JSON.stringify(
                {

                  symbol,

                  tools:
                    tools.tools.map(
                      (tool) => ({

                        name:
                          tool.name,

                        description:
                          tool.description ||
                          "",

                        inputSchema:
                          tool.inputSchema ||
                          null,

                      })
                    ),

                },

                null,

                2
              )
            );


          } finally {

            try {

              await transport.close();

            } catch (_) {}

          }


        } catch (error) {

          console.error(
            "QUOTE ERROR:",
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
 * =====================================
 * YAHOO FINANCE HELPERS
 * =====================================
 */

function normalizeBistSymbol(symbol) {

  if (!symbol) return null;

  let clean =
    String(symbol)
      .trim()
      .toUpperCase()
      .replace(/^BIST:/, "");

  if (!clean.endsWith(".IS")) {
    clean += ".IS";
  }

  return clean;
}


async function fetchYahooChart(
  symbol,
  range = "1y",
  interval = "1d"
) {

  const yahooSymbol =
    normalizeBistSymbol(symbol);

  if (!yahooSymbol) {
    throw new Error(
      "Yahoo sembolü oluşturulamadı."
    );
  }


  const yahooUrl =
    "https://query1.finance.yahoo.com/v8/finance/chart/" +
    encodeURIComponent(yahooSymbol) +
    `?range=${encodeURIComponent(range)}` +
    `&interval=${encodeURIComponent(interval)}` +
    "&events=history&includeAdjustedClose=true";


  console.log(
    "YAHOO REQUEST →",
    yahooUrl
  );


  const response =
    await fetch(
      yahooUrl,
      {
        method: "GET",

        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",

          "Accept":
            "application/json,text/plain,*/*"
        }
      }
    );


  const text =
    await response.text();


  let data = null;


  try {

    data =
      JSON.parse(text);

  } catch {

    throw new Error(
      `Yahoo Finance JSON döndürmedi. HTTP ${response.status}`
    );

  }


  if (!response.ok) {

    throw new Error(
      data?.chart?.error?.description ||
      `Yahoo Finance HTTP ${response.status}`
    );

  }


  if (
    data?.chart?.error
  ) {

    throw new Error(
      data.chart.error.description ||
      "Yahoo Finance chart hatası."
    );

  }


  const result =
    data?.chart?.result?.[0];


  if (!result) {

    throw new Error(
      "Yahoo Finance chart sonucu boş."
    );

  }


  const timestamps =
    result.timestamp || [];


  const quote =
    result.indicators
      ?.quote?.[0];


  if (
    !quote ||
    !Array.isArray(timestamps)
  ) {

    throw new Error(
      "Yahoo Finance OHLC verisi bulunamadı."
    );

  }


  const history = [];


  for (
    let i = 0;
    i < timestamps.length;
    i++
  ) {

    const open =
      Number(
        quote.open?.[i]
      );

    const high =
      Number(
        quote.high?.[i]
      );

    const low =
      Number(
        quote.low?.[i]
      );

    const close =
      Number(
        quote.close?.[i]
      );

    const volume =
      Number(
        quote.volume?.[i]
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
        Number.isFinite(open)
          ? open
          : close,

      high:
        Number.isFinite(high)
          ? high
          : close,

      low:
        Number.isFinite(low)
          ? low
          : close,

      close,

      volume:
        Number.isFinite(volume)
          ? volume
          : 0

    });

  }


  if (
    history.length === 0
  ) {

    throw new Error(
      "Yahoo Finance history boş."
    );

  }


  return {
    symbol:
      yahooSymbol
        .replace(/\.IS$/, ""),

    history,

    meta:
      result.meta || {}

  };

}


/*
 * =====================================
 * MARKET ENDPOINT
 * =====================================
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


    const requestedSymbol =
      url.searchParams
        .get("symbol");


    if (!requestedSymbol) {

      res.writeHead(
        400,
        {
          "Content-Type":
            "application/json; charset=utf-8"
        }
      );


      res.end(
        JSON.stringify({
          error:
            "symbol parametresi gerekli."
        })
      );


      return;

    }


    const symbol =
      requestedSymbol
        .trim()
        .toUpperCase();


    console.log(
      `MARKET → ${symbol}`
    );


    /*
     * 1 günlük Yahoo verisini al.
     *
     * Market endpoint için
     * güncel quote'a yakın veri.
     */

    const yahoo =
      await fetchYahooChart(
        symbol,
        "5d",
        "1d"
      );


    const history =
      yahoo.history;


    const latest =
      history[
        history.length - 1
      ];


    const previous =
      history[
        history.length - 2
      ];


    const price =
      latest?.close ?? null;


    const previousClose =
      previous?.close ?? null;


    let changePercent =
      null;


    if (
      Number.isFinite(price) &&
      Number.isFinite(previousClose) &&
      previousClose !== 0
    ) {

      changePercent =
        (
          (price - previousClose) /
          previousClose
        ) * 100;

    }


    const volume =
      latest?.volume ?? null;


    const result = {

      symbol,

      timestamp:
        new Date().toISOString(),

      quote: {

        price,

        changePercent,

        volume,

        previousClose

      },

      price,

      changePercent,

      volume,

      history

    };


    res.writeHead(
      200,
      {
        "Content-Type":
          "application/json; charset=utf-8",

        "Cache-Control":
          "no-store"
      }
    );


    res.end(
      JSON.stringify(
        result
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
          "application/json; charset=utf-8"
      }
    );


    res.end(
      JSON.stringify({
        error:
          error.message
      })
    );

  }


  return;

}


/*
 * =====================================
 * CHART ENDPOINT
 * =====================================
 */

if (
  req.method === "GET" &&
  req.url.startsWith("/chart")
) {

  try {

    const url =
      new URL(
        req.url,
        `http://${req.headers.host}`
      );


    const requestedSymbol =
      url.searchParams
        .get("symbol");


    const range =
      url.searchParams
        .get("range") ||
      "1y";


    const interval =
      url.searchParams
        .get("interval") ||
      "1d";


    if (!requestedSymbol) {

      res.writeHead(
        400,
        {
          "Content-Type":
            "application/json; charset=utf-8"
        }
      );


      res.end(
        JSON.stringify({
          error:
            "symbol parametresi gerekli."
        })
      );


      return;

    }


    const symbol =
      requestedSymbol
        .trim()
        .toUpperCase();


    console.log(
      `CHART → ${symbol} ${range} ${interval}`
    );


    const yahoo =
      await fetchYahooChart(
        symbol,
        range,
        interval
      );


    res.writeHead(
      200,
      {
        "Content-Type":
          "application/json; charset=utf-8",

        "Cache-Control":
          "no-store"
      }
    );


    res.end(
      JSON.stringify({

        symbol,

        history:
          yahoo.history

      })
    );


  } catch (error) {

    console.error(
      "CHART ERROR:",
      error
    );


    res.writeHead(
      500,
      {
        "Content-Type":
          "application/json; charset=utf-8"
      }
    );


    res.end(
      JSON.stringify({
        error:
          error.message
      })
    );

  }


  return;

}
      /*
       * =====================================
       * WEB
       * =====================================
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

              console.error(
                "index.html okunamadı:",
                error
              );


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
       * =====================================
       * ASK
       * =====================================
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


              if (
                !data.question
              ) {

                throw new Error(
                  "question alanı gerekli."
                );

              }


              console.log(
                "///////////////////////////////////////////////////////////"
              );


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
       * =====================================
       * CSS
       * =====================================
       */

      if (
        req.method === "GET" &&
        req.url === "/style.css"
      ) {

        const filePath =
          path.join(
            __dirname,
            "public",
            "style.css"
          );


        fs.readFile(
          filePath,
          (error, data) => {

            if (error) {

              console.error(
                "style.css okunamadı:",
                error
              );


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
                  "text/css; charset=utf-8",
              }
            );


            res.end(data);

          }
        );


        return;

      }


      /*
       * =====================================
       * APP JS
       * =====================================
       */

      if (
        req.method === "GET" &&
        req.url === "/app.js"
      ) {

        const filePath =
          path.join(
            __dirname,
            "public",
            "app.js"
          );


        fs.readFile(
          filePath,
          (error, data) => {

            if (error) {

              console.error(
                "app.js okunamadı:",
                error
              );


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
                  "application/javascript; charset=utf-8",
              }
            );


            res.end(data);

          }
        );


        return;

      }


      /*
       * =====================================
       * 404
       * =====================================
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
 * =====================================
 * SERVER START
 * =====================================
 */

server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `BorsaCI server ${PORT} portunda çalışıyor.`
    );

    console.log(
      `Groq model: ${MODEL}`
    );

  }
);