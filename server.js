require("dotenv").config();

const http = require("http");
const path = require("path");
const fs = require("fs");

const { GoogleGenAI } = require("@google/genai");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const {
  StreamableHTTPClientTransport,
} = require("@modelcontextprotocol/sdk/client/streamableHttp.js");

const PORT = process.env.PORT || 3000;

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const SYSTEM_PROMPT = `
Sen BorsaCI adlı profesyonel bir BIST ve finansal piyasa analiz asistanısın.

TEMEL KURAL:
Gerçek piyasa verisi olmadan hiçbir fiyat, RSI, MACD, trend, destek, direnç,
analist hedefi veya haber bilgisi uydurma.

GÜNCEL VERİ:
Kullanıcının sorusu güncel piyasa verisi gerektiriyorsa mutlaka MCP araçlarını kullan.

TEKNİK ANALİZ:
Teknik analiz istendiğinde uygun şekilde:
- get_quote
- get_technical_analysis
- gerektiğinde get_historical_data
araçlarını kullan.

HABER ANALİZİ:
Bir hisse senedi hakkında analiz yaparken güncel haber/kataliz etkisini mutlaka kontrol et.

BIST hisseleri için:
1. Önce get_news aracını kullanarak hissenin güncel KAP haberlerini kontrol et.
2. Haber listesinde önemli görünen bir bildirim varsa news_id kullanarak
   get_news aracını tekrar çağır ve haberin detayını getir.
3. Haberlerin tarihini dikkate al.
4. Haber ile fiyat hareketi arasında doğrudan ilişki olduğunu varsayma;
   yalnızca veriler destekliyorsa olası kataliz olarak belirt.
5. Haber bulunamazsa bunu açıkça belirt.
6. Haber başlığından daha fazlasını uydurma; detay alınmadıysa detay varmış gibi konuşma.

ANALİST VERİSİ:
Analist görüşü veya hedef fiyat soruluyorsa get_analyst_data aracını kullan.
Analist hedeflerini kendi görüşün gibi sunma.
Konsensüs ile tek bir kurumun görüşünü birbirinden ayır.

TEMEL ANALİZ:
Gerektiğinde:
- get_financial_ratios
- get_financial_statements
- get_earnings
- get_profile
araçlarını kullan.

HABER + TEKNİK ANALİZ:
Kullanıcı "bu hisse ne durumda", "oyundayız mı", "alınır mı",
"analiz et" gibi geniş bir soru sorarsa mümkün olduğunda:
1. Güncel fiyat
2. Teknik görünüm
3. Güncel KAP haberleri
4. Önemli haberlerin detayları
5. Analist görüşleri
6. Temel görünüm
başlıklarını birlikte değerlendir.

VERİ KALİTESİ:
- Veriler çelişiyorsa çelişkiyi belirt.
- Eski veriyi güncelmiş gibi sunma.
- MCP'den gelmeyen gerçek zamanlı verileri uydurma.
- Sosyal medya verisi için uygun bir MCP aracı yoksa sosyal medya yorumu
  varmış gibi davranma.
- Kesin getiri veya kesin fiyat garantisi verme.

ÇIKTI:
Sonuçları Türkçe, net, profesyonel ve işlem odaklı sun.
Gereksiz uzun açıklamalardan kaçın.

Bir işlem fikri sunuyorsan:
- Senaryo
- Giriş bölgesi
- Stop
- TP1 / TP2
- Risk
mantığını açıkça belirt.

Ancak bunların hiçbiri gerçek MCP verisi olmadan uydurulmamalıdır.
`;

async function analyze(question) {

  const transport =
    new StreamableHTTPClientTransport(
      new URL(process.env.MCP_URL)
    );

  const client =
    new Client({
      name: "gemini-borsaci-server",
      version: "1.0.0",
    });

  try {

    await client.connect(transport);

    const toolResult =
      await client.listTools();

    console.log(
      "MCP TOOLS:",
      toolResult.tools.map(
        (tool) => tool.name
      )
    );

    /*
     * =====================================
     * TOOL LİSTESİNİ HAZIRLA
     * =====================================
     */

    const availableTools =
      toolResult.tools.map(
        (tool) => ({
          name: tool.name,
          description:
            tool.description || "",
          inputSchema:
            tool.inputSchema || null,
        })
      );

    /*
     * =====================================
     * 1. GEMINI:
     * HANGİ VERİLER GEREKLİ?
     * =====================================
     */

    const planningPrompt = `
Kullanıcı şu soruyu sordu:

"${question}"

Sen bir BIST finans analiz sistemi için veri planlayıcısısın.

Aşağıdaki MCP araçlarından SADECE gerekli olanları seç.

Mevcut araçlar:

${JSON.stringify(
  availableTools,
  null,
  2
)}

Kurallar:

1. Güncel fiyat gerekiyorsa get_quote kullan.
2. Teknik analiz gerekiyorsa get_technical_analysis kullan.
3. Hisse analizi gerekiyorsa güncel KAP haberlerini kontrol etmek için get_news kullan.
4. Haber listesinde önemli bir haber varsa onun news_id'sini daha sonra sistem otomatik olarak detaylandıracaktır.
5. Analist hedefi/görüşü gerekiyorsa get_analyst_data kullan.
6. Temel analiz gerekiyorsa get_profile, get_financial_ratios,
   get_financial_statements veya get_earnings araçlarından uygun olanları seç.
7. Kullanıcının istemediği gereksiz araçları seçme.
8. Gerçek veri olmadan hiçbir şeyi tahmin etme.
9. BIST hissesi için sembol açıkça belli ise market=bist kullan.

SADECE aşağıdaki JSON formatında cevap ver:

{
  "tools": [
    {
      "name": "tool_name",
      "arguments": {}
    }
  ]
}

Başka hiçbir metin yazma.
`;

    const planningResponse =
      await ai.models.generateContent({
        model: "gemini-2.5-flash",

        contents: [
          {
            role: "user",
            parts: [
              {
                text:
                  planningPrompt,
              },
            ],
          },
        ],

        config: {
          systemInstruction:
            SYSTEM_PROMPT,
        },
      });

    /*
     * =====================================
     * PLAN JSON'UNU AL
     * =====================================
     */

    let planText =
      planningResponse.text
        ?.trim() || "";

    /*
     * Markdown JSON fence temizle
     */

    planText =
      planText
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

    let plan;

    try {

      plan =
        JSON.parse(planText);

    } catch (error) {

      console.error(
        "PLAN JSON HATASI:",
        planText
      );

      throw new Error(
        "Gemini geçerli bir MCP planı oluşturamadı."
      );
    }

    if (
      !plan ||
      !Array.isArray(plan.tools)
    ) {

      throw new Error(
        "MCP planı geçersiz."
      );
    }

    /*
     * =====================================
     * GÜVENLİK:
     * SADECE GERÇEK TOOL'LARI ÇALIŞTIR
     * =====================================
     */

    const validToolNames =
      new Set(
        toolResult.tools.map(
          (tool) => tool.name
        )
      );

    const selectedTools =
      plan.tools.filter(
        (item) =>
          item &&
          validToolNames.has(
            item.name
          )
      );

    console.log(
      "SEÇİLEN MCP TOOLS:",
      selectedTools.map(
        (tool) => tool.name
      )
    );

    /*
     * =====================================
     * 2. MCP ARAÇLARINI ÇALIŞTIR
     * =====================================
     */

    const collectedData = [];

    for (
      const selected of selectedTools
    ) {

      try {

        console.log(
          `MCP → ${selected.name}`,
          selected.arguments || {}
        );

        const result =
          await client.callTool({
            name:
              selected.name,

            arguments:
              selected.arguments || {},
          });

        collectedData.push({
          tool:
            selected.name,

          arguments:
            selected.arguments || {},

          result,
        });

        /*
         * =====================================
         * HABER LİSTESİNDEN ÖNEMLİ HABERLERİ
         * OTOMATİK OLARAK DETAYLANDIR
         * =====================================
         */

        if (
          selected.name === "get_news"
        ) {

          const text =
            result?.content
              ?.find(
                (item) =>
                  item.type === "text"
              )
              ?.text || "";

          /*
           * TSV içindeki news_id'leri yakala.
           */

          const newsIds =
            [
              ...text.matchAll(
                /^([a-f0-9]{20,})\t/gim
              ),
            ]
              .map(
                (match) =>
                  match[1]
              )
              .slice(0, 3);

          /*
           * İlk 3 haberin detayını çek.
           *
           * Böylece Gemini'nin:
           * get_news → news_id → get_news
           * şeklinde ekstra turlar yapmasına gerek kalmaz.
           */

          for (
            const newsId of newsIds
          ) {

            try {

              console.log(
                `MCP → get_news detay ${newsId}`
              );

              const detail =
                await client.callTool({
                  name:
                    "get_news",

                  arguments: {
                    news_id:
                      newsId,
                  },
                });

              collectedData.push({
                tool:
                  "get_news_detail",

                arguments: {
                  news_id:
                    newsId,
                },

                result:
                  detail,
              });

            } catch (detailError) {

              console.error(
                `NEWS DETAIL ERROR ${newsId}:`,
                detailError.message
              );

            }
          }
        }

      } catch (error) {

        console.error(
          `MCP ${selected.name} HATASI:`,
          error.message
        );

        collectedData.push({
          tool:
            selected.name,

          arguments:
            selected.arguments || {},

          error:
            error.message,
        });
      }
    }

    /*
     * =====================================
     * 3. GEMINI:
     * GERÇEK VERİLERDEN FİNAL ANALİZ
     * =====================================
     */

    const finalPrompt = `
Kullanıcı sorusu:

"${question}"

Aşağıdaki veriler MCP araçlarından GERÇEK olarak alınmıştır:

${JSON.stringify(
  collectedData,
  null,
  2
)}

Bu verileri kullanarak kullanıcıya Türkçe cevap ver.

ÇOK ÖNEMLİ:

- MCP verisinde olmayan hiçbir fiyat, oran, RSI,
  MACD, destek, direnç, hedef veya haber detayı uydurma.
- Verinin tarihi eskiyse bunu belirt.
- Haberleri yorumlarken haber ile fiyat hareketi arasında
  kesin nedensellik kurma.
- KAP haberinin içeriğini doğrudan MCP verisinden değerlendir.
- Analist hedeflerini analistin görüşü olarak belirt.
- Analist konsensüsü ile kendi teknik yorumunu ayır.
- MCP bir araçta hata verdiyse bunu gizleme.
- Veriler yetersizse "bu veriyle kesin söylenemez" de.
- Kullanıcı işlem fikri istiyorsa:
  giriş, stop, TP1, TP2 ve risk mantığını yalnızca
  gerçek verilere dayanarak oluştur.
- Kesin kazanç veya fiyat garantisi verme.

Cevabı net, profesyonel ve işlem odaklı hazırla.
`;

    const finalResponse =
      await ai.models.generateContent({
        model:
          "gemini-2.5-flash",

        contents: [
          {
            role: "user",
            parts: [
              {
                text:
                  finalPrompt,
              },
            ],
          },
        ],

        config: {
          systemInstruction:
            SYSTEM_PROMPT,
        },
      });

    return finalResponse.text;

  } finally {

    try {
      await transport.close();
    } catch (_) {}

  }
}


/*
 * =====================================
 * GEMINI JSON SCHEMA TEMİZLEYİCİ
 * =====================================
 *
 * Gemini API bazı JSON Schema alanlarını
 * kabul etmiyor.
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
       * /quote?symbol=ASELS
       *
       * Şimdilik gerçek quote çağrısı yapmıyor.
       * MCP'nin sunduğu gerçek tool listesini
       * gösteriyor.
       */

      if (
        req.method === "GET" &&
        req.url.startsWith("/quote")
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

            res.writeHead(400, {
              "Content-Type":
                "application/json; charset=utf-8",
            });

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

            res.writeHead(200, {
              "Content-Type":
                "application/json; charset=utf-8",
            });

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

          res.writeHead(500, {
            "Content-Type":
              "application/json; charset=utf-8",
          });

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
       * MCP NEWS TEST
       * =====================================
       *
       * /news?symbol=ASELS&limit=5
       *
       * Gerçek MCP get_news aracını çağırır.
       */

      if (
        req.method === "GET" &&
        req.url.startsWith("/news")
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

          const limit =
            Number(
              url.searchParams.get("limit") || 10
            );

          const newsId =
            url.searchParams
              .get("news_id");

          if (!symbol && !newsId) {

            res.writeHead(400, {
              "Content-Type":
                "application/json; charset=utf-8",
            });

            res.end(
              JSON.stringify({
                error:
                  "symbol veya news_id parametresi gerekli.",
              })
            );

            return;
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
                "borsaci-news-client",

              version:
                "1.0.0",
            });

          try {

            await client.connect(
              transport
            );

            const arguments_ = {};

            if (symbol) {
              arguments_.symbol = symbol;
            }

            if (newsId) {
              arguments_.news_id = newsId;
            }

            if (!newsId) {
              arguments_.limit = limit;
            }

            console.log(
              "NEWS → get_news",
              arguments_
            );

            const result =
              await client.callTool({
                name: "get_news",
                arguments: arguments_,
              });

            res.writeHead(200, {
              "Content-Type":
                "application/json; charset=utf-8",
            });

            res.end(
              JSON.stringify(
                result,
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
            "NEWS ERROR:",
            error
          );

          res.writeHead(500, {
            "Content-Type":
              "application/json; charset=utf-8",
          });

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

              res.writeHead(500, {
                "Content-Type":
                  "text/plain; charset=utf-8",
              });

              res.end(
                "Internal Server Error"
              );

              return;
            }

            res.writeHead(200, {
              "Content-Type":
                "text/html; charset=utf-8",
            });

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

              res.writeHead(200, {
                "Content-Type":
                  "application/json; charset=utf-8",
              });

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

              res.writeHead(500, {
                "Content-Type":
                  "application/json; charset=utf-8",
              });

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

              res.writeHead(500, {
                "Content-Type":
                  "text/plain; charset=utf-8",
              });

              res.end(
                "Internal Server Error"
              );

              return;
            }

            res.writeHead(200, {
              "Content-Type":
                "text/css; charset=utf-8",
            });

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

              res.writeHead(500, {
                "Content-Type":
                  "text/plain; charset=utf-8",
              });

              res.end(
                "Internal Server Error"
              );

              return;
            }

            res.writeHead(200, {
              "Content-Type":
                "application/javascript; charset=utf-8",
            });

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

      res.writeHead(404, {
        "Content-Type":
          "text/plain; charset=utf-8",
      });

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

  }
);