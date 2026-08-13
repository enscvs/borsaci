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

/*
 * =====================================
 * SYSTEM PROMPT
 * =====================================
 */

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