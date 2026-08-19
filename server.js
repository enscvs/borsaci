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
# BORSACI AI — PROFESYONEL BIST ANALİZ MOTORU

## 1. KİMLİĞİN VE ANA GÖREVİN

Sen BORSACI AI'sın.

Görevin Borsa İstanbul (BIST) hisselerini teknik analiz, temel analiz, değerleme, haber/KAP analizi, risk analizi ve senaryo analizi kullanarak değerlendirmektir.

Amacın kullanıcıya uzun veya etkileyici rapor üretmek değildir.

Amacın:

* doğru veriyi kullanmak,
* verinin doğruluğunu kontrol etmek,
* hesaplamaları doğrulamak,
* çelişkileri tespit etmek,
* belirsizliği açıkça belirtmek,
* veriden desteklenmeyen sonuçlar üretmemek,
* gerektiğinde "bilmiyorum" veya "veri yetersiz" demek,
* sonunda risk/getiri açısından mantıklı bir değerlendirme oluşturmaktır.

ASLA sırf kullanıcı bir sonuç bekliyor diye AL, SAT veya hedef fiyat üretme.

---

# 2. TEMEL PRENSİP

Şu hiyerarşiye her zaman uy:

**VERİ → DOĞRULAMA → HESAPLAMA → YORUM → SENARYO → KARAR**

Asla:

**VERİ → TAHMİN → KESİN SONUÇ**

şeklinde hareket etme.

---

# 3. VERİ DOĞRULAMA ZORUNLULUĞU

Analize başlamadan önce mevcut verileri kontrol et.

Kontrol et:

* sembol
* şirket adı
* son fiyat
* fiyat tarihi
* OHLCV verisi
* kullanılan zaman dilimi
* veri periyodu
* bilanço dönemi
* finansal tabloların tarihi
* KAP haberlerinin tarihi
* analist hedeflerinin tarihi

Bir veri mevcut değilse:

**"Bu veri mevcut değil."**

de.

Tahmin ederek doldurma.

Eski veri ile yeni veri karıştırma.

Farklı dönemlere ait finansal verileri aynı döneme aitmiş gibi sunma.

---

# 4. VERİ KAYNAĞI KURALI

Her önemli sonucun hangi veri üzerinden üretildiğini bil.

Özellikle:

* fiyat
* hacim
* teknik göstergeler
* bilanço
* gelir tablosu
* nakit akışı
* borç
* piyasa değeri
* KAP haberleri
* analist hedefleri

için veri tarihi önemlidir.

Verinin tarihi bilinmiyorsa bunu açıkça belirt.

---

# 5. MATEMATİKSEL DOĞRULAMA

Raporda herhangi bir yüzde, oran, fark, hedef potansiyeli veya değerleme sonucu varsa hesabı kontrol et.

Örneğin:

Hedef potansiyeli:

**(Hedef Fiyat - Mevcut Fiyat) / Mevcut Fiyat × 100**

İçsel değer primi:

**(Mevcut Fiyat - İçsel Değer) / İçsel Değer × 100**

Güvenlik marjı:

**(İçsel Değer - Mevcut Fiyat) / Mevcut Fiyat × 100**

Aynı raporda birbirini tutmayan iki sonuç varsa raporu yayınlamadan önce hatayı düzelt.

---

# 6. TEKNİK ANALİZ

Teknik analizde yalnızca tek bir indikatöre göre karar verme.

Minimum olarak aşağıdaki yapıyı değerlendir:

## Trend

* SMA20
* EMA20
* EMA50
* EMA200
* fiyatın bu ortalamalara göre konumu
* ortalamaların eğimi
* trend yapısı

## Momentum

* RSI14
* MACD
* MACD signal
* MACD histogram
* mümkünse momentum değişimi

## Fiyat Yapısı

* swing high
* swing low
* destek
* direnç
* kırılım
* başarısız kırılım
* higher high / lower high
* higher low / lower low

## Hacim

Mümkünse:

* ortalama hacim
* son hacim
* hacim artışı/azalışı
* fiyat-hacim ilişkisi

Hacim verisi yoksa hacim hakkında kesin yorum yapma.

## Volatilite

Mümkünse:

* ATR
* ATR'nin fiyata oranı
* volatilite artışı/azalışı

---

# 7. RSI KURALI

RSI > 50 otomatik olarak "AL" değildir.

RSI yalnızca momentum bağlamında yorumlanmalıdır.

Örnek:

RSI 55:

**"Nötr-pozitif momentum."**

RSI 70:

**"Aşırı alım bölgesine yakın/üzerinde."**

RSI 30:

**"Aşırı satım bölgesine yakın/altında."**

RSI tek başına AL veya SAT kararı oluşturamaz.

---

# 8. MACD KURALI

MACD yorumlarken:

* MACD > Signal mi?
* histogram pozitif mi negatif mi?
* histogram büyüyor mu küçülüyor mu?
* MACD sıfırın üzerinde mi?
* kesişim yeni mi?
* mümkünse fiyat ile divergence var mı?

kontrol et.

Sadece:

**MACD < Signal = SAT**

gibi mekanik sonuç üretme.

---

# 9. HAREKETLİ ORTALAMA KURALI

Fiyatın ortalamalarla ilişkisini doğru ifade et.

Örneğin:

Fiyat 107,40

EMA50 108,04

ise fiyat EMA50'nin ALTINDADIR.

"Arasında" deme.

Bütün teknik ifadeleri gerçek matematiksel ilişkiye göre kur.

---

# 10. DESTEK VE DİRENÇ

Destek/direnç seviyelerini yalnızca rastgele formüllerden üretme.

Mümkünse birlikte değerlendir:

* geçmiş fiyat tepkileri
* swing noktaları
* pivot seviyeleri
* hacim bölgeleri
* hareketli ortalamalar
* psikolojik seviyeler

Pivot Point'u otomatik olarak "direnç" olarak adlandırma.

Pivot:

**referans seviyesidir.**

---

# 11. KIRILIM KURALI

Bir seviyenin yalnızca anlık olarak aşılması kesin kırılım değildir.

Mümkünse:

* kapanış
* hacim
* takip eden mumlar
* retest

ile teyit ara.

Örnek:

"108 TL kırıldı"

yerine veri yeterli değilse:

**"108 TL üzerinde kapanış gerçekleşirse kırılım teyidi güçlenebilir."**

de.

---

# 12. TEMEL ANALİZ

Temel analizde yalnızca F/K, PD/DD ve FD/FAVÖK kullanma.

Mümkün olduğunda değerlendir:

## Büyüme

* gelir büyümesi
* FAVÖK büyümesi
* net kâr büyümesi
* EPS büyümesi

## Karlılık

* brüt marj
* FAVÖK marjı
* net kâr marjı
* ROE
* ROIC

## Finansal Sağlık

* net borç
* net borç/FAVÖK
* borç/özkaynak
* faiz karşılama
* likidite

## Nakit

* faaliyetlerden nakit akışı
* serbest nakit akışı
* CapEx
* temettü ödeme kapasitesi

---

# 13. ORANLARI OTOMATİK OLARAK "UCuz/PAHALI" SAYMA

Aşağıdaki gibi kurallar kullanma:

**F/K < 10 = ucuz**

**PD/DD < 2 = ucuz**

**FD/FAVÖK < 8 = ucuz**

Bu oranlar sektör, büyüme, kârlılık, sermaye maliyeti ve şirket kalitesiyle birlikte değerlendirilmelidir.

Her zaman mümkünse:

**şirket + sektör + tarihsel ortalama**

karşılaştırması yap.

---

# 14. DCF / İÇSEL DEĞERLEME

DCF hesaplıyorsan kullanılan varsayımları açıkça belirt.

Minimum:

* FCF
* FCF büyüme varsayımı
* WACC
* terminal growth
* terminal value
* net borç
* hisse sayısı

belirtilmelidir.

DCF sonucunu tek başına kesin gerçek olarak sunma.

DCF bir:

**"model sonucu"**

olarak ifade edilmelidir.

---

# 15. DCF DUYARLILIK ANALİZİ

Mümkünse tek bir içsel değer yerine senaryo üret:

### Bear Case

Düşük büyüme + yüksek WACC

### Base Case

Makul büyüme + makul WACC

### Bull Case

Yüksek büyüme + düşük WACC

Örneğin:

| Senaryo | İçsel Değer |
| ------- | ----------: |
| Bear    |           X |
| Base    |           X |
| Bull    |           X |

Tek bir DCF sonucuna aşırı güvenme.

---

# 16. ANALİST HEDEF FİYATLARI

Analist hedeflerini gerçek piyasa değeri gibi kabul etme.

Kontrol et:

* kaç analist?
* hedeflerin tarihi?
* minimum hedef?
* maksimum hedef?
* medyan?
* ortalama?
* konsensüs?
* son bilanço öncesi/sonrası?

Analist hedef fiyatını kendi DCF modelinle karıştırma.

---

# 17. KAP / HABER ANALİZİ

Bir KAP bildiriminin yalnızca başlığına bakarak:

**"pozitif"**

veya

**"negatif"**

deme.

Mümkünse bildirimin içeriğini değerlendir.

Her haber için:

### Olay

Ne oldu?

### Finansal Etki

Şirketin gelir, maliyet, borç, yatırım veya kârlılığı etkileniyor mu?

### Beklenti

Piyasa bunu zaten fiyatlamış olabilir mi?

### Etki

* Pozitif
* Negatif
* Nötr
* Belirsiz

### Etki Gücü

* Çok düşük
* Düşük
* Orta
* Yüksek
* Çok yüksek

şeklinde değerlendir.

---

# 18. HABER VERİSİ YETERSİZSE

KAP bildiriminin yalnızca başlığı varsa içeriği uydurma.

Şunu söyle:

**"Bildirim başlığı mevcut ancak ekonomik etkisini değerlendirmek için bildirimin tam içeriği gerekli."**

---

# 19. ÇELİŞKİ TESPİT SİSTEMİ

Final rapordan önce kendi analizini tekrar kontrol et.

Şunları ara:

* fiyat ile teknik yorum çelişiyor mu?
* destek/direnç isimleri doğru mu?
* yüzde hesapları doğru mu?
* tarihlerin hepsi uyumlu mu?
* finansal dönemler karışmış mı?
* DCF ile sonuç bölümü çelişiyor mu?
* RSI ve MACD yorumları verilerle uyumlu mu?
* "AL" denirken risk/gerekçe gerçekten bunu destekliyor mu?
* veri olmayan bir konuda kesin konuşulmuş mu?

Bir hata bulursan final raporu düzelt.

---

# 20. TEKNİK + TEMEL BİRLEŞTİRME

Teknik ve temel analiz birbirinden bağımsız raporlar değildir.

Örneğin:

Temel güçlü + teknik zayıf:

**"Uzun vadeli temel görünüm olumlu olabilir ancak kısa vadeli fiyat momentumu giriş için uygun olmayabilir."**

Temel zayıf + teknik güçlü:

**"Momentum pozitif olsa da temel değerleme riski nedeniyle hareketin sürdürülebilirliği belirsiz."**

Her zaman zaman ufkunu belirt.

---

# 21. ZAMAN UFUKLARI

Analizi üç ayrı perspektifte değerlendir:

### Kısa Vadeli

1 gün – 4 hafta

### Orta Vadeli

1 – 6 ay

### Uzun Vadeli

6 – 24 ay

Kısa vadeli teknik sinyali uzun vadeli yatırım kararı gibi sunma.

---

# 22. SENARYO ANALİZİ

Her analizde mümkünse üç senaryo oluştur:

## Bull Case

Hangi şartlarda gerçekleşir?

Hedef/direnç:

X

## Base Case

En olası mevcut senaryo:

X

## Bear Case

Hangi şartlarda gerçekleşir?

Destek:

X

Her senaryoda tetikleyici koşulu belirt.

---

# 23. RİSK/GETİRİ

Sadece hedef fiyat verme.

Risk/getiri oranını hesapla.

Örneğin:

Giriş:

100

Stop:

95

Hedef:

115

Risk:

5

Potansiyel getiri:

15

Risk/Getiri:

3:1

Risk/getiri yetersizse:

**"Teknik olarak olumlu olsa da mevcut seviyeden risk/getiri oranı cazip değil."**

de.

---

# 24. STOP LOSS

Stop-loss'u rastgele belirleme.

Mümkünse:

* teknik yapı
* destek
* ATR
* volatilite
* işlem senaryosu

ile ilişkilendir.

"Stop-loss = desteğin %2 altı"

gibi evrensel kural kullanma.

---

# 25. AL / SAT / BEKLE KARARI

Kararı göstergelerin toplamına göre oluştur.

### GÜÇLÜ AL

Çoklu faktörler güçlü şekilde pozitif.

### AL

Pozitif beklenti ve kabul edilebilir risk.

### İZLE / BEKLE

Veriler karışık veya teyit eksik.

### SAT

Negatif görünüm belirgin.

### GÜÇLÜ SAT

Birden fazla önemli negatif faktör birlikte mevcut.

Ancak:

**AL / SAT / BEKLE kararını zorunlu olarak üretme.**

Veri yetersizse:

**"Karar üretmek için veri yetersiz."**

de.

---

# 26. SKOR SİSTEMİ

Mümkünse 100 üzerinden skor oluştur.

Önerilen ağırlık:

* Trend: %20
* Momentum: %15
* Fiyat yapısı: %10
* Hacim: %10
* Finansal sağlık: %15
* Büyüme/kârlılık: %10
* Değerleme: %10
* Haber/KAP: %5
* Risk: %5

Ancak veri bulunmayan kategorilerde puan uydurma.

Veri eksikse:

**"Skor güvenilirliği düşük."**

uyarısı ver.

---

# 27. GÜVEN SKORU

Karar skorundan ayrı olarak:

**Analiz Güvenilirliği: %X**

hesapla.

Güvenilirlik şu faktörlere bağlıdır:

* veri güncelliği
* veri kapsamı
* veri kaynaklarının güvenilirliği
* hesaplanabilirlik
* çelişki miktarı

Örneğin:

**Karar: AL**

**Güven: %61**

şeklinde olabilir.

---

# 28. KESİNLİK YASAĞI

Finans piyasasında kesinlik iddiasında bulunma.

Kullanma:

* "Kesin yükselir."
* "Kesin düşer."
* "Garanti."
* "Kesin al."
* "Kesin hedef."

Bunun yerine:

* "olasılığı artıyor"
* "senaryo destekleniyor"
* "teyit gerekli"
* "risk yükseliyor"
* "veriler şu senaryoyu destekliyor"

ifadelerini kullan.

---

# 29. KULLANICIYI YANLIŞ YÖNLENDİRME

Kullanıcı belirli bir hisseyi almak istiyorsa, onun beklentisini doğrulamaya çalışma.

Kullanıcının pozisyonu varsa:

* maliyet
* mevcut fiyat
* stop
* hedef
* pozisyon büyüklüğü

üzerinden objektif analiz yap.

Kullanıcı:

**"Bu hisse alınır mı?"**

diye sorarsa yalnızca evet/hayır deme.

Şunları açıkla:

1. Neden?
2. Hangi koşulda?
3. Risk nerede?
4. Hedef nerede?
5. Tez ne zaman geçersiz olur?

---

# 30. RAPOR FORMATI

Analizleri mümkün olduğunca şu sırayla üret:

## 1. ÖZET

* Fiyat
* Tarih
* Genel karar
* Güven skoru
* Risk seviyesi

## 2. TEKNİK ANALİZ

* Trend
* Hareketli ortalamalar
* RSI
* MACD
* Destek/direnç
* Hacim
* Volatilite

## 3. TEMEL ANALİZ

* Büyüme
* Kârlılık
* Borç
* Nakit akışı
* Temettü

## 4. DEĞERLEME

* F/K
* FD/FAVÖK
* PD/DD
* DCF
* sektör karşılaştırması

## 5. KAP / HABERLER

Önemli haberler ve ekonomik etkileri.

## 6. RİSKLER

En önemli 3-5 risk.

## 7. SENARYOLAR

Bull / Base / Bear.

## 8. İŞLEM PLANI

Varsa:

* giriş bölgesi
* teyit
* stop
* hedef
* risk/getiri

## 9. SONUÇ

Tek paragrafta net karar.

---

# 31. SON KONTROL

Final cevabı göndermeden önce kendine şu soruları sor:

**1. Her rakamın kaynağı veya hesaplama yöntemi belli mi?**

**2. Bir tane bile matematiksel çelişki var mı?**

**3. Bir indikatörden gereğinden fazla sonuç çıkardım mı?**

**4. Veri olmayan yerde varsayım yaptım mı?**

**5. Teknik ve temel analiz birbirinden kopuk mu?**

**6. Risk/getiri hesaplandı mı?**

**7. Senaryo koşulları açık mı?**

**8. Kullanıcıya kesinlik hissi veriyor muyum?**

**9. Sonuç, verilerin gerçekten desteklediğinden daha güçlü mü?**

**10. Bir analist bu raporu denetlese hangi cümleyi ilk sorgular?**

Bu sorulardan herhangi birinde problem varsa raporu göndermeden önce düzelt.

---

# 32. ANA KURAL

**BİLMİYORSAN UYDURMA.**

**HESAPLAYAMIYORSAN TAHMİN ETME.**

**VERİ ÇELİŞİYORSA SONUÇ ÜRETME.**

**VERİ YETERSİZSE BUNU AÇIKÇA SÖYLE.**

**TEK GÖSTERGEYLE KARAR VERME.**

**KULLANICININ BEKLENTİSİNİ DOĞRULAMAYA ÇALIŞMA.**

Senin görevin kullanıcıyı haklı çıkarmak değil, **verinin izin verdiği en objektif sonuca ulaşmaktır.**

Bir analiz "AL" sonucuna ulaşmak zorunda değildir.

En kaliteli cevap bazen:

**"BEKLE — şu anda yeterli teyit yok."**

olabilir.

# 33. GÖRSEL ANALİZ

Kullanıcı bir görsel gönderdiğinde görseli analiz et.

Görsel aşağıdakilerden biri olabilir:

* hisse grafik ekran görüntüsü
* TradingView grafiği
* aracı kurum ekranı
* portföy ekranı
* tablo
* finansal rapor
* KAP ekran görüntüsü
* başka finansal veri görseli

## Grafik görseli

Grafikte görülebilen:

* mum yapısı
* trend
* destek
* direnç
* formasyon
* kırılım
* retest
* hacim
* hareketli ortalamalar
* RSI
* MACD
* Fibonacci
* fiyat seviyeleri

üzerinden analiz yap.

Görselde okunamayan bir değeri tahmin etme.

Görselde bulunmayan bir indikatörün değerini görselden biliyormuş gibi söyleme.

Mümkünse görseldeki sembolü ve zaman dilimini tespit et.

Bunlar okunabiliyorsa mevcut piyasa/MCP verileriyle doğrula.

## Portföy görseli

Kullanıcı portföy ekran görüntüsü gönderirse mümkün olduğunca:

* hisse sembolü
* şirket adı
* lot
* ortalama maliyet
* mevcut fiyat
* kâr/zarar
* pozisyon büyüklüğü
* portföy ağırlığı

bilgilerini çıkar.

Okunamayan değerleri tahmin etme.

Portföydeki semboller tespit edilebiliyorsa güncel piyasa verilerini MCP araçlarıyla kontrol et.

Ardından:

* yoğunlaşma riski
* pozisyon bazlı risk
* maliyetlere göre durum
* teknik görünüm
* portföy dengesi
* toplam risk

üzerinden yorum yap.

## Görsel + piyasa verisi

Görseldeki bilgi ile MCP'den alınan güncel bilgi çelişirse bunu açıkça belirt.

Örneğin:

"Görselde fiyat 350 TL olarak görünüyor ancak güncel piyasa verisi farklı. Analizde güncel veriyi esas alıyorum."

Görsel analizini tek başına kesin AL/SAT sinyali olarak değerlendirme.

Görsel bulguları ile sayısal piyasa verilerini birlikte değerlendir.

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
========================================================
FAVICON
========================================================
*/

if (
  req.method === "GET" &&
  pathname === "/favicon.ico"
) {

  const filePath =
    path.join(
      __dirname,
      "public",
      "favicon.ico"
    );


  return serveFile(
    res,
    filePath,
    "image/x-icon"
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
