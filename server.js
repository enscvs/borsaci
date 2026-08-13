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

if (!process.env.OPENROUTER_API_KEY) {
  console.warn(
    "UYARI: OPENROUTER_API_KEY bulunamadı."
  );
}

if (!process.env.MCP_URL) {
  console.warn(
    "UYARI: MCP_URL bulunamadı."
  );
}

const ai =
  new OpenAI({
    apiKey:
      process.env.OPENROUTER_API_KEY,

    baseURL:
      "https://openrouter.ai/api/v1",
  });


const MODEL =
  process.env.OPENROUTER_MODEL ||
  "openrouter/free";


/*
 * =====================================
 * SYSTEM PROMPT
 * =====================================
 */

const SYSTEM_PROMPT = `
Sen BorsaCI adlı profesyonel bir BIST ve finansal piyasa analiz asistanısın.

========================================
TEMEL KURAL
========================================

Gerçek piyasa verisi olmadan hiçbir fiyat, RSI, MACD, trend, destek,
direnç, analist hedefi, bilanço veya haber bilgisi uydurma.

Güncel veri gerekiyorsa mutlaka MCP araçlarını kullan.

MCP'den gelen veriler ile kendi yorumunu birbirinden ayır.

Veri bulunamazsa açıkça "veri bulunamadı" de.

Tahmin ederek gerçek piyasa verisi üretme.


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

mümkün olduğunca şu sırayı takip et:

1. get_quote
2. get_technical_analysis
3. get_news
4. Önemli haber varsa get_news ile news_id kullanarak haber detayını getir.
5. get_analyst_data
6. Gerekliyse temel analiz araçlarını kullan.

Her kategori için MCP'den gerçek veri gelmiyorsa o kategoriyi uydurma.


========================================
HABER DETAYI
========================================

get_news sonucu yalnızca haber listesi veriyorsa başlıktan haber içeriği
uydurma.

Haber listesinde aşağıdaki türlerde bir haber görürsen detayını almak için
news_id kullan:

- Özel Durum Açıklaması
- Sözleşme
- İhale
- Sipariş
- Yeni iş ilişkisi
- Finansal sonuç
- Temettü
- Sermaye artırımı
- Geri alım
- Ortaklık
- Satın alma
- Yatırım
- Kapasite artışı
- Önemli yönetim değişikliği
- Regülasyon veya şirketi doğrudan etkileyen gelişme

Özellikle fiyatı veya şirket görünümünü etkileyebilecek haberlerin
detayını almaya çalış.

Haber başlığından içerik uydurma.

Haber ile fiyat hareketi arasında doğrudan nedensellik kurma.

Veriler destekliyorsa "olası kataliz" olarak ifade et.


========================================
TEKNİK ANALİZ
========================================

Teknik analiz istendiğinde:

- get_quote
- get_technical_analysis

kullan.

Gerekliyse:

- get_historical_data

kullan.

Mümkün olduğunda:

- Güncel fiyat
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

MCP bir değer vermiyorsa tahmin etme.


========================================
ANALİST VERİSİ
========================================

Analist hedef fiyatı veya analist görüşü isteniyorsa:

get_analyst_data

kullan.

Analist hedeflerini kendi görüşün gibi sunma.

Kurum hedefi ile konsensüs hedefini birbirinden ayır.

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

Finansal oranları doğru isimlendir:

Dividend Yield = Temettü Verimi
P/B = PD/DD
P/E = F/K
Market Cap = Piyasa Değeri

MCP'nin verdiği birim açık değilse birim uydurma.


========================================
ÇIKTI STANDARDI
========================================

Geniş hisse analizlerinde mümkün olduğunca:

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

Önemli güncel haberleri ve alınmışsa haber detaylarını özetle.

Haber detayını gerçekten MCP'den aldıysan detay ver.

Sadece başlık varsa yalnızca başlığı ve mevcut kısa özeti kullan.

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

Genel görünümü:

- Pozitif
- Nötr
- Negatif

olarak belirt.

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

Giriş, stop veya hedef fiyat MCP verilerinden desteklenmiyorsa
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
 * MCP → OPENAI TOOL FORMAT
 * =====================================
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
 * =====================================
 * NEWS ID BULUCU
 * =====================================
 *
 * MCP get_news sonucunun farklı
 * formatlarını mümkün olduğunca
 * yakalamaya çalışır.
 */

function extractNewsItems(result) {

  const items = [];

  function walk(value) {

    if (!value) {
      return;
    }

    if (
      typeof value === "string"
    ) {

      /*
       * TSV formatındaki haberleri
       * yakalamaya çalış.
       */

      const lines =
        value.split("\n");

      for (
        const line of lines
      ) {

        const trimmed =
          line.trim();

        if (
          !trimmed ||
          trimmed.startsWith("##") ||
          trimmed.startsWith("```")
        ) {
          continue;
        }

        const columns =
          trimmed.split("\t");

        /*
         * TSV:
         * id title summary source url ...
         */

        if (
          columns.length >= 2 &&
          columns[0] &&
          columns[1]
        ) {

          const possibleId =
            columns[0].trim();

          const possibleTitle =
            columns[1].trim();

          /*
           * Haber ID'leri genellikle
           * hex karakterlerden oluşuyor.
           */

          if (
            /^[a-f0-9]{16,}$/i.test(
              possibleId
            )
          ) {

            items.push({

              news_id:
                possibleId,

              title:
                possibleTitle,

              summary:
                columns[2]
                  ? columns[2].trim()
                  : "",

              source:
                columns[3]
                  ? columns[3].trim()
                  : "",

              url:
                columns[4]
                  ? columns[4].trim()
                  : "",

            });

          }

        }

      }

      return;
    }


    if (
      Array.isArray(value)
    ) {

      for (
        const item
        of value
      ) {

        walk(item);

      }

      return;
    }


    if (
      typeof value === "object"
    ) {

      /*
       * Doğrudan haber objesi.
       */

      const newsId =
        value.news_id ||
        value.newsId ||
        value.id;

      const title =
        value.title ||
        value.headline;

      if (
        newsId &&
        title
      ) {

        items.push({

          news_id:
            String(newsId),

          title:
            String(title),

          summary:
            value.summary ||
            value.description ||
            "",

          source:
            value.source ||
            "",

          url:
            value.url ||
            "",

        });

      }


      for (
        const child
        of Object.values(value)
      ) {

        if (
          child &&
          typeof child === "object"
        ) {

          walk(child);

        }

      }

    }

  }

  walk(result);

  /*
   * Aynı news_id tekrarlarını kaldır.
   */

  const unique =
    new Map();

  for (
    const item
    of items
  ) {

    if (
      !unique.has(
        item.news_id
      )
    ) {

      unique.set(
        item.news_id,
        item
      );

    }

  }

  return Array.from(
    unique.values()
  );
}


/*
 * =====================================
 * ÖNEMLİ HABER Mİ?
 * =====================================
 */

function isImportantNews(
  news
) {

  if (
    !news ||
    !news.title
  ) {

    return false;

  }

  const title =
    news.title.toLowerCase();


  const keywords = [

    "özel durum",

    "sözleşme",

    "ihale",

    "sipariş",

    "yeni iş",

    "iş ilişkisi",

    "anlaşma",

    "temettü",

    "sermaye artır",

    "bedelli",

    "bedelsiz",

    "geri alım",

    "pay geri",

    "ortaklık",

    "satın alma",

    "devral",

    "yatırım",

    "kapasite",

    "finansal sonuç",

    "bilanço",

    "kar",

    "zarar",

    "esas sözleşme",

    "yönetim kurulu",

    "genel kurul",

    "borçlanma",

    "tahvil",

    "yatırımcı",

    "fiyat",

  ];


  return keywords.some(
    (keyword) =>
      title.includes(
        keyword
      )
  );
}


/*
 * =====================================
 * MCP NEWS DETAYI OTOMATİK
 * =====================================
 */

async function getImportantNewsDetails(
  client,
  newsResult,
  detailedNewsIds
) {

  const newsItems =
    extractNewsItems(
      newsResult
    );


  if (
    newsItems.length === 0
  ) {

    console.log(
      "NEWS → Haber ID bulunamadı."
    );

    return [];

  }


  /*
   * Öncelikle önemli haberleri seç.
   */

  const important =
    newsItems.filter(
      isImportantNews
    );


  /*
   * Hiç önemli haber bulunamazsa
   * ilk haberi detaylandır.
   *
   * Böylece sistem tamamen boş
   * kalmaz.
   */

  const selected =
    important.length > 0
      ? important.slice(0, 2)
      : newsItems.slice(0, 1);


  const details = [];


  for (
    const news
    of selected
  ) {

    if (
      detailedNewsIds.has(
        news.news_id
      )
    ) {

      continue;

    }


    console.log(
      "MCP → get_news DETAIL",
      {
        news_id:
          news.news_id,
      }
    );


    try {

      const detail =
        await client.callTool({

          name:
            "get_news",

          arguments: {

            news_id:
              news.news_id,

          },

        });


      detailedNewsIds.add(
        news.news_id
      );


      details.push({

        news_id:
          news.news_id,

        title:
          news.title,

        detail,

      });


    } catch (error) {

      console.error(
        "NEWS DETAIL HATASI:",
        error.message
      );

    }

  }


  return details;
}


/*
 * =====================================
 * ANALİZ
 * =====================================
 */

async function analyze(
  question
) {

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


  /*
   * Otomatik detay alınmış haberler.
   */

  const detailedNewsIds =
    new Set();


  /*
   * Haber sonuçlarını takip ediyoruz.
   */

  let latestNewsResult =
    null;


  try {

    /*
     * =====================================
     * MCP CONNECT
     * =====================================
     */

    await client.connect(
      transport
    );


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
        (tool) =>
          tool.name
      )
    );


    /*
     * =====================================
     * OPENROUTER TOOLS
     * =====================================
     */

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
     *
     * Maksimum 6 AI turu.
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
       * =====================================
       * OPENROUTER
       * =====================================
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
       * FINAL CEVAP
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
       * AI mesajını ekle.
       */

      messages.push(
        message
      );


      /*
       * =====================================
       * TOOL ÇAĞRILARI
       * =====================================
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

          argumentsObject =
            {};

        }


        console.log(
          `MCP → ${functionName}`,
          argumentsObject
        );


        /*
         * =====================================
         * MCP TOOL
         * =====================================
         */

        try {

          const result =
            await client.callTool({

              name:
                functionName,

              arguments:
                argumentsObject,

            });


          /*
           * Haber sonucunu sakla.
           */

          if (
            functionName ===
            "get_news"
          ) {

            latestNewsResult =
              result;

          }


          /*
           * =====================================
           * HABER DETAYI OTOMATİK
           * =====================================
           */

          if (
            functionName ===
              "get_news" &&
            !argumentsObject.news_id
          ) {

            const details =
              await getImportantNewsDetails(

                client,

                result,

                detailedNewsIds

              );


            /*
             * Ana haber sonucuna
             * detayları ekle.
             */

            if (
              details.length > 0
            ) {

              result.content =
                Array.isArray(
                  result.content
                )
                  ? [
                      ...result.content,

                      {
                        type:
                          "text",

                        text:
                          "\n\n===== OTOMATİK HABER DETAYLARI =====\n" +
                          JSON.stringify(
                            details,
                            null,
                            2
                          ),

                      },

                    ]
                  : [

                      {
                        type:
                          "text",

                        text:
                          JSON.stringify(
                            result
                          ),

                      },

                      {
                        type:
                          "text",

                        text:
                          "\n\n===== OTOMATİK HABER DETAYLARI =====\n" +
                          JSON.stringify(
                            details,
                            null,
                            2
                          ),

                      },

                    ];

            }

          }


          /*
           * =====================================
           * TOOL SONUCUNU OPENROUTER'A GÖNDER
           * =====================================
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
                (tool) =>
                  tool.name
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