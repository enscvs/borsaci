const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

async function main() {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: "BIST'te ASELSAN hakkında tek cümlelik teknik analiz yap.",
  });

  console.log(response.text);
}

main().catch(console.error);