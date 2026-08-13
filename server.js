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
- Teknik analiz için get_quote, get_technical_analysis ve gerektiğinde
  get_historical_data kullan.
- Temel analiz için ilgili finansal MCP araçlarını kullan.
- Haber gerekiyorsa get_news kullan.
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
          console.error(`MCP ${call.name} hatası:`, error.message);

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

    throw new Error("Maksimum MCP adımına ulaşıldı.");

  } finally {
    try {
      await transport.close();
    } catch (_) {
      // bağlantı zaten kapanmış olabilir
    }
  }
}

/*
 * Gemini API bazı JSON Schema alanlarını kabul etmiyor.
 * MCP şemalarındaki unsupported alanları temizliyoruz.
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
    if (unsupported.includes(key)) continue;

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

const server = http.createServer(async (req, res) => {


  /*
   * ANALİZ API
   */
  if (
    req.method === "POST" &&
    req.url === "/ask"
  ) {

    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
    });

    req.on("end", async () => {

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

      }

      catch (error) {

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

    });

    return;
  }

  /*
   * BULUNAMAYAN ADRES
   */
  res.writeHead(404, {
    "Content-Type":
      "text/plain; charset=utf-8",
  });

  res.end("Not Found");
});

server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `BorsaCI server ${PORT} portunda çalışıyor.`
    );

  }
);