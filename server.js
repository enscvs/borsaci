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
 * =====================================
 * SERVER
 * =====================================
 */

const PORT =
  process.env.PORT || 3000;


/*
 * =====================================
 * OPENROUTER
 * =====================================
 */

if (!process.env.OPENROUTER_API_KEY) {
  console.error(
    "❌ OPENROUTER_API_KEY bulunamadı."
  );
}

const ai =
  new OpenAI({
    apiKey:
      process.env.OPENROUTER_API_KEY,

    baseURL:
      "https://openrouter.ai/api/v1",

    defaultHeaders: {
      "HTTP-Referer":
        "https://gemini-borsaci.onrender.com",

      "X-Title":
        "BorsaCI",
    },
  });


/*
 * =====================================
 * MODEL
 * =====================================
 */

const MODEL =
  process.env.OPENROUTER_MODEL ||
  "openrouter/free";


/*
 * =====================================
 * SYSTEM PROMPT
 * =====================================
 */

const SYSTEM_PROMPT = `
Sen BorsaCI adlı profesyonel BIST ve finansal piyasa analiz asistanısın.

========================================
TEMEL KURAL
========================================

Gerçek MCP verisi olmadan hiçbir piyasa verisi uydurma.

Asla uydurma:

- fiyat
- günlük değişim
- hacim
- RSI
- MACD
- trend
- destek
- direnç
- hedef fiyat
- bilanço
- haber
- analist görüşü

Güncel bilgi gerekiyorsa MCP araçlarını kullan.

MCP verisi ile kendi yorumunu birbirinden ayır.

Veri yoksa:

"Veri bulunamadı."

de.

Tahmin ederek veri oluşturma.


========================================
GENİŞ HİSSE ANALİZİ
========================================

Kullanıcı:

"ASELS şu an ne durumda?"
"ASELS analiz et"
"ASELS alınır mı?"
"oyundayız mı?"
"bu hisse ne durumda?"
"ne düşünüyorsun?"

gibi geniş bir soru sorarsa mümkün olduğunca şu akışı takip et:

1. get_quote
2. get_technical_analysis
3. get_news
4. Haber listesinden önemli görünen haber varsa:
   get_news + news_id
5. get_analyst_data
6. Gerekirse temel analiz araçları

Önemli:

get_news sadece başlık listesi döndürüyorsa,
haber başlığından detay uydurma.

Önemli bir haberin id'si varsa mutlaka
get_news aracını news_id parametresiyle çağırarak
haber detayını almaya çalış.

Özellikle:

- Özel Durum Açıklaması
- sözleşme
- ihale
- yeni sipariş
- finansal sonuç
- sermaye işlemi
- ortaklık
- yatırım
- temettü
- yönetim değişikliği
- önemli hukuki gelişme

gibi haberleri önemse.


========================================
HABER DETAYI
========================================

get_news sonucu aşağıdakilere benzer alanlar içerebilir:

id
title
summary
source
url
published_date

Haber listesinde önemli bir haber varsa:

get_news({
  news_id: "..."
})

şeklinde detay çağrısı yap.

Detay çağrısından gelen gerçek metni analiz et.

Haber başlığından detay çıkarma.

Haber ile fiyat hareketi arasında kesin nedensellik kurma.

Sadece veriler destekliyorsa:

"olası kataliz"

olarak ifade et.


========================================
TEKNİK ANALİZ
========================================

Teknik analiz için:

get_quote
get_technical_analysis

kullan.

Gerekirse:

get_historical_data

kullan.

Mümkün olduğunda:

- Fiyat
- Günlük değişim
- Hacim
- Trend
- RSI
- MACD
- Hareketli ortalamalar
- Destek
- Direnç
- Momentum

değerlendir.

Veri yoksa tahmin etme.


========================================
ANALİST VERİSİ
========================================

Analist görüşü veya hedef fiyat soruluyorsa:

get_analyst_data

kullan.

Kurum hedefi ile konsensüs hedefini ayır.

Analist hedefini BorsaCI'nın kendi hedefi gibi sunma.

Veri yoksa hedef fiyat uydurma.


========================================
TEMEL ANALİZ
========================================

Gerektiğinde:

get_financial_ratios
get_financial_statements
get_earnings
get_profile

kullan.

Terimleri doğru Türkçeleştir:

P/B = PD/DD
P/E = F/K
Dividend Yield = Temettü Verimi
Market Cap = Piyasa Değeri


========================================
TOOL KULLANIMI
========================================

Gereksiz tool çağrısı yapma.

Aynı veriyi tekrar tekrar isteme.

Bir tool sonucu yeterliyse aynı tool'u tekrar çağırma.

Haber detayına ihtiyaç varsa önce haber listesindeki
id değerini kullan.

Herhangi bir tool hata verirse mevcut verilerle devam et.


========================================
ÇIKTI
========================================

Geniş analizlerde mümkün olduğunca:

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

Önemli haberleri tarihleriyle belirt.

Haber detayına ulaşıldıysa detayın önemli kısmını özetle.

## 🎯 Analist Görüşleri

- Konsensüs:
- Hedef fiyat:
- Öne çıkan kurumlar:

## 💰 Temel Görünüm

- F/K:
- PD/DD:
- Temettü verimi:
- Piyasa değeri:
- Finansal sonuçlar:

## 🎯 BorsaCI Yorumu

Pozitif / Nötr / Negatif

ve kısa gerekçesi.


========================================
İŞLEM SENARYOSU
========================================

Kullanıcı işlem fikri isterse gerçek MCP verisine dayanarak:

Senaryo:
Giriş:
Stop:
TP1:
TP2:
Risk:

ver.

Gerçek veri yoksa fiyat uydurma.


========================================
VERİ KALİTESİ
========================================

Eski veriyi güncelmiş gibi sunma.

MCP verisi olmadan gerçek zamanlı veri verme.

Haber başlığından detay uydurma.

Sosyal medya MCP aracı yoksa sosyal medya yorumu uydurma.

MCP verileri çelişirse bunu açıkça belirt.

Türkçe, net ve işlem odaklı cevap ver.

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
 * MCP → OPENAI TOOLS
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
 * MCP CLIENT
 * =====================================
 */

async function createMcpClient() {

  if (!process.env.MCP_URL) {

    throw new Error(
      "MCP_URL environment variable bulunamadı."
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
        "openrouter-borsaci-server",

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
  } =
    await createMcpClient();

  try {

    /*
     * MCP TOOLS
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


    /*
     * OpenRouter tools
     */

    const tools =
      convertMcpToolsToOpenAITools(
        toolResult.tools
      );


    /*
     * Messages
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

    const MAX_STEPS = 6;

    for (
      let step = 0;
      step < MAX_STEPS;
      step++
    ) {

      console.log(
        `AI STEP → ${step + 1}`
      );


      /*
       * OpenRouter
       */

      const response =
        await ai.chat.completions.create({

          model:
            MODEL,

          messages,

          tools,

          tool_choice:
            "auto",

          temperature:
            0.15,

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
       * FINAL CEVAP
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
       * AI mesajı
       */

      messages.push(
        message
      );


      /*
       * =====================================
       * MCP TOOL ÇAĞRILARI
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


          /*
           * Tool sonucu
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
 * JSON RESPONSE
 * =====================================
 */

function sendJson(
  res,
  status,
  data
) {

  res.writeHead(
    status,
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
       * ROOT
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
       * QUOTE TEST
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

            sendJson(
              res,
              400,
              {
                error:
                  "symbol parametresi gerekli.",
              }
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


            sendJson(
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


          sendJson(
            res,
            500,
            {
              error:
                error.message,
            }
          );

        }

        return;
      }


      /*
       * =====================================
       * ASK API
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

            /*
             * Basit body limiti
             */

            if (
              body.length >
              100000
            ) {

              req.destroy();

            }

          }
        );


        req.on(
          "end",
          async () => {

            try {

              const data =
                JSON.parse(body);


              if (
                !data.question ||
                typeof data.question !== "string"
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


              sendJson(
                res,
                200,
                {
                  answer,
                }
              );


            } catch (error) {

              console.error(
                "Analiz hatası:",
                error
              );


              sendJson(
                res,
                500,
                {
                  error:
                    error.message,
                }
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
       * APP.JS
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
      `OpenRouter model: ${MODEL}`
    );

  }
);