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
 * =====================================
 * OPENROUTER
 * =====================================
 */

const ai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

/*
 * OpenRouter'da kullanılacak model.
 *
 * İlk etapta ücretsiz model kullanıyoruz.
 * Gerekirse daha sonra değiştiririz.
 */

const MODEL =
  process.env.OPENROUTER_MODEL ||
  "openrouter/free";

const SYSTEM_PROMPT = `
Sen BorsaCI adlı profesyonel bir BIST ve finansal piyasa analiz asistanısın.

========================================
TEMEL KURAL
========================================

Gerçek piyasa verisi olmadan hiçbir fiyat, RSI, MACD, trend, destek,
direnç, analist hedefi, bilanço veya haber bilgisi uydurma.

Güncel veri gerekiyorsa mutlaka MCP araçlarını kullan.

MCP'den gelen veriler ile kendi yorumunu birbirinden ayır.

Veri bulunamazsa "veri bulunamadı" de.
Tahmin ederek veri üretme.


========================================
GENİŞ HİSSE ANALİZİ
========================================

Kullanıcı aşağıdaki tarzda geniş bir soru sorarsa:

- "ASELS şu an ne durumda?"
- "ASELS analiz et"
- "ASELS alınır mı?"
- "oyundayız mı?"
- "bu hisse ne durumda?"
- "ne düşünüyorsun?"

aşağıdaki sırayı mümkün olduğunca takip et:

1. get_quote
2. get_technical_analysis
3. get_news
4. Önemli görünen haber varsa get_news ile news_id kullanarak
   haber detayını getir.
5. get_analyst_data
6. Gerekliyse temel analiz araçlarını kullan.

Ancak MCP'den veri gelmeyen kategoriler için veri uydurma.


========================================
TEKNİK ANALİZ
========================================

Teknik analiz istendiğinde öncelikle:

- get_quote
- get_technical_analysis

kullan.

Gerekliyse:

- get_historical_data

kullan.

Teknik yorumda mümkün olduğunda:

- Güncel fiyat
- Trend
- RSI
- MACD
- Hareketli ortalamalar
- Destek
- Direnç
- Hacim
- Momentum

değerlendir.

MCP bu değerlerden birini vermiyorsa tahmin etme.


========================================
HABER ANALİZİ
========================================

Hisse analizi sırasında güncel haberleri kontrol et.

Önce:

get_news

kullan.

Haber listesinden fiyatı veya şirket görünümünü etkileyebilecek önemli
bir haber varsa:

get_news

aracını news_id ile tekrar kullanarak detayını getir.

Haber başlığından haber içeriği uydurma.

Haber ile fiyat hareketi arasında doğrudan nedensellik kurma.

Sadece veriler destekliyorsa:

"olası kataliz"

olarak ifade et.


========================================
ANALİST VERİSİ
========================================

Analist hedef fiyatı veya analist görüşü isteniyorsa:

get_analyst_data

kullan.

Analist hedeflerini kendi görüşün gibi sunma.

Kurum hedefi ile konsensüs hedefini ayır.

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

Finansal oranları yanlış yorumlama.

Örneğin:

Dividend Yield = Temettü Verimi

P/B = PD/DD

P/E = F/K

Market Cap = Piyasa Değeri

olarak ifade et.

MCP'nin verdiği birimin anlamsız veya hatalı göründüğü durumda
birim uydurma.


========================================
ÇIKTI STANDARDI
========================================

Geniş hisse analizlerinde mümkün olduğunda şu formatı kullan:

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

Önemli güncel haberleri ve gerekiyorsa haber detaylarını özetle.

## 🎯 Analist Görüşleri

- Konsensüs:
- Hedef fiyat:
- Öne çıkan kurum görüşleri:

Veri yoksa açıkça belirt.

## 💰 Temel Görünüm

Gerektiğinde:

- F/K
- PD/DD
- Temettü verimi
- Piyasa değeri
- Finansal sonuçlar

## 🎯 BorsaCI Yorumu

Verilerden hareketle:

- Pozitif
- Nötr
- Negatif

olarak genel görünümü belirt.

Ardından nedenini kısa ve net açıkla.


========================================
İŞLEM SENARYOSU
========================================

Kullanıcı işlem fikri isterse ve gerçek veri mevcutsa:

Senaryo:
Giriş:
Stop:
TP1:
TP2:
Risk:

şeklinde sun.

TP/SL veya giriş fiyatı MCP verilerinden desteklenmiyorsa
uydurma.

Kesin kazanç veya kesin fiyat garantisi verme.


========================================
VERİ KALİTESİ
========================================

- Eski veriyi güncelmiş gibi sunma.
- MCP verisi olmadan gerçek zamanlı fiyat verme.
- Haber başlığından detay uydurma.
- Sosyal medya verisi için uygun MCP aracı yoksa sosyal medya yorumu
  varmış gibi davranma.
- MCP verileri çelişirse bunu belirt.
- Birim hatalı görünüyorsa yanlış birimi tekrarlama.
- Türkçe, net ve profesyonel yaz.
- Gereksiz uzunlukta cevap verme.
`;

/*
 * =====================================
 * SCHEMA TEMİZLEYİCİ
 * =====================================
 *
 * MCP JSON Schema'larını OpenAI/OpenRouter
 * function tool formatına uygun hale getirir.
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
 * MCP TOOL → OPENROUTER TOOL
 * =====================================
 */

function convertMcpToolsToOpenAITools(
  tools
) {

  return tools.map(
    (tool) => ({
      type: "function",

      function: {
        name: tool.name,

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
 * GEMINI + MCP ANALİZ
 * =====================================
 */

async function analyze(question) {

  /*
   * MCP bağlantısı
   */

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

  try {

    /*
     * MCP'ye bağlan
     */

    await client.connect(
      transport
    );

    /*
     * Gerçek MCP araçlarını al
     */

    const toolResult =
      await client.listTools();

    console.log(
      "MCP TOOLS:",
      toolResult.tools.map(
        (tool) => tool.name
      )
    );

    /*
     * MCP → OpenRouter tools
     */

    const tools =
      convertMcpToolsToOpenAITools(
        toolResult.tools
      );

    /*
     * Conversation
     */

    const messages = [
      {
        role: "system",
        content:
          SYSTEM_PROMPT,
      },

      {
        role: "user",
        content:
          question,
      },
    ];


    /*
     * =====================================
     * TOOL LOOP
     * =====================================
     *
     * Maksimum 6 tur.
     *
     * Gereksiz sonsuz tool çağrısını
     * engelliyoruz.
     */

    for (
      let step = 0;
      step < 6;
      step++
    ) {

      console.log(
        `AI STEP → ${step + 1}`
      );

      /*
       * OpenRouter çağrısı
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
            0.2,
        });


      const message =
        response.choices?.[0]?.message;


      if (!message) {

        throw new Error(
          "OpenRouter cevap üretmedi."
        );

      }


      /*
       * Tool çağrısı yoksa
       * final cevap.
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
       * AI mesajini conversation'a ekle
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
              toolCall.function.arguments ||
              "{}"
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

          /*
           * MCP tool çalıştır
           */

          const result =
            await client.callTool({

              name:
                functionName,

              arguments:
                argumentsObject,

            });


          /*
           * Tool sonucunu OpenRouter'a gönder
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


          /*
           * Hata da modele bildiriliyor.
           */

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
       * MCP TOOL TEST
       * =====================================
       *
       * GET /quote?symbol=ASELS
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


          const transport =
            new StreamableHTTPClientTransport(
              new URL(
                process.env.MCP_URL
              )
            );


          const client =
            new Client({

              name:
                "borsaci-web-client",

              version:
                "1.0.0",

            });


          try {

            await client.connect(
              transport
            );


            const tools =
              await client.listTools();


            console.log(
              "========== GERÇEK MCP TOOLS =========="
            );


            console.log(
              tools.tools.map(
                (tool) => tool.name
              )
            );


            console.log(
              "======================================"
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


            return;


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
       * WEB ARAYÜZÜ
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
       * ANALİZ API
       * =====================================
       *
       * POST /ask
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
       * JAVASCRIPT
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