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

Kurallar:
- Gerçek piyasa verisi olmadan fiyat, RSI, MACD veya teknik seviye uydurma.
- Güncel veri gerektiğinde mutlaka MCP araçlarını kullan.
- Teknik analiz için uygun MCP araçlarını kullan.
- Temel analiz için ilgili finansal MCP araçlarını kullan.
- Haber gerekiyorsa haber MCP aracını kullan.
- Veriler çelişiyorsa bunu belirt.
- Kesin getiri garantisi verme.
- Sonuçları Türkçe, net ve profesyonel şekilde sun.
`;

async function analyze(question) {
  const transport = new StreamableHTTPClientTransport(
    new URL(process.env.MCP_URL)
  );

  const client = new Client({
    name: "gemini-borsaci-server",
    version: "1.0.0",
  });

  try {
    await client.connect(transport);

    const toolResult = await client.listTools();

    console.log(
      "MCP TOOLS:",
      toolResult.tools.map((tool) => tool.name)
    );

    const geminiTools = [
      {
        functionDeclarations: toolResult.tools.map((tool) => ({
          name: tool.name,
          description: tool.description || "",
          parameters: cleanSchema(tool.inputSchema),
        })),
      },
    ];

    let contents = [
      {
        role: "user",
        parts: [{ text: question }],
      },
    ];

    for (let step = 0; step < 10; step++) {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          tools: geminiTools,
        },
      });

      const candidate = response.candidates?.[0];

      if (!candidate) {
        throw new Error("Gemini cevap üretmedi.");
      }

      const parts = candidate.content?.parts || [];

      const functionCalls = parts.filter(
        (part) => part.functionCall
      );

      if (functionCalls.length === 0) {
        return response.text;
      }

      contents.push(candidate.content);

      for (const part of functionCalls) {
        const call = part.functionCall;

        console.log(`MCP → ${call.name}`);

        try {
          const result = await client.callTool({
            name: call.name,
            arguments: call.args || {},
          });

          contents.push({
            role: "user",
            parts: [
              {
                functionResponse: {
                  name: call.name,
                  response: {
                    result,
                  },
                },
              },
            ],
          });
        } catch (error) {
          console.error(
            `MCP ${call.name} hatası:`,
            error.message
          );

          contents.push({
            role: "user",
            parts: [
              {
                functionResponse: {
                  name: call.name,
                  response: {
                    error: error.message,
                  },
                },
              },
            ],
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
 * Gemini API bazı JSON Schema alanlarını kabul etmiyor.
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
 * HTTP SERVER
 */
const server = http.createServer(
  async (req, res) => {

    /*
     * =====================================
     * MCP TOOL TEST
     * =====================================
     *
     * Şimdilik gerçek veri çağırmıyoruz.
     * MCP'nin gerçekten hangi tool'ları
     * sunduğunu öğreniyoruz.
     */

    if (
      req.method === "GET" &&
      req.url.startsWith("/quote")
    ) {

      try {

        const url = new URL(
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
            new URL(process.env.MCP_URL)
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
                        tool.description || "",

                      inputSchema:
                        tool.inputSchema || null,
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

    res.end("Not Found");

  }
);


/*
 * SERVER START
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