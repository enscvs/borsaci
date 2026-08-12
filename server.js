require("dotenv").config();

const http = require("http");
const { GoogleGenAI } = require("@google/genai");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const {
  StreamableHTTPClientTransport,
} = require("@modelcontextprotocol/sdk/client/streamableHttp.js");
const TelegramBot = require("node-telegram-bot-api");
const PORT = process.env.PORT || 3000;
});

console.log("Telegram bot başlatıldı.");
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
      await transport.close();
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
  throw new Error("Maksimum MCP adımına ulaşıldı.");
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
          typeof item === "object" ? cleanSchema(item) : item
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
// BorsaCI web arayüzü
if (req.method === "GET" && req.url === "/") {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
  });

  res.end(`
<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BorsaCI</title>

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: #0b0f14;
  color: #f1f5f9;
  font-family: Arial, sans-serif;
}

.container {
  max-width: 900px;
  margin: auto;
  padding: 20px;
}

.header {
  text-align: center;
  padding: 25px 10px;
}

.logo {
  font-size: 32px;
  font-weight: 800;
}

.subtitle {
  color: #94a3b8;
  margin-top: 6px;
}

textarea {
  width: 100%;
  min-height: 130px;
  resize: vertical;
  border: 1px solid #263241;
  border-radius: 14px;
  background: #111827;
  color: white;
  padding: 16px;
  font-size: 16px;
  outline: none;
}

textarea:focus {
  border-color: #64748b;
}

button {
  width: 100%;
  margin-top: 12px;
  padding: 15px;
  border: none;
  border-radius: 12px;
  background: #2563eb;
  color: white;
  font-size: 17px;
  font-weight: 700;
  cursor: pointer;
}

button:disabled {
  opacity: 0.6;
}

.quick {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}

.quick button {
  width: auto;
  margin: 0;
  padding: 10px 14px;
  background: #1e293b;
  font-size: 14px;
}

.result {
  margin-top: 20px;
  padding: 20px;
  border-radius: 14px;
  background: #111827;
  border: 1px solid #263241;
  white-space: pre-wrap;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.status {
  text-align: center;
  color: #94a3b8;
  margin-top: 12px;
  min-height: 22px;
}

@media (max-width: 600px) {
  .container {
    padding: 12px;
  }

  .logo {
    font-size: 27px;
  }

  textarea {
    min-height: 120px;
  }
}
</style>
</head>

<body>

<div class="container">

  <div class="header">
    <div class="logo">📈 BorsaCI</div>
    <div class="subtitle">
      AI destekli BIST ve finansal piyasa analiz asistanı
    </div>
  </div>

  <textarea
    id="question"
    placeholder="BorsaCI'ye bir soru sor...

Örnek:
ASELSAN'ın güncel teknik analizini yap.
TUPRS için destek ve direnç seviyelerini değerlendir.
BIST'te bugün hangi hisseler güçlü?"
  ></textarea>

  <button id="askButton" onclick="askBorsaCI()">
    🔎 ANALİZ ET
  </button>

  <div class="quick">
    <button onclick="quickAsk('ASELSAN güncel teknik analizini yap')">
      ASELSAN
    </button>

    <button onclick="quickAsk('TUPRS güncel teknik analizini yap')">
      TUPRS
    </button>

    <button onclick="quickAsk('BIST piyasasını güncel verilerle değerlendir')">
      BIST
    </button>

    <button onclick="quickAsk('Güncel piyasa haberlerini ve önemli katalizörleri değerlendir')">
      📰 Haberler
    </button>
  </div>

  <div class="status" id="status"></div>

  <div class="result" id="result" style="display:none;"></div>

</div>

<script>

function quickAsk(text) {
  document.getElementById("question").value = text;
  askBorsaCI();
}

async function askBorsaCI() {

  const question =
    document.getElementById("question").value.trim();

  if (!question) {
    alert("Önce bir soru yaz.");
    return;
  }

  const button =
    document.getElementById("askButton");

  const status =
    document.getElementById("status");

  const result =
    document.getElementById("result");

  button.disabled = true;
  button.innerText = "⏳ ANALİZ EDİLİYOR...";
  status.innerText =
    "MCP verileri toplanıyor ve Gemini analiz ediyor...";
  result.style.display = "none";

  try {

    const response = await fetch("/ask", {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        question: question
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Sunucu hatası");
    }

    result.innerText = data.answer;
    result.style.display = "block";

    status.innerText = "✅ Analiz tamamlandı.";

  } catch (error) {

    result.innerText =
      "❌ Hata: " + error.message;

    result.style.display = "block";

    status.innerText = "";

  } finally {

    button.disabled = false;
    button.innerText = "🔎 ANALİZ ET";

  }
}

</script>

</body>
</html>
  `);

  return;
}
  // Analysis endpoint
  if (req.method === "POST" && req.url === "/ask") {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
    });

    req.on("end", async () => {
      try {
        const data = JSON.parse(body);

        if (!data.question) {
          throw new Error("question alanı gerekli.");
        }

        console.log(`Soru: ${data.question}`);

        const answer = await analyze(data.question);

        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
        });

        res.end(
          JSON.stringify({
            answer,
          })
        );
      } catch (error) {
        console.error(error);

        res.writeHead(500, {
          "Content-Type": "application/json; charset=utf-8",
        });

        res.end(
          JSON.stringify({
            error: error.message,
          })
        );
      }
    });

    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const question = msg.text;

  if (!question) return;

  if (
    question.toLowerCase() === "/start"
  ) {
    await bot.sendMessage(
      chatId,
      "📈 BorsaCI hazır.\n\nHisse veya piyasa sorunu yazabilirsin.\n\nÖrnek:\nASELSAN'ın güncel teknik analizini yap."
    );
    return;
  }

  if (
    question.toLowerCase() === "/help"
  ) {
    await bot.sendMessage(
      chatId,
      "BorsaCI kullanım örnekleri:\n\n" +
      "• ASELSAN teknik analiz\n" +
      "• TUPRS temel ve teknik analiz\n" +
      "• En güçlü BIST hisselerini tara\n" +
      "• GARAN için destek direnç seviyelerini bul\n" +
      "• Altın mı BIST mi daha iyi performans gösterdi?"
    );
    return;
  }

  await bot.sendMessage(chatId, "🔎 Veriler toplanıyor, analiz ediyorum...");

  try {
    const answer = await analyze(question);

    // Telegram mesaj limiti yaklaşık 4096 karakter.
    const chunks = answer.match(/[\s\S]{1,4000}/g) || [];

    for (const chunk of chunks) {
      await bot.sendMessage(chatId, chunk);
    }
  } catch (error) {
    console.error("Telegram analiz hatası:", error);

    await bot.sendMessage(
      chatId,
      "❌ Analiz sırasında hata oluştu.\n\n" +
      error.message
    );
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`BorsaCI server ${PORT} portunda çalışıyor.`);
});