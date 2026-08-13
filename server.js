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


/*
========================================================
CONFIG
========================================================
*/

const PORT =
  process.env.PORT || 3000;

const MODEL =
  process.env.GROQ_MODEL ||
  "openai/gpt-oss-120b";


/*
========================================================
AI PROVIDERS
========================================================
*/

const groqAI = new OpenAI({
  apiKey:
    process.env.GROQ_API_KEY,

  baseURL:
    "https://api.groq.com/openai/v1",
});


const geminiAI = new OpenAI({
  apiKey:
    process.env.GEMINI_API_KEY,

  baseURL:
    "https://generativelanguage.googleapis.com/v1beta/openai/",
});


const mistralAI = new OpenAI({
  apiKey:
    process.env.MISTRAL_API_KEY,

  baseURL:
    "https://api.mistral.ai/v1",
});


/*
========================================================
SYSTEM PROMPT
========================================================
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
6. Gerekliyse haber araçlarını kullan.
7. Gerekliyse temel analiz araçlarını kullan.
8. MCP verilerini aldıktan sonra teknik analizi oluştur.

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

Haber tarihini belirt.

Haber ile fiyat arasında doğrudan nedensellik kurma.


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
GENİŞ ANALİZ FORMAT
========================================

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
========================================================
HTTP HELPERS
========================================================
*/

function sendJSON(
  res,
  statusCode,
  data
) {

  res.writeHead(
    statusCode,
    {
      "Content-Type":
        "application/json; charset=utf-8",

      "Cache-Control":
        "no-store",

      "Access-Control-Allow-Origin":
        "*",

      "Access-Control-Allow-Methods":
        "GET,POST,OPTIONS",

      "Access-Control-Allow-Headers":
        "Content-Type",
    }
  );

  res.end(
    JSON.stringify(
      data
    )
  );
}


function sendText(
  res,
  statusCode,
  text
) {

  res.writeHead(
    statusCode,
    {
      "Content-Type":
        "text/plain; charset=utf-8",

      "Access-Control-Allow-Origin":
        "*",
    }
  );

  res.end(text);
}


/*
========================================================
SCHEMA CLEANER
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
MCP → OPENAI TOOLS
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
              type:
                "object",

              properties:
                {},
            }
          ),

      },

    })
  );
}


/*
========================================================
MCP CONNECTION
========================================================
*/

async function createMcpClient() {

  if (!process.env.MCP_URL) {

    throw new Error(
      "MCP_URL environment variable tanımlı değil."
    );

  }

  const transport =
    new StreamableHTTPClientTransport(
      new URL(
        process.env.MCP_URL
      )
    );


  const client =
    new Client({

      name:
        "borsaci",

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
========================================================
AI ANALYZE
========================================================
*/

async function analyze(
  question
) {

  if (!question) {

    throw new Error(
      "Soru boş olamaz."
    );

  }


  const {
    client,
    transport,
  } =
    await createMcpClient();


  try {

    /*
    ========================================
    MCP TOOLS
    ========================================
    */

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


    if (
      tools.length === 0
    ) {

      throw new Error(
        "MCP sunucusunda kullanılabilir araç bulunamadı."
      );

    }


    /*
    ========================================
    MESSAGES
    ========================================
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
    ========================================
    TOOL LOOP
    ========================================
    */

    for (
      let step = 0;
      step < 20;
      step++
    ) {

      console.log(
        `AI STEP → ${step + 1}`
      );


      /*
      ========================================
      GROQ → GEMINI → MISTRAL
      ========================================
      */

      let response;


      try {

        console.log(
          "AI PROVIDER → GROQ"
        );


        response =
          await groqAI.chat.completions.create({

            model:
              MODEL,

            messages,

            tools,

            tool_choice:
              "auto",

            temperature:
              0.1,

          });


      } catch (groqError) {

        console.error(
          "GROQ HATA →",
          groqError.message
        );


        try {

          console.log(
            "AI PROVIDER → GEMINI"
          );


          response =
            await geminiAI.chat.completions.create({

              model:
                "gemini-2.5-flash",

              messages,

              tools,

              tool_choice:
                "auto",

              temperature:
                0.1,

            });


        } catch (geminiError) {

          console.error(
            "GEMINI HATA →",
            geminiError.message
          );


          try {

            console.log(
              "AI PROVIDER → MISTRAL"
            );


            response =
              await mistralAI.chat.completions.create({

                model:
                  "mistral-small-latest",

                messages,

                tools,

                tool_choice:
                  "auto",

                temperature:
                  0.1,

              });


          } catch (mistralError) {

            console.error(
              "MISTRAL HATA →",
              mistralError.message
            );


            throw new Error(
              "Groq, Gemini ve Mistral AI servislerinin üçü de kullanılamıyor."
            );

          }

        }

      }


      const message =
        response
          .choices?.[0]
          ?.message;


      if (!message) {

        throw new Error(
          "AI cevap üretmedi."
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


      /*
      ========================================
      AI MESSAGE
      ========================================
      */

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
          toolCall
            .function
            .name;


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
      "Maksimum MCP analiz adımına ulaşıldı."
    );


  } finally {

    try {

      await transport.close();

    } catch (_) {}

  }

}


/*
========================================================
YAHOO FINANCE
========================================================
*/

function normalizeBistSymbol(
  symbol
) {

  if (!symbol) {
    return null;
  }


  let clean =
    String(symbol)
      .trim()
      .toUpperCase()
      .replace(/^BIST:/, "");


  if (
    !clean.endsWith(".IS")
  ) {

    clean += ".IS";

  }


  return clean;
}


/*
========================================================
YAHOO CHART
========================================================
*/

async function fetchYahooChart(
  symbol,
  range = "1y",
  interval = "1d"
) {

  const yahooSymbol =
    normalizeBistSymbol(
      symbol
    );


  if (!yahooSymbol) {

    throw new Error(
      "Yahoo sembolü oluşturulamadı."
    );

  }


  const yahooUrl =
    "https://query1.finance.yahoo.com/v8/finance/chart/" +
    encodeURIComponent(
      yahooSymbol
    ) +
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

        method:
          "GET",

        headers: {

          "User-Agent":
            "Mozilla/5.0",

          "Accept":
            "application/json,text/plain,*/*",

        },

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
    result
      .indicators
      ?.quote?.[0];


  if (
    !quote ||
    !Array.isArray(
      timestamps
    )
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
      !Number.isFinite(
        close
      )
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
          : 0,

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
        .replace(
          /\.IS$/,
          ""
        ),

    history,

    meta:
      result.meta || {},

  };

}


/*
========================================================
MARKET HANDLER
========================================================
*/

async function handleMarket(
  req,
  res
) {

  try {

    const url =
      new URL(
        req.url,
        `http://${req.headers.host || "localhost"}`
      );


    const requestedSymbol =
      url.searchParams.get(
        "symbol"
      );


    if (!requestedSymbol) {

      return sendJSON(
        res,
        400,
        {
          error:
            "symbol parametresi gerekli.",
        }
      );

    }


    const symbol =
      requestedSymbol
        .trim()
        .toUpperCase();


    console.log(
      `MARKET → ${symbol}`
    );


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
      latest?.close ??
      null;


    const previousClose =
      previous?.close ??
      null;


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
        ) *
        100;

    }


    const volume =
      latest?.volume ??
      null;


    return sendJSON(
      res,
      200,
      {

        symbol,

        timestamp:
          new Date().toISOString(),

        quote: {

          price,

          changePercent,

          volume,

          previousClose,

        },

        price,

        changePercent,

        volume,

        history,

      }
    );


  } catch (error) {

    console.error(
      "MARKET ERROR:",
      error
    );


    return sendJSON(
      res,
      500,
      {

        error:
          error.message,

      }
    );

  }

}


/*
========================================================
CHART HANDLER
========================================================
*/

async function handleChart(
  req,
  res
) {

  try {

    const url =
      new URL(
        req.url,
        `http://${req.headers.host || "localhost"}`
      );


    const requestedSymbol =
      url.searchParams.get(
        "symbol"
      );


    const range =
      url.searchParams.get(
        "range"
      ) ||
      "1y";


    const interval =
      url.searchParams.get(
        "interval"
      ) ||
      "1d";


    if (!requestedSymbol) {

      return sendJSON(
        res,
        400,
        {

          error:
            "symbol parametresi gerekli.",

        }
      );

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


    return sendJSON(
      res,
      200,
      {

        symbol,

        history:
          yahoo.history,

      }
    );


  } catch (error) {

    console.error(
      "CHART ERROR:",
      error
    );


    return sendJSON(
      res,
      500,
      {

        error:
          error.message,

      }
    );

  }

}


/*
========================================================
QUOTE / MCP TOOL TEST
========================================================
*/

async function handleQuote(
  req,
  res
) {

  let transport = null;


  try {

    const url =
      new URL(
        req.url,
        `http://${req.headers.host || "localhost"}`
      );


    const symbol =
      url.searchParams
        .get("symbol")
        ?.trim()
        .toUpperCase();


    if (!symbol) {

      return sendJSON(
        res,
        400,
        {

          error:
            "symbol parametresi gerekli.",

        }
      );

    }


    console.log(
      `QUOTE TEST → ${symbol}`
    );


    const connection =
      await createMcpClient();


    transport =
      connection.transport;


    const tools =
      await connection.client.listTools();


    return sendJSON(
      res,
      200,
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

      }
    );


  } catch (error) {

    console.error(
      "QUOTE ERROR:",
      error
    );


    return sendJSON(
      res,
      500,
      {

        error:
          error.message,

      }
    );


  } finally {

    if (transport) {

      try {

        await transport.close();

      } catch (_) {}

    }

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
          `Dosya okunamadı: ${filePath}`,
          error
        );


        return sendText(
          res,
          500,
          "Internal Server Error"
        );

      }


      res.writeHead(
        200,
        {

          "Content-Type":
            contentType,

          "Cache-Control":
            "no-cache",

          "Access-Control-Allow-Origin":
            "*",

        }
      );


      res.end(data);

    }
  );

}


/*
========================================================
READ REQUEST BODY
========================================================
*/

function readBody(
  req
) {

  return new Promise(
    (resolve, reject) => {

      let body = "";


      req.on(
        "data",
        (chunk) => {

          body += chunk;


          if (
            body.length >
            1024 * 1024
          ) {

            reject(
              new Error(
                "Request body çok büyük."
              )
            );


            req.destroy();

          }

        }
      );


      req.on(
        "end",
        () => {

          resolve(body);

        }
      );


      req.on(
        "error",
        reject
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
      CORS PREFLIGHT
      ========================================
      */

      if (
        req.method === "OPTIONS"
      ) {

        res.writeHead(
          204,
          {

            "Access-Control-Allow-Origin":
              "*",

            "Access-Control-Allow-Methods":
              "GET,POST,OPTIONS",

            "Access-Control-Allow-Headers":
              "Content-Type",

          }
        );


        res.end();

        return;

      }


      /*
      ========================================
      URL PARSE
      ========================================
      */

      let url;


      try {

        url =
          new URL(
            req.url,
            `http://${req.headers.host || "localhost"}`
          );

      } catch {

        return sendText(
          res,
          400,
          "Bad Request"
        );

      }


      const pathname =
        url.pathname;


      console.log(
        `${req.method} ${pathname}`
      );


      /*
      ========================================
      HEALTH
      ========================================
      */

      if (
        req.method === "GET" &&
        pathname === "/health"
      ) {

        return sendJSON(
          res,
          200,
          {

            status:
              "ok",

            service:
              "BorsaCI",

            model:
              MODEL,

            timestamp:
              new Date().toISOString(),

          }
        );

      }


      /*
      ========================================
      QUOTE
      ========================================
      */

      if (
        req.method === "GET" &&
        (
          pathname === "/quote" ||
          pathname === "/api/quote"
        )
      ) {

        return handleQuote(
          req,
          res
        );

      }


      /*
      ========================================
      MARKET
      ========================================
      */

      if (
        req.method === "GET" &&
        (
          pathname === "/market" ||
          pathname === "/api/market"
        )
      ) {

        return handleMarket(
          req,
          res
        );

      }


      /*
      ========================================
      CHART
      ========================================
      */

      if (
        req.method === "GET" &&
        (
          pathname === "/chart" ||
          pathname === "/api/chart"
        )
      ) {

        return handleChart(
          req,
          res
        );

      }


      /*
      ========================================
      ASK
      ========================================
      */

      if (
        req.method === "POST" &&
        (
          pathname === "/ask" ||
          pathname === "/api/ask"
        )
      ) {

        try {

          const body =
            await readBody(
              req
            );


          let data;


          try {

            data =
              JSON.parse(body);

          } catch {

            throw new Error(
              "Geçersiz JSON."
            );

          }


          if (
            !data?.question ||
            typeof data.question !==
              "string"
          ) {

            throw new Error(
              "question alanı gerekli."
            );

          }


          const question =
            data.question.trim();


          if (!question) {

            throw new Error(
              "question alanı boş olamaz."
            );

          }


          console.log(
            "==========================================================="
          );


          console.log(
            `SORU → ${question}`
          );


          const answer =
            await analyze(
              question
            );


          console.log(
            "AI CEVAP →",
            answer
          );


          return sendJSON(
            res,
            200,
            {

              answer,

            }
          );


        } catch (error) {

          console.error(
            "ANALİZ HATASI:",
            error
          );


          return sendJSON(
            res,
            500,
            {

              error:
                error.message,

            }
          );

        }

      }


      /*
      ========================================
      ROOT
      ========================================
      */

      if (
        req.method === "GET" &&
        pathname === "/"
      ) {

        const filePath =
          path.join(
            __dirname,
            "public",
            "index.html"
          );


        return serveFile(
          res,
          filePath,
          "text/html; charset=utf-8"
        );

      }


      /*
      ========================================
      CSS
      ========================================
      */

      if (
        req.method === "GET" &&
        pathname === "/style.css"
      ) {

        const filePath =
          path.join(
            __dirname,
            "public",
            "style.css"
          );


        return serveFile(
          res,
          filePath,
          "text/css; charset=utf-8"
        );

      }


      /*
      ========================================
      APP JS
      ========================================
      */

      if (
        req.method === "GET" &&
        pathname === "/app.js"
      ) {

        const filePath =
          path.join(
            __dirname,
            "public",
            "app.js"
          );


        return serveFile(
          res,
          filePath,
          "application/javascript; charset=utf-8"
        );

      }


      /*
      ========================================
      404
      ========================================
      */

      console.log(
        `404 → ${req.method} ${pathname}`
      );


      return sendJSON(
        res,
        404,
        {

          error:
            "Not Found",

          path:
            pathname,

          method:
            req.method,

        }
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
      "==========================================================="
    );

    console.log(
      `BorsaCI server ${PORT} portunda çalışıyor.`
    );

    console.log(
      `Groq model: ${MODEL}`
    );

    console.log(
      `MCP URL: ${process.env.MCP_URL ? "TANIMLI" : "YOK"}`
    );

    console.log(
      `Groq API: ${process.env.GROQ_API_KEY ? "TANIMLI" : "YOK"}`
    );

    console.log(
      `Gemini API: ${process.env.GEMINI_API_KEY ? "TANIMLI" : "YOK"}`
    );

    console.log(
      `Mistral API: ${process.env.MISTRAL_API_KEY ? "TANIMLI" : "YOK"}`
    );

    console.log(
      "==========================================================="
    );

  }
);
