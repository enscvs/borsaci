require("dotenv").config();

const http = require("http");
const path = require("path");
const fs = require("fs");

const {
  createAuthService,
} = require("./auth");

const OpenAI = require("openai");

const precision = require("./precision/engine");

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

const auth =
  createAuthService(
    {
      passwordHash:
        process.env.AUTH_PASSWORD_HASH,
      sessionSecret:
        process.env.SESSION_SECRET,
    }
  );

const MODEL =
  process.env.GROQ_MODEL ||
  "openai/gpt-oss-120b";

const VISION_MODEL =
  process.env.GEMINI_VISION_MODEL ||
  "gemini-2.5-flash";

const TRADING_AI_MODEL =
  process.env.TRADING_AI_MODEL ||
  MODEL;

const TELEGRAM_BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN;

const TELEGRAM_CHAT_ID =
  process.env.TELEGRAM_CHAT_ID;

async function sendTelegramNotification(
  message
) {

  if (
    !TELEGRAM_BOT_TOKEN ||
    !TELEGRAM_CHAT_ID ||
    !message
  ) {
    return false;
  }

  try {

    const response =
      await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            {
              chat_id: TELEGRAM_CHAT_ID,
              text: String(message).slice(0, 4000),
            }
          ),
        }
      );

    if (!response.ok) {
      const detail =
        (await response.text())
          .replace(/\s+/g, " ")
          .slice(0, 500);
      throw new Error(
        `Telegram HTTP ${response.status}: ${detail || "No error detail returned"}`
      );
    }

    console.log("TELEGRAM NOTIFICATION SENT");
    return true;

  } catch (error) {

    console.error(
      "TELEGRAM NOTIFICATION ERROR:",
      error.message
    );

    return false;

  }

}


function formatTelegramCurrency(
  value
) {

  const amount =
    Number(value);

  return `₺${Number.isFinite(amount)
    ? amount.toLocaleString(
        "tr-TR",
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }
      )
    : "--"}`;

}


function buildPaperOpenNotification(
  position
) {

  const positionValue =
    Number(position.quantity) *
    Number(position.entry);

  const risk =
    Math.max(
      0,
      (
        Number(position.entry) -
        Number(position.stop)
      ) * Number(position.quantity)
    );

  return [
    "🟢 BORSACI · PAPER İŞLEM AÇILDI",
    "",
    `${position.symbol} · LONG`,
    `Giriş: ${formatTelegramCurrency(position.entry)}`,
    `Miktar: ${position.quantity} lot`,
    `Pozisyon: ${formatTelegramCurrency(positionValue)}`,
    "",
    `SL: ${formatTelegramCurrency(position.stop)}`,
    `TP1: ${formatTelegramCurrency(position.target1)}`,
    `TP2: ${formatTelegramCurrency(position.target2)}`,
    `SL'ye kadar olası zarar: ${formatTelegramCurrency(risk)}`,
  ].join("\\n");

}


function buildPaperCloseNotification(
  position,
  closePrice,
  status,
  reason,
  totalPnl
) {

  const stopped =
    status === "STOPPED";

  return [
    stopped
      ? "🛑 BORSACI · PAPER STOP"
      : "✅ BORSACI · PAPER İŞLEM KAPANDI",
    "",
    `${position.symbol} · LONG`,
    `Kapanış: ${formatTelegramCurrency(closePrice)}`,
    `Toplam P&L: ${formatTelegramCurrency(totalPnl)}`,
    `Neden: ${reason}`,
  ].join("\\n");

}


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
  data,
  extraHeaders = {}
) {

  res.writeHead(
    statusCode,
    {
      "Content-Type":
        "application/json; charset=utf-8",

      "Cache-Control":
        "no-store",

      "X-Content-Type-Options":
        "nosniff",

      "Referrer-Policy":
        "same-origin",

      ...extraHeaders,
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
  text,
  extraHeaders = {}
) {

  res.writeHead(
    statusCode,
    {
      "Content-Type":
        "text/plain; charset=utf-8",

      "Cache-Control":
        "no-store",

      "X-Content-Type-Options":
        "nosniff",

      ...extraHeaders,
    }
  );

  res.end(text);
}


/*
========================================================
AUTHENTICATION
========================================================
*/

function getClientIp(req) {
  const forwarded =
    String(
      req.headers["x-forwarded-for"] || ""
    )
      .split(",")[0]
      .trim();

  return forwarded ||
    req.socket?.remoteAddress ||
    "unknown";
}


function expectedOrigin(req) {
  const host =
    String(req.headers.host || "")
      .trim()
      .toLowerCase();

  const forwardedProto =
    String(
      req.headers["x-forwarded-proto"] || ""
    )
      .split(",")[0]
      .trim()
      .toLowerCase();

  const protocol =
    forwardedProto === "https" ||
    req.socket?.encrypted
      ? "https"
      : "http";

  return host
    ? `${protocol}://${host}`
    : "";
}


function hasTrustedOrigin(req) {
  const origin =
    String(req.headers.origin || "")
      .trim()
      .replace(/\/$/, "");

  const expected =
    expectedOrigin(req)
      .replace(/\/$/, "");

  return Boolean(origin && expected && origin === expected);
}


function isStateChangingRequest(req) {
  return !["GET", "HEAD", "OPTIONS"]
    .includes(req.method);
}


function isProtectedPath(pathname) {
  return (
    pathname.startsWith("/api/") ||
    [
      "/ask",
      "/quote",
      "/market",
      "/chart",
      "/trading/scanner",
    ].includes(pathname)
  );
}


async function handleAuthLogin(req, res) {
  const ip = getClientIp(req);

  if (!hasTrustedOrigin(req)) {
    return sendJSON(res, 403, {
      error: "Request rejected.",
    });
  }

  if (
    !auth.configured() ||
    !auth.loginAllowed(ip)
  ) {
    return sendJSON(
      res,
      auth.loginAllowed(ip)
        ? 503
        : 429,
      {
        error:
          auth.loginAllowed(ip)
            ? "Authentication unavailable."
            : "Too many attempts. Try again later.",
      }
    );
  }

  try {
    const body = await readBody(req);
    const data = JSON.parse(body || "{}");
    const valid =
      await auth.verifyPassword(
        data?.password
      );

    if (!valid) {
      auth.recordFailedLogin(ip);

      return sendJSON(res, 401, {
        error: "Invalid credentials.",
      });
    }

    auth.clearFailedLogins(ip);

    const session =
      auth.createSession();

    return sendJSON(
      res,
      200,
      {
        authenticated: true,
        csrfToken: session.csrfToken,
        expiresAt:
          new Date(
            session.expiresAt
          ).toISOString(),
      },
      {
        "Set-Cookie":
          auth.sessionCookie(
            session.token
          ),
      }
    );
  } catch {
    auth.recordFailedLogin(ip);

    return sendJSON(res, 401, {
      error: "Invalid credentials.",
    });
  }
}


function handleAuthSession(req, res) {
  const session =
    auth.getSessionFromRequest(req);

  if (!session) {
    return sendJSON(res, 401, {
      authenticated: false,
    });
  }

  return sendJSON(res, 200, {
    authenticated: true,
    csrfToken: session.csrfToken,
    expiresAt:
      new Date(
        session.expiresAt
      ).toISOString(),
  });
}


function handleAuthLogout(req, res) {
  const session =
    auth.getSessionFromRequest(req);

  if (
    !session ||
    !hasTrustedOrigin(req) ||
    String(
      req.headers["x-csrf-token"] || ""
    ) !== session.csrfToken
  ) {
    return sendJSON(res, 401, {
      error: "Unauthorized.",
    });
  }

  const cookies =
    String(req.headers.cookie || "")
      .split(";")
      .map(value => value.trim());

  const sessionCookie =
    cookies.find(
      value =>
        value.startsWith(
          `${auth.cookieName}=`
        )
    );

  if (sessionCookie) {
    auth.revokeSession(
      decodeURIComponent(
        sessionCookie.slice(
          auth.cookieName.length + 1
        )
      )
    );
  }

  return sendJSON(
    res,
    200,
    {
      authenticated: false,
    },
    {
      "Set-Cookie":
        auth.clearSessionCookie(),
    }
  );
}


function authorizeRequest(req, res) {
  const session =
    auth.getSessionFromRequest(req);

  if (!session) {
    sendJSON(res, 401, {
      error: "Unauthorized.",
    });
    return null;
  }

  if (isStateChangingRequest(req)) {
    if (
      !hasTrustedOrigin(req) ||
      String(
        req.headers["x-csrf-token"] || ""
      ) !== session.csrfToken
    ) {
      sendJSON(res, 403, {
        error: "Request rejected.",
      });
      return null;
    }
  }

  return session;
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
/*
========================================================
AI ANALYZE
========================================================
*/

async function analyze(
  question,
  image = null
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
    USER CONTENT
    ========================================
    */

    const userContent = [

      {
        type:
          "text",

        text:
          question,

      },

    ];


    /*
    ========================================
    IMAGE
    ========================================
    */

    if (image) {

      userContent.push({

        type:
          "image_url",

        image_url: {

          url:
            image,

        },

      });

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
          userContent,

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


      let response;


      /*
      ========================================
      GÖRSEL VARSA
      → GEMINI VISION
      ========================================
      */

      if (
        image &&
        step === 0
      ) {

        console.log(
          "AI PROVIDER → GEMINI VISION"
        );


        try {

          response =
            await geminiAI.chat.completions.create({

              model:
                VISION_MODEL,

              messages,

              tools,

              tool_choice:
                "auto",

              temperature:
                0.1,

            });


        } catch (geminiVisionError) {

          console.error(
            "GEMINI VISION HATA →",
            geminiVisionError.message
          );


          throw new Error(
            `Görsel analiz edilemedi: ${geminiVisionError.message}`
          );

        }

      }


      /*
      ========================================
      NORMAL METİN
      → GROQ
      ========================================
      */

      else {

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


          /*
          ========================================
          GEMINI FALLBACK
          ========================================
          */

          try {

            console.log(
              "AI PROVIDER → GEMINI"
            );


            response =
              await geminiAI.chat.completions.create({

                model:
                  VISION_MODEL,

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


            /*
            ========================================
            MISTRAL FALLBACK
            ========================================
            */

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

      }


      /*
      ========================================
      RESPONSE CHECK
      ========================================
      */

      const message =
        response
          ?.choices?.[0]
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
      MCP TOOL CALLS
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


  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => controller.abort(),
      12000
    );

  let response;

  try {

    response =
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

          signal:
            controller.signal,

        }
      );

  } catch (error) {

    if (controller.signal.aborted) {

      throw new Error(
        `Yahoo Finance zaman aşımına uğradı: ${yahooSymbol}`
      );

    }

    throw error;

  } finally {

    clearTimeout(timeout);

  }


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


    const validOhlc =
      [open, high, low, close].every(
        value =>
          Number.isFinite(value) &&
          value > 0
      ) &&
      high >= Math.max(open, close, low) &&
      low <= Math.min(open, close, high);

    /*
     * Yahoo piyasa kapalıyken veya gecikmeli akışta
     * son mum için 0/null OHLC gönderebiliyor. Bu mum
     * indikatörlere girerse ATR ve giriş seviyeleri
     * negatife düşebilir; tamamen yok sayılır.
     */
    if (!validOhlc) {
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

          "X-Content-Type-Options":
            "nosniff",

          "Referrer-Policy":
            "same-origin",

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

const MAX_BODY_SIZE =
  12 * 1024 * 1024; // 12 MB


function readBody(req) {

  return new Promise(
    (resolve, reject) => {

      let body = "";
      let rejected = false;


      req.on(
        "data",
        (chunk) => {

          if (rejected) {
            return;
          }


          body += chunk;


          if (
            Buffer.byteLength(body, "utf8") >
            MAX_BODY_SIZE
          ) {

            rejected = true;


            reject(
              new Error(
                "Request body çok büyük. Maksimum 12 MB."
              )
            );


            req.destroy();

          }

        }
      );


      req.on(
        "end",
        () => {

          if (!rejected) {

            resolve(body);

          }

        }
      );


      req.on(
        "error",
        (error) => {

          if (!rejected) {

            reject(error);

          }

        }
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

        ...result.content,

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

        ...result.content,

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
PAPER TRADING DECISIONS
========================================================
*/

function createDefaultTradingState() {

  return {

    version: 2,

    paper: {
      initialCapital: 100000,
      cash: 100000,
      equity: 100000,
      pnl: 0,
      pnlPercent: 0,
      positions: [],
    },

    risk: {
      maxPositionPercent: 31,
      maxPositions: 3,
    },

    killSwitch: {
      active: false,
      activatedAt: null,
    },

    decisions: [],

    history: [],

    activity: [
      {
        timestamp: new Date().toISOString(),
        type: "SYSTEM",
        message: "Paper trading engine initialized.",
      },
    ],

  };

}


function normalizeTradingState(
  value
) {

  const fallback =
    createDefaultTradingState();

  return {

    ...fallback,

    ...(value || {}),

    paper: {
      ...fallback.paper,
      ...((value || {}).paper || {}),
    },

    risk: {
      ...fallback.risk,
      ...((value || {}).risk || {}),
      /*
       * Eski kayıtlardaki %32 hedefini de yeni portföy
       * kuralına uydur: en fazla üç işlemle toplam %93,
       * en az %7 nakit rezerv.
       */
      maxPositionPercent: Math.min(
        31,
        Math.max(
          1,
          Number((value || {}).risk?.maxPositionPercent) || 31
        )
      ),
      maxPositions: Math.min(
        3,
        Math.max(
          1,
          Math.floor(Number((value || {}).risk?.maxPositions) || 3)
        )
      ),
    },

    killSwitch: {
      ...fallback.killSwitch,
      ...((value || {}).killSwitch || {}),
      active:
        Boolean((value || {}).killSwitch?.active),
    },

    decisions:
      Array.isArray(
        value?.decisions
      )
        ? value.decisions
        : [],

    history:
      Array.isArray(
        value?.history
      )
        ? value.history
        : [],

    activity:
      Array.isArray(
        value?.activity
      )
        ? value.activity
        : fallback.activity,

  };

}


async function getTradingState() {

  /*
   * Paper kayıtları, watchlist ile aynı kanıtlanmış
   * GitHub contents akışında saklanır.
   */
  const watchlistResult =
    await getWatchlist();

  return {

    content:
      normalizeTradingState(
        watchlistResult.content.trading
      ),

    sha:
      watchlistResult.sha,

    container:
      watchlistResult.content,

  };

}


async function saveTradingState(
  state,
  sha,
  container
) {

  const watchlist = {

    ...(container || {}),

    symbols:
      Array.isArray(
        container?.symbols
      )
        ? container.symbols
        : [],

    trading:
      normalizeTradingState(state),

  };

  return await saveWatchlist(
    watchlist,
    sha
  );

}


function roundTradingValue(
  value
) {

  return Number(
    Number(value).toFixed(2)
  );

}


function buildAiDecision(item, rank, riskSettings = {}) {
  const precisionResult = item?.precision;
  if (!precisionResult) return null;

  const plan = precisionResult.plan || {};
  const capital = Math.max(1000, Number(riskSettings.capital) || 100000);
  const allocation = Math.min(31, Math.max(1, Number(riskSettings.maxPositionPercent) || 31));
  const reference = Number(plan?.entry?.reference || item.price);
  const quantity = reference > 0 ? Math.floor((capital * allocation / 100) / reference) : 0;
  const decision = precisionResult.decision === "FILTERS_PASSED" ? "FILTERS_PASSED" : precisionResult.decision || "NO_TRADE";
  const pending = decision === "WATCH" || decision === "FILTERS_PASSED";
  const now = new Date().toISOString();

  return {
    id: `${Date.now()}-${item.symbol}`,
    rank,
    symbol: item.symbol,
    action: decision,
    status: pending ? "PENDING" : "REJECTED",
    confidence: null,
    entry: plan.entry || null,
    stop: plan.stop || null,
    target1: plan.target1 || null,
    target2: plan.target2 || null,
    riskReward: plan.riskReward ? `1:${plan.riskReward}` : null,
    riskPlan: {
      capital,
      targetPositionValue: Math.round(capital * allocation / 100 * 100) / 100,
      reservePercent: Math.max(0, 100 - allocation * Math.min(3, Number(riskSettings.maxPositions) || 3)),
      quantity,
      positionValue: Math.round(quantity * reference * 100) / 100,
      actualRisk: plan.risk && quantity ? Math.round(plan.risk * quantity * 100) / 100 : null,
      maxPositionPercent: allocation,
      maxPositions: Math.min(3, Math.max(1, Number(riskSettings.maxPositions) || 3)),
    },
    filters: {
      dataQuality: precisionResult.dataQuality === "PASSED",
      regime: precisionResult.marketRegime,
      relativeStrength: Boolean(precisionResult.reasons?.some(x => x.includes("Göreceli güç"))),
      strategy: Boolean(precisionResult.reasons?.length),
    },
    precision: {
      engineVersion: precision.CONFIG.version,
      marketRegime: precisionResult.marketRegime || "UNKNOWN",
      dataQuality: precisionResult.dataQuality || "FAILED",
      probability: precisionResult.probability ?? null,
      expectedR: precisionResult.expectedR ?? null,
      calibration: precisionResult.calibration || { status: "KALIBRE_EDILMEDI" },
      relativeStrengthRank: item.relativeStrengthRank ?? null,
      relativeStrengthPercentile: item.relativeStrengthPercentile ?? null,
      maxHoldingDays: plan.maxHoldingDays || precision.CONFIG.strategy.maxHoldingDays,
      reasons: precisionResult.reasons || [],
      invalidators: precisionResult.invalidators || [],
      missing: precisionResult.missing || [],
      disclaimer: precisionResult.disclaimer || "Garanti değildir; model kalibrasyonu olmadan işlem önerilmez.",
    },
    indicators: {
      rsi: item.features?.rsi14 ?? null,
      atr: item.features?.atr ?? null,
      atrPercent: item.features?.atrPercent ?? null,
    },
    aiReview: {
      available: false,
      provider: "EXPLANATION_ONLY",
      score: null,
      verdict: "NOT_USED_FOR_DECISION",
      summary: "LLM fiyat, stop, hedef, olasılık veya kararı değiştiremez.",
    },
    lifecycle: { stage: pending ? "PENDING" : "REJECTED", createdAt: now, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() },
    reason: decision === "WATCH"
      ? "Filtreleri geçti; model henüz kalibre edilmediği için işlem açılmaz."
      : (precisionResult.invalidators || ["Yetersiz kanıt."]).join(" · "),
    invalidation: plan.stop ? `Günlük plan geçersizliği: ${plan.stop} altı teyitli kapanış.` : "Doğrulanmış veri olmadan işlem yok.",
    timestamp: now,
  };
}


function createAiDecisions(
  results,
  riskSettings = {}
) {

  const candidates =
    (Array.isArray(results) ? results : [])
      .map(
        (item, index) =>
          buildAiDecision(
            item,
            index + 1,
            riskSettings
          )
      )
      .filter(Boolean)
      .sort(
        (a, b) =>
          b.confidence -
          a.confidence
      );

  return candidates.slice(0, 3);

}


function decisionFingerprint(
  decision
) {

  return [
    decision?.symbol,
    decision?.action,
    Number(
      decision?.entry?.reference || 0
    ).toFixed(2),
    Number(decision?.stop || 0).toFixed(2),
    Number(decision?.target1 || 0).toFixed(2),
    Number(decision?.target2 || 0).toFixed(2),
  ].join("|");

}

function addTradingActivity(
  state,
  type,
  message,
  timestamp
) {

  state.activity = [
    {
      timestamp,
      type,
      message,
    },
    ...(Array.isArray(state.activity)
      ? state.activity
      : []),
  ].slice(0, 100);

}


function recalculatePaper(
  paper
) {

  paper.equity =
    Number(paper.cash || 0) +
    (Array.isArray(paper.positions)
      ? paper.positions
      : [])
      .filter(
        item => item.status === "OPEN"
      )
      .reduce(
        (sum, item) =>
          sum +
          Number(item.current || item.entry || 0) *
          Number(item.quantity || 0),
        0
      );

  paper.pnlPercent =
    Number(paper.initialCapital) > 0
      ? (Number(paper.pnl || 0) /
        Number(paper.initialCapital)) * 100
      : 0;

}


function archivePaperDecision(
  state,
  decisionId,
  status,
  reason,
  timestamp,
  totalPnl
) {

  const decision =
    (state.decisions || []).find(
      item => item.id === decisionId
    );

  state.decisions =
    (state.decisions || []).filter(
      item => item.id !== decisionId
    );

  if (!decision) return;

  state.history = [
    {
      ...decision,
      status,
      lifecycle: {
        ...(decision.lifecycle || {}),
        stage: status,
        closedAt: timestamp,
      },
      outcome: reason,
      realizedPnL: totalPnl,
    },
    ...(Array.isArray(state.history)
      ? state.history
      : []),
  ].slice(0, 100);

}


function openPaperPositionForDecision(
  state,
  decision,
  timestamp
) {
  const paper = state.paper;

  if (state.killSwitch?.active) {
    throw new Error("Kill Switch aktif: yeni paper işlem açılamaz.");
  }

  if (!decision || decision.action !== "BUY SETUP" || decision.status !== "PENDING") {
    throw new Error("Bu karar paper işlem açmak için uygun değil.");
  }

  if (paper.positions.some(item => item.decisionId === decision.id && item.status === "OPEN")) {
    throw new Error("Bu karar için zaten açık bir paper pozisyon var.");
  }

  const maxPositions = Math.max(1, Math.floor(Number(state.risk?.maxPositions) || 3));
  if (paper.positions.filter(item => item.status === "OPEN").length >= maxPositions) {
    throw new Error(`Aynı anda en fazla ${maxPositions} açık pozisyon olabilir.`);
  }

  const quantity = Math.floor(Number(decision.riskPlan?.quantity) || 0);
  const entry = Number(decision.entry?.reference) || 0;
  const positionValue = quantity * entry;

  if (quantity <= 0 || positionValue <= 0) {
    throw new Error("Kararın lot veya giriş fiyatı geçersiz.");
  }
  if (positionValue > Number(paper.cash)) {
    throw new Error("Paper bakiyesi bu pozisyon için yeterli değil.");
  }

  const position = {
    id: `paper-${timestamp}-${decision.symbol}`,
    decisionId: decision.id,
    symbol: decision.symbol,
    quantity,
    originalQuantity: quantity,
    entry,
    current: entry,
    stop: Number(decision.stop),
    target1: Number(decision.target1),
    target2: Number(decision.target2),
    status: "OPEN",
    openedAt: timestamp,
    tp1Hit: false,
    realizedPnl: 0,
    pnl: 0,
  };

  paper.cash = Number(paper.cash) - positionValue;
  paper.positions = [position, ...paper.positions];
  decision.status = "OPEN";
  decision.lifecycle = {...(decision.lifecycle || {}), stage: "OPEN", openedAt: timestamp};

  addTradingActivity(
    state,
    "PAPER_OPEN",
    `${position.symbol} paper pozisyonu açıldı: ${quantity} lot · ₺${positionValue.toFixed(2)}.`,
    timestamp
  );
  recalculatePaper(paper);
  return position;
}

function openEligiblePaperPositions(
  state,
  timestamp
) {
  const opened = [];
  for (const decision of state.decisions || []) {
    if (decision.action !== "BUY SETUP" || decision.status !== "PENDING") continue;
    try {
      opened.push(openPaperPositionForDecision(state, decision, timestamp));
    } catch (error) {
      console.warn("PAPER AUTO OPEN SKIPPED:", error.message);
    }
  }
  return opened;
}

function completedFourHourClose(
  history
) {

  const formatter =
    new Intl.DateTimeFormat(
      "sv-SE",
      {
        timeZone: "Europe/Istanbul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        hourCycle: "h23",
      }
    );

  const groups = new Map();

  for (
    const candle of history || []
  ) {

    const parts =
      Object.fromEntries(
        formatter
          .formatToParts(
            new Date(
              Number(candle.time) * 1000
            )
          )
          .filter(
            part => part.type !== "literal"
          )
          .map(
            part => [
              part.type,
              part.value,
            ]
          )
      );

    const hour =
      Number(parts.hour);

    if (
      !Number.isFinite(hour) ||
      hour < 10 ||
      hour >= 18
    ) {
      continue;
    }

    const bucket =
      hour < 14
        ? "10-14"
        : "14-18";

    const key =
      `${parts.year}-${parts.month}-${parts.day}-${bucket}`;

    const candles =
      groups.get(key) || [];

    candles.push(candle);
    groups.set(key, candles);

  }

  const completed =
    [...groups.values()]
      .filter(
        candles => candles.length >= 4
      )
      .map(
        candles =>
          candles
            .sort(
              (a, b) =>
                Number(a.time) -
                Number(b.time)
            )
            .at(-1)
      )
      .sort(
        (a, b) =>
          Number(a.time) -
          Number(b.time)
      );

  return completed.at(-1) || null;

}


function closeMonitoredPaperPosition(
  state,
  position,
  closePrice,
  status,
  reason,
  timestamp
) {

  const paper =
    state.paper;

  const closingPnl =
    (closePrice - Number(position.entry)) *
    Number(position.quantity);

  const totalPnl =
    Number(position.realizedPnl || 0) +
    closingPnl;

  paper.cash =
    Number(paper.cash) +
    closePrice * Number(position.quantity);

  paper.pnl =
    Number(paper.pnl) + closingPnl;

  paper.positions =
    paper.positions.map(
      item =>
        item.id === position.id
          ? {
              ...item,
              current: closePrice,
              pnl: totalPnl,
              status,
              closedAt: timestamp,
              closeReason: reason,
            }
          : item
    );

  archivePaperDecision(
    state,
    position.decisionId,
    status,
    reason,
    timestamp,
    totalPnl
  );

  addTradingActivity(
    state,
    status,
    `${position.symbol} paper pozisyonu kapatıldı: ${reason} · ₺${totalPnl.toFixed(2)}.`,
    timestamp
  );

  return {
    symbol: position.symbol,
    type: status,
    message:
      buildPaperCloseNotification(
        position,
        closePrice,
        status,
        reason,
        totalPnl
      ),
  };

}


async function monitorPaperPositions() {

  let stateResult;

  try {

    stateResult =
      await getTradingState();

  } catch (error) {

    console.error(
      "PAPER MONITOR STATE ERROR:",
      error.message
    );

    return;

  }

  const state =
    stateResult.content;

  const openPositions =
    state.paper.positions.filter(
      item => item.status === "OPEN"
    );

  if (openPositions.length === 0) {
    return;
  }

  const timestamp =
    new Date().toISOString();

  const notifications = [];
  let changed = false;

  for (
    const savedPosition of openPositions
  ) {

    try {

      const yahoo =
        await fetchYahooChart(
          savedPosition.symbol,
          "1mo",
          "1h"
        );

      const hourly =
        yahoo.history;

      const current =
        Number(
          hourly.at(-1)?.close
        );

      if (!Number.isFinite(current)) {
        continue;
      }

      let position =
        state.paper.positions.find(
          item => item.id === savedPosition.id
        );

      if (
        !position ||
        position.status !== "OPEN"
      ) {
        continue;
      }

      position.current = current;
      position.pnl =
        (current - Number(position.entry)) *
        Number(position.quantity);
      changed = true;

      if (
        !position.tp1Hit &&
        current >= Number(position.target1)
      ) {

        const closeQuantity =
          Math.floor(
            Number(position.quantity) / 2
          );

        const realizedPnl =
          closeQuantity > 0
            ? (current - Number(position.entry)) *
              closeQuantity
            : 0;

        position.quantity =
          Number(position.quantity) - closeQuantity;
        position.stop =
          Number(position.entry);
        position.tp1Hit = true;
        position.realizedPnl =
          Number(position.realizedPnl || 0) +
          realizedPnl;
        position.pnl =
          (current - Number(position.entry)) *
          Number(position.quantity);

        state.paper.cash =
          Number(state.paper.cash) +
          current * closeQuantity;
        state.paper.pnl =
          Number(state.paper.pnl) +
          realizedPnl;

        addTradingActivity(
          state,
          "TP1",
          `${position.symbol} TP1: ${closeQuantity} lot kapatıldı, SL maliyete çekildi.`,
          timestamp
        );

        notifications.push(
          `BORSACI PAPER TP1\\n${position.symbol}\\n${closeQuantity} lot kapandı · ₺${(current * closeQuantity).toFixed(2)}\\nKalan: ${position.quantity} lot\\nSL maliyete çekildi.`
        );
      }

      if (
        position.status === "OPEN" &&
        current >= Number(position.target2)
      ) {

        notifications.push(
          closeMonitoredPaperPosition(
            state,
            position,
            current,
            "CLOSED",
            "TP2_REACHED",
            timestamp
          ).message
        );

        changed = true;
        continue;

      }

      /*
       * Stop yalnızca tamamlanmış 4 saatlik mumun
       * kapanışı stop seviyesinin ALTINDA olduğunda çalışır.
       */
      const fourHour =
        completedFourHourClose(hourly);

      if (
        fourHour &&
        Number(fourHour.close) <
          Number(position.stop)
      ) {

        notifications.push(
          closeMonitoredPaperPosition(
            state,
            position,
            Number(fourHour.close),
            "STOPPED",
            "FOUR_HOUR_CLOSE_BELOW_STOP",
            timestamp
          ).message
        );

        changed = true;

      }

    } catch (error) {

      console.error(
        `PAPER MONITOR ${savedPosition.symbol}:`,
        error.message
      );

    }

  }

  if (!changed) {
    return;
  }

  recalculatePaper(
    state.paper
  );

  await saveTradingState(
    state,
    stateResult.sha,
    stateResult.container
  );

  for (
    const message of notifications
  ) {
    await sendTelegramNotification(message);
  }

}


async function recordAiDecisions(
  decisions
) {

  const stateResult =
    await getTradingState();

  const state =
    stateResult.content ||
    createDefaultTradingState();

  const now =
    new Date().toISOString();

  const incoming =
    Array.isArray(decisions)
      ? decisions
      : [];

  const existing =
    Array.isArray(state.decisions)
      ? state.decisions
      : [];

  const existingByFingerprint =
    new Map(
      existing.map(
        decision => [
          decisionFingerprint(decision),
          decision,
        ]
      )
    );

  const incomingKeys =
    new Set(
      incoming.map(
        decisionFingerprint
      )
    );

  const archived =
    existing
      .filter(
        decision =>
          decision?.status === "PENDING" &&
          !incomingKeys.has(
            decisionFingerprint(decision)
          )
      )
      .map(
        decision => ({
          ...decision,
          status: "EXPIRED",
          lifecycle: {
            ...(decision.lifecycle || {}),
            stage: "EXPIRED",
            closedAt: now,
          },
          outcome: "SUPERSEDED_BY_NEW_SCAN",
        })
      );

  state.history = [
    ...archived,
    ...(Array.isArray(state.history)
      ? state.history
      : []),
  ].slice(0, 100);

  /*
   * Aynı teknik karar tekrar gelirse eski kartı olduğu gibi
   * korumak yerine yeni AI incelemesini kullan. Açık pozisyon
   * varsa karar kimliği ve OPEN yaşam döngüsü korunur.
   */
  state.decisions =
    incoming.map(
      decision => {
        const previous =
          existingByFingerprint.get(
            decisionFingerprint(decision)
          );

        if (!previous) {
          return decision;
        }

        const hasOpenPosition =
          state.paper.positions.some(
            position =>
              position.decisionId === previous.id &&
              position.status === "OPEN"
          );

        return {
          ...decision,
          id: previous.id,
          action:
            hasOpenPosition
              ? previous.action
              : decision.action,
          status:
            hasOpenPosition
              ? "OPEN"
              : decision.status,
          lifecycle:
            hasOpenPosition
              ? {
                  ...(decision.lifecycle || {}),
                  stage: "OPEN",
                  openedAt:
                    previous.lifecycle?.openedAt ||
                    previous.timestamp ||
                    now,
                }
              : decision.lifecycle,
        };
      }
    );

  const opened =
    openEligiblePaperPositions(
      state,
      now
    );

  addTradingActivity(
    state,
    "SCAN",
    `${state.decisions.length} active AI decision(s) refreshed or generated.`,
    now
  );

  await saveTradingState(
    state,
    stateResult.sha,
    stateResult.container
  );

  for (
    const position of opened
  ) {
    await sendTelegramNotification(
      buildPaperOpenNotification(
        position
      )
    );
  }

  return state;

}

async function readTradingRequest(req) {
  const body = await readBody(req);
  try {
    return JSON.parse(body || "{}");
  } catch {
    throw new Error("Geçersiz istek verisi.");
  }
}

async function handleTradingRiskSettings(req, res) {
  try {
    const input = await readTradingRequest(req);
    const stateResult = await getTradingState();
    const state = stateResult.content;

    const capital = Math.max(
      1000,
      Number(input.capital) ||
      Number(state.risk?.capital) ||
      Number(state.paper?.initialCapital) ||
      100000
    );
    const maxPositionPercent = Math.min(
      31,
      Math.max(1, Number(input.maxPositionPercent) || 31)
    );
    const maxPositions = Math.min(
      3,
      Math.max(1, Math.floor(Number(input.maxPositions) || 3))
    );

    state.risk = {
      ...(state.risk || {}),
      capital,
      maxPositionPercent,
      maxPositions,
      capitalSource:
        input.capitalSource === "BROKER"
          ? "BROKER"
          : "MANUAL",
    };

    /*
     * Paper portföyünün başlangıç sermayesi Risk Engine
     * sermayesiyle aynı kaynaktır. Açık işlemler korunur;
     * yalnızca serbest nakit yeni sermaye farkı kadar
     * güncellenir ve equity tekrar hesaplanır.
     */
    const previousCapital = Math.max(
      1000,
      Number(state.paper?.initialCapital) || 100000
    );
    const capitalDelta =
      capital - previousCapital;

    state.paper.initialCapital = capital;
    state.paper.cash = roundTradingValue(
      Number(state.paper.cash || 0) + capitalDelta
    );
    recalculatePaper(state.paper);

    const timestamp = new Date().toISOString();
    addTradingActivity(
      state,
      "RISK",
      `Risk Engine ve Paper Portfolio sermayesi ${formatTelegramCurrency(capital)} olarak eşitlendi.`,
      timestamp
    );

    await saveTradingState(
      state,
      stateResult.sha,
      stateResult.container
    );

    return sendJSON(res, 200, state);
  } catch (error) {
    console.error("RISK SETTINGS ERROR:", error.message);
    return sendJSON(res, 400, {error: error.message});
  }
}

async function handleKillSwitch(req, res) {
  try {
    const input = await readTradingRequest(req);
    const expectedPassword =
      String(process.env.KILL_SWITCH_PASSWORD || "");

    if (!expectedPassword) {
      throw new Error("KILL_SWITCH_PASSWORD Render ortamında ayarlı değil.");
    }

    /*
     * Şifre + düğmeye basma, Kill Switch'in toplu
     * kapatma emri için açık kullanıcı onayıdır.
     */
    if (String(input.password || "") !== expectedPassword) {
      throw new Error("Kill Switch şifresi yanlış.");
    }

    const activate = input.action === "activate";
    const stateResult = await getTradingState();
    const state = stateResult.content;
    const timestamp = new Date().toISOString();
    const notifications = [];
    let liquidatedCount = 0;

    state.killSwitch = {
      active: activate,
      activatedAt: activate ? timestamp : null,
    };

    if (activate) {
      const openPositions =
        (state.paper?.positions || [])
          .filter(item => item.status === "OPEN");

      for (const position of openPositions) {
        let closePrice =
          Number(position.current) ||
          Number(position.entry);

        /*
         * Paper kapanışı için son alınabilen piyasa
         * kapanışını kullan. Veri kaynağı geçici olarak
         * erişilemezse ekranda tutulan son fiyatla güvenli
         * biçimde kapanır.
         */
        try {
          const yahoo =
            await fetchYahooChart(
              position.symbol,
              "5d",
              "1h"
            );

          const marketPrice =
            Number(yahoo.history?.at(-1)?.close);

          if (
            Number.isFinite(marketPrice) &&
            marketPrice > 0
          ) {
            closePrice = marketPrice;
          }
        } catch (error) {
          console.error(
            "KILL SWITCH PRICE ERROR:",
            position.symbol,
            error.message
          );
        }

        const notification =
          closeMonitoredPaperPosition(
            state,
            position,
            closePrice,
            "CLOSED",
            "KILL_SWITCH_MARKET_CLOSE",
            timestamp
          );

        notifications.push(notification.message);
        liquidatedCount += 1;
      }

      recalculatePaper(state.paper);
    }

    const message = activate
      ? "KILL SWITCH AKTİF: " +
        liquidatedCount +
        " açık paper pozisyon piyasa fiyatından kapatıldı. Takip edilecek açık pozisyon kalmadı."
      : "KILL SWITCH KAPATILDI: yeni paper işlemler yeniden açılabilir.";

    addTradingActivity(state, "KILL_SWITCH", message, timestamp);

    await saveTradingState(
      state,
      stateResult.sha,
      stateResult.container
    );

    for (const notification of notifications) {
      void sendTelegramNotification(notification);
    }

    void sendTelegramNotification(
      (activate ? "🛑" : "🟢") + " BORSACI " + message
    );

    return sendJSON(res, 200, state);
  } catch (error) {
    console.error("KILL SWITCH ERROR:", error.message);
    return sendJSON(res, 400, {error: error.message});
  }
}

async function handlePaperOpen(req, res) {
  try {
    const input = await readTradingRequest(req);
    const decisionId = String(input.decisionId || "").trim();
    if (!decisionId) throw new Error("Karar kimliği gerekli.");

    const stateResult = await getTradingState();
    const state = stateResult.content;
    const decision = (state.decisions || []).find(item => item.id === decisionId);
    const timestamp = new Date().toISOString();
    const position = openPaperPositionForDecision(state, decision, timestamp);

    await saveTradingState(state, stateResult.sha, stateResult.container);
    void sendTelegramNotification(
      buildPaperOpenNotification(
        position
      )
    );
    return sendJSON(res, 200, state);
  } catch (error) {
    console.error("PAPER OPEN ERROR:", error.message);
    return sendJSON(res, 400, {error: error.message});
  }
}

async function handlePaperClose(req, res) {
  try {
    const input = await readTradingRequest(req);
    const decisionId = String(input.decisionId || "").trim();
    if (!decisionId) throw new Error("Karar kimliği gerekli.");

    const stateResult = await getTradingState();
    const state = stateResult.content;
    const position = (state.paper.positions || []).find(
      item => item.decisionId === decisionId && item.status === "OPEN"
    );
    if (!position) throw new Error("Açık paper pozisyon bulunamadı.");

    const closePrice = Number(position.current) || Number(position.entry);
    const timestamp = new Date().toISOString();
    const notification = closeMonitoredPaperPosition(
      state, position, closePrice, "CLOSED", "MANUAL_CLOSE", timestamp
    );
    recalculatePaper(state.paper);

    await saveTradingState(state, stateResult.sha, stateResult.container);
    void sendTelegramNotification(notification.message);
    return sendJSON(res, 200, state);
  } catch (error) {
    console.error("PAPER CLOSE ERROR:", error.message);
    return sendJSON(res, 400, {error: error.message});
  }
}

async function handleTradingState(
  req,
  res
) {

  try {

    const stateResult =
      await getTradingState();

    return sendJSON(
      res,
      200,
      stateResult.content
    );

  } catch (error) {

    console.error(
      "TRADING STATE ERROR:",
      error
    );

    return sendJSON(
      res,
      500,
      {
        error: error.message,
      }
    );

  }

}


/*
========================================================
AI TRADING SCANNER
========================================================
*/

const BIST100_SYMBOLS = [
  "AEFES","AGHOL","AHGAZ","AKBNK","AKCNS","AKFGY","AKFYE",
  "AKSA","AKSEN","ALARK","ALBRK","ALFAS","ARCLK","ASELS",
  "ASTOR","AYDEM","BAGFS","BASGZ","BERA","BIMAS","BINBN",
  "BIOEN","BRSAN","BRYAT","BSOKE","BTCIM","CANTE","CCOLA",
  "CEMAS","CEMTS","CIMSA","CLEBI","CWENE","DOAS","DOHOL",
  "ECILC","ECZYT","EGEEN","EKGYO","ENERY","ENJSA","ENKAI",
  "EREGL","ESEN","EUPWR","FROTO","GARAN","GESAN","GENTS",
  "GLYHO","GOLTS","GUBRF","GWIND","HALKB","HEKTS","HLGYO",
  "ISCTR","ISMEN","IZENR","KARSN","KCAER","KCHOL","KONTR",
  "KONYA","KOZAA","KOZAL","KRDMD","KTLEV","KUYAS","MAVI",
  "MGROS","MIATK","ODAS","OTKAR","OYAKC","PASEU","PETKM",
  "PGSUS","QUAGR","REEDR","SAHOL","SASA","SDTTR","SISE",
  "SKBNK","SMRTG","SOKM","TAVHL","TCELL","THYAO","TKFEN",
  "TMSN","TOASO","TRCAS","TSKB","TSPOR","TTKOM","TTRAK",
  "TUKAS","TUPRS","ULKER","VAKBN","VESBE","YKBNK","YEOTK",
  "ZOREN"
];


/*
--------------------------------------------------------
INDICATORS
--------------------------------------------------------
*/

function sma(values, period) {

  if (!Array.isArray(values) || values.length < period) {
    return null;
  }

  const slice =
    values.slice(values.length - period);

  return (
    slice.reduce(
      (sum, value) => sum + value,
      0
    ) / period
  );
}


function ema(values, period) {

  if (
    !Array.isArray(values) ||
    values.length < period
  ) {
    return null;
  }

  const multiplier =
    2 / (period + 1);

  let result =
    sma(values.slice(0, period), period);

  if (result === null) {
    return null;
  }

  for (
    let i = period;
    i < values.length;
    i++
  ) {

    result =
      (
        values[i] - result
      ) *
        multiplier +
      result;

  }

  return result;
}


function calculateRSI(
  closes,
  period = 14
) {

  if (
    !Array.isArray(closes) ||
    closes.length <= period
  ) {
    return null;
  }

  let gains = 0;
  let losses = 0;

  for (
    let i = 1;
    i <= period;
    i++
  ) {

    const change =
      closes[i] -
      closes[i - 1];

    if (change >= 0) {
      gains += change;
    } else {
      losses -= change;
    }

  }

  let averageGain =
    gains / period;

  let averageLoss =
    losses / period;

  for (
    let i = period + 1;
    i < closes.length;
    i++
  ) {

    const change =
      closes[i] -
      closes[i - 1];

    const gain =
      change > 0
        ? change
        : 0;

    const loss =
      change < 0
        ? -change
        : 0;

    averageGain =
      (
        averageGain *
          (period - 1) +
        gain
      ) / period;

    averageLoss =
      (
        averageLoss *
          (period - 1) +
        loss
      ) / period;

  }

  if (averageLoss === 0) {
    return 100;
  }

  const rs =
    averageGain /
    averageLoss;

  return (
    100 -
    100 / (1 + rs)
  );

}


function calculateATR(
  history,
  period = 14
) {

  if (
    !Array.isArray(history) ||
    history.length <= period
  ) {
    return null;
  }

  const trueRanges = [];

  for (
    let i = 1;
    i < history.length;
    i++
  ) {

    const current =
      history[i];

    const previous =
      history[i - 1];

    const tr =
      Math.max(
        current.high - current.low,
        Math.abs(
          current.high -
          previous.close
        ),
        Math.abs(
          current.low -
          previous.close
        )
      );

    trueRanges.push(tr);

  }

  return sma(
    trueRanges,
    period
  );

}


/*
--------------------------------------------------------
MACD
--------------------------------------------------------
*/

function calculateMACD(
  closes
) {

  const ema12 =
    ema(closes, 12);

  const ema26 =
    ema(closes, 26);

  if (
    ema12 === null ||
    ema26 === null
  ) {
    return null;
  }

  const macd =
    ema12 - ema26;

  return macd;
}


/*
--------------------------------------------------------
SCORE
--------------------------------------------------------
*/

function calculateScannerScore(
  history
) {

  const closes =
    history.map(
      item => item.close
    );

  const volumes =
    history.map(
      item => item.volume || 0
    );

  const price =
    closes[closes.length - 1];

  const ema20 =
    ema(closes, 20);

  const ema50 =
    ema(closes, 50);

  const ema200 =
    ema(closes, 200);

  const rsi =
    calculateRSI(closes, 14);

  const atr =
    calculateATR(history, 14);

  const macd =
    calculateMACD(closes);

  const averageVolume =
    sma(volumes, 20);

  const latestVolume =
    volumes[volumes.length - 1];

  /*
   * Scanner yalnızca pozitif ve hesaplanabilir fiyat
   * serileriyle karar üretir. Piyasa kapalıyken gelen
   * 0 fiyatı burada fail-closed olarak elenir.
   */
  if (
    ![
      price,
      ema20,
      ema50,
      ema200,
      rsi,
      atr,
    ].every(
      value =>
        Number.isFinite(value) &&
        value > 0
    )
  ) {
    return null;
  }

  let score = 0;

  const signals = [];

  /*
  TREND
  */

  if (
    ema20 !== null &&
    price > ema20
  ) {

    score += 15;

    signals.push(
      "Price > EMA20"
    );

  }

  if (
    ema50 !== null &&
    price > ema50
  ) {

    score += 10;

    signals.push(
      "Price > EMA50"
    );

  }

  if (
    ema200 !== null &&
    price > ema200
  ) {

    score += 15;

    signals.push(
      "Price > EMA200"
    );

  }


  /*
  EMA STRUCTURE
  */

  if (
    ema20 !== null &&
    ema50 !== null &&
    ema20 > ema50
  ) {

    score += 10;

    signals.push(
      "EMA20 > EMA50"
    );

  }


  /*
  RSI
  */

  if (
    rsi !== null &&
    rsi >= 50 &&
    rsi <= 70
  ) {

    score += 15;

    signals.push(
      "RSI bullish"
    );

  } else if (
    rsi !== null &&
    rsi > 70
  ) {

    score += 5;

    signals.push(
      "RSI overbought"
    );

  }


  /*
  MACD
  */

  if (
    macd !== null &&
    macd > 0
  ) {

    score += 10;

    signals.push(
      "MACD positive"
    );

  }


  /*
  VOLUME
  */

  if (
    averageVolume &&
    latestVolume >
      averageVolume * 1.2
  ) {

    score += 15;

    signals.push(
      "Volume expansion"
    );

  } else if (
    averageVolume &&
    latestVolume >
      averageVolume
  ) {

    score += 7;

    signals.push(
      "Volume above average"
    );

  }


  /*
  CAP SCORE
  */

  score =
    Math.max(
      0,
      Math.min(
        100,
        score
      )
    );


  let decision =
    "WATCH";

  if (score >= 80) {
    decision = "BUY SETUP";
  } else if (score >= 65) {
    decision = "WATCH";
  } else {
    decision = "NEUTRAL";
  }


  /*
  ATR BASED RISK LEVEL
  */

  let volatility =
    null;

  if (
    atr !== null &&
    price > 0
  ) {

    volatility =
      (
        atr /
        price
      ) * 100;

  }


  return {

    price,
    ema20,
    ema50,
    ema200,
    rsi,
    macd,
    atr,
    volume: latestVolume,
    averageVolume,

    volatility,

    score,
    decision,

    signals

  };

}


/*
--------------------------------------------------------
SCAN ONE SYMBOL
--------------------------------------------------------
*/

function buildTradingChartContext(
  history
) {
  const recent =
    (history || []).slice(-12);

  const closes =
    recent.map(item => Number(item.close));

  const first =
    closes[0] || 0;

  const last =
    closes.at(-1) || 0;

  const highest =
    Math.max(...recent.map(item => Number(item.high) || 0));

  const lowest =
    Math.min(...recent.map(item => Number(item.low) || Infinity));

  return {
    return12d:
      first > 0
        ? roundTradingValue(
            (last - first) / first * 100
          )
        : null,
    range12d:
      last > 0 && Number.isFinite(lowest)
        ? roundTradingValue(
            (highest - lowest) / last * 100
          )
        : null,
    candles: recent.map(item => ({
      close: roundTradingValue(item.close),
      high: roundTradingValue(item.high),
      low: roundTradingValue(item.low),
      volume: Number(item.volume) || 0,
    })),
  };
}


async function fetchTradingNews(
  symbol
) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    5000
  );

  try {
    const response = await fetch(
      "https://query1.finance.yahoo.com/v1/finance/search?q=" +
      encodeURIComponent(`${symbol}.IS`) +
      "&newsCount=3",
      {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "application/json",
        },
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      return [];
    }

    const payload = await response.json();

    return (payload?.news || [])
      .slice(0, 3)
      .map(item => ({
        title: String(item?.title || "").slice(0, 240),
        publisher: String(item?.publisher || "").slice(0, 80),
        publishedAt:
          item?.providerPublishTime
            ? new Date(
                Number(item.providerPublishTime) * 1000
              ).toISOString()
            : null,
      }))
      .filter(item => item.title);
  } catch (error) {
    console.warn(
      `TRADING NEWS ${symbol}:`,
      error.message
    );
    return [];
  } finally {
    clearTimeout(timeout);
  }
}


function parseTradingAiJson(
  content
) {
  const raw =
    String(content || "")
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");

  if (start < 0 || end < start) {
    throw new Error("AI değerlendirmesi JSON formatında değil.");
  }

  const json =
    raw.slice(start, end + 1);

  try {
    return JSON.parse(json);
  } catch (firstError) {
    /*
     * Bazı sağlayıcılar geçerli nesne içinde yalnızca son
     * virgül bırakabiliyor. Bu sınırlı normalizasyon, serbest
     * metni JSON'a çevirmeye çalışmadan bu yanıtı kurtarır.
     */
    const normalized =
      json.replace(
        /,\s*([}\]])/g,
        "$1"
      );

    try {
      return JSON.parse(normalized);
    } catch {
      const arrayStart =
        raw.indexOf("[");
      const arrayEnd =
        raw.lastIndexOf("]");

      if (
        arrayStart >= 0 &&
        arrayEnd > arrayStart
      ) {
        return {
          reviews: JSON.parse(
            raw.slice(
              arrayStart,
              arrayEnd + 1
            ).replace(
              /,\s*([}\]])/g,
              "$1"
            )
          ),
        };
      }

      throw firstError;
    }
  }
}


async function evaluateTradingCandidatesWithAi(
  candidates
) {
  const list =
    Array.isArray(candidates)
      ? candidates.slice(0, 6)
      : [];

  if (list.length === 0) {
    return new Map();
  }

  if (
    !process.env.GROQ_API_KEY &&
    !process.env.GEMINI_API_KEY &&
    !process.env.MISTRAL_API_KEY
  ) {
    return new Map(
      list.map(item => [
        item.symbol,
        {
          available: false,
          provider: "UNAVAILABLE",
          score: null,
          verdict: "WATCH",
          summary:
            "AI anahtarı tanımlı olmadığı için yalnızca teknik analiz kullanıldı.",
          chartComment: "",
          newsComment: "",
        },
      ])
    );
  }

  const enriched =
    await Promise.all(
      list.map(async item => ({
        symbol: item.symbol,
        technical: {
          score: item.score,
          price: item.price,
          ema20: item.ema20,
          ema50: item.ema50,
          ema200: item.ema200,
          rsi: item.rsi,
          macd: item.macd,
          atr: item.atr,
          volatility: item.volatility,
          volume: item.volume,
          averageVolume: item.averageVolume,
          signals: item.signals,
        },
        chart: item.chartContext,
        news: await fetchTradingNews(item.symbol),
      }))
    );

  const prompt = [
    "BIST için teknik tarama adaylarını değerlendir.",
    "Bu bir otomasyon güvenlik katmanıdır; yalnızca verilen veriyle çalış.",
    "Fiyat hedefi, emir veya kesin sonuç üretme.",
    "Her sembol için grafik verisi, teknik göstergeler ve verilen haber başlıklarının risk/kalite etkisini puanla.",
    "Haber yoksa bunu nötr kabul et; uydurma haber veya KAP bilgisi üretme.",
    "Yalnızca aşağıdaki JSON nesnesini döndür:",
    '{"reviews":[{"symbol":"ASELS","score":0,"verdict":"APPROVE|WATCH|REJECT","chartComment":"en fazla 90 karakter","newsComment":"en fazla 90 karakter","summary":"en fazla 120 karakter"}]}',
    "Tüm adayları eksiksiz döndür. Açıklamalar kısa olmalı ve yalnızca JSON döndürmelisin.",
    "score 0-100: 65 altı APPROVE olamaz. APPROVE yalnızca teknik yapı ve haber riski uyumluysa verilir.",
    "Adaylar:",
    JSON.stringify(enriched),
  ].join("\n\n");

  let response;
  let provider = "GROQ";
  const providerErrors = [];

  try {
    if (!process.env.GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY tanımlı değil.");
    }

    response = await groqAI.chat.completions.create({
      model: TRADING_AI_MODEL,
      messages: [
        {
          role: "system",
          content:
            "Sen temkinli bir BIST araştırma asistanısın. Yalnızca geçerli JSON döndür.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.1,
      response_format: {
        type: "json_object",
      },
      max_tokens: 1600,
    }, {
      timeout: 15000,
    });
  } catch (groqError) {
    console.warn(
      "TRADING AI GROQ:",
      groqError.message
    );
    providerErrors.push(
      `GROQ: ${String(groqError.message || "unknown error").slice(0, 180)}`
    );

    try {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY tanımlı değil.");
      }

      provider = "GEMINI";
      response = await geminiAI.chat.completions.create({
        model: VISION_MODEL,
        messages: [
          {
            role: "system",
            content:
              "Sen temkinli bir BIST araştırma asistanısın. Yalnızca geçerli JSON döndür.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.1,
      max_tokens: 1600,
    }, {
      timeout: 15000,
    });
    } catch (geminiError) {
      console.warn(
        "TRADING AI GEMINI:",
        geminiError.message
      );
      providerErrors.push(
        `GEMINI: ${String(geminiError.message || "unknown error").slice(0, 180)}`
      );

      try {
        if (!process.env.MISTRAL_API_KEY) {
          throw new Error("MISTRAL_API_KEY tanımlı değil.");
        }

        provider = "MISTRAL";
        response = await mistralAI.chat.completions.create({
          model: "mistral-small-latest",
          messages: [
            {
              role: "system",
              content:
                "Sen temkinli bir BIST araştırma asistanısın. Yalnızca geçerli JSON döndür.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.1,
      max_tokens: 1600,
    }, {
      timeout: 15000,
    });
      } catch (mistralError) {
        console.warn(
          "TRADING AI MISTRAL:",
          mistralError.message
        );
        providerErrors.push(
          `MISTRAL: ${String(mistralError.message || "unknown error").slice(0, 180)}`
        );

        return new Map(
          list.map(item => [
            item.symbol,
            {
              available: false,
              provider: "UNAVAILABLE",
              score: null,
              verdict: "WATCH",
              summary:
                `AI değerlendirmesi alınamadı; otomatik işlem kapalı tutuldu. ${providerErrors.join(" | ")}`.slice(0, 650),
              error:
                providerErrors.join(" | ").slice(0, 650),
              chartComment: "",
              newsComment: "",
            },
          ])
        );
      }
    }
  }

  try {
    const parsed =
      parseTradingAiJson(
        response?.choices?.[0]?.message?.content
      );

    const reviewBySymbol =
      new Map(
        (parsed?.reviews || [])
          .map(review => {
            const symbol =
              String(review?.symbol || "")
                .trim()
                .toUpperCase();

            const score =
              Math.max(
                0,
                Math.min(
                  100,
                  Math.round(Number(review?.score))
                )
              );

            const verdict =
              ["APPROVE", "WATCH", "REJECT"]
                .includes(
                  String(review?.verdict || "")
                    .toUpperCase()
                )
                ? String(review.verdict).toUpperCase()
                : "WATCH";

            return [
              symbol,
              {
                available: Number.isFinite(score),
                provider,
                score:
                  Number.isFinite(score)
                    ? score
                    : null,
                verdict,
                chartComment:
                  String(review?.chartComment || "")
                    .slice(0, 120),
                newsComment:
                  String(review?.newsComment || "")
                    .slice(0, 120),
                summary:
                  String(review?.summary || "")
                    .slice(0, 160),
              },
            ];
          })
          .filter(([symbol]) => symbol)
      );

    return new Map(
      list.map(item => [
        item.symbol,
        reviewBySymbol.get(item.symbol) || {
          available: false,
          provider,
          score: null,
          verdict: "WATCH",
          summary:
            "AI bu sembol için yapılandırılmış değerlendirme döndürmedi.",
          chartComment: "",
          newsComment: "",
        },
      ])
    );
  } catch (error) {
    console.warn(
      "TRADING AI PARSE:",
      error.message
    );

    return new Map(
      list.map(item => [
        item.symbol,
        {
          available: false,
          provider,
          score: null,
          verdict: "WATCH",
          summary:
            "AI yanıtı doğrulanamadı; otomatik işlem güvenlik nedeniyle kapalı tutuldu.",
          chartComment: "",
          newsComment: "",
        },
      ])
    );
  }
}


async function refreshScannerPriceFromHourly(
  item
) {
  try {
    const intraday =
      await fetchYahooChart(
        item.symbol,
        "5d",
        "1h"
      );

    const latest =
      intraday.history.at(-1);

    const price =
      Number(latest?.close);

    const timestamp =
      Number(latest?.time);

    /*
     * Günlük Yahoo mumunun geç güncellenmesi durumunda son
     * tamamlanmış saatlik kapanış giriş/SL/TP için önceliklidir.
     * Eski veya geçersiz bir saatlik kayıt asla kullanılmaz.
     */
    if (
      !Number.isFinite(price) ||
      price <= 0 ||
      !Number.isFinite(timestamp) ||
      Date.now() - timestamp * 1000 >
        14 * 24 * 60 * 60 * 1000
    ) {
      return item;
    }

    return {
      ...item,
      price,
      priceSource: "YAHOO_1H_LAST_CLOSE",
      priceTimestamp:
        new Date(timestamp * 1000).toISOString(),
    };
  } catch (error) {
    console.warn(
      `SCANNER INTRADAY ${item.symbol}:`,
      error.message
    );

    return {
      ...item,
      priceSource: "YAHOO_1D_FALLBACK",
    };
  }
}


async function scanSymbol(symbol) {
  try {
    const yahoo = await fetchYahooChart(symbol, "2y", "1d");
    const history = yahoo.history;
    const validation = precision.validateHistory(history);
    const features = precision.featuresAt(history);
    return {
      symbol,
      history,
      features,
      validation,
      price: features.price,
      ema20: features.ema20,
      ema50: features.ema50,
      ema200: features.ema200,
      rsi: features.rsi14,
      atr: features.atr,
      volume: features.volume,
      averageVolume: features.averageVolume20,
      timestamp: new Date().toISOString(),
      priceTimestamp: validation.lastTimestamp,
      priceSource: "YAHOO_1D_COMPLETED",
    };
  } catch (error) {
    console.error(`SCANNER ${symbol}:`, error.message);
    return null;
  }
}


/*
--------------------------------------------------------
SCANNER HANDLER
--------------------------------------------------------
*/

async function handleTradingScanner(req, res) {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const riskSettings = {
      capital: requestUrl.searchParams.get("capital"),
      maxPositionPercent: requestUrl.searchParams.get("maxPositionPercent"),
      maxPositions: requestUrl.searchParams.get("maxPositions"),
    };
    const startedAt = Date.now(), maximumScanDuration = 45000, batchSize = 8;
    const results = []; let scanned = 0;
    const indexPromise = fetchYahooChart("XU100", "2y", "1d");

    for (let i = 0; i < BIST100_SYMBOLS.length && Date.now() - startedAt < maximumScanDuration; i += batchSize) {
      const batch = BIST100_SYMBOLS.slice(i, i + batchSize);
      const values = await Promise.all(batch.map(scanSymbol));
      scanned += batch.length;
      values.filter(Boolean).forEach(value => results.push(value));
    }

    let indexHistory;
    try { indexHistory = (await indexPromise).history; }
    catch (error) { throw new Error(`XU100 rejimi doğrulanamadı: ${error.message}`); }

    const valid = results.filter(item => item.validation?.ok);
    const ranked = precision.rankRelativeStrength(valid, indexHistory);
    const bySymbol = new Map(ranked.map(item => [item.symbol, item]));
    const regime = precision.calculateMarketRegime({ indexHistory, universeFeatures: valid.map(item => item.features) });

    const evaluated = results.map(item => {
      const rankedItem = bySymbol.get(item.symbol) || item;
      const decision = precision.evaluateSetup(rankedItem, { regime, model: null });
      return {
        ...item,
        ...rankedItem,
        precision: decision,
        decision: decision.decision,
        score: null,
        signals: decision.reasons || [],
        dataQuality: decision.dataQuality,
        marketRegime: decision.marketRegime || regime.regime,
        calibratedProbability: decision.probability ?? null,
        calibration: decision.calibration,
        expectedR: decision.expectedR ?? null,
      };
    }).sort((a, b) => {
      const rankA = a.decision === "WATCH" ? 0 : a.decision === "NO_TRADE" ? 1 : 2;
      const rankB = b.decision === "WATCH" ? 0 : b.decision === "NO_TRADE" ? 1 : 2;
      return rankA - rankB || (a.relativeStrengthRank || 9999) - (b.relativeStrengthRank || 9999);
    }).slice(0, 5);

    const decisions = createAiDecisions(evaluated, riskSettings);
    const tradingState = await recordAiDecisions(decisions);

    return sendJSON(res, 200, {
      success: true, timestamp: new Date().toISOString(), scanned, successful: results.length,
      complete: scanned === BIST100_SYMBOLS.length, marketRegime: regime, engine: { version: precision.CONFIG.version, calibration: "KALIBRE_EDILMEDI" },
      results: evaluated, decisions: tradingState.decisions, paper: tradingState.paper, activity: tradingState.activity, history: tradingState.history, risk: tradingState.risk,
    });
  } catch (error) {
    console.error("TRADING SCANNER ERROR:", error.message);
    return sendJSON(res, 500, { success: false, error: error.message });
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

        /*
         * Cross-origin requests are not supported. Same-origin
         * requests do not need CORS response headers.
         */
        res.writeHead(
          204,
          {
            "Allow":
              "GET, POST, OPTIONS",
            "Cache-Control":
              "no-store",
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
       * Public authentication endpoints are intentionally
       * narrow. All other /api/* routes pass through the
       * central authorization guard below.
       */
      if (
        req.method === "POST" &&
        pathname === "/api/auth/login"
      ) {
        return handleAuthLogin(req, res);
      }

      if (
        req.method === "GET" &&
        pathname === "/api/auth/session"
      ) {
        return handleAuthSession(req, res);
      }

      if (
        req.method === "POST" &&
        pathname === "/api/auth/logout"
      ) {
        return handleAuthLogout(req, res);
      }

      if (isProtectedPath(pathname)) {
        const session =
          authorizeRequest(req, res);

        if (!session) {
          return;
        }

        req.authSession = session;
      }
        
        /*
========================================================
AI TRADING SCANNER ROUTE
========================================================
*/

if (
  req.method === "GET" &&
  (
    pathname === "/api/trading/scanner" ||
    pathname === "/trading/scanner"
  )
) {

  return handleTradingScanner(
    req,
    res
  );

}
/*
========================================================
PAPER TRADING STATE
========================================================
*/

if (
  req.method === "GET" &&
  pathname === "/api/trading/state"
) {

  return handleTradingState(
    req,
    res
  );

}

if (
  req.method === "POST" &&
  pathname === "/api/trading/risk-settings"
) {
  return handleTradingRiskSettings(req, res);
}

if (
  req.method === "POST" &&
  pathname === "/api/trading/kill-switch"
) {
  return handleKillSwitch(req, res);
}

if (
  req.method === "POST" &&
  pathname === "/api/trading/paper/open"
) {
  return handlePaperOpen(req, res);
}

if (
  req.method === "POST" &&
  pathname === "/api/trading/paper/close"
) {
  return handlePaperClose(req, res);
}
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


/*
========================================
IMAGE
========================================
*/

let image = null;

if (
  data.image &&
  typeof data.image === "string"
) {

  image =
    data.image.trim();

}


/*
========================================
IMAGE VALIDATION
========================================
*/

if (image) {

  if (
    !image.startsWith(
      "data:image/"
    )
  ) {

    throw new Error(
      "Geçersiz görsel formatı."
    );

  }


  const allowedTypes = [
    "data:image/jpeg",
    "data:image/png",
    "data:image/webp",
    "data:image/gif",
  ];


  const validType =
    allowedTypes.some(
      type =>
        image.startsWith(type)
    );


  if (!validType) {

    throw new Error(
      "Desteklenmeyen görsel formatı."
    );

  }

}


console.log(
  "==========================================================="
);


console.log(
  `SORU → ${question}`
);


console.log(
  `GÖRSEL → ${image ? "VAR" : "YOK"}`
);


console.log(
  "🔥 API/ASK REQUEST GELDİ"
);


console.log(
  "🔥 ANALYZE BAŞLADI"
);


const answer =
  await analyze(
    question,
    image
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
      AUTH JS
      ========================================
      */

      if (
        req.method === "GET" &&
        pathname === "/auth.js"
      ) {

        return serveFile(
          res,
          path.join(
            __dirname,
            "public",
            "auth.js"
          ),
          "application/javascript; charset=utf-8"
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

    setTimeout(
      () => {
        monitorPaperPositions()
          .catch(
            error =>
              console.error(
                "PAPER MONITOR START ERROR:",
                error.message
              )
          );
      },
      15000
    );

    setInterval(
      () => {
        monitorPaperPositions()
          .catch(
            error =>
              console.error(
                "PAPER MONITOR ERROR:",
                error.message
              )
          );
      },
      5 * 60 * 1000
    );

    sendTelegramNotification(
      "BORSACI bağlantısı aktif. Paper işlem monitörü hazır."
    );

  }
);
