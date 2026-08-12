require("dotenv").config();

const { GoogleGenAI } = require("@google/genai");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const {
  StreamableHTTPClientTransport,
} = require("@modelcontextprotocol/sdk/client/streamableHttp.js");

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const SYSTEM_PROMPT = `
Sen BorsaCI adlı profesyonel bir BIST ve finansal piyasa analiz asistanısın.

Temel prensiplerin:

- Gerçek piyasa verisi olmadan fiyat, RSI, MACD, bilanço veya teknik seviye uydurma.
- Güncel veri gerektiğinde mutlaka MCP araçlarını kullan.
- Kullanıcı bir hisse soruyorsa önce sembolü doğrula.
- Teknik analiz için gerektiğinde get_quote, get_technical_analysis ve
  get_historical_data araçlarını kullan.
- Temel analiz gerekiyorsa get_profile, get_financial_statements,
  get_financial_ratios ve get_earnings araçlarını kullan.
- Haber/katalizör gerekiyorsa get_news kullan.
- Analist beklentisi gerekiyorsa get_analyst_data kullan.
- Sektör karşılaştırması gerekiyorsa get_sector_comparison kullan.
- Gerektiğinde birden fazla aracı birlikte kullan.
- Veriler çelişiyorsa bunu açıkça belirt.
- Kesin getiri garantisi verme.
- Al/sat kararını kullanıcı adına kesin emir şeklinde verme; bunun yerine
  senaryo, risk, destek/direnç, stop ve hedef bölgelerini açıkla.
- Teknik analizde trend, momentum, hacim, volatilite ve önemli seviyeleri
  birlikte değerlendir.
- Temel analizde değerleme, kârlılık, borçluluk, büyüme ve nakit akışını
  birlikte değerlendir.
- Sonuçları Türkçe ve net biçimde sun.
`;

async function main() {
  const transport = new StreamableHTTPClientTransport(
    new URL(process.env.MCP_URL)
  );

  const client = new Client({
    name: "gemini-borsaci",
    version: "1.0.0",
  });

  console.log("Borsa MCP'ye bağlanılıyor...");

  await client.connect(transport);

  console.log("✅ MCP hazır.");

  const toolResult = await client.listTools();

  const tools = toolResult.tools;

  console.log(`✅ ${tools.length} MCP aracı yüklendi.`);

function sanitizeGeminiSchema(schema) {
  if (!schema || typeof schema !== "object") {
    return schema;
  }

  const allowedKeys = new Set([
    "type",
    "format",
    "description",
    "nullable",
    "enum",
    "items",
    "properties",
    "required",
    "additionalProperties",
  ]);

  const result = {};

  for (const [key, value] of Object.entries(schema)) {
    if (!allowedKeys.has(key)) {
      continue;
    }

    if (key === "properties" && value && typeof value === "object") {
      result.properties = {};

      for (const [propName, propSchema] of Object.entries(value)) {
        result.properties[propName] = sanitizeGeminiSchema(propSchema);
      }

      continue;
    }

    if (key === "items" && value && typeof value === "object") {
      result.items = sanitizeGeminiSchema(value);
      continue;
    }

    if (key === "additionalProperties") {
      // Gemini function schema tarafında bunu mümkün olduğunca basit tut.
      if (typeof value === "boolean") {
        result.additionalProperties = value;
      }
      continue;
    }

    result[key] = value;
  }

  return result;
}

 const geminiTools = [
  {
    functionDeclarations: tools.map((tool) => ({
      name: tool.name,
      description: tool.description || "",
      parameters: sanitizeGeminiSchema(tool.inputSchema),
    })),
  },
];
  const question =
    process.argv.slice(2).join(" ") ||
    "ASELSAN hissesini güncel verilerle teknik olarak analiz et.";

  console.log(`\nSoru: ${question}\n`);
  console.log("Gemini analiz ediyor...\n");

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
      console.log("\n════════════════════════════════════");
      console.log("BORSA CI");
      console.log("════════════════════════════════════\n");
      console.log(response.text);
      console.log("\n════════════════════════════════════");

      break;
    }

    contents.push(candidate.content);

    for (const part of functionCalls) {
      const call = part.functionCall;

      console.log(`🔧 ${call.name}`);

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
                  result: result,
                },
              },
            },
          ],
        });
      } catch (error) {
        console.error(`❌ ${call.name} hatası:`, error.message);

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

  await transport.close();
}

main().catch((error) => {
  console.error("\n❌ HATA:");
  console.error(error);
  process.exit(1);
});
