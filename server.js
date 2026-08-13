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
} = require(
  "@modelcontextprotocol/sdk/client/streamableHttp.js"
);

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

if (!process.env.MCP_URL) {
  console.error(
    "❌ MCP_URL bulunamadı."
  );
}

const ai =
  new OpenAI({
    apiKey:
      process.env.OPENROUTER_API_KEY,

    baseURL:
      "https://openrouter.ai/api/v1",
  });


/*
 * =====================================
 * OPENROUTER MODEL
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
Sen BorsaCI adlı profesyonel bir BIST ve finansal piyasa analiz asistanısın.

========================================
TEMEL KURAL
========================================

Gerçek MCP verisi olmadan hiçbir gerçek piyasa verisi uydurma.

Özellikle aşağıdakileri tahmin ederek üretme:

- Fiyat
- Günlük değişim
- Hacim
- RSI
- MACD
- Trend
- Destek
- Direnç
- Hareketli ortalamalar
- Momentum
- Analist hedef fiyatı
- Finansal oranlar
- Haber
- Haber detayı
- Bilanço bilgisi

MCP'den gelen veri ile kendi yorumunu açıkça ayır.

Bir veri MCP çıktısında yoksa:

"Veri bulunamadı."

de.

Tahmin ederek değer üretme.


========================================
GENİŞ HİSSE ANALİZİ
========================================

Kullanıcı:

- "ASELS şu an ne durumda?"
- "ASELS analiz et"
- "TUPRS ne durumda?"
- "oyundayız mı?"
- "bu hisse ne durumda?"
- "alınır mı?"
- "ne düşünüyorsun?"

gibi geniş bir analiz istiyorsa mümkün olduğunca:

1. get_quote
2. get_technical_analysis
3. get_news
4. önemli haberlerin detayları
5. get_analyst_data
6. gerektiğinde temel analiz

değerlendir.

Ancak server tarafından otomatik alınan haber detayları da dahil olmak üzere
yalnızca gerçekten MCP'den gelen verileri kullan.


========================================
HABERLER
========================================

Haber analizi özellikle önemlidir.

get_news sonucunda haber listesi varsa:

- Haber ID'sini oku.
- Haber başlığını oku.
- Tarihini dikkate al.
- Önemli görünen haberleri detaylarıyla değerlendir.

Server önemli haberlerin detaylarını otomatik olarak get_news(news_id)
ile sağlayabilir.

Detay alınmışsa haberin içeriğini özetleyebilirsin.

Sadece başlık varsa başlıktan detay uydurma.

Haber ile fiyat hareketi arasında doğrudan nedensellik kurma.

Yalnızca veriler destekliyorsa:

"olası kataliz"

olarak ifade et.


========================================
TEKNİK ANALİZ
========================================

Teknik analiz için:

get_quote
get_technical_analysis

kullan.

Gerekliyse:

get_historical_data

kullan.

MCP çıktısında mevcutsa:

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

MCP'de olmayan teknik seviyeleri kendin hesaplamadıysan
kesin destek veya direnç olarak sunma.


========================================
ANALİST VERİSİ
========================================

Analist hedef fiyatı veya görüşü soruluyorsa:

get_analyst_data

kullan.

Kurum hedef fiyatı ile konsensüs hedefini birbirinden ayır.

Analist hedefini BorsaCI'nın kendi hedefi gibi sunma.

Veri yoksa:

"Veri bulunamadı."

de.


========================================
TEMEL ANALİZ
========================================

Gerektiğinde:

get_financial_ratios
get_financial_statements
get_earnings
get_profile

kullan.

Oranları doğru isimlendir:

P/B = PD/DD
P/E = F/K
Dividend Yield = Temettü Verimi
Market Cap = Piyasa Değeri

MCP'nin verdiği birimi değiştirme.

Bir değer anlamsız görünüyorsa uydurma.


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

Önemli haberleri tarihleriyle özetle.

Detay alınmışsa haberin önemli içeriğini açıkla.

## 🎯 Analist Görüşleri

- Konsensüs:
- Hedef fiyat:
- Öne çıkan kurum görüşleri:

## 💰 Temel Görünüm

Gerektiğinde:

- F/K
- PD/DD
- Temettü verimi
- Piyasa değeri
- Finansal sonuçlar

## 🎯 BorsaCI Yorumu

Sonuç:

- Pozitif
- Nötr
- Negatif

olarak değerlendir.

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

MCP verisiyle desteklenmeyen kesin giriş,
stop veya hedef fiyat uydurma.

Kesin kazanç veya kesin fiyat garantisi verme.


========================================
VERİ KALİTESİ
========================================

- Eski veriyi güncelmiş gibi sunma.
- MCP verisi olmadan gerçek zamanlı fiyat verme.
- Haber başlığından detay uydurma.
- Sosyal medya verisi yoksa sosyal medya yorumu uydurma.
- MCP verileri çelişirse çelişkiyi belirt.
- MCP'de olmayan teknik seviyeleri veriymiş gibi gösterme.
- Hacmi günlük değişim olarak gösterme.
- Piyasa değerini hacim olarak gösterme.
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
 * MCP TOOL → OPENAI TOOL
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
 * =====================================
 * SYMBOL NORMALIZER
 * =====================================
 *
 * Bazı modeller:
 *
 * symbol: "TUPRS"
 *
 * yerine:
 *
 * symbol: ["TUPRS"]
 *
 * gönderebiliyor.
 *
 * MCP çoğu durumda string beklediği için
 * tek elemanlı array'i string'e çeviriyoruz.
 */

function normalizeArguments(
  args
) {

  if (
    !args ||
    typeof args !== "object"
  ) {
    return {};
  }

  const normalized = {
    ...args,
  };

  if (
    Array.isArray(
      normalized.symbol
    ) &&
    normalized.symbol.length === 1
  ) {

    normalized.symbol =
      normalized.symbol[0];

  }

  return normalized;
}


/*
 * =====================================
 * NEWS ID ÇIKARICI
 * =====================================
 */

function extractNewsItems(
  result
) {

  const items = [];

  try {

    /*
     * MCP sonucu genellikle:
     *
     * {
     *   content: [
     *     {
     *       type: "text",
     *       text: "..."
     *     }
     *   ]
     * }
     */

    if (
      result &&
      Array.isArray(
        result.content
      )
    ) {

      for (
        const content
        of result.content
      ) {

        if (
          content &&
          typeof content.text ===
            "string"
        ) {

          const text =
            content.text;

          /*
           * TSV içindeki satırları
           * bulmaya çalış.
           */

          const lines =
            text.split("\n");

          for (
            const line
            of lines
          ) {

            /*
             * Haber ID'leri genellikle
             * uzun hexadecimal string.
             */

            const match =
              line.match(
                /^([a-f0-9]{20,})\t/
              );

            if (match) {

              const id =
                match[1];

              /*
               * Başlığı da mümkünse al.
               */

              const parts =
                line.split("\t");

              const title =
                parts[1] || "";

              items.push({
                id,
                title,
              });

            }

          }

        }

      }

    }

  } catch (error) {

    console.error(
      "Haber ID çıkarma hatası:",
      error.message
    );

  }

  return items;
}


/*
 * =====================================
 * ÖNEMLİ HABER SEÇİCİ
 * =====================================
 *
 * Her haberi detaylandırmak istemiyoruz.
 *
 * İlk etapta en fazla 3 haber.
 *
 * Finansal sonuç, sözleşme, yatırım,
 * temettü, sermaye, satın alma,
 * ihale, ortaklık, yönetim vb.
 * başlıkları önceliklendiriyoruz.
 */

function selectImportantNews(
  newsItems
) {

  if (
    !Array.isArray(newsItems)
  ) {
    return [];
  }

  const keywords = [
    "finansal",
    "bilanço",
    "finans",
    "sözleşme",
    "anlaşma",
    "ihale",
    "sipariş",
    "yatırım",
    "temettü",
    "sermaye",
    "bedelsiz",
    "bedelli",
    "geri alım",
    "pay geri",
    "satın alma",
    "ortaklık",
    "iştirak",
    "birleşme",
    "devralma",
    "kredi",
    "borç",
    "kapasite",
    "üretim",
    "fabrika",
    "proje",
    "ödül",
    "savunma",
    "ihracat",
    "döviz",
    "kur",
    "özel durum",
  ];

  const scored =
    newsItems.map(
      (item, index) => {

        const title =
          String(
            item.title || ""
          ).toLowerCase();

        let score = 0;

        for (
          const keyword
          of keywords
        ) {

          if (
            title.includes(
              keyword
            )
          ) {
            score++;
          }

        }

        /*
         * Listenin başındaki haberler
         * biraz öncelikli.
         */

        score +=
          Math.max(
            0,
            2 - index * 0.2
          );

        return {
          ...item,
          score,
        };

      }
    );

  scored.sort(
    (a, b) =>
      b.score - a.score
  );

  return scored
    .slice(0, 3);
}


/*
 * =====================================
 * MCP NEWS DETAIL
 * =====================================
 *
 * Haber listesi geldikten sonra
 * önemli haberlerin detayını
 * server tarafında otomatik çağırır.
 */

async function fetchNewsDetails(
  client,
  newsItems
) {

  const important =
    selectImportantNews(
      newsItems
    );

  if (
    important.length === 0
  ) {

    console.log(
      "📰 Detaylandırılacak önemli haber bulunamadı."
    );

    return [];
  }

  const details = [];

  for (
    const news
    of important
  ) {

    if (!news.id) {
      continue;
    }

    console.log(
      `📰 HABER DETAY → ${news.id}`
    );

    try {

      const detail =
        await client.callTool({

          name:
            "get_news",

          arguments: {
            news_id:
              news.id,
          },

        });

      details.push({
        news_id:
          news.id,

        title:
          news.title,

        detail,
      });

    } catch (error) {

      console.error(
        `Haber detay hatası ${news.id}:`,
        error.message
      );

    }

  }

  return details;
}


/*
 * =====================================
 * HABER SONUÇLARINI MESSAGES'A EKLE
 * =====================================
 */

function addNewsContext(
  messages,
  newsListResult,
  newsDetails
) {

  const context = {
    news_list:
      newsListResult,

    important_news_details:
      newsDetails,
  };

  messages.push({

    role:
      "system",

    content:
      `
SERVER TARAFINDAN OTOMATİK HABER KONTROLÜ YAPILDI.

Aşağıdaki veri MCP get_news aracından alınmıştır.

Haber listesi:
${JSON.stringify(
  newsListResult
)}

Önemli haber detayları:
${JSON.stringify(
  newsDetails
)}

Bu verileri analizinde kullan.

Önemli haber detayları mevcutsa bunları
"Haber / KAP" bölümünde özetle.

Haber detayında olmayan bilgileri uydurma.
`,

  });

}


/*
 * =====================================
 * GENİŞ ANALİZ Mİ?
 * =====================================
 */

function isBroadAnalysis(
  question
) {

  const text =
    String(
      question || ""
    ).toLowerCase();

  const keywords = [
    "şu an ne durumda",
    "ne durumda",
    "analiz et",
    "analiz",
    "alınır mı",
    "alınır",
    "oyundayız",
    "oyunda mıyız",
    "ne düşünüyorsun",
    "yorumla",
    "görünüm",
    "durumu",
  ];

  return keywords.some(
    (keyword) =>
      text.includes(keyword)
  );
}


/*
 * =====================================
 * HİSSE SEMBOLÜ ÇIKAR
 * =====================================
 *
 * Otomatik haber çağrısı için
 * sorudan sembolü mümkün olduğunca
 * bulmaya çalışıyoruz.
 */

function extractSymbol(
  question
) {

  const text =
    String(
      question || ""
    );

  /*
   * BIST hisseleri genellikle
   * 3-6 karakter.
   */

  const matches =
    text.match(
      /\b[A-ZÇĞİÖŞÜ]{3,6}\b/g
    );

  if (
    !matches ||
    matches.length === 0
  ) {
    return null;
  }

  /*
   * Türkçe kelimeleri filtrele.
   */

  const ignored = new Set([
    "ŞUAN",
    "ŞU",
    "NE",
    "DURUMDA",
    "ANALİZ",
    "BIST",
    "HİSSE",
    "HISSE",
    "ALINIR",
    "MI",
    "Mİ",
    "VE",
    "BU",
    "TUPRS",
  ]);

  /*
   * TUPRS özel olarak korunuyor.
   */

  for (
    const match
    of matches
  ) {

    if (
      match === "TUPRS"
    ) {
      return "TUPRS";
    }

  }

  for (
    const match
    of matches
  ) {

    if (
      !ignored.has(match)
    ) {

      return match;

    }

  }

  return null;
}


/*
 * =====================================
 * ANALYZE
 * =====================================
 */

async function analyze(
  question
) {

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
       * TOOL YOK → FINAL
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
       * =====================================
       * AI TOOL MESAJI
       * =====================================
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

          argumentsObject = {};

        }


        /*
         * Normalize
         */

        argumentsObject =
          normalizeArguments(
            argumentsObject
          );


        console.log(
          `MCP → ${functionName}`,
          argumentsObject
        );


        /*
         * =====================================
         * MCP CALL
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
           * =====================================
           * NEWS ÖZEL İŞLEMİ
           * =====================================
           *
           * AI get_news çağırdıysa,
           * sonuçtan önemli haberleri çıkarıp
           * detaylarını otomatik al.
           */

          if (
            functionName ===
              "get_news" &&
            !argumentsObject.news_id
          ) {

            console.log(
              "📰 Haber listesi alındı."
            );


            const newsItems =
              extractNewsItems(
                result
              );


            console.log(
              `📰 ${newsItems.length} haber bulundu.`
            );


            const newsDetails =
              await fetchNewsDetails(
                client,
                newsItems
              );


            /*
             * Ana tool sonucunu ekle
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


            /*
             * Detayları ayrı context
             * olarak modele ver.
             */

            messages.push({

              role:
                "system",

              content:
                `
OTOMATİK HABER DETAYLARI

get_news sonucundan önemli görülen
haberlerin detayları server tarafından
otomatik olarak alınmıştır.

${JSON.stringify(
  newsDetails
)}

Bu haber detaylarını kullan.

Haber detayında bulunmayan bilgileri
uydurma.
`,

            });


          } else {


            /*
             * Normal tool sonucu
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

          }


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
    async (
      req,
      res
    ) => {


      /*
       * =====================================
       * /quote
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
          (
            error,
            data
          ) => {

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
       * POST /ask
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
          (
            error,
            data
          ) => {

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
          (
            error,
            data
          ) => {

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