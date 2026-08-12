require("dotenv").config();

const readline = require("readline");
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
- Al/sat kararını kullanıcı adına kesin emir şeklinde verme.
  Bunun yerine senaryo, risk, destek/direnç, stop ve hedef bölgelerini açıkla.
- Teknik analizde trend, momentum, hacim, volatilite ve önemli seviyeleri
  birlikte değerlendir.
- Temel analizde değerleme, kârlılık, borçluluk, büyüme ve nakit akışını
  birlikte değerlendir.
- Analist görüşü ile kendi yorumunu birbirinden açıkça ayır.
- Bir analistin hedef fiyatını kendi tahmininmiş gibi sunma.
- Sonuçları Türkçe ve net biçimde sun.
`;

async function analyzeQuestion(question, client, geminiTools) {
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

    // Gemini artık araç çağırmıyorsa nihai cevap gelmiştir.
    if (functionCalls.length === 0) {
      console.log("\n" + "═".repeat(70));
      console.log("BORSA CI");
      console.log("═".repeat(70));
      console.log(response.text);
      console.log("═".repeat(70) + "\n");

      return;
    }

    // Gemini'nin cevabını konuşma geçmişine ekle.
    contents.push(candidate.content);

    // MCP araçlarını çalıştır.
    for (const part of functionCalls) {
      const call = part.functionCall;

      console.log(`🔧 ${call.name} çalıştırılıyor...`);

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

  console.log("⚠️ Maksimum araç çağrısı sayısına ulaşıldı.");
}

async function main() {
  const mcpUrl = process.env.MCP_URL;

  if (!mcpUrl) {
    throw new Error(".env içinde MCP_URL bulunamadı.");
  }

  if (!process.env.GEMINI_API_KEY) {
    throw new Error(".env içinde GEMINI_API_KEY bulunamadı.");
  }

  console.log("");
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║                    BORSA CI                              ║");
  console.log("║             AI BIST ANALİZ ASİSTANI                      ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log("");

  console.log("Borsa MCP'ye bağlanılıyor...");

  const transport = new StreamableHTTPClientTransport(
    new URL(mcpUrl)
  );

  const client = new Client({
    name: "gemini-borsaci",
    version: "1.0.0",
  });

  await client.connect(transport);

  console.log("✅ MCP hazır.");

  const toolResult = await client.listTools();
  const tools = toolResult.tools;

  console.log(`✅ ${tools.length} MCP aracı yüklendi.`);
  console.log("");

  const geminiTools = [
    {
      functionDeclarations: tools.map((tool) => ({
        name: tool.name,
        description: tool.description || "",
        parameters: cleanSchema(tool.inputSchema),
      })),
    },
  ];

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "BorsaCI > ",
  });

  console.log("Hazır. Sorunu yaz.");
  console.log("Çıkmak için 'çık', 'exit' veya 'quit' yaz.");
  console.log("");

  rl.prompt();

  rl.on("line", async (input) => {
    const question = input.trim();

    if (!question) {
      rl.prompt();
      return;
    }

    if (
      question.toLowerCase() === "çık" ||
      question.toLowerCase() === "exit" ||
      question.toLowerCase() === "quit"
    ) {
      console.log("\nBorsaCI kapatılıyor...");
      rl.close();
      return;
    }

    try {
      console.log("\nGemini analiz ediyor...\n");

      // Yeni soru için MCP bağlantısını yeniden kurmuyoruz.
      await analyzeQuestion(question, client, geminiTools);
    } catch (error) {
      console.error("\n❌ HATA:");
      console.error(error.message || error);
      console.log("");
    }

    rl.prompt();
  });

  rl.on("close", async () => {
    try {
      await transport.close();
    } catch (_) {}

    process.exit(0);
  });
}

/*
 * MCP JSON Schema'sını Gemini'nin kabul ettiği
 * FunctionDeclaration schema formatına dönüştürür.
 *
 * Bazı MCP araçlarında OpenAPI/JSON Schema alanları
 * (examples, const, exclusiveMinimum vb.) bulunabiliyor.
 * Gemini bunların bazılarını kabul etmediği için temizliyoruz.
 */
function cleanSchema(schema) {
  if (!schema || typeof schema !== "object") {
    return {
      type: "OBJECT",
      properties: {},
    };
  }

  const allowed = new Set([
    "type",
    "description",
    "properties",
    "required",
    "items",
    "enum",
    "format",
    "nullable",
  ]);

  const output = {};

  for (const [key, value] of Object.entries(schema)) {
    if (!allowed.has(key)) {
      continue;
    }

    if (key === "properties" && value && typeof value === "object") {
      output.properties = {};

      for (const [propName, propSchema] of Object.entries(value)) {
        output.properties[propName] = cleanSchema(propSchema);
      }
    } else if (key === "items" && value && typeof value === "object") {
      output.items = cleanSchema(value);
    } else {
      output[key] = value;
    }
  }

  // Gemini genellikle büyük harfli JSON Schema tipleriyle daha uyumlu.
  if (typeof output.type === "string") {
    output.type = output.type.toUpperCase();
  }

  return output;
}

main().catch((error) => {
  console.error("\n❌ HATA:");
  console.error(error);
  process.exit(1);
});