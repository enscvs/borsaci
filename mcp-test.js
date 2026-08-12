require("dotenv").config();

const {
  Client
} = require("@modelcontextprotocol/sdk/client/index.js");

const {
  StreamableHTTPClientTransport
} = require("@modelcontextprotocol/sdk/client/streamableHttp.js");

async function main() {
  const url = new URL(process.env.MCP_URL);

  const transport = new StreamableHTTPClientTransport(url);

  const client = new Client({
    name: "gemini-borsaci",
    version: "1.0.0",
  });

  console.log("MCP'ye bağlanılıyor...");

  await client.connect(transport);

  console.log("✅ MCP bağlantısı başarılı!\n");

  const result = await client.listTools();

  console.log("Kullanılabilir araçlar:\n");

  for (const tool of result.tools) {
    console.log(`🔧 ${tool.name}`);

    if (tool.description) {
      console.log(`   ${tool.description}`);
    }

    console.log("");
  }

  await transport.close();
}

main().catch((error) => {
  console.error("\n❌ MCP bağlantı hatası:");
  console.error(error);
  process.exit(1);
});