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
} = require("@modelcontextprotocol/sdk/client/streamableHttp.js");


/*
========================================================
CONFIG
========================================================
*/

const PORT =
  process.env.PORT || 3000;

const MODEL =
  process.env.GROQ_MODEL ||
  "openai/gpt-oss-120b";


/*
========================================================
AI PROVIDERS
========================================================
*/

const groqAI = new OpenAI({
  apiKey:
    process.env.GROQ_API_KEY,

  baseURL:
    "https://api.groq.com/openai/v1",
});


const geminiAI = new OpenAI({
  apiKey:
    process.env.GEMINI_API_KEY,

  baseURL:
    "https://generativelanguage.googleapis.com/v1beta/openai/",
});


const mistralAI = new OpenAI({
  apiKey:
    process.env.MISTRAL_API_KEY,

  baseURL:
    "https://api.mistral.ai/v1",
});


/*
========================================================
SYSTEM PROMPT
========================================================
*/

const SYSTEM_PROMPT = `
BORSACI AI — PROFESYONEL BIST ANALİZ MOTORU

ROL
Sen BORSACI AI'sın. Borsa İstanbul hisselerini veri odaklı, objektif ve risk kontrollü analiz edersin.

AMAÇ
Görevin etkileyici veya uzun rapor yazmak değil;
DOĞRU VERİ → DOĞRULAMA → HESAPLAMA → YORUM → SENARYO → KARAR
zincirini izleyerek uygulanabilir ve denetlenebilir analiz üretmektir.

Kullanıcının beklentisini doğrulama. AL/SAT sonucu üretmek zorunda değilsin.
Veri yetersizse açıkça söyle.

==================================================
1. VERİ KURALI
==================================================

Analizden önce kontrol et:

- Sembol ve şirket
- Fiyat ve fiyat tarihi
- OHLCV ve zaman dilimi
- Teknik veri dönemi
- Bilanço dönemi
- Finansal tablo tarihleri
- KAP haber tarihleri
- Analist hedeflerinin tarihi

Eksik veri varsa UYDURMA.
Eski ve yeni veriyi karıştırma.
Veri tarihi bilinmiyorsa belirt.

Önemli sonuçların hangi veriye dayandığını bil.

==================================================
2. ZORUNLU MATEMATİKSEL DOĞRULAMA
==================================================

Final rapordan önce tüm hesaplamaları bağımsız olarak yeniden hesapla.

Kontrol et:

- Fiyat/EMA/SMA ilişkileri
- Yüzde değişimleri
- Marjlar
- Borç oranları
- Net Borç/FAVÖK
- Prim/iskonto
- Hedef potansiyeli
- Risk/Getiri
- Skor toplamları
- DCF hesapları varsa kullanılan formüller

Temel formüller:

Hedef Potansiyeli =
(Hedef - Fiyat) / Fiyat × 100

Prim =
(Fiyat - İçsel Değer) / İçsel Değer × 100

İskonto =
(İçsel Değer - Fiyat) / Fiyat × 100

Risk =
Giriş - Stop

Getiri =
Hedef - Giriş

R/R =
Getiri / Risk

Negatif bazdan yüzde büyüme hesaplama.
Zarardan kâra geçişte:
“%X arttı” yerine mutlak değişimi ve “zarardan kâra dönüş” ifadesini kullan.

Bir hesap ile verilen veri uyuşmuyorsa:
“VERİ/HESAP ÇELİŞKİSİ” yaz.
Hangisinin doğru olduğunu bilmiyorsan seçim yapma.

“%100 doğru”, “tamamen doğrulandı” gibi kesin ifadeler kullanma.

==================================================
3. TEKNİK ANALİZ
==================================================

Tek göstergeden karar verme.

### Trend
Değerlendir:
- Fiyat
- SMA20
- EMA20
- EMA50
- EMA200
- Ortalamaların eğimi
- Higher High / Lower High
- Higher Low / Lower Low

Fiyat bir ortalamanın altındaysa bunu doğru şekilde “ortalamanın altında” olarak belirt.

### Momentum
Değerlendir:
- RSI14
- MACD
- Signal
- Histogram
- Sıfır çizgisi
- Kesişim
- Mümkünse divergence

RSI >50 otomatik AL değildir.

MACD yorumunda mutlaka:
MACD > Signal mi?
Histogram pozitif mi?
Momentum güçleniyor mu?
kontrol et.

### Fiyat Yapısı
Değerlendir:
- Swing high/low
- Destek
- Direnç
- Pivot
- Kırılım
- Retest
- Başarısız kırılım

Pivot'u otomatik destek/direnç olarak adlandırma.

### Hacim
Mümkünse:
- Ortalama hacim
- Son hacim
- Hacim değişimi
- Fiyat/hacim ilişkisi

Veri yoksa yorum yapma.

### Volatilite
Mümkünse ATR ve ATR/fiyat oranını kullan.
ATR yoksa volatilite hakkında kesin sonuç verme.

==================================================
4. KIRILIM KURALI
==================================================

Anlık seviye aşımı kesin kırılım değildir.

Mümkünse:
- kapanış
- hacim
- takip eden mumlar
- retest

ile teyit ara.

Teyit yoksa:
“X üzerinde kapanış kırılımı güçlendirebilir.”

==================================================
5. TEMEL ANALİZ
==================================================

Mümkünse değerlendir:

### Büyüme
- Gelir
- FAVÖK
- Net kâr
- EPS

### Karlılık
- Brüt marj
- FAVÖK marjı
- Net kâr marjı
- ROE
- ROIC

### Finansal Sağlık
- Net borç
- Net Borç/FAVÖK
- Borç/Özkaynak
- Faiz karşılama
- Likidite

### Nakit
- Faaliyet nakit akışı
- Serbest nakit akışı
- CapEx
- Temettü ödeme kapasitesi

Oranları tek başına “ucuz/pahalı” olarak sınıflandırma.
Mümkünse şirketi:
SEKTÖR + TARİHSEL ORTALAMA + BÜYÜME/KALİTE
ile karşılaştır.

==================================================
6. DCF / DEĞERLEME
==================================================

DCF varsa bunun bir MODEL SONUCU olduğunu açıkça belirt.

Mümkünse:
- FCF
- büyüme
- WACC
- terminal growth
- terminal value
- net borç
- hisse sayısı

varsayımlarını göster.

Varsayımlar görünür değilse:
“DCF güvenilirliği düşük”
olarak işaretle.

Mümkünse Bear / Base / Bull DCF üret.
Tek DCF değerini kesin gerçek olarak sunma.

Analist hedeflerini DCF ile karıştırma.
Hedeflerin tarihini ve mümkünse analist sayısını, medyanını ve aralığını kontrol et.

==================================================
7. KAP / HABER
==================================================

Başlığa bakarak kesin ekonomik etki çıkarma.

Tam içerik varsa değerlendir:

- Olay
- Finansal etki
- Beklenti/fiyatlama
- Etki: Pozitif / Negatif / Nötr / Belirsiz
- Etki gücü: Çok düşük → Çok yüksek

Sadece başlık varsa:
“Ekonomik etkiyi belirlemek için tam bildirim içeriği gerekli.”

==================================================
8. RİSK
==================================================

En önemli 3-5 riski belirle.

Özellikle:
- Değerleme
- Borç
- Likidite
- Karlılık
- Sektör
- Regülasyon
- Faiz
- Kur
- Operasyonel risk

Stop-loss rastgele belirleme.
Mümkünse destek, volatilite, ATR ve fiyat yapısıyla ilişkilendir.

==================================================
9. SENARYO
==================================================

Mümkünse:

BULL
- Tetikleyici
- Hedef
- Geçerlilik koşulu

BASE
- Tetikleyici
- Beklenen fiyat bölgesi
- Geçerlilik koşulu

BEAR
- Tetikleyici
- Destek/aşağı yönlü bölge
- Geçersizleşme koşulu

Olasılık veriyorsan bunun MODEL TAHMİNİ olduğunu açıkça belirt.
Dayanağı olmayan %30/%50/%20 gibi rakamları gerçek istatistik gibi sunma.

==================================================
10. RİSK / GETİRİ
==================================================

İşlem planı veriyorsan mutlaka:

Giriş
Teyit
Stop
Hedef
Risk
Getiri
R/R

hesapla.

Giriş fiyatı aralıksa tek R/R verme.
Aralık için minimum-maksimum R/R göster.

R/R cazip değilse açıkça:
“Mevcut seviyede risk/getiri cazip değil.”
de.

==================================================
11. KARAR
==================================================

Kararı tüm verilerin bileşimine göre oluştur:

GÜÇLÜ AL
AL
İZLE / BEKLE
SAT
GÜÇLÜ SAT

Ancak veri yetersizse:
“KARAR ÜRETMEK İÇİN VERİ YETERSİZ.”

Teknik + temel farklı zaman ufuklarında çelişebilir.
Bunu açıkça belirt.

Zaman ufukları:
- Kısa: 1 gün–4 hafta
- Orta: 1–6 ay
- Uzun: 6–24 ay

Kısa vadeli sinyali uzun vadeli yatırım kararı gibi sunma.

==================================================
12. SKOR VE GÜVEN
==================================================

Mümkünse 100 üzerinden karar skoru oluştur.

Önerilen ağırlık:

Trend %20
Momentum %15
Fiyat Yapısı %10
Hacim %10
Finansal Sağlık %15
Büyüme/Karlılık %10
Değerleme %10
Haber/KAP %5
Risk %5

Veri olmayan kategoride puan UYDURMA.
Eksik veri varsa skor güvenilirliğini düşür.

Karar skoru ile analiz güvenilirliğini ayır.

Analiz Güvenilirliği:
- Veri güncelliği
- Veri kapsamı
- Kaynak kalitesi
- Hesaplanabilirlik
- Çelişki miktarı

==================================================
13. KESİNLİK YASAĞI
==================================================

Asla:

“Kesin yükselir.”
“Kesin düşer.”
“Garanti.”
“Kesin al.”
“Kesin hedef.”

deme.

Bunun yerine:
- “senaryo destekleniyor”
- “olasılık artıyor”
- “teyit gerekli”
- “risk yükseliyor”
- “veriler bu senaryoyu destekliyor”

ifadelerini kullan.

==================================================
14. FINAL RAPOR ÖNCESİ ZORUNLU KONTROL
==================================================

Raporu göndermeden önce kontrol et:

1. Her rakamın tarihi/kaynağı veya hesaplama yöntemi belli mi?
2. Tüm matematiksel sonuçlar yeniden hesaplandı mı?
3. Fiyat-indikatör ilişkileri doğru mu?
4. Finansal dönemler karışmış mı?
5. Aynı metrik farklı bölümlerde farklı mı?
6. Destek/direnç isimleri doğru mu?
7. DCF varsayımları yeterli mi?
8. Veri olmayan yerde varsayım yaptım mı?
9. Haber içeriği gerçekten doğrulandı mı?
10. Risk/Getiri gerçekten hesaplandı mı?
11. Teknik ve temel sonuçlar birbiriyle tutarlı mı?
12. Karar veriden daha güçlü ifade edilmiş mi?

Hata varsa:
- hatayı gizleme,
- raporu düzelt,
- düzeltilmiş sonucu kullan.

Önemli veri eksikse:
“KARAR GÜVENİ DÜŞÜK.”

==================================================
15. RAPOR FORMATI
==================================================

1. ÖZET
- Fiyat / Tarih
- Karar
- Analiz Güvenilirliği
- Risk
- En önemli gerekçe

2. TEKNİK
- Trend
- Momentum
- Destek/Direnç
- Hacim
- Volatilite

3. TEMEL
- Büyüme
- Karlılık
- Borç
- Nakit
- Temettü

4. DEĞERLEME
- F/K
- FD/FAVÖK
- PD/DD
- DCF
- Sektör karşılaştırması

5. KAP / HABER

6. RİSKLER

7. BULL / BASE / BEAR

8. İŞLEM PLANI
- Giriş
- Teyit
- Stop
- Hedef
- R/R

9. SONUÇ
Tek paragrafta net, gerekçeli ve koşullu karar.

==================================================
ANA KURAL
==================================================

BİLMİYORSAN UYDURMA.
HESAPLAYAMIYORSAN TAHMİN ETME.
ÇELİŞİYORSA SONUÇ ÜRETME.
VERİ YETERSİZSE SÖYLE.
TEK GÖSTERGEYLE KARAR VERME.
KULLANICININ BEKLENTİSİNİ DOĞRULAMA.

AMAÇ KULLANICIYI HAKLI ÇIKARMAK DEĞİL,
VERİNİN İZİN VERDİĞİ EN OBJEKTİF VE RİSK/GETİRİ AÇISINDAN SAVUNULABİLİR SONUCA ULAŞMAKTIR.

Gerekirse en doğru sonuç:
“BEKLE — YETERLİ TEYİT YOK.”
========================================================
FINAL OUTPUT BLOCKER — RAPOR YAYINLAMA KİLİDİ
========================================================

Raporu kullanıcıya göndermeden önce aşağıdaki kontrolleri
gerçekten yeniden çalıştır.

Aşağıdakilerden biri yanlışsa raporu yayınlama:

1. Her fiyat seviyesi kendi destek/direnç etiketiyle eşleşiyor mu?
2. R1/R2/R3 ve S1/S2/S3 değerleri raporun tüm bölümlerinde aynı mı?
3. EMA/SMA ilişkileri matematiksel olarak doğru mu?
4. MACD yorumu MACD, Signal ve Histogram ile uyumlu mu?
5. RSI yorumu gerçek RSI aralığıyla uyumlu mu?
6. Tüm yüzde ve R/R hesapları yeniden hesaplandı mı?
7. Giriş + stop + hedef olmadan R/R yazılmış mı?
8. Teknik hedef gerçekten teknik seviyeden mi geliyor?
9. Kaynağı belirtilmeyen hiçbir veri sonuca dahil edilmiş mi?
10. Sadece başlığı görülen KAP haberine ekonomik etki atfedilmiş mi?
11. DCF varsayımları görünmüyorsa DCF kesin gerçek gibi sunulmuş mu?
12. Analist hedefleri için tarih ve analist sayısı bilinmiyorsa
    konsensüs kesin veri gibi sunulmuş mu?
13. Farklı bölümlerde aynı finansal metrik farklı değer taşıyor mu?
14. Önceki veride olmayan yeni bir değer açıklamasız ortaya çıkmış mı?
15. Her “AL/SAT” koşulu gözlemlenebilir ve ölçülebilir mi?
16. Keyfi eşikler gerekçesiz şekilde sinyal olarak kullanılmış mı?

HERHANGİ BİR KONTROL BAŞARISIZSA:

- Hatalı sonucu düzelt.
- Düzeltemiyorsan sonucu kullanma.
- "DOĞRULAMA BAŞARISIZ" yaz.
- İlgili veriyi "VERİ ÇELİŞKİSİ" veya "VERİ YETERSİZ"
  olarak işaretle.
- Hatalı veriden AL/SAT sonucu üretme.

“DOĞRULAMA BAŞARILI” SADECE TÜM KONTROLLER GERÇEKTEN
GEÇTİKTEN SONRA KULLANILABİLİR.
========================================================
`;


/*
========================================================
HTTP HELPERS
========================================================
*/

function sendJSON(
  res,
  statusCode,
  data
) {

  res.writeHead(
    statusCode,
    {
      "Content-Type":
        "application/json; charset=utf-8",

      "Cache-Control":
        "no-store",

      "Access-Control-Allow-Origin":
        "*",

      "Access-Control-Allow-Methods":
        "GET,POST,OPTIONS",

      "Access-Control-Allow-Headers":
        "Content-Type",
    }
  );

  res.end(
    JSON.stringify(
      data
    )
  );
}


function sendText(
  res,
  statusCode,
  text
) {

  res.writeHead(
    statusCode,
    {
      "Content-Type":
        "text/plain; charset=utf-8",

      "Access-Control-Allow-Origin":
        "*",
    }
  );

  res.end(text);
}


/*
========================================================
SCHEMA CLEANER
========================================================
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
========================================================
MCP → OPENAI TOOLS
========================================================
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
========================================================
MCP CONNECTION
========================================================
*/

async function createMcpClient() {

  if (!process.env.MCP_URL) {

    throw new Error(
      "MCP_URL environment variable tanımlı değil."
    );

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
        "borsaci",

      version:
        "1.0.0",

    });
console.log("🔥 MCP CONNECT BAŞLIYOR");

  await client.connect(
    transport
  );

console.log("🔥 MCP CONNECT BAŞARILI");
  return {
    client,
    transport,
  };
}


/*
========================================================
AI ANALYZE
========================================================
*/

async function analyze(
  question
) {

  if (!question) {

    throw new Error(
      "Soru boş olamaz."
    );

  }


  const {
    client,
    transport,
  } =
    await createMcpClient();


  try {

    /*
    ========================================
    MCP TOOLS
    ========================================
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


    const tools =
      convertMcpToolsToOpenAITools(
        toolResult.tools
      );


    if (
      tools.length === 0
    ) {

      throw new Error(
        "MCP sunucusunda kullanılabilir araç bulunamadı."
      );

    }


    /*
    ========================================
    MESSAGES
    ========================================
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
    ========================================
    TOOL LOOP
    ========================================
    */

    for (
      let step = 0;
      step < 20;
      step++
    ) {

      console.log(
        `AI STEP → ${step + 1}`
      );


      /*
      ========================================
      GROQ → GEMINI → MISTRAL
      ========================================
      */

      let response;


      try {

        console.log(
          "AI PROVIDER → GROQ"
        );


        response =
          await groqAI.chat.completions.create({

            model:
              MODEL,

            messages,

            tools,

            tool_choice:
              "auto",

            temperature:
              0.1,

          });


      } catch (groqError) {

        console.error(
          "GROQ HATA →",
          groqError.message
        );


        try {

          console.log(
            "AI PROVIDER → GEMINI"
          );


          response =
            await geminiAI.chat.completions.create({

              model:
                "gemini-2.5-flash",

              messages,

              tools,

              tool_choice:
                "auto",

              temperature:
                0.1,

            });


        } catch (geminiError) {

          console.error(
            "GEMINI HATA →",
            geminiError.message
          );


          try {

            console.log(
              "AI PROVIDER → MISTRAL"
            );


            response =
              await mistralAI.chat.completions.create({

                model:
                  "mistral-small-latest",

                messages,

                tools,

                tool_choice:
                  "auto",

                temperature:
                  0.1,

              });


          } catch (mistralError) {

            console.error(
              "MISTRAL HATA →",
              mistralError.message
            );


            throw new Error(
              "Groq, Gemini ve Mistral AI servislerinin üçü de kullanılamıyor."
            );

          }

        }

      }


      const message =
        response
          .choices?.[0]
          ?.message;


      if (!message) {

        throw new Error(
          "AI cevap üretmedi."
        );

      }


      /*
      ========================================
      FINAL RESPONSE
      ========================================
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
      ========================================
      AI MESSAGE
      ========================================
      */

      messages.push(
        message
      );


      /*
      ========================================
      TOOL CALLS
      ========================================
      */

      for (
        const toolCall
        of message.tool_calls
      ) {

        const functionName =
          toolCall
            .function
            .name;


        let argumentsObject =
          {};


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

        }


        console.log(
          `MCP → ${functionName}`,
          argumentsObject
        );


        try {

          const result =
            await client.callTool({

              name:
                functionName,

              arguments:
                argumentsObject,

            });


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
      "Maksimum MCP analiz adımına ulaşıldı."
    );


  } finally {

    try {

      await transport.close();

    } catch (_) {}

  }

}


/*
========================================================
YAHOO FINANCE
========================================================
*/

function normalizeBistSymbol(
  symbol
) {

  if (!symbol) {
    return null;
  }


  let clean =
    String(symbol)
      .trim()
      .toUpperCase()
      .replace(/^BIST:/, "");


  if (
    !clean.endsWith(".IS")
  ) {

    clean += ".IS";

  }


  return clean;
}


/*
========================================================
YAHOO CHART
========================================================
*/

async function fetchYahooChart(
  symbol,
  range = "1y",
  interval = "1d"
) {

  const yahooSymbol =
    normalizeBistSymbol(
      symbol
    );


  if (!yahooSymbol) {

    throw new Error(
      "Yahoo sembolü oluşturulamadı."
    );

  }


  const yahooUrl =
    "https://query1.finance.yahoo.com/v8/finance/chart/" +
    encodeURIComponent(
      yahooSymbol
    ) +
    `?range=${encodeURIComponent(range)}` +
    `&interval=${encodeURIComponent(interval)}` +
    "&events=history&includeAdjustedClose=true";


  console.log(
    "YAHOO REQUEST →",
    yahooUrl
  );


  const response =
    await fetch(
      yahooUrl,
      {

        method:
          "GET",

        headers: {

          "User-Agent":
            "Mozilla/5.0",

          "Accept":
            "application/json,text/plain,*/*",

        },

      }
    );


  const text =
    await response.text();


  let data;


  try {

    data =
      JSON.parse(text);

  } catch {

    throw new Error(
      `Yahoo Finance JSON döndürmedi. HTTP ${response.status}`
    );

  }


  if (!response.ok) {

    throw new Error(
      data?.chart?.error?.description ||
      `Yahoo Finance HTTP ${response.status}`
    );

  }


  if (
    data?.chart?.error
  ) {

    throw new Error(
      data.chart.error.description ||
      "Yahoo Finance chart hatası."
    );

  }


  const result =
    data?.chart?.result?.[0];


  if (!result) {

    throw new Error(
      "Yahoo Finance chart sonucu boş."
    );

  }


  const timestamps =
    result.timestamp || [];


  const quote =
    result
      .indicators
      ?.quote?.[0];


  if (
    !quote ||
    !Array.isArray(
      timestamps
    )
  ) {

    throw new Error(
      "Yahoo Finance OHLC verisi bulunamadı."
    );

  }


  const history = [];


  for (
    let i = 0;
    i < timestamps.length;
    i++
  ) {

    const open =
      Number(
        quote.open?.[i]
      );

    const high =
      Number(
        quote.high?.[i]
      );

    const low =
      Number(
        quote.low?.[i]
      );

    const close =
      Number(
        quote.close?.[i]
      );

    const volume =
      Number(
        quote.volume?.[i]
      );


    if (
      !Number.isFinite(
        close
      )
    ) {

      continue;

    }


    history.push({

      time:
        timestamps[i],

      open:
        Number.isFinite(open)
          ? open
          : close,

      high:
        Number.isFinite(high)
          ? high
          : close,

      low:
        Number.isFinite(low)
          ? low
          : close,

      close,

      volume:
        Number.isFinite(volume)
          ? volume
          : 0,

    });

  }


  if (
    history.length === 0
  ) {

    throw new Error(
      "Yahoo Finance history boş."
    );

  }


  return {

    symbol:
      yahooSymbol
        .replace(
          /\.IS$/,
          ""
        ),

    history,

    meta:
      result.meta || {},

  };

}


/*
========================================================
MARKET HANDLER
========================================================
*/

async function handleMarket(
  req,
  res
) {

  try {

    const url =
      new URL(
        req.url,
        `http://${req.headers.host || "localhost"}`
      );


    const requestedSymbol =
      url.searchParams.get(
        "symbol"
      );


    if (!requestedSymbol) {

      return sendJSON(
        res,
        400,
        {
          error:
            "symbol parametresi gerekli.",
        }
      );

    }


    const symbol =
      requestedSymbol
        .trim()
        .toUpperCase();


    console.log(
      `MARKET → ${symbol}`
    );


    const yahoo =
      await fetchYahooChart(
        symbol,
        "5d",
        "1d"
      );


    const history =
      yahoo.history;


    const latest =
      history[
        history.length - 1
      ];


    const previous =
      history[
        history.length - 2
      ];


    const price =
      latest?.close ??
      null;


    const previousClose =
      previous?.close ??
      null;


    let changePercent =
      null;


    if (
      Number.isFinite(price) &&
      Number.isFinite(previousClose) &&
      previousClose !== 0
    ) {

      changePercent =
        (
          (price - previousClose) /
          previousClose
        ) *
        100;

    }


    const volume =
      latest?.volume ??
      null;


    return sendJSON(
      res,
      200,
      {

        symbol,

        timestamp:
          new Date().toISOString(),

        quote: {

          price,

          changePercent,

          volume,

          previousClose,

        },

        price,

        changePercent,

        volume,

        history,

      }
    );


  } catch (error) {

    console.error(
      "MARKET ERROR:",
      error
    );


    return sendJSON(
      res,
      500,
      {

        error:
          error.message,

      }
    );

  }

}


/*
========================================================
CHART HANDLER
========================================================
*/

async function handleChart(
  req,
  res
) {

  try {

    const url =
      new URL(
        req.url,
        `http://${req.headers.host || "localhost"}`
      );


    const requestedSymbol =
      url.searchParams.get(
        "symbol"
      );


    const range =
      url.searchParams.get(
        "range"
      ) ||
      "1y";


    const interval =
      url.searchParams.get(
        "interval"
      ) ||
      "1d";


    if (!requestedSymbol) {

      return sendJSON(
        res,
        400,
        {

          error:
            "symbol parametresi gerekli.",

        }
      );

    }


    const symbol =
      requestedSymbol
        .trim()
        .toUpperCase();


    console.log(
      `CHART → ${symbol} ${range} ${interval}`
    );


    const yahoo =
      await fetchYahooChart(
        symbol,
        range,
        interval
      );


    return sendJSON(
      res,
      200,
      {

        symbol,

        history:
          yahoo.history,

      }
    );


  } catch (error) {

    console.error(
      "CHART ERROR:",
      error
    );


    return sendJSON(
      res,
      500,
      {

        error:
          error.message,

      }
    );

  }

}


/*
========================================================
QUOTE / MCP TOOL TEST
========================================================
*/

async function handleQuote(
  req,
  res
) {

  let transport = null;


  try {

    const url =
      new URL(
        req.url,
        `http://${req.headers.host || "localhost"}`
      );


    const symbol =
      url.searchParams
        .get("symbol")
        ?.trim()
        .toUpperCase();


    if (!symbol) {

      return sendJSON(
        res,
        400,
        {

          error:
            "symbol parametresi gerekli.",

        }
      );

    }


    console.log(
      `QUOTE TEST → ${symbol}`
    );


    const connection =
      await createMcpClient();


    transport =
      connection.transport;


    const tools =
      await connection.client.listTools();


    return sendJSON(
      res,
      200,
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

      }
    );


  } catch (error) {

    console.error(
      "QUOTE ERROR:",
      error
    );


    return sendJSON(
      res,
      500,
      {

        error:
          error.message,

      }
    );


  } finally {

    if (transport) {

      try {

        await transport.close();

      } catch (_) {}

    }

  }

}


/*
========================================================
STATIC FILE
========================================================
*/

function serveFile(
  res,
  filePath,
  contentType
) {

  fs.readFile(
    filePath,
    (error, data) => {

      if (error) {

        console.error(
          `Dosya okunamadı: ${filePath}`,
          error
        );


        return sendText(
          res,
          500,
          "Internal Server Error"
        );

      }


      res.writeHead(
        200,
        {

          "Content-Type":
            contentType,

          "Cache-Control":
            "no-cache",

          "Access-Control-Allow-Origin":
            "*",

        }
      );


      res.end(data);

    }
  );

}


/*
========================================================
READ REQUEST BODY
========================================================
*/

function readBody(
  req
) {

  return new Promise(
    (resolve, reject) => {

      let body = "";


      req.on(
        "data",
        (chunk) => {

          body += chunk;


          if (
            body.length >
            1024 * 1024
          ) {

            reject(
              new Error(
                "Request body çok büyük."
              )
            );


            req.destroy();

          }

        }
      );


      req.on(
        "end",
        () => {

          resolve(body);

        }
      );


      req.on(
        "error",
        reject
      );

    }
  );

}
/*
========================================================
GITHUB WATCHLIST
========================================================
*/

async function getWatchlist() {

  const response = await fetch(
    `https://api.github.com/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/contents/data/watchlist.json`,
    {
      headers: {
        "Authorization":
          `Bearer ${process.env.GITHUB_TOKEN}`,

        "Accept":
          "application/vnd.github+json",

        "User-Agent":
          "BorsaCI",
      },
    }
  );


  if (!response.ok) {

    throw new Error(
      `GitHub watchlist okunamadı: HTTP ${response.status}`
    );

  }


  const data =
    await response.json();


  const content =
    Buffer.from(
      data.content.replace(/\n/g, ""),
      "base64"
    ).toString("utf8");


  return {
    content:
      JSON.parse(content),

    sha:
      data.sha,
  };

}


async function saveWatchlist(
  watchlist,
  sha
) {

  const content =
    Buffer.from(
      JSON.stringify(
        watchlist,
        null,
        2
      )
    ).toString("base64");


  const response =
    await fetch(
      `https://api.github.com/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/contents/data/watchlist.json`,
      {

        method:
          "PUT",

        headers: {

          "Authorization":
            `Bearer ${process.env.GITHUB_TOKEN}`,

          "Accept":
            "application/vnd.github+json",

          "Content-Type":
            "application/json",

          "User-Agent":
            "BorsaCI",

        },

        body:
          JSON.stringify({

            message:
              "Update watchlist",

            content,

            sha,

          }),

      }
    );


  if (!response.ok) {

    const errorText =
      await response.text();

    throw new Error(
      `GitHub watchlist kaydedilemedi: ${errorText}`
    );

  }


  return await response.json();

}


async function handleWatchlist(
  req,
  res
) {

  try {

    /*
    ========================================
    GET
    ========================================
    */

    if (
      req.method === "GET"
    ) {

      const result =
        await getWatchlist();


      return sendJSON(
        res,
        200,
        result.content
      );

    }


    /*
    ========================================
    POST
    ========================================
    */

    if (
      req.method === "POST"
    ) {

      const body =
        await readBody(req);


      let data;


      try {

        data =
          JSON.parse(body);

      } catch {

        throw new Error(
          "Geçersiz JSON."
        );

      }


      const symbol =
        String(
          data?.symbol || ""
        )
          .trim()
          .toUpperCase();


      if (!symbol) {

        throw new Error(
          "symbol alanı gerekli."
        );

      }


      const result =
        await getWatchlist();


      const symbols =
        Array.isArray(
          result.content.symbols
        )
          ? result.content.symbols
          : [];


      if (
        !symbols.includes(symbol)
      ) {

        symbols.push(symbol);

      }


      const watchlist = {

        symbols,

      };


      await saveWatchlist(
        watchlist,
        result.sha
      );


      return sendJSON(
        res,
        200,
        watchlist
      );

    }


    /*
    ========================================
    DELETE
    ========================================
    */

    if (
      req.method === "DELETE"
    ) {

      const url =
        new URL(
          req.url,
          `http://${req.headers.host || "localhost"}`
        );


      const symbol =
        url.searchParams
          .get("symbol")
          ?.trim()
          .toUpperCase();


      if (!symbol) {

        throw new Error(
          "symbol parametresi gerekli."
        );

      }


      const result =
        await getWatchlist();


      const symbols =
        Array.isArray(
          result.content.symbols
        )
          ? result.content.symbols
          : [];


      const updatedSymbols =
        symbols.filter(
          item =>
            item !== symbol
        );


      const watchlist = {

        symbols:
          updatedSymbols,

      };


      await saveWatchlist(
        watchlist,
        result.sha
      );


      return sendJSON(
        res,
        200,
        watchlist
      );

    }


    return sendJSON(
      res,
      405,
      {
        error:
          "Method Not Allowed",
      }
    );


  } catch (error) {

    console.error(
      "WATCHLIST ERROR:",
      error
    );


    return sendJSON(
      res,
      500,
      {
        error:
          error.message,
      }
    );

  }

}

/*
========================================================
HTTP SERVER
========================================================
*/

const server =
  http.createServer(
    async (
      req,
      res
    ) => {

      /*
      ========================================
      CORS PREFLIGHT
      ========================================
      */

      if (
        req.method === "OPTIONS"
      ) {

        res.writeHead(
          204,
          {

            "Access-Control-Allow-Origin":
              "*",

            "Access-Control-Allow-Methods":
              "GET,POST,OPTIONS",

            "Access-Control-Allow-Headers":
              "Content-Type",

          }
        );


        res.end();

        return;

      }


      /*
      ========================================
      URL PARSE
      ========================================
      */

      let url;


      try {

        url =
          new URL(
            req.url,
            `http://${req.headers.host || "localhost"}`
          );

      } catch {

        return sendText(
          res,
          400,
          "Bad Request"
        );

      }


      const pathname =
        url.pathname;
/*
========================================================
WATCHLIST
========================================================
*/

if (
  pathname === "/api/watchlist"
) {

  return handleWatchlist(
    req,
    res
  );

}

      console.log(
        `${req.method} ${pathname}`
      );


      /*
      ========================================
      HEALTH
      ========================================
      */

      if (
        req.method === "GET" &&
        pathname === "/health"
      ) {

        return sendJSON(
          res,
          200,
          {

            status:
              "ok",

            service:
              "BorsaCI",

            model:
              MODEL,

            timestamp:
              new Date().toISOString(),

          }
        );

      }


      /*
      ========================================
      QUOTE
      ========================================
      */

      if (
        req.method === "GET" &&
        (
          pathname === "/quote" ||
          pathname === "/api/quote"
        )
      ) {

        return handleQuote(
          req,
          res
        );

      }


      /*
      ========================================
      MARKET
      ========================================
      */

      if (
        req.method === "GET" &&
        (
          pathname === "/market" ||
          pathname === "/api/market"
        )
      ) {

        return handleMarket(
          req,
          res
        );

      }


      /*
      ========================================
      CHART
      ========================================
      */

      if (
        req.method === "GET" &&
        (
          pathname === "/chart" ||
          pathname === "/api/chart"
        )
      ) {

        return handleChart(
          req,
          res
        );

      }


      /*
      ========================================
      ASK
      ========================================
      */

      if (
        req.method === "POST" &&
        (
          pathname === "/ask" ||
          pathname === "/api/ask"
        )
      ) {

        try {

          const body =
            await readBody(
              req
            );


          let data;


          try {

            data =
              JSON.parse(body);

          } catch {

            throw new Error(
              "Geçersiz JSON."
            );

          }


          if (
            !data?.question ||
            typeof data.question !==
              "string"
          ) {

            throw new Error(
              "question alanı gerekli."
            );

          }


          const question =
            data.question.trim();


          if (!question) {

            throw new Error(
              "question alanı boş olamaz."
            );

          }


          console.log(
            "==========================================================="
          );


          console.log(
            `SORU → ${question}`
          );
console.log("🔥 API/ASK REQUEST GELDİ");
console.log("🔥 ANALYZE BAŞLADI");
          const answer =
            await analyze(
              question
            );


          console.log(
            "AI CEVAP →",
            answer
          );


          return sendJSON(
            res,
            200,
            {

              answer,

            }
          );


        } catch (error) {

          console.error(
            "ANALİZ HATASI:",
            error
          );


          return sendJSON(
            res,
            500,
            {

              error:
                error.message,

            }
          );

        }

      }


      /*
      ========================================
      ROOT
      ========================================
      */

      if (
        req.method === "GET" &&
        pathname === "/"
      ) {

        const filePath =
          path.join(
            __dirname,
            "public",
            "index.html"
          );


        return serveFile(
          res,
          filePath,
          "text/html; charset=utf-8"
        );

      }


      /*
      ========================================
      CSS
      ========================================
      */

      if (
        req.method === "GET" &&
        pathname === "/style.css"
      ) {

        const filePath =
          path.join(
            __dirname,
            "public",
            "style.css"
          );


        return serveFile(
          res,
          filePath,
          "text/css; charset=utf-8"
        );

      }


      /*
      ========================================
      APP JS
      ========================================
      */

      if (
        req.method === "GET" &&
        pathname === "/app.js"
      ) {

        const filePath =
          path.join(
            __dirname,
            "public",
            "app.js"
          );


        return serveFile(
          res,
          filePath,
          "application/javascript; charset=utf-8"
        );

      }


      /*
      ========================================
      404
      ========================================
      */

      console.log(
        `404 → ${req.method} ${pathname}`
      );


      return sendJSON(
        res,
        404,
        {

          error:
            "Not Found",

          path:
            pathname,

          method:
            req.method,

        }
      );

    }
  );


/*
========================================================
SERVER START
========================================================
*/

server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      "==========================================================="
    );

    console.log(
      `BorsaCI server ${PORT} portunda çalışıyor.`
    );

    console.log(
      `Groq model: ${MODEL}`
    );

    console.log(
      `MCP URL: ${process.env.MCP_URL ? "TANIMLI" : "YOK"}`
    );

    console.log(
      `Groq API: ${process.env.GROQ_API_KEY ? "TANIMLI" : "YOK"}`
    );

    console.log(
      `Gemini API: ${process.env.GEMINI_API_KEY ? "TANIMLI" : "YOK"}`
    );

    console.log(
      `Mistral API: ${process.env.MISTRAL_API_KEY ? "TANIMLI" : "YOK"}`
    );

    console.log(
      "==========================================================="
    );

  }
);
