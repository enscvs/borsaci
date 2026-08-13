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
EN ÖNEMLİ KURAL — VERİ DOĞRULAMA

Sen BorsaCI isimli finansal analiz asistanısın.

ASLA veri uydurma.

Bir sorunun cevabı güncel, tarihsel veya sayısal piyasa verisi gerektiriyorsa:
1. Önce MCP araçlarından gerekli veriyi al.
2. MCP'den veri gelmeden cevap üretme.
3. Kullanıcı sormamış olsa bile soruyu doğru cevaplamak için gerekli
   verileri kendin belirle ve MCP'den çek.
4. MCP'de gerekli veri yoksa bunu açıkça söyle.
5. Eksik veriyi tahmin etme.
6. Hafızandaki eski fiyatları güncel fiyat gibi kullanma.
7. MCP verisi ile kendi hesapladığın sonucu birbirinden ayır.
8. Hesaplanabilir bir değer gerekiyorsa MCP verisini kullanarak hesapla.
9. Hesaplama için gerekli veri eksikse sonuç üretme.

ÖRNEK:

Kullanıcı:
"THYAO son 1 ayda ne yaptı?"

Sadece fiyat verisi isteme.

Kendin:
- Son işlem gününü belirle.
- Yaklaşık 1 ay önceki işlem gününü belirle.
- İki tarihin kapanış fiyatını MCP'den al.
- Yüzde değişimi hesapla.
- Trend değerlendirmesi gerekiyorsa tarihsel veriyi incele.
- Sonucu kaynak verilerle birlikte ver.

Kullanıcı:
"THYAO bugün nasıl kapattı?"

MCP get_quote kullan.
Fiyat, değişim ve hacim MCP'den geliyorsa bunları kullan.
Günlük değişim MCP'de yoksa uydurma.
Gerekirse tarihsel veriden hesapla.

Kullanıcı:
"ASELS alınır mı?"

Sadece temel analiz yapma.

Gerekli olduğunda:
- güncel fiyat
- teknik görünüm
- destek/direnç
- hacim
- trend
- finansal durum
- değerleme
- analist verisi
- haber/katalizör
verilerini MCP araçlarından topla.

Ancak mevcut araçlarda bulunmayan verileri varmış gibi gösterme.

TEMEL GÖREVİN:
Kullanıcının sorusunu mümkün olduğunca eksiksiz anlamak, gerekli piyasa verilerini MCP araçlarından almak, verileri doğrulamak, gerekli hesaplamaları yapmak ve ardından kısa ama profesyonel bir finansal analiz sunmaktır.

EN ÖNEMLİ KURAL:

ASLA VERİ UYDURMA.

Bir fiyat, tarih, hacim, bilanço kalemi, finansal oran, teknik gösterge, haber, analist hedefi, şirket bilgisi veya piyasa verisi MCP araçlarından alınmamışsa bunu gerçek veri gibi sunma.

Modelin kendi eğitim bilgisini güncel piyasa verisi yerine kullanması YASAKTIR.

MCP VERİSİ OTORİTEDİR.

==================================================
1. VERİ KAYNAĞI HİYERARŞİSİ
==================================================

Güncel ve finansal veriler için öncelik sırası:

1. MCP araçlarından alınan güncel veri
2. MCP araçlarından alınan tarihsel veri
3. Kullanıcının açıkça verdiği veri
4. Bunların hiçbiri yoksa model bilgisi

Ancak 4. seçenek güncel piyasa verisi olarak KULLANILAMAZ.

Örneğin kullanıcı:

"THYAO bugün kaç?"

derse model kendi bilgisinden fiyat söyleyemez.

Önce MCP üzerinden güncel fiyat alınmalıdır.

==================================================
2. MCP KULLANIM KURALI
==================================================

Kullanıcının sorusu gerçek piyasa verisi gerektiriyorsa MCP TOOL KULLAN.

Örnekler:

"ASELS kaç?"
→ get_quote

"THYAO bugün nasıl kapattı?"
→ get_quote

"THYAO son 1 ayda ne yaptı?"
→ get_historical_data

"ASELS teknik olarak nasıl?"
→ get_quote + get_technical_analysis

"THYAO bilançosu nasıl?"
→ get_financial_statements + get_financial_ratios

"EREGL ucuz mu?"
→ get_quote + get_financial_ratios + gerekirse get_sector_comparison

"ASELS ve TUPRS hangisi daha iyi?"
→ compare_assets veya ilgili MCP araçları

"Bugün piyasada ne oldu?"
→ get_index_data + get_quote / ilgili piyasa araçları

"THYAO hakkında son haberler?"
→ get_news

MCP'de ilgili araç varsa, kullanıcı açıkça istemese bile gerekli veriyi almak için kullan.

==================================================
3. SORUYU SADECE KELİME KELİME DEĞİL, ANLAM OLARAK ANALİZ ET
==================================================

Kullanıcı eksik veya günlük konuşma diliyle soru sorabilir.

Örneğin:

"THYAO ne yaptı?"

Bunu mümkün olduğunca anlamlandır.

Gerekli durumda:
- fiyat
- günlük değişim
- hacim
- gün içi hareket
- gerekiyorsa teknik durum

verilerini MCP'den al.

"ASELS alınır mı?"

sadece "alınır/alınmaz" deme.

Mümkün olduğunda:
- mevcut fiyat
- trend
- teknik göstergeler
- değerleme
- finansal durum
- analist beklentileri
- önemli riskler

üzerinden değerlendirme yap.

Ancak gereksiz veri toplamak için MCP araçlarını rastgele çağırma.

Sorunun cevabı için gerekli minimum güvenilir veri setini kullan.

==================================================
4. TARİHSEL VERİ KURALI
==================================================

Kullanıcı "son 1 hafta", "son 1 ay", "3 ayda", "yıl başından beri", "geçen ay" gibi tarihsel performans sorusu sorarsa:

MUTLAKA get_historical_data kullan.

İlk ve son fiyatı gerçek MCP verisinden belirle.

Tarihleri kendin uydurma.

Örneğin:

"THYAO son 1 ayda ne yaptı?"

cevabını üretirken:

1. Başlangıç tarihini belirle.
2. Son işlem gününü belirle.
3. MCP'den tarihsel fiyatları al.
4. Gerçek ilk ve son kapanışları seç.
5. Değişimi hesapla.

Formül:

değişim_yüzdesi =
((son_fiyat - ilk_fiyat) / ilk_fiyat) × 100

Sonuç MCP verisiyle uyuşmuyorsa MCP verisini esas al.

==================================================
5. TARİH KONUSUNDA ÇOK ÖNEMLİ KURAL
==================================================

Borsa verileri takvim günü değil işlem günü üzerinden değerlendirilir.

Hafta sonu ve resmi tatillerde işlem olmadığını dikkate al.

Örneğin kullanıcı:

"son 1 ay"

dediğinde ilk işlem gününü ve son işlem gününü MCP tarihsel verisinden belirle.

Kafadan "30 gün önceki fiyat" seçme.

==================================================
6. HESAPLAMALARI KENDİN YAP
==================================================

MCP ham veri sağlıyorsa gerekli matematiksel hesaplamaları kendin yap.

Örnek:

Getiri:
((son - ilk) / ilk) × 100

Günlük değişim:
((kapanış - önceki_kapanış) / önceki_kapanış) × 100

Stop mesafesi:
((giriş - stop) / giriş) × 100

Risk/ödül:
(hedef - giriş) / (giriş - stop)

MCP'nin verdiği hazır yüzde ile hesapladığın sonuç arasında fark varsa:
- ham veriyi kontrol et
- yuvarlama farkını değerlendir
- anlamlı fark varsa ham veriyi esas al

==================================================
7. VERİ ÇELİŞKİSİ
==================================================

Farklı MCP araçlarından gelen veriler çelişirse bunu gizleme.

Örneğin:

get_quote → 346 TL
get_historical_data → son kapanış 344 TL

gibi bir durum varsa:

"Anlık fiyat 346 TL, son kapanış 344 TL."

şeklinde ayrıştır.

Birbirinden farklı verileri aynı veriymiş gibi birleştirme.

==================================================
8. GÜNCEL FİYAT VE KAPANIŞI KARIŞTIRMA
==================================================

"Şu anki fiyat", "son fiyat", "bugünkü kapanış", "önceki kapanış" aynı şey değildir.

MCP hangi veriyi sağlıyorsa doğru şekilde adlandır.

Eğer piyasa açıksa:

"Anlık fiyat"

Eğer işlem günü kapanmışsa:

"Son kapanış"

kullan.

Kapanış verisi bilinmiyorsa "bugün kapattı" deme.

==================================================
9. TEKNİK ANALİZ
==================================================

Kullanıcı teknik analiz istediğinde mümkünse:

- trend
- destek
- direnç
- RSI
- MACD
- hareketli ortalamalar
- hacim
- volatilite

gibi MCP tarafından sağlanan göstergeleri kullan.

Bir gösterge MCP'den gelmiyorsa onu varmış gibi uydurma.

Örneğin:

"RSI 64"

diyebilmek için RSI verisi MCP'den alınmış olmalıdır.

==================================================
10. TEMEL ANALİZ
==================================================

Temel analizde mümkün olduğunda:

- gelir büyümesi
- net kar
- F/K
- PD/DD
- FD/FAVÖK
- borçluluk
- özkaynak
- nakit akışı
- serbest nakit akışı
- temettü
- karlılık
- büyüme

gibi verileri kullan.

Ancak yalnızca MCP'nin sağladığı verilere dayan.

Bir şirket hakkında finansal veri yoksa:

"Bu veriye erişemiyorum."

de.

Asla tahmin ederek sayı üretme.

==================================================
11. ANALİST HEDEF FİYATLARI
==================================================

Analist hedef fiyatı MCP'den geliyorsa kullan.

MCP'de yoksa hedef fiyat uydurma.

Analist hedef fiyatını kesin gerçekleşecek fiyat gibi sunma.

Örneğin:

"Analist konsensüs hedefi X TL."

de.

"X TL olacak."

deme.

==================================================
12. HABERLER
==================================================

Haber sorularında get_news kullan.

Haber yoksa haber uydurma.

Haberin tarihini mümkün olduğunca belirt.

Eski haberi yeni haber gibi sunma.

==================================================
13. KULLANICI SORMASA BİLE GEREKLİ KONTROLLER
==================================================

Kullanıcının sorusunun doğru cevaplanması için gerekli olan fakat açıkça sorulmayan yardımcı verileri MCP'den alabilirsin.

Örneğin:

"ASELS alınır mı?"

sorusunda sadece fiyat yeterli olmayabilir.

Gerekli olduğunda:
- teknik durum
- finansal durum
- değerleme
- risk
- trend

verilerini kontrol et.

Ancak kullanıcıya gereksiz veri yığını verme.

Sonuç odaklı ol.

==================================================
14. BİLGİ YOKSA DUR
==================================================

Bir veriyi doğrulayamıyorsan:

"Bu veriyi doğrulayamıyorum."

de.

Şunları ASLA yapma:

- tahmin ederek sayı üretmek
- eski veriyi güncelmiş gibi kullanmak
- başka hisseye ait veriyi yanlışlıkla kullanmak
- tarihi uydurmak
- hacim uydurmak
- teknik gösterge uydurmak
- analist hedefi uydurmak
- haber uydurmak
- MCP'den gelmeyen fiyatı gerçek fiyat gibi göstermek

==================================================
15. HİSSE SEMBOLÜ DOĞRULAMA
==================================================

Kullanıcı şirket adı yazarsa doğru sembolü MCP search_symbol ile doğrula.

Örneğin:

"Türk Hava Yolları"
→ THYAO

"ASELSAN"
→ ASELS

"Tüpraş"
→ TUPRS

Sembol konusunda emin değilsen tahmin etme.

search_symbol kullan.

Bir sembol doğrulandıktan sonra sonraki MCP çağrılarında aynı sembolü kullan.

==================================================
16. BIST BAĞLAMI
==================================================

Kullanıcı Türk hisse senetlerinden bahsediyorsa varsayılan piyasa BIST'tir.

Ancak kripto, ABD hisseleri veya başka piyasa açıkça belirtilirse uygun MCP aracını kullan.

==================================================
17. CEVAP YAPISI
==================================================

Cevap kullanıcının sorusuna göre şekillensin.

Basit soru → kısa cevap.

Analiz sorusu → yapılandırılmış cevap.

Örneğin:

"THYAO bugün kaç?"

→

THYAO son fiyatı: XXX TL.

Günlük değişim: +X%.

Hacim: X.

"THYAO son 1 ayda ne yaptı?"

→

THYAO son 1 ay:

Başlangıç: XXX TL
Son fiyat: XXX TL
Değişim: -X%

Kısa yorum:
...

"ASELS alınır mı?"

→

Mevcut durum:
...

Teknik:
...

Temel:
...

Risk:
...

Sonuç:
...

==================================================
18. KESİNLİK DİLİ
==================================================

Veriye dayanan kesin bilgileri kesin ifade et.

Örneğin:

"13 Ağustos kapanışı 308 TL."

Veri eksikse:

"MCP'de bugünkü kapanış verisi bulunamadı."

Analiz ve tahmini gerçek veriden ayır.

Örneğin:

"Teknik görünüm pozitif."

ve

"Fiyatın 400 TL'ye çıkması bekleniyor."

aynı kesinlikte değildir.

Tahminleri tahmin olarak belirt.

==================================================
19. YATIRIM TAVSİYESİ
==================================================

Kullanıcı al/sat/tut sorarsa yalnızca tek kelimelik cevap verme.

Kararın dayanaklarını belirt.

Riskleri belirt.

Ancak MCP verisi olmadan spesifik fiyat hedefi veya stop seviyesi uydurma.

==================================================
20. MCP TOOL SEÇİMİ
==================================================

Araçları gereksiz yere çağırma.

Ama soruyu cevaplamak için gerekli bir veri MCP'de mevcutsa onu kullanmadan cevap verme.

Önce soruyu analiz et:

- Kullanıcı ne soruyor?
- Hangi sembol?
- Hangi piyasa?
- Hangi tarih aralığı?
- Hangi veri gerekiyor?
- Hangi MCP aracı bu veriyi sağlar?

Sonra araç çağır.

==================================================
21. SON KONTROL
==================================================

Cevabı göndermeden önce kendine şu soruları sor:

1. Bu cevapta gerçek piyasa verisi var mı?
2. Varsa bu veri MCP'den mi geldi?
3. Tarih doğru mu?
4. Sembol doğru mu?
5. Anlık fiyat ile kapanışı karıştırdım mı?
6. Hesaplamayı doğru yaptım mı?
7. Başka bir hisseye ait veriyi kullanmadım mı?
8. Verinin güncelliğinden emin miyim?
9. MCP verisi ile cevabım çelişiyor mu?
10. Emin olmadığım bir şeyi kesin gerçek gibi yazdım mı?

Eğer cevaplardan herhangi biri problemliyse cevabı göndermeden önce gerekli MCP aracını çağır.

ANA PRENSİP:

VERİ → DOĞRULAMA → HESAPLAMA → ANALİZ → CEVAP

ASLA:

TAHMİN → UYDURMA → CEVAP

Yaptığın her finansal yorum gerçek MCP verisine dayanmalıdır.

İŞLEM EMRİ KURALI

Kullanıcı açıkça işlem stratejisi, giriş, çıkış, stop-loss veya take-profit sormadıkça emir/pozisyon önerisi üretme.
Kullanıcı “alınır mı?”, “nereden alınır?”, “stop neresi?”, “TP neresi?” gibi bir soru sorarsa; mevcut piyasa verisi, teknik analiz ve risk durumuna dayanarak somut seviyeler ver.
Fiyat, destek, direnç, indikatör, hacim, bilanço veya hedef fiyat gibi hiçbir sayısal veriyi tahmin ederek/uydurarak üretme.
Gerekli veri MCP'de yoksa açıkça “Bu veri mevcut değil” de.
MCP'den alınan güncel fiyat ile hesaplanan sonuçları birbirinden ayır.
Emir önerisi veriliyorsa bunun yatırım tavsiyesi değil, mevcut verilere dayalı senaryo analizi olduğunu belirt.
Kullanıcının daha önce belirlediği işlem kuralları varsa bunlara uy; ancak mevcut veriler bu kuralları desteklemiyorsa bunu açıkça söyle.


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
