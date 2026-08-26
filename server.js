require("dotenv").config();

const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const {
  createAuthService,
} = require("./auth");

const OpenAI = require("openai");
const fibonacciEngine = require("./trading/fibonacci-engine");
const dailySummary = require("./trading/daily-summary");
const paperOrders = require("./trading/paper-orders");
const { scannerAction } = require("./trading/decision-policy");

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

const TELEGRAM_WEBHOOK_SECRET =
  process.env.TELEGRAM_WEBHOOK_SECRET;

const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  "https://gemini-borsaci.onrender.com";

// Binance piyasa listesi alınamazsa taramanın tamamen durmaması için kısa
// bir geri-dönüş evreni. Normal durumda her tarama öncesi hacme göre ilk 100
// aktif USDT spot paritesi Binance'ten dinamik olarak seçilir.
const BINANCE_CRYPTO_FALLBACK_SYMBOLS = [
  "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "ADAUSDT",
  "DOGEUSDT", "AVAXUSDT", "LINKUSDT", "DOTUSDT", "LTCUSDT", "ATOMUSDT",
  "NEARUSDT", "ARBUSDT", "OPUSDT", "SUIUSDT", "AAVEUSDT", "INJUSDT",
  "FETUSDT", "RENDERUSDT"
];

// Binance'in resmî, yalnızca piyasa verisi için sunduğu ayna ilk sıradadır.
// Bu sabit route'lar çalışmadan önce başlatılır; istek callback'i içindeki
// temporal-dead-zone hatasını önler.
const BINANCE_PUBLIC_BASE_URLS = [
  // Global Render IP'leri Binance.com'da 418 alabiliyor; aynı spot piyasa
  // verisini sağlayan ABD uç noktası bu ortam için önceliklidir.
  "https://api.binance.us",
  "https://data-api.binance.vision",
  "https://api-gcp.binance.com",
  "https://api1.binance.com",
  "https://api.binance.com"
];
let binanceActivePublicBaseUrl = null;

// Scanner ilerlemesi yalnızca kısa süreli arayüz geri bildirimi içindir;
// kalıcı işlem/veri durumunun kaynağı değildir.
const scannerJobs = new Map();
let paperMonitorRunning = false;
const PAPER_MONITOR_INTERVAL_MS = 60 * 1000;
const PAPER_PRICE_CACHE_TTL_MS = 15 * 1000;
const paperMarketPriceCache = new Map();
const paperMonitorStatus = {
  intervalMs: PAPER_MONITOR_INTERVAL_MS,
  running: false,
  lastStartedAt: null,
  lastFinishedAt: null,
  nextCheckAt: null,
  watchedLimitOrders: 0,
  lastError: null,
};

function updateScannerJob(jobId, progress, message, status = "RUNNING") {
  if (!jobId) return;
  scannerJobs.set(jobId, {
    progress: Math.max(0, Math.min(100, Math.round(Number(progress) || 0))),
    message: String(message || "Hazırlanıyor"),
    status,
    updatedAt: new Date().toISOString(),
  });
  for (const [id, job] of scannerJobs) {
    if (Date.now() - new Date(job.updatedAt).getTime() > 10 * 60 * 1000) scannerJobs.delete(id);
  }
}

async function sendTelegramNotification(
  message,
  replyMarkup = null
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
          body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            text: String(message).slice(0, 4000),
            ...(replyMarkup ? {reply_markup: replyMarkup} : {}),
          }),
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

/*
 * Günlük özet, yalnızca aynı günün tamamlanmış scanner snapshot'ı varsa
 * gönderilir. İşaret GitHub'daki trading state'e Telegram isteğinden önce
 * yazılır; Render yeniden başlasa bile aynı seans için çift bildirim olmaz.
 * Bir dış servis çağrısı ile kalıcı kayıt arasında tam olarak-once garantisi
 * teknik olarak mümkün olmadığından burada güvenli tercih at-most-once'dır.
 */
let dailySummaryInFlight = false;

async function sendDailyTradingSummaryIfDue(now = new Date()) {
  if (
    dailySummaryInFlight ||
    !dailySummary.isDailySummaryDue(now) ||
    !TELEGRAM_BOT_TOKEN ||
    !TELEGRAM_CHAT_ID
  ) {
    return false;
  }

  dailySummaryInFlight = true;

  try {
    const stateResult = await getTradingState();
    const state = stateResult.content;
    const expectedSessionKey = lastClosedBistSessionKey(now);
    const snapshotSessionKey = state.scannerSnapshot?.sessionKey;
    const snapshotCreatedToday = state.scannerSnapshot?.createdAt &&
      istanbulClock(new Date(state.scannerSnapshot.createdAt)).key === expectedSessionKey;

    // Otomatik scanner çalıştırmıyoruz. Sonuç gerçekten bugünün
    // kapanmış günlük mumuna ait değilse yanıltıcı "yeni ilk 5" mesajı yok.
    if (snapshotSessionKey !== expectedSessionKey && !snapshotCreatedToday) {
      return false;
    }

    if (state.dailySummary?.sessionKey === snapshotSessionKey) {
      return false;
    }

    const message = dailySummary.buildDailySummaryMessage(
      state,
      snapshotSessionKey,
      expectedSessionKey
    );

    state.dailySummary = {
      sessionKey: snapshotSessionKey,
      reservedAt: new Date().toISOString(),
      snapshotCreatedAt: state.scannerSnapshot?.createdAt || null,
    };

    // Önce kalıcı rezervasyon, ardından dış Telegram çağrısı: restart
    // veya timer çakışması aynı seans özetini iki kez gönderemez.
    await saveTradingState(
      state,
      stateResult.sha,
      stateResult.container
    );

    const delivered = await sendTelegramNotification(message);

    if (delivered) {
      console.log("TELEGRAM DAILY SUMMARY SENT");
    } else {
      console.error("TELEGRAM DAILY SUMMARY DELIVERY FAILED");
    }

    return delivered;
  } catch (error) {
    console.error("TELEGRAM DAILY SUMMARY ERROR:", error.message);
    return false;
  } finally {
    dailySummaryInFlight = false;
  }
}

function telegramApprovalButtonsReady() {
  return Boolean(
    TELEGRAM_BOT_TOKEN &&
    TELEGRAM_CHAT_ID &&
    TELEGRAM_WEBHOOK_SECRET &&
    PUBLIC_BASE_URL
  );
}

async function telegramApi(method, payload) {
  if (!TELEGRAM_BOT_TOKEN) return false;
  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(payload),
    }
  );
  if (!response.ok) throw new Error(`Telegram HTTP ${response.status}`);
  return true;
}

async function answerTelegramCallback(callbackId, text) {
  if (!callbackId) return;
  try {
    await telegramApi("answerCallbackQuery", {
      callback_query_id: callbackId,
      text: String(text || "İşlem alındı.").slice(0, 180),
      show_alert: false,
    });
  } catch (error) {
    console.error("TELEGRAM CALLBACK ERROR:", error.message);
  }
}

async function configureTelegramWebhook() {
  if (!telegramApprovalButtonsReady()) return false;
  try {
    const webhookUrl = `${String(PUBLIC_BASE_URL).replace(/\/$/, "")}/api/telegram/webhook`;
    await telegramApi("setWebhook", {
      url: webhookUrl,
      secret_token: TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ["callback_query"],
    });
    console.log("TELEGRAM APPROVAL WEBHOOK CONFIGURED");
    return true;
  } catch (error) {
    console.error("TELEGRAM WEBHOOK ERROR:", error.message);
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
    `Emir türü: ${position.orderType || "LIMIT"} · PAPER ONLY`,
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

function buildPaperApprovalNotification(decision) {
  const order = getEffectivePendingOrder(decision) || {
    symbol: decision.symbol,
    orderType: "LIMIT",
    entryPrice: decision.entry?.reference,
    quantity: decision.riskPlan?.quantity,
    positionValue: decision.riskPlan?.positionValue,
    stop: decision.stop,
    target1: decision.target1,
    target2: decision.target2,
  };
  const manual = isManualPaperDecision(decision);

  return [
    "⏳ BORSACI · PAPER İŞLEM ONAYI",
    "",
    `${order.symbol} · ${manual ? "MANUEL PAPER" : (decision.grade || "BUY SETUP")}`,
    `Emir: ${order.orderType} · PAPER ONLY`,
    `Giriş: ${formatTelegramCurrency(order.entryPrice)}`,
    `Miktar: ${order.quantity || 0} lot · ${formatTelegramCurrency(order.positionValue)}`,
    "",
    `SL: ${formatTelegramCurrency(order.stop)}`,
    `TP1: ${formatTelegramCurrency(order.target1)} · TP2: ${formatTelegramCurrency(order.target2)}`,
    "",
    "Onay verirsen paper işlem açılır.",
  ].join("\\n");
}

function paperApprovalKeyboard(decision) {
  return {
    inline_keyboard: [[
      {
        text: `✅ ${decision.symbol} ONAYLA`,
        callback_data: `paper_approve:${decision.id}`,
      },
      {
        text: "✖ REDDET",
        callback_data: `paper_reject:${decision.id}`,
      },
    ]],
  };
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
  interval = "1d",
  timeoutMs = 12000
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
      Math.max(1000, Number(timeoutMs) || 12000)
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

    // Kripto paper hesabı BIST kâğıt hesabından tamamen ayrıdır. Aynı
    // sembol adı, bakiye veya fiyat kaynağı iki piyasayı birbirine karıştırmaz.
    cryptoPaper: {
      initialCapital: 10000,
      cash: 10000,
      equity: 10000,
      pnl: 0,
      pnlPercent: 0,
      positions: [],
      decisions: [],
      history: [],
      signals: [],
      activity: [],
      risk: {maxPositionPercent: 20, maxPositions: 5},
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

    // Son günlük Telegram özetinin kalıcı idempotency kaydı.
    // Session anahtarı, scanner'ın kullandığı tamamlanmış günlük mumdur.
    dailySummary: {
      sessionKey: null,
      reservedAt: null,
      snapshotCreatedAt: null,
    },

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

  const rawDecisions =
    Array.isArray(value?.decisions)
      ? value.decisions
      : [];

  // Eski scanner kayıtları pendingOrder alanı olmadan saklanmış olabilir.
  // Okurken güvenli varsayılan taslağı ekliyoruz; ilk sonraki state yazımında
  // bu metadata kalıcı hâle gelir.
  const decisions =
    rawDecisions.map(
      decision => ensurePendingOrder(decision)
    );

  return {

    ...fallback,

    ...(value || {}),

    paper: {
      ...fallback.paper,
      ...((value || {}).paper || {}),
    },

    cryptoPaper: {
      ...fallback.cryptoPaper,
      ...((value || {}).cryptoPaper || {}),
      positions: Array.isArray((value || {}).cryptoPaper?.positions) ? (value || {}).cryptoPaper.positions : [],
      decisions: Array.isArray((value || {}).cryptoPaper?.decisions) ? (value || {}).cryptoPaper.decisions : [],
      history: Array.isArray((value || {}).cryptoPaper?.history) ? (value || {}).cryptoPaper.history : [],
      signals: Array.isArray((value || {}).cryptoPaper?.signals) ? (value || {}).cryptoPaper.signals : [],
      activity: Array.isArray((value || {}).cryptoPaper?.activity) ? (value || {}).cryptoPaper.activity : [],
      risk: {...fallback.cryptoPaper.risk, ...((value || {}).cryptoPaper?.risk || {})},
    },

    risk: {
      ...fallback.risk,
      ...((value || {}).risk || {}),
      // Risk ayarları kullanıcı tarafından belirlenir. Toplam tahsisin %100
      // üzerindeki görünürlüğü arayüzdeki kapasite göstergesiyle sağlanır;
      // eski %31 / 3 işlem tavanları burada uygulanmaz.
      maxPositionPercent: Math.max(
        1,
        Number((value || {}).risk?.maxPositionPercent) || 31
      ),
      maxPositions: Math.max(
        1,
        Math.floor(Number((value || {}).risk?.maxPositions) || 3)
      ),
    },

    killSwitch: {
      ...fallback.killSwitch,
      ...((value || {}).killSwitch || {}),
      active:
        Boolean((value || {}).killSwitch?.active),
    },

    decisions,

    history:
      Array.isArray(
        value?.history
      )
        ? value.history
        : [],

    dailySummary: {
      ...fallback.dailySummary,
      ...((value || {}).dailySummary || {}),
    },

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
  if (!item?.validation?.ok) return null;
  const fib = item.fibonacci || {};
  // Paper işlem planı yalnızca geçerli günlük A-B-C yapısı ve %2,70
  // üzeri tamamlanmış günlük kapanış ile oluşturulur.
  const plan = fib.valid ? fib : null;
  if (!plan || !Number.isFinite(Number(plan.entryPrice)) || !Number.isFinite(Number(plan.stopLoss))) return null;
  const capital=Math.max(1000,Number(riskSettings.capital)||100000), allocation=Math.max(1,Number(riskSettings.maxPositionPercent)||31);
  const entry=Number(plan.entryPrice), stop=Number(plan.stopLoss), quantity=Math.floor(capital*allocation/100/entry);
  const hasEntryUpper=Number.isFinite(Number(fib.entryZoneHigh))&&Number(fib.entryZoneHigh)>Number(fib.entryZoneLow);
  // Trend direnci olmadan giriş üst limiti yoktur; bu durumda onaya
  // düşebilecek bir BUY SETUP üretmeyiz.
  const active=Boolean(fib.status === "ACTIVE" && fib.confirmationPassed && hasEntryUpper);
  const action=scannerAction({active,score:item.score});
  const status=action==="BUY SETUP"?"PENDING_APPROVAL":action==="NO TRADE"?"REJECTED":"PENDING";
  const now=new Date().toISOString();
  const decision = {
    id:`${Date.now()}-${item.symbol}`,rank,symbol:item.symbol,action,status,confidence:null,
    entry:{low:roundTradingValue(fib.entryZoneLow),high:hasEntryUpper?roundTradingValue(fib.entryZoneHigh):null,reference:roundTradingValue(entry)},
    stop:roundTradingValue(stop),target1:roundTradingValue(plan.tp1),target2:roundTradingValue(plan.tp2),target3:roundTradingValue(plan.tp3),
    riskReward:{tp1:plan.riskRewardTp1??null,tp2:plan.riskRewardTp2??null,tp3:plan.riskRewardTp3??null},
    riskPlan:{capital,targetPositionValue:roundTradingValue(capital*allocation/100),reservePercent:Math.max(0,100-allocation*Math.max(1,Number(riskSettings.maxPositions)||3)),quantity,positionValue:roundTradingValue(quantity*entry),actualRisk:roundTradingValue(quantity*Math.max(0,entry-stop)),maxPositionPercent:allocation,maxPositions:Math.max(1,Number(riskSettings.maxPositions)||3)},
    indicators:{score:item.score,rsi:roundTradingValue(item.features.rsi),atr:roundTradingValue(item.features.atr),macd:roundTradingValue(item.features.macd)},
    /*
     * Bu tablo ilk teknik eleme skorunun açıklamasıdır. Fibonacci daha
     * sonra işlem planı kapısı olarak değerlendirilir; geçmişe dönük
     * puan eklenmediği için karttaki skorla bire bir tutarlı kalır.
     */
    scoreBreakdown:item.scoreBreakdown?{...item.scoreBreakdown,calculationStage:"INITIAL_TECHNICAL_SCREEN"}:null,
    filters:{trend:item.scoreBreakdown?.trend?.score>0,momentum:item.scoreBreakdown?.momentum?.score>0,volume:item.scoreBreakdown?.volumeLiquidity?.score>0,rsi:item.features.rsi>=45&&item.features.rsi<=70},
    planMethod:"FIBONACCI_A_B_C_DAILY",fibonacci:fib,grade:item.grade,reasons:item.reasons||[],risks:item.risks||[],
    aiReview:item.aiReview||{available:false,provider:"NOT_REQUESTED",summary:""},
    lifecycle:{stage:status,createdAt:now,expiresAt:new Date(Date.now()+24*60*60*1000).toISOString()},
    reason:active?"A-B-C yapısı %2,70 üzerinde tamamlanmış günlük kapanışla teyit edildi.":(fib.invalidReason||"C'den dönüş için günlük teyit bekleniyor."),
    invalidation:`C seviyesinin %2 altındaki stop (${fib.stopLoss}) planı geçersiz kılar.`,
    timestamp:now,
  };

  return ensurePendingOrder(decision, now);
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
          Number(b.indicators?.score || 0) -
          Number(a.indicators?.score || 0)
      );

  let approvals = 0;
  return candidates.slice(0, 5).map(decision => {
    if (decision.action !== "BUY SETUP") return decision;
    approvals += 1;
    if (approvals <= 3) return decision;
    return {
      ...decision,
      action: "WATCH",
      status: "PENDING",
      lifecycle: {...decision.lifecycle, stage: "PENDING"},
      reason: "İlk üç paper işlem onay kontenjanı dolu; bu kurulum izleniyor.",
    };
  });

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


async function fetchPaperMarketPrice(symbol) {
  const yahoo = await fetchYahooChart(symbol, "1mo", "1h", 12000);
  const price = Number(yahoo.history.at(-1)?.close);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`${symbol} için doğrulanmış son piyasa fiyatı alınamadı.`);
  }
  return roundTradingValue(price);
}

async function fetchCachedPaperMarketPrice(symbol) {
  const normalizedSymbol = String(symbol || "").trim().toUpperCase();
  const cached = paperMarketPriceCache.get(normalizedSymbol);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < PAPER_PRICE_CACHE_TTL_MS) {
    return cached;
  }

  const price = await fetchPaperMarketPrice(normalizedSymbol);
  const value = {
    price,
    asOf: new Date().toISOString(),
    source: "YAHOO_LAST_COMPLETED_CANDLE",
    fetchedAt: now,
  };
  paperMarketPriceCache.set(normalizedSymbol, value);
  return value;
}

function telegramMessagingReady() {
  return Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID);
}

async function openPaperPositionForDecision(
  state,
  decision,
  timestamp
) {
  const paper = state.paper;

  if (state.killSwitch?.active) {
    throw new Error("Kill Switch aktif: yeni paper işlem açılamaz.");
  }

  if (
    !decision ||
    !isPaperApprovableDecision(decision) ||
    !["PENDING", "PENDING_APPROVAL", "PENDING_LIMIT"].includes(decision.status)
  ) {
    throw new Error("Bu karar paper işlem açmak için uygun değil.");
  }

  if (paper.positions.some(item =>
    item.status === "OPEN" &&
    (item.decisionId === decision.id || (item.decisionIds || []).includes(decision.id))
  )) {
    throw new Error("Bu karar için zaten açık bir paper pozisyon var.");
  }

  const existingSymbolPosition = paper.positions.find(item =>
    item.status === "OPEN" && item.symbol === decision.symbol
  );
  const maxPositions = Math.max(1, Math.floor(Number(state.risk?.maxPositions) || 3));
  if (!existingSymbolPosition && paper.positions.filter(item => item.status === "OPEN").length >= maxPositions) {
    throw new Error(`Aynı anda en fazla ${maxPositions} açık pozisyon olabilir.`);
  }

  const order = buildPendingOrderFromDecision(
    decision,
    decision.pendingOrder,
    timestamp
  );

  if (!order) {
    throw new Error("Paper emir taslağı geçersiz.");
  }

  const quantity = Number(order.quantity);
  const marketPrice = await fetchPaperMarketPrice(order.symbol);
  // MARKET her zaman sunucunun aldığı son fiyatla açılır. LIMIT ise yalnızca
  // son fiyat limitin altında/eşitse doldurulur; aksi halde sahte dolum yok.
  if (order.orderType === "LIMIT" && marketPrice > Number(order.entryPrice)) {
    throw new Error(`${order.symbol} LIMIT emri henüz gerçekleşmedi: son fiyat ${formatTelegramCurrency(marketPrice)}, limit ${formatTelegramCurrency(order.entryPrice)}.`);
  }
  const entry = order.orderType === "MARKET"
    ? marketPrice
    : Math.min(marketPrice, Number(order.entryPrice));
  const positionValue = quantity * entry;
  const entryCommission = roundTradingValue(positionValue * PAPER_COMMISSION_RATE);
  const totalCost = roundTradingValue(positionValue + entryCommission);

  if (order.stop !== null && Number(order.stop) >= entry) {
    throw new Error("Doğrulanmış fiyatla MARKET emrin stopu girişin altında olmalı.");
  }
  for (const [label, target] of [["TP1", order.target1], ["TP2", order.target2], ["TP3", order.target3]]) {
    if (target !== null && Number(target) <= entry) {
      throw new Error(`Doğrulanmış fiyatla MARKET emrin ${label} seviyesi girişin üzerinde olmalı.`);
    }
  }

  if (quantity <= 0 || positionValue <= 0) {
    throw new Error("Kararın lot veya giriş fiyatı geçersiz.");
  }
  if (totalCost > Number(paper.cash)) {
    throw new Error("Paper bakiyesi bu pozisyon için yeterli değil.");
  }

  if (existingSymbolPosition) {
    const previousQuantity = Number(existingSymbolPosition.quantity);
    const combinedQuantity = previousQuantity + quantity;
    const averageEntry = roundTradingValue(
      ((Number(existingSymbolPosition.entry) * previousQuantity) + positionValue) / combinedQuantity
    );
    existingSymbolPosition.quantity = combinedQuantity;
    existingSymbolPosition.originalQuantity = Number(existingSymbolPosition.originalQuantity || previousQuantity) + quantity;
    existingSymbolPosition.entry = averageEntry;
    existingSymbolPosition.current = marketPrice;
    existingSymbolPosition.pnl = roundTradingValue((marketPrice - averageEntry) * combinedQuantity);
    existingSymbolPosition.decisionIds = [...new Set([...(existingSymbolPosition.decisionIds || [existingSymbolPosition.decisionId]), decision.id])];
    paper.cash = roundTradingValue(Number(paper.cash) - totalCost);
    decision.status = "OPEN";
    decision.lifecycle = {...(decision.lifecycle || {}), stage: "OPEN", openedAt: timestamp};
    decision.pendingOrder = {...order, entryPrice: entry, positionValue, commission: entryCommission, totalCost, actualRisk: order.stop === null ? null : roundTradingValue((entry - Number(order.stop)) * quantity), status: "FILLED", updatedAt: timestamp, approvedAt: timestamp};
    addTradingActivity(state, "PAPER_OPEN", `${existingSymbolPosition.symbol} mevcut paper pozisyonuna eklendi: ${quantity} lot · ortalama giriş ${formatTelegramCurrency(averageEntry)}.`, timestamp);
    recalculatePaper(paper);
    return existingSymbolPosition;
  }

  const position = {
    id: `paper-${timestamp}-${order.symbol}-${crypto.randomBytes(4).toString("hex")}`,
    decisionId: decision.id,
    decisionIds: [decision.id],
    symbol: order.symbol,
    source: order.source,
    paperOnly: true,
    orderType: order.orderType,
    quantity,
    originalQuantity: quantity,
    entry,
    entryCommission,
    current: entry,
    stop: order.stop,
    target1: order.target1,
    target2: order.target2,
    target3: order.target3,
    status: "OPEN",
    openedAt: timestamp,
    tp1Hit: false,
    realizedPnl: -entryCommission,
    pnl: -entryCommission,
  };

  paper.cash = roundTradingValue(Number(paper.cash) - totalCost);
  paper.positions = [position, ...paper.positions];
  decision.status = "OPEN";
  decision.lifecycle = {...(decision.lifecycle || {}), stage: "OPEN", openedAt: timestamp};
  decision.pendingOrder = {
    ...order,
    entryPrice: entry,
    positionValue: roundTradingValue(positionValue),
    commission: entryCommission,
    totalCost,
    actualRisk: order.stop === null ? null : roundTradingValue((entry - Number(order.stop)) * quantity),
    status: "APPROVED",
    updatedAt: timestamp,
    approvedAt: timestamp,
  };

  addTradingActivity(
    state,
    "PAPER_OPEN",
    `${position.symbol} ${isManualPaperDecision(decision) ? "manuel" : "scanner"} paper pozisyonu açıldı: ${quantity} lot · ₺${positionValue.toFixed(2)} · ${position.orderType}.`,
    timestamp
  );
  recalculatePaper(paper);
  return position;
}

async function openEligiblePaperPositions(
  state,
  timestamp
) {
  const opened = [];
  const eligible = (state.decisions || [])
    .filter(decision => decision.action === "BUY SETUP" && decision.status === "PENDING")
    .sort((a,b) => Number(b.indicators?.score || 0) - Number(a.indicators?.score || 0))
    .slice(0, 3);
  for (const decision of eligible) {
    try {
      opened.push(await openPaperPositionForDecision(state, decision, timestamp));
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

  const exitCommission = roundTradingValue(closePrice * Number(position.quantity) * PAPER_COMMISSION_RATE);
  const closingPnl =
    (closePrice - Number(position.entry)) *
    Number(position.quantity) - exitCommission;

  const totalPnl =
    Number(position.realizedPnl || 0) +
    closingPnl;

  paper.cash =
    Number(paper.cash) +
    closePrice * Number(position.quantity) - exitCommission;

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

  for (const decisionId of new Set(position.decisionIds || [position.decisionId])) {
    archivePaperDecision(state, decisionId, status, reason, timestamp, totalPnl);
  }

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

  // Kullanıcının onayladığı ancak limit fiyatı henüz gelmemiş emirler de
  // pozisyon monitörünün parçasıdır. Böylece sayfadaki CHECK LIMIT ORDER
  // düğmesine tekrar basmak gerekmez; fiyat limitine indiğinde paper pozisyon
  // sunucu tarafından açılır.
  const pendingLimitDecisions =
    (state.decisions || []).filter(
      decision =>
        decision?.status === "PENDING_LIMIT" &&
        getEffectivePendingOrder(decision)?.orderType === "LIMIT"
    );

  paperMonitorStatus.watchedLimitOrders = pendingLimitDecisions.length;

  if (openPositions.length === 0 && pendingLimitDecisions.length === 0) {
    return;
  }

  const timestamp =
    new Date().toISOString();

  const notifications = [];
  let changed = false;

  for (const decision of pendingLimitDecisions) {
    const order = getEffectivePendingOrder(decision);

    try {
      const marketPrice = (await fetchCachedPaperMarketPrice(order.symbol)).price;

      // Alış limit emri yalnızca son doğrulanmış fiyat limitin altına/eşitse
      // gerçekleşir. Fiyat yukarıdaysa emir beklemeye devam eder.
      if (marketPrice > Number(order.entryPrice)) {
        continue;
      }

      const position = await openPaperPositionForDecision(
        state,
        decision,
        timestamp
      );

      addTradingActivity(
        state,
        "PAPER_LIMIT_FILLED",
        `${position.symbol} LIMIT emri gerçekleşti: ${position.quantity} lot · ${formatTelegramCurrency(position.entry)}.`,
        timestamp
      );
      notifications.push(buildPaperOpenNotification(position));
      changed = true;
    } catch (error) {
      console.error(
        `PAPER LIMIT MONITOR ${order?.symbol || decision?.symbol}:`,
        error.message
      );
    }
  }

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
        Number.isFinite(Number(position.target1)) &&
        Number(position.target1) > 0 &&
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
        Number.isFinite(Number(position.target2)) &&
        Number(position.target2) > 0 &&
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
        Number.isFinite(Number(position.stop)) &&
        Number(position.stop) > 0 &&
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
  decisions,
  scannerSnapshot = null
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
          ["PENDING", "PENDING_APPROVAL"].includes(decision?.status) &&
          !isManualPaperDecision(decision) &&
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
          return ensurePendingOrder(decision, now);
        }

        const hasOpenPosition =
          state.paper.positions.some(
            position =>
              position.decisionId === previous.id &&
              position.status === "OPEN"
          );

        const next = {
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
          // Aynı teknik plan tekrar tarandığında güncel AI içeriği gelir;
          // fakat kullanıcı tarafından düzenlenmiş lot/fiyat/emir türü
          // taslağı özellikle korunur.
          pendingOrder:
            previous.status === "PENDING_APPROVAL"
              ? previous.pendingOrder
              : previous.pendingOrder || decision.pendingOrder,
        };

        return ensurePendingOrder(next, now);
      }
    );

  // Yeni taramada seviyeleri değişen açık bir pozisyonun karar kartı
  // silinmez. Böylece pozisyon, açıldığı planla görünür ve her zaman
  // kapatılabilir kalır.
  const retainedOpenDecisions = existing.filter(
    decision =>
      decision?.status === "OPEN" &&
      !isManualPaperDecision(decision) &&
      state.paper.positions.some(
        position =>
          position.decisionId === decision.id &&
          position.status === "OPEN"
      ) &&
      !state.decisions.some(next => next.id === decision.id)
  );
  // Manuel paper emirleri scanner kriterine bağlı değildir. Yeni scanner
  // snapshot'ı bunları expire/replace etmez; kullanıcı onaylayana,
  // reddedene veya işlem kapanana kadar yaşarlar.
  const retainedManualDecisions = existing.filter(
    decision =>
      isManualPaperDecision(decision) &&
      ["PENDING_APPROVAL", "OPEN"].includes(decision?.status) &&
      !state.decisions.some(next => next.id === decision.id)
  );
  state.decisions = [
    ...state.decisions,
    ...retainedOpenDecisions,
    ...retainedManualDecisions,
  ];

  if (scannerSnapshot) {
    state.scannerSnapshot = scannerSnapshot;
  }

  // Paper işlem scanner tarafından otomatik açılmaz. Yeni BUY SETUP'lar
  // Telegram veya sitedeki tek kullanımlık onaydan sonra açılabilir.
  const previouslyQueued = new Set(
    existing
      .filter(
        item =>
          item?.status === "PENDING_APPROVAL" &&
          !isManualPaperDecision(item)
      )
      .map(item => item.id)
  );
  const approvalRequests = state.decisions
    .filter(item => item.action === "BUY SETUP" && item.status === "PENDING_APPROVAL")
    .filter(item => !previouslyQueued.has(item.id));

  for (const decision of approvalRequests) {
    addTradingActivity(
      state,
      "PAPER_APPROVAL_REQUESTED",
      `${decision.symbol} için paper işlem onayı bekleniyor.`,
      now
    );
  }

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

  if (telegramMessagingReady()) {
    for (const decision of approvalRequests) {
      // Bildirim teslimi scanner HTTP yanıtını geciktiremez.
      void sendPaperApprovalRequest(decision);
    }
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


async function createManualPaperDecision(input, state, timestamp) {
  if (state.killSwitch?.active) {
    throw new Error("Kill Switch aktif: yeni paper işlem taslağı oluşturulamaz.");
  }

  const order = paperOrders.normalizePaperOrder(input, {
    requireSymbol: true,
    requireOrderType: true,
  });
  if (order.orderType === "LIMIT") {
    const marketPrice = await fetchPaperMarketPrice(order.symbol);
    const deviation = Math.abs(order.entryPrice - marketPrice) / marketPrice;
    if (deviation > 0.25) {
      throw new Error(`${order.symbol} LIMIT fiyatı son doğrulanmış fiyattan %${Math.round(deviation * 100)} uzakta. Son fiyat: ${formatTelegramCurrency(marketPrice)}.`);
    }
  }
  const id = [
    "manual",
    Date.now(),
    order.symbol,
    crypto.randomBytes(4).toString("hex"),
  ].join("-");

  return {
    id,
    rank: null,
    symbol: order.symbol,
    action: "MANUAL PAPER",
    status: "PENDING_APPROVAL",
    source: "MANUAL",
    manualOrder: true,
    paperOnly: true,
    confidence: null,
    grade: "MANUEL",
    entry: {
      low: order.entryPrice,
      high: order.entryPrice,
      reference: order.entryPrice,
    },
    stop: order.stop,
    target1: order.target1,
    target2: order.target2,
    target3: order.target3,
    riskReward: {
      tp1: null,
      tp2: null,
      tp3: null,
    },
    riskPlan: {
      capital: Number(state.paper?.initialCapital) || null,
      targetPositionValue: order.positionValue,
      reservePercent: null,
      quantity: order.quantity,
      positionValue: order.positionValue,
      actualRisk: order.actualRisk,
      maxPositionPercent: null,
      maxPositions: Math.max(1, Math.floor(Number(state.risk?.maxPositions) || 3)),
      manualOverride: true,
    },
    indicators: {
      score: null,
      rsi: null,
      atr: null,
      macd: null,
    },
    filters: {
      manualOverride: true,
    },
    planMethod: "MANUAL_PAPER_ORDER",
    fibonacci: null,
    reasons: ["Kullanıcı tarafından manuel paper emir taslağı oluşturuldu."],
    risks: [],
    aiReview: {
      available: false,
      provider: "NOT_USED",
      summary: "Manuel paper emir; AI/scanner kriteri uygulanmadı.",
    },
    lifecycle: {
      stage: "PENDING_APPROVAL",
      createdAt: timestamp,
      expiresAt: null,
    },
    reason: "Manuel paper emir; scanner kriterlerinden bağımsız olarak kullanıcı onayı bekliyor.",
    invalidation: "Bu emir yalnızca paper trading içindir; onaydan önce düzenlenebilir veya reddedilebilir.",
    pendingOrder: {
      ...order,
      source: "MANUAL",
      paperOnly: true,
      createdAt: timestamp,
      updatedAt: timestamp,
      editedAt: null,
    },
    timestamp,
  };
}


async function handleManualPaperOrder(req, res) {
  try {
    const input = await readTradingRequest(req);
    const stateResult = await getTradingState();
    const state = stateResult.content;
    const timestamp = new Date().toISOString();
    const candidate = await createManualPaperDecision(input, state, timestamp);
    const existing = (state.decisions || []).find(item =>
      item.status === "PENDING_APPROVAL" &&
      isManualPaperDecision(item) &&
      item.symbol === candidate.symbol
    );
    const decision = existing || candidate;

    if (existing) {
      decision.entry = candidate.entry;
      decision.stop = candidate.stop;
      decision.target1 = candidate.target1;
      decision.target2 = candidate.target2;
      decision.target3 = candidate.target3;
      decision.riskPlan = candidate.riskPlan;
      decision.pendingOrder = {
        ...candidate.pendingOrder,
        createdAt: existing.pendingOrder?.createdAt || existing.timestamp || timestamp,
        updatedAt: timestamp,
        editedAt: timestamp,
      };
      decision.lifecycle = {...(existing.lifecycle || {}), stage: "PENDING_APPROVAL"};
    } else {
      state.decisions = [decision, ...(Array.isArray(state.decisions) ? state.decisions : [])];
    }

    addTradingActivity(
      state,
      "PAPER_MANUAL_PENDING",
      `${decision.symbol} için manuel paper emir ${existing ? "güncellendi" : "onayı bekliyor"}: ${decision.pendingOrder.quantity} lot · ${decision.pendingOrder.orderType}.`,
      timestamp
    );

    await saveTradingState(state, stateResult.sha, stateResult.container);

    void sendPaperApprovalRequest(decision);

    return sendJSON(res, 201, tradingStateForClient(state));
  } catch (error) {
    console.error("PAPER MANUAL ORDER ERROR:", error.message);
    return sendJSON(res, 400, {error: error.message});
  }
}


async function handlePendingPaperOrders(req, res) {
  try {
    const stateResult = await getTradingState();
    const state = stateResult.content;

    return sendJSON(res, 200, {
      paperOnly: true,
      killSwitchActive: Boolean(state.killSwitch?.active),
      availableCash: Number(state.paper?.cash || 0),
      maxOpenPositions: Math.max(1, Math.floor(Number(state.risk?.maxPositions) || 3)),
      pendingOrders: pendingPaperOrders(state),
    });
  } catch (error) {
    console.error("PAPER PENDING ORDERS ERROR:", error.message);
    return sendJSON(res, 500, {error: error.message});
  }
}

async function runPaperMonitor() {
  if (paperMonitorRunning) {
    return;
  }

  paperMonitorRunning = true;
  paperMonitorStatus.running = true;
  paperMonitorStatus.lastStartedAt = new Date().toISOString();
  paperMonitorStatus.lastError = null;
  try {
    await monitorPaperPositions();
  } catch (error) {
    paperMonitorStatus.lastError = "Fiyat kontrolü geçici olarak tamamlanamadı.";
    throw error;
  } finally {
    paperMonitorRunning = false;
    paperMonitorStatus.running = false;
    paperMonitorStatus.lastFinishedAt = new Date().toISOString();
    paperMonitorStatus.nextCheckAt = new Date(
      Date.now() + PAPER_MONITOR_INTERVAL_MS
    ).toISOString();
  }
}

async function handlePaperMonitorStatus(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const symbols = [...new Set(
    String(url.searchParams.get("symbols") || "")
      .split(",")
      .map(symbol => symbol.trim().toUpperCase())
      .filter(symbol => /^[A-Z0-9]{2,12}$/.test(symbol))
      .slice(0, 12)
  )];
  const prices = {};
  const unavailable = [];

  await Promise.all(symbols.map(async symbol => {
    try {
      const quote = await fetchCachedPaperMarketPrice(symbol);
      prices[symbol] = {
        price: quote.price,
        asOf: quote.asOf,
        source: quote.source,
      };
    } catch {
      unavailable.push(symbol);
    }
  }));

  return sendJSON(res, 200, {
    paperOnly: true,
    monitor: {...paperMonitorStatus},
    prices,
    unavailable,
  });
}

async function handleDecisionPendingOverride(req, res) {
  try {
    const input = await readTradingRequest(req);
    const decisionId = String(input.decisionId || "").trim();
    const symbol = String(input.symbol || "").trim().toUpperCase();
    if (!decisionId && !symbol) throw new Error("Karar kimliği gerekli.");
    const stateResult = await getTradingState();
    const state = stateResult.content;
    const decision = (state.decisions || []).find(item => item.id === decisionId) ||
      (state.decisions || []).find(item => item.symbol === symbol && item.status !== "OPEN" && !isManualPaperDecision(item));
    if (!decision || decision.status === "OPEN") {
      throw new Error("Bu AI kararı bekleyen emre dönüştürülemez.");
    }
    const timestamp = new Date().toISOString();
    // Kriter dışı karar dahi Pending Orders'a alınırken eski teknik giriş
    // değil, Yahoo'dan doğrulanan en son piyasa fiyatı ile başlatılır.
    const entryPrice = await fetchPaperMarketPrice(decision.symbol);
    if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
      throw new Error("Bu karar için doğrulanmış giriş fiyatı yok.");
    }
    const capital = Number(state.risk?.capital || state.paper?.initialCapital || 0);
    const allocation = Number(state.risk?.maxPositionPercent || 31) / 100;
    const quantity = Math.max(1, Math.floor(Number(decision.riskPlan?.quantity) || (capital * allocation / entryPrice)));
    const optionalLevel = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
    const order = paperOrders.normalizePaperOrder({
      symbol: decision.symbol,
      quantity,
      entryPrice,
      orderType: "LIMIT",
      stop: optionalLevel(decision.stop),
      target1: optionalLevel(decision.target1),
      target2: optionalLevel(decision.target2),
      target3: optionalLevel(decision.target3),
    }, {requireSymbol: true, requireOrderType: true});
    decision.action = "BUY SETUP";
    decision.status = "PENDING_APPROVAL";
    decision.manualOverride = true;
    decision.lifecycle = {...(decision.lifecycle || {}), stage: "PENDING_APPROVAL", overrideAt: timestamp};
    decision.pendingOrder = {...order, source: "AI PLAN", paperOnly: true, createdAt: timestamp, updatedAt: timestamp, editedAt: null};
    decision.reason = `${decision.reason || ""} Kullanıcı kriter dışı AI kararını manuel onay kuyruğuna ekledi.`.trim();
    addTradingActivity(state, "AI_DECISION_MANUAL_PENDING", `${decision.symbol} kriter dışı AI kararı kullanıcı isteğiyle onay kuyruğuna eklendi.`, timestamp);
    await saveTradingState(state, stateResult.sha, stateResult.container);
    void sendPaperApprovalRequest(decision);
    return sendJSON(res, 200, tradingStateForClient(state));
  } catch (error) {
    console.error("AI DECISION PENDING OVERRIDE ERROR:", error.message);
    return sendJSON(res, 400, {error: error.message});
  }
}

async function sendPaperApprovalRequest(decision) {
  if (!telegramMessagingReady()) return false;
  const interactive = telegramApprovalButtonsReady();
  // Callback rotasını tekrar kurmak idempotenttir; eski Render instance'ı
  // veya geçici Telegram hatası butonları kalıcı olarak bozmamalı.
  if (interactive) void configureTelegramWebhook();
  return sendTelegramNotification(
    buildPaperApprovalNotification(decision),
    interactive ? paperApprovalKeyboard(decision) : null
  );
}


async function handlePendingPaperOrderUpdate(req, res) {
  try {
    const input = await readTradingRequest(req);
    const decisionId = String(input.decisionId || input.orderId || "").trim();

    if (!decisionId) {
      throw new Error("Bekleyen emir kimliği gerekli.");
    }

    const stateResult = await getTradingState();
    const state = stateResult.content;
    const decision = (state.decisions || []).find(item => item.id === decisionId);

    if (
      !decision ||
      !["PENDING_APPROVAL", "PENDING_LIMIT"].includes(decision.status) ||
      !isPaperApprovableDecision(decision)
    ) {
      throw new Error("Bu paper emir artık düzenlenemez.");
    }

    const current = getEffectivePendingOrder(decision);
    if (!current) {
      throw new Error("Bekleyen paper emir taslağı geçersiz.");
    }

    if (Object.prototype.hasOwnProperty.call(input, "symbol")) {
      const requestedSymbol = paperOrders.normalizeSymbol(input.symbol);
      if (requestedSymbol !== current.symbol) {
        throw new Error("Bekleyen emrin sembolü değiştirilemez; yeni manuel emir oluşturun.");
      }
    }

    const order = paperOrders.normalizePaperOrder(
      {
        ...input,
        symbol: current.symbol,
      },
      {
        existing: current,
      }
    );
    const timestamp = new Date().toISOString();

    decision.pendingOrder = {
      ...order,
      source: current.source,
      paperOnly: true,
      createdAt: current.createdAt || decision.timestamp || timestamp,
      updatedAt: timestamp,
      editedAt: timestamp,
    };

    addTradingActivity(
      state,
      "PAPER_ORDER_EDITED",
      `${decision.symbol} bekleyen paper emri düzenlendi: ${order.quantity} lot · ${formatTelegramCurrency(order.entryPrice)} · ${order.orderType}.`,
      timestamp
    );

    await saveTradingState(state, stateResult.sha, stateResult.container);

    void sendPaperApprovalRequest(decision);

    return sendJSON(res, 200, tradingStateForClient(state));
  } catch (error) {
    console.error("PAPER ORDER UPDATE ERROR:", error.message);
    return sendJSON(res, 400, {error: error.message});
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
    const maxPositionPercent = Math.max(
      1,
      Number(input.maxPositionPercent) || 31
    );
    const maxPositions = Math.max(
      1,
      Math.floor(Number(input.maxPositions) || 3)
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

    return sendJSON(res, 200, tradingStateForClient(state));
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

    return sendJSON(res, 200, tradingStateForClient(state));
  } catch (error) {
    console.error("KILL SWITCH ERROR:", error.message);
    return sendJSON(res, 400, {error: error.message});
  }
}

async function approvePaperDecision(decisionId, source) {
  const stateResult = await getTradingState();
  const state = stateResult.content;
  const decision = (state.decisions || []).find(item => item.id === decisionId);
  if (!decision || !["PENDING_APPROVAL", "PENDING_LIMIT"].includes(decision.status)) {
    throw new Error("Bu paper işlem onay beklemiyor veya artık geçerli değil.");
  }
  const timestamp = new Date().toISOString();
  const pendingOrder = getEffectivePendingOrder(decision);
  if (pendingOrder?.orderType === "LIMIT") {
    const marketPrice = await fetchPaperMarketPrice(pendingOrder.symbol);
    if (marketPrice > Number(pendingOrder.entryPrice)) {
      decision.status = "PENDING_LIMIT";
      decision.lifecycle = {...(decision.lifecycle || {}), stage: "PENDING_LIMIT", lastCheckedAt: timestamp, lastMarketPrice: marketPrice};
      decision.pendingOrder = {...pendingOrder, status: "PENDING_LIMIT", lastMarketPrice: marketPrice, updatedAt: timestamp};
      addTradingActivity(state, "PAPER_LIMIT_PENDING", `${decision.symbol} LIMIT emir bekliyor: son ${formatTelegramCurrency(marketPrice)} · limit ${formatTelegramCurrency(pendingOrder.entryPrice)}.`, timestamp);
      await saveTradingState(state, stateResult.sha, stateResult.container);
      return state;
    }
  }
  if (isManualPaperDecision(decision)) {
    // Daha önce oluşmuş aynı-sembol manuel taslaklarını onay kuyruğunda
    // bırakma; tek emir onaylanır ve eski kopyalar geçmişe kaldırılır.
    for (const duplicate of (state.decisions || []).filter(item =>
      item.id !== decision.id &&
      item.status === "PENDING_APPROVAL" &&
      isManualPaperDecision(item) &&
      item.symbol === decision.symbol
    )) {
      archivePaperDecision(state, duplicate.id, "REJECTED", "SUPERSEDED_BY_LATEST_MANUAL_ORDER", timestamp, 0);
    }
  }
  const position = await openPaperPositionForDecision(state, decision, timestamp);
  addTradingActivity(
    state,
    "PAPER_APPROVED",
    `${position.symbol} paper işlemi ${source} üzerinden onaylandı.`,
    timestamp
  );
  await saveTradingState(state, stateResult.sha, stateResult.container);
  void sendTelegramNotification(buildPaperOpenNotification(position));
  return state;
}


/*
 * Scanner kararları ve elle oluşturulan emirler aynı PENDING_APPROVAL
 * yaşam döngüsünü kullanır. `pendingOrder`, kararın değiştirilebilir paper
 * emir taslağıdır; teknik kararın kendi giriş/SL/TP değerleri ise ham
 * scanner kaydı olarak korunur. Böylece aynı plan yeniden tarandığında
 * kullanıcının lot/fiyat/emir türü düzenlemesi kaybolmaz.
 */
function isManualPaperDecision(decision) {
  return Boolean(
    decision?.manualOrder === true ||
    decision?.source === "MANUAL" ||
    decision?.action === "MANUAL PAPER"
  );
}


function isPaperApprovableDecision(decision) {
  return Boolean(
    decision &&
    ["BUY SETUP", "MANUAL PAPER"].includes(decision.action)
  );
}


function buildPendingOrderFromDecision(
  decision,
  existingOrder = null,
  timestamp = new Date().toISOString()
) {
  if (!isPaperApprovableDecision(decision)) {
    return null;
  }

  const fallback = {
    symbol: decision.symbol,
    quantity: decision.riskPlan?.quantity,
    entryPrice: decision.entry?.reference,
    orderType: "LIMIT",
    stop: decision.stop,
    target1: decision.target1,
    target2: decision.target2,
    target3: decision.target3,
  };

  /*
   * Mevcut taslak varsa onu baz al. Böylece tarayıcıdan gelen yeni teknik
   * açıklama/AI içeriği yenilenirken kullanıcının order override'ı sabit
   * kalır. Geçersiz/eski kayıt, onay sırasında açık hata vermek yerine
   * güvenli scanner varsayılanına döner.
   */
  let normalized;
  try {
    normalized = paperOrders.normalizePaperOrder(
      existingOrder
        ? {
            ...existingOrder,
            symbol: decision.symbol,
          }
        : fallback,
      {
        existing: fallback,
      }
    );
  } catch {
    try {
      normalized = paperOrders.normalizePaperOrder(fallback);
    } catch {
      return null;
    }
  }

  const source = isManualPaperDecision(decision)
    ? "MANUAL"
    : "SCANNER";

  return {
    ...normalized,
    source,
    paperOnly: true,
    createdAt:
      existingOrder?.createdAt ||
      decision?.lifecycle?.createdAt ||
      decision?.timestamp ||
      timestamp,
    updatedAt:
      existingOrder?.updatedAt ||
      timestamp,
    editedAt:
      existingOrder?.editedAt ||
      null,
  };
}


function ensurePendingOrder(decision, timestamp) {
  if (!decision || decision.status !== "PENDING_APPROVAL") {
    return decision;
  }

  const pendingOrder = buildPendingOrderFromDecision(
    decision,
    decision.pendingOrder,
    timestamp
  );

  return pendingOrder
    ? {
        ...decision,
        pendingOrder,
      }
    : decision;
}


function getEffectivePendingOrder(decision) {
  if (!decision || !["PENDING_APPROVAL", "PENDING_LIMIT"].includes(decision.status)) {
    return null;
  }

  return buildPendingOrderFromDecision(
    decision,
    decision.pendingOrder,
    decision?.timestamp || new Date().toISOString()
  );
}


function pendingPaperOrders(state) {
  return (Array.isArray(state?.decisions) ? state.decisions : [])
    .filter(
      decision =>
        ["PENDING_APPROVAL", "PENDING_LIMIT"].includes(decision?.status) &&
        isPaperApprovableDecision(decision)
    )
    .map(decision => {
      const order = getEffectivePendingOrder(decision);

      if (!order) {
        return null;
      }

      return {
        id: decision.id,
        decisionId: decision.id,
        status: decision.status,
        manualOrder: isManualPaperDecision(decision),
        source: order.source,
        paperOnly: true,
        symbol: order.symbol,
        orderType: order.orderType,
        quantity: order.quantity,
        entryPrice: order.entryPrice,
        stop: order.stop,
        target1: order.target1,
        target2: order.target2,
        target3: order.target3,
        positionValue: order.positionValue,
        actualRisk: order.actualRisk,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        editedAt: order.editedAt,
        action: decision.action,
        grade: decision.grade || null,
        reason: decision.reason || null,
      };
    })
    .filter(Boolean);
}


function paperStateForClient(state) {
  return {
    ...(state?.paper || {}),
    pendingOrders: pendingPaperOrders(state),
    monitor: {...paperMonitorStatus},
  };
}


function tradingStateForClient(state) {
  return {
    ...(state || {}),
    paper: paperStateForClient(state),
  };
}

async function rejectPaperDecision(decisionId, source) {
  const stateResult = await getTradingState();
  const state = stateResult.content;
  const decision = (state.decisions || []).find(item => item.id === decisionId);
  if (!decision || decision.status !== "PENDING_APPROVAL") {
    throw new Error("Bu paper işlem onay beklemiyor veya artık geçerli değil.");
  }
  const timestamp = new Date().toISOString();
  decision.status = "REJECTED_BY_USER";
  decision.lifecycle = {
    ...(decision.lifecycle || {}),
    stage: "REJECTED_BY_USER",
    rejectedAt: timestamp,
    rejectedBy: source,
  };
  decision.outcome = "USER_REJECTED";
  addTradingActivity(
    state,
    "PAPER_REJECTED",
    `${decision.symbol} paper işlem planı ${source} üzerinden reddedildi.`,
    timestamp
  );
  await saveTradingState(state, stateResult.sha, stateResult.container);
  return state;
}

async function handlePaperApproval(req, res) {
  try {
    const input = await readTradingRequest(req);
    const decisionId = String(input.decisionId || input.orderId || "").trim();
    if (!decisionId) throw new Error("Karar kimliği gerekli.");
    return sendJSON(
      res,
      200,
      tradingStateForClient(
        await approvePaperDecision(decisionId, "SITE")
      )
    );
  } catch (error) {
    console.error("PAPER APPROVAL ERROR:", error.message);
    return sendJSON(res, 400, {error: error.message});
  }
}

async function handlePaperRejection(req, res) {
  try {
    const input = await readTradingRequest(req);
    const decisionId = String(input.decisionId || input.orderId || "").trim();
    if (!decisionId) throw new Error("Karar kimliği gerekli.");
    return sendJSON(
      res,
      200,
      tradingStateForClient(
        await rejectPaperDecision(decisionId, "SITE")
      )
    );
  } catch (error) {
    console.error("PAPER REJECTION ERROR:", error.message);
    return sendJSON(res, 400, {error: error.message});
  }
}

async function handleTelegramWebhook(req, res) {
  const receivedSecret = String(req.headers["x-telegram-bot-api-secret-token"] || "");
  const expectedSecret = String(TELEGRAM_WEBHOOK_SECRET || "");
  const isValidSecret = Boolean(expectedSecret) &&
    receivedSecret.length === expectedSecret.length &&
    crypto.timingSafeEqual(Buffer.from(receivedSecret), Buffer.from(expectedSecret));
  if (!isValidSecret) {
    return sendJSON(res, 401, {error: "Unauthorized"});
  }
  let update;
  try {
    update = JSON.parse((await readBody(req)) || "{}");
  } catch {
    return sendJSON(res, 400, {error: "Bad request"});
  }
  const callback = update?.callback_query;
  if (!callback?.id || String(callback?.message?.chat?.id || "") !== String(TELEGRAM_CHAT_ID || "")) {
    return sendJSON(res, 200, {ok: true});
  }
  const match = /^paper_(approve|reject):([A-Za-z0-9_-]{1,80})$/.exec(String(callback.data || ""));
  if (!match) return sendJSON(res, 200, {ok: true});
  // Telegram callback sorgusu çok kısa sürede cevaplanmalı. Piyasa fiyatı,
  // GitHub state'i ve Telegram bildirimi daha uzun sürebileceğinden önce
  // butonun alındığını onaylıyor, işlemi arka planda tamamlıyoruz.
  await answerTelegramCallback(callback.id, "İşlem alındı, doğrulanıyor.");
  void (async () => {
    try {
      if (match[1] === "approve") {
        await approvePaperDecision(match[2], "TELEGRAM");
      } else {
        await rejectPaperDecision(match[2], "TELEGRAM");
      }
    } catch (error) {
      console.error("TELEGRAM PAPER APPROVAL ERROR:", error.message);
      void sendTelegramNotification(`BORSACI PAPER ONAY HATASI\nİşlem tamamlanamadı: ${String(error.message || "bilinmeyen hata").slice(0, 250)}`);
    }
  })();
  return sendJSON(res, 200, {ok: true});
}

async function handlePaperClose(req, res) {
  try {
    const input = await readTradingRequest(req);
    const decisionId = String(input.decisionId || "").trim();
    const positionId = String(input.positionId || "").trim();
    const symbol = String(input.symbol || "").trim().toUpperCase();
    if (!decisionId && !positionId && !symbol) throw new Error("Pozisyon kimliği gerekli.");

    const stateResult = await getTradingState();
    const state = stateResult.content;
    const position = (state.paper.positions || []).find(
      item =>
        item.status === "OPEN" &&
        (item.id === positionId || item.decisionId === decisionId || item.symbol === symbol)
    );
    if (!position) throw new Error("Açık paper pozisyon bulunamadı.");

    const quantity = input.quantity === undefined
      ? Number(position.quantity)
      : Number(input.quantity);
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > Number(position.quantity)) {
      throw new Error("Satılacak lot, açık pozisyon miktarından büyük olamaz.");
    }
    const orderType = String(input.orderType || "MARKET").trim().toUpperCase();
    if (!["MARKET", "LIMIT"].includes(orderType)) {
      throw new Error("Satış emir türü MARKET veya LIMIT olmalı.");
    }
    const marketPrice = await fetchPaperMarketPrice(position.symbol);
    let closePrice = marketPrice;
    if (orderType === "LIMIT") {
      const limitPrice = Number(input.limitPrice);
      if (!Number.isFinite(limitPrice) || limitPrice <= 0) {
        throw new Error("LIMIT satış için geçerli limit fiyatı gerekli.");
      }
      if (marketPrice < limitPrice) {
        throw new Error(`${position.symbol} LIMIT satış gerçekleşmedi: son fiyat ${formatTelegramCurrency(marketPrice)}, limit ${formatTelegramCurrency(limitPrice)}.`);
      }
      closePrice = Math.max(marketPrice, limitPrice);
    }
    const timestamp = new Date().toISOString();
    let notification;
    if (quantity === Number(position.quantity)) {
      notification = closeMonitoredPaperPosition(
        state, position, closePrice, "CLOSED", `MANUAL_${orderType}_CLOSE`, timestamp
      );
    } else {
      const exitCommission = roundTradingValue(closePrice * quantity * PAPER_COMMISSION_RATE);
      const realizedPnl = roundTradingValue((closePrice - Number(position.entry)) * quantity - exitCommission);
      position.quantity = Number(position.quantity) - quantity;
      position.current = closePrice;
      position.realizedPnl = roundTradingValue(Number(position.realizedPnl || 0) + realizedPnl);
      position.pnl = roundTradingValue((closePrice - Number(position.entry)) * Number(position.quantity));
      state.paper.cash = roundTradingValue(Number(state.paper.cash) + closePrice * quantity - exitCommission);
      state.paper.pnl = roundTradingValue(Number(state.paper.pnl) + realizedPnl);
      addTradingActivity(state, "PAPER_PARTIAL_CLOSE", `${position.symbol} ${quantity} lot ${orderType} ile kapatıldı. Kalan: ${position.quantity} lot.`, timestamp);
      notification = {message: `BORSACI PAPER KISMİ SATIŞ\n${position.symbol}\n${quantity} lot · ${orderType} · ${formatTelegramCurrency(closePrice)}\nKalan: ${position.quantity} lot`};
    }
    recalculatePaper(state.paper);

    await saveTradingState(state, stateResult.sha, stateResult.container);
    void sendTelegramNotification(notification.message);
    return sendJSON(res, 200, tradingStateForClient(state));
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
      tradingStateForClient(
        stateResult.content
      )
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

/* v5: 60 puan BUY SETUP eşiği ve bekleyen paper emir metadatası. */
const SCANNER_SNAPSHOT_VERSION = "daily-top-five-v5";
const PAPER_COMMISSION_RATE = 0.001;
const BIST_DAILY_PRICE_LIMIT = 0.10;

function istanbulClock(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Istanbul",
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now).filter(item => item.type !== "literal").map(item => [item.type, item.value])
  );
  return {
    day: parts.weekday,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    key: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

function previousBistWeekday(dateKey) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  do {
    date.setUTCDate(date.getUTCDate() - 1);
  } while (date.getUTCDay() === 0 || date.getUTCDay() === 6);
  return date.toISOString().slice(0, 10);
}

function lastClosedBistSessionKey(now = new Date()) {
  const clock = istanbulClock(now);
  if (
    clock.day === "Sat" ||
    clock.day === "Sun" ||
    clock.hour < 18 ||
    (clock.hour === 18 && clock.minute < 15)
  ) {
    return previousBistWeekday(clock.key);
  }
  return clock.key;
}

function isBistOutsideTradingHours(now = new Date()) {
  const clock = istanbulClock(now);
  return clock.day === "Sat" || clock.day === "Sun" || clock.hour < 10 || clock.hour >= 18;
}

function normalizedScannerRisk(settings = {}) {
  return {
    capital: Math.max(1000, Number(settings.capital) || 100000),
    maxPositionPercent: Math.max(1, Number(settings.maxPositionPercent) || 31),
    maxPositions: Math.max(1, Math.floor(Number(settings.maxPositions) || 3)),
  };
}

function scannerRiskKey(settings = {}) {
  const risk = normalizedScannerRisk(settings);
  return `${risk.capital}|${risk.maxPositionPercent}|${risk.maxPositions}`;
}

function scannerSnapshotResult(item) {
  const {history, ...result} = item || {};
  return result;
}

function createScannerSnapshot(results, riskSettings, scanned, successful) {
  return {
    version: SCANNER_SNAPSHOT_VERSION,
    sessionKey: lastClosedBistSessionKey(),
    riskKey: scannerRiskKey(riskSettings),
    createdAt: new Date().toISOString(),
    scanned,
    successful,
    results: (Array.isArray(results) ? results : []).map(scannerSnapshotResult),
  };
}

function canReuseScannerSnapshot(snapshot, riskSettings) {
  return Boolean(
    isBistOutsideTradingHours() &&
    snapshot?.version === SCANNER_SNAPSHOT_VERSION &&
    snapshot?.sessionKey === lastClosedBistSessionKey() &&
    snapshot?.riskKey === scannerRiskKey(riskSettings) &&
    Array.isArray(snapshot?.results) &&
    snapshot.results.length === 5
  );
}


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
            "AI haber yorumu için anahtar tanımlı değil.",
          newsComment: "",
          expertComment: "",
        },
      ])
    );
  }

  const enriched =
    await Promise.all(
      list.map(async item => ({
        symbol: item.symbol,
        news: await fetchTradingNews(item.symbol),
      }))
    );

  const prompt = [
    "BIST tarama adayları için yalnızca doğrulanmış haber başlıklarını özetle.",
    "Teknik analiz, fiyat, indikatör, hedef, emir, puan veya olasılık yorumu yapma.",
    "Haber başlığında veya kaynakta olmayan KAP, bilanço, analist ya da uzman görüşü uydurma.",
    "Uzman yorumu alanı, gerçek bir uzman alıntısı değildir: yalnızca verilen başlıkların ihtiyatlı AI yorumu olmalı. Başlık yoksa 'Doğrulanmış haber başlığı alınamadı.' yaz.",
    "Yalnızca aşağıdaki JSON nesnesini döndür:",
    '{"reviews":[{"symbol":"ASELS","newsComment":"en fazla 120 karakter","expertComment":"en fazla 120 karakter","summary":"en fazla 120 karakter"}]}',
    "Tüm adayları eksiksiz döndür. Açıklamalar kısa, doğal Türkçe olmalı ve yalnızca JSON döndürmelisin.",
    "AL, SAT, APPROVE, REJECT, puan, olasılık, giriş, stop veya hedef üretme.",
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
                `AI haber yorumu alınamadı. ${providerErrors.join(" | ")}`.slice(0, 650),
              error:
                providerErrors.join(" | ").slice(0, 650),
              newsComment: "",
              expertComment: "",
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
              available: Boolean(review?.summary || review?.newsComment || review?.expertComment),
                provider,
                score: null,
                verdict: "INFO",
                newsComment:
                  String(review?.newsComment || "")
                    .slice(0, 120),
                expertComment:
                  String(review?.expertComment || "")
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
          newsComment: "",
          expertComment: "",
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
            "AI haber yorumu doğrulanamadı.",
          newsComment: "",
          expertComment: "",
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
    // Taramanın her satırı aynı kısa süre içinde ya sonuçlanır ya da
    // fail-closed olur. Bir tek sembol tüm 106 hisseyi kilitlemez.
    const yahoo = await fetchYahooChart(symbol, "2y", "1d", 6000);
    const history = [...yahoo.history];
    /*
     * Gün içi taramada Yahoo'nun açık günlük mumunu indikatörlere
     * sokmuyoruz; son tamamlanmış BIST günlük mumla çalışıyoruz.
     */
    const latestDaily = history.at(-1);
    if (latestDaily) {
      const latestDate = new Date(Number(latestDaily.time) * 1000);
      const formatter = new Intl.DateTimeFormat("en-CA", { timeZone:"Europe/Istanbul", year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hourCycle:"h23" });
      const latestParts = Object.fromEntries(formatter.formatToParts(latestDate).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
      const nowParts = Object.fromEntries(formatter.formatToParts(new Date()).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
      const beforeDailyClose = Number(nowParts.hour) < 18 || (Number(nowParts.hour) === 18 && Number(nowParts.minute) < 15);
      if (latestParts.year + latestParts.month + latestParts.day === nowParts.year + nowParts.month + nowParts.day && beforeDailyClose) history.pop();
    }
    const validation = fibonacciEngine.validateDaily(history);
    if (!validation.ok) return { symbol, history, validation, dataStatus: validation.message };
    const baseFib = { valid:false, status:"NO_VALID_STRUCTURE", riskRewardTp2:null, riskRewardTp3:null, volumeConfirmation:"WEAK" };
    const analysis = fibonacciEngine.score(history, baseFib);
    return { symbol, history, validation, dataStatus:"OK", ...analysis, fibonacci:baseFib, timestamp:new Date().toISOString() };
  } catch (error) {
    console.warn(`SCANNER ${symbol}:`, error.message);
    return { symbol, history:null, validation:{ok:false,code:"FETCH_FAILED"}, dataStatus:"VERİ YETERSİZ" };
  }
}


/*
--------------------------------------------------------
SCANNER HANDLER
--------------------------------------------------------
*/

async function handleTradingScanner(req,res) {
  let jobId = "";
  try {
    const url=new URL(req.url,`http://${req.headers.host||"localhost"}`);
    const riskSettings={capital:url.searchParams.get("capital"),maxPositionPercent:url.searchParams.get("maxPositionPercent"),maxPositions:url.searchParams.get("maxPositions")};
    jobId=String(url.searchParams.get("jobId")||"").replace(/[^a-zA-Z0-9_-]/g,"").slice(0,80);
    updateScannerJob(jobId,2,"Teknik tarama başlatıldı");
    const existingStateResult=await getTradingState();
    const existingState=existingStateResult.content;
    if(canReuseScannerSnapshot(existingState.scannerSnapshot,riskSettings)){
      const snapshot=existingState.scannerSnapshot;
      updateScannerJob(jobId,100,"Piyasa kapalı: son tamamlanmış günlük tarama aynen kullanıldı","COMPLETE");
      return sendJSON(res,200,{success:true,cached:true,timestamp:new Date().toISOString(),scanned:snapshot.scanned,successful:snapshot.successful,complete:true,xu100:{status:"BİLİNMİYOR",description:"XU100 görünümü bilgilendirme amaçlıdır; hisselerin teknik kalite skorunu ve sıralamasını engellemez."},results:snapshot.results,decisions:existingState.decisions,paper:paperStateForClient(existingState),activity:existingState.activity,history:existingState.history,risk:existingState.risk});
    }
    /*
     * Tarama tek HTTP isteğinde biter: günlük evren için ayrı,
     * Günlük veriyle A-B-C ve kırılım teyidi hesaplanır.
     */
    const within=(promise,ms,fallback)=>new Promise(resolve=>{
      const timeout=setTimeout(()=>resolve(fallback),ms);
      Promise.resolve(promise).then(
        value=>{ clearTimeout(timeout); resolve(value); },
        ()=>{ clearTimeout(timeout); resolve(fallback); }
      );
    });
    // Her sembol ayrı zaman aşımına sahiptir. Bir yavaş Yahoo yanıtı
    // tüm batch'i boşaltmaz; 106 sembol daima aynı sabit sırayla taranır.
    const batchSize=12,results=[];let scanned=0;
    const xu100Promise=within(
      fetchYahooChart("XU100","2y","1d",3000).then(value=>fibonacciEngine.xu100Info(value.history)),
      3000,
      null
    ).catch(()=>null);
    for(let i=0;i<BIST100_SYMBOLS.length;i+=batchSize){
      const batch=BIST100_SYMBOLS.slice(i,i+batchSize);
      const rows=await Promise.all(batch.map(symbol=>within(
        scanSymbol(symbol),
        7000,
        {symbol,history:null,validation:{ok:false,code:"FETCH_TIMEOUT"},dataStatus:"VERİ YETERSİZ"}
      )));
      scanned+=batch.length;results.push(...rows);
      updateScannerJob(jobId,5+Math.round(50*scanned/BIST100_SYMBOLS.length),`${scanned}/${BIST100_SYMBOLS.length} hisse için günlük veri kontrol edildi`);
    }
    let xu100={status:"BİLİNMİYOR",description:"XU100 görünümü bilgilendirme amaçlıdır; hisselerin teknik kalite skorunu ve sıralamasını engellemez."};
    const xu100Result=await xu100Promise;
    if(xu100Result) xu100=xu100Result;
    // İlk seçim yalnızca mevcut teknik kalite kurallarıyla yapılır.
    // Fibonacci bu sıralamayı değiştirmez; yalnızca ilk beş adayın
    // giriş/stop/hedef planını doğrular.
    const valid=results.filter(x=>x.validation?.ok).sort((a,b)=>Number(b.score||0)-Number(a.score||0)||String(a.symbol).localeCompare(String(b.symbol),"en"));
    const technicalTopFive=valid.slice(0,5);
    updateScannerJob(jobId,60,`Teknik puanla ilk ${technicalTopFive.length} aday seçildi`);
    updateScannerJob(jobId,70,"Seçilen 5 aday için günlük Fibonacci A-B-C hesaplanıyor");
    updateScannerJob(jobId,82,"Günlük alçalan tepe kırılımı ve %3 giriş üst seviyesi doğrulanıyor");
    const enriched=technicalTopFive.map(item=>{
      const fib=fibonacciEngine.fibonacciPlan(item.history);
      const analysis=fibonacciEngine.score(item.history,fib);
      const technicalScore=Number(item.score||0);
      const decision=technicalScore>=80?"A+ / GÜÇLÜ ADAY":technicalScore>=70?"A / AL ADAYI":technicalScore>=60?"B / İZLE":technicalScore>=50?"NÖTR":"ZAYIF";
      return {...item,...analysis,score:technicalScore,grade:item.grade,scoreBreakdown:item.scoreBreakdown,fibonacci:fib,decision,price:analysis.features.price,ema20:analysis.features.ema20,ema50:analysis.features.ema50,ema200:analysis.features.ema200,rsi:analysis.features.rsi,macd:analysis.features.macd,atr:analysis.features.atr,volumeRatio:analysis.features.volumeRatio,turnover:analysis.features.turnover};
    });
    updateScannerJob(jobId,88,"Haber başlıkları için AI özeti hazırlanıyor");
    const noAi=new Map(enriched.slice(0,5).map(item=>[item.symbol,{available:false,provider:"PENDING",summary:"YZ DEĞERLENDİRMESİ BEKLİYOR",newsComment:"",expertComment:""}]));
    const rawAi=await Promise.race([
      evaluateTradingCandidatesWithAi(enriched.slice(0,5)),
      new Promise(resolve=>setTimeout(()=>resolve(noAi),7000))
    ]).catch(()=>noAi);
    const ranked=enriched.map(item=>({...item,aiReview:rawAi.get(item.symbol)||noAi.get(item.symbol)||{available:false,provider:"PENDING",summary:"YZ DEĞERLENDİRMESİ BEKLİYOR",newsComment:"",expertComment:""}}));
    const decisions=createAiDecisions(ranked.slice(0,5),riskSettings);
    updateScannerJob(jobId,96,"Uygun Fibonacci kurulumları kaydediliyor");
    const snapshot=createScannerSnapshot(ranked,riskSettings,scanned,valid.length);
    const state=await recordAiDecisions(decisions,snapshot);
    updateScannerJob(jobId,100,`${state.paper?.positions?.filter(item=>item.status==="OPEN").length||0} açık paper pozisyon · Tarama tamamlandı`,"COMPLETE");
    return sendJSON(res,200,{success:true,timestamp:new Date().toISOString(),scanned,successful:valid.length,complete:scanned===BIST100_SYMBOLS.length,xu100,results:ranked,decisions:state.decisions,paper:paperStateForClient(state),activity:state.activity,history:state.history,risk:state.risk});
  } catch(error) { updateScannerJob(jobId,100,`Tarama hatası: ${error.message}`,"ERROR"); console.error("TRADING SCANNER ERROR:",error.message);return sendJSON(res,500,{success:false,error:error.message}); }
}

function handleTradingScannerStatus(req,res) {
  const url=new URL(req.url,`http://${req.headers.host||"localhost"}`);
  const jobId=String(url.searchParams.get("jobId")||"").replace(/[^a-zA-Z0-9_-]/g,"").slice(0,80);
  const job=scannerJobs.get(jobId);
  return sendJSON(res,200,job||{progress:0,message:"Tarama durumu bekleniyor",status:"PENDING"});
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

      // Telegram bu imzalı callback endpoint'ine tarayıcı oturumu olmadan
      // ulaşır; doğrulama webhook secret ile burada yapılır.
      if (
        req.method === "POST" &&
        pathname === "/api/telegram/webhook"
      ) {
        return handleTelegramWebhook(req, res);
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
  pathname === "/api/trading/scanner/status"
) {
  return handleTradingScannerStatus(req, res);
}

if (
  req.method === "GET" &&
  pathname === "/api/crypto/scanner"
) {
  return handleCryptoScanner(req, res);
}

if (req.method === "GET" && pathname === "/api/crypto/state") return handleCryptoState(req, res);
if (req.method === "GET" && pathname === "/api/crypto/quotes") return handleCryptoQuotes(req, res);
if (req.method === "POST" && pathname === "/api/crypto/risk-settings") return handleCryptoRiskSettings(req, res);
if (req.method === "POST" && pathname === "/api/crypto/paper/queue") return handleCryptoPaperQueue(req, res);
if (req.method === "POST" && pathname === "/api/crypto/paper/update") return handleCryptoPaperUpdate(req, res);
if (req.method === "POST" && pathname === "/api/crypto/paper/approve") return handleCryptoPaperApprove(req, res);
if (req.method === "POST" && pathname === "/api/crypto/paper/reject") return handleCryptoPaperReject(req, res);
if (req.method === "POST" && pathname === "/api/crypto/paper/close") return handleCryptoPaperClose(req, res);

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
  req.method === "GET" &&
  pathname === "/api/trading/paper/pending"
) {
  return handlePendingPaperOrders(req, res);
}

async function fetchBinancePublicJson(path) {
  let lastError = null;
  const baseUrls = binanceActivePublicBaseUrl
    ? [binanceActivePublicBaseUrl, ...BINANCE_PUBLIC_BASE_URLS.filter(baseUrl => baseUrl !== binanceActivePublicBaseUrl)]
    : BINANCE_PUBLIC_BASE_URLS;
  for (const baseUrl of baseUrls) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        headers: {"Accept": "application/json"},
        signal: controller.signal
      });
      if (response.ok) {
        binanceActivePublicBaseUrl = baseUrl;
        return response.json();
      }
      lastError = new Error(`Binance HTTP ${response.status}`);
      if (baseUrl === binanceActivePublicBaseUrl) binanceActivePublicBaseUrl = null;
      // Yalnız erişim/rate-limit sorunlarında alternatif aynaya geçilir.
      if (![403, 418, 429, 451, 500, 502, 503, 504].includes(response.status)) throw lastError;
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError || new Error("Binance piyasa verisi alınamadı.");
}

async function fetchBinanceDailyHistory(symbol) {
  const rows = await fetchBinancePublicJson(
    `/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=1d&limit=550`
  );
  if (!Array.isArray(rows)) throw new Error("Binance mum verisi geçersiz.");
  return rows
    .filter(row => Number(row?.[6]) <= Date.now())
    .map(row => ({
      time: Math.floor(Number(row[6]) / 1000),
      open: Number(row[1]), high: Number(row[2]), low: Number(row[3]),
      close: Number(row[4]), volume: Number(row[5]),
    }))
    .filter(candle => [candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite));
}

async function fetchCryptoPaperMarketPrice(symbol) {
  const quote = await fetchBinancePublicJson(`/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`);
  const price = Number(quote?.price);
  if (!Number.isFinite(price) || price <= 0) throw new Error(`${symbol} için doğrulanmış kripto piyasa fiyatı alınamadı.`);
  return roundCryptoValue(price);
}

function roundCryptoValue(value) {
  return Number(Number(value).toFixed(8));
}

function normalizeCryptoPaperOrder(input = {}, {existing = null} = {}) {
  const symbol = String(input.symbol ?? existing?.symbol ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{2,20}$/.test(symbol) || !symbol.endsWith("USDT")) throw new Error("Geçerli bir USDT spot paritesi gerekli.");
  const orderType = String(input.orderType ?? existing?.orderType ?? "MARKET").trim().toUpperCase();
  if (!["MARKET", "LIMIT"].includes(orderType)) throw new Error("Emir türü PİYASA veya LİMİT olmalı.");
  const positive = (value, label, required = false) => {
    if (value === undefined || value === null || value === "") { if (required) throw new Error(`${label} gerekli.`); return null; }
    const number = Number(value); if (!Number.isFinite(number) || number <= 0 || number > 1e12) throw new Error(`${label} geçerli ve pozitif olmalı.`);
    return roundCryptoValue(number);
  };
  const quantity = positive(input.quantity ?? existing?.quantity, "Miktar", true);
  const entryPrice = orderType === "MARKET" ? null : positive(input.entryPrice ?? input.price ?? existing?.entryPrice, "Limit fiyatı", true);
  const stop = positive(input.stop ?? existing?.stop, "Stop");
  const target1 = positive(input.target1 ?? existing?.target1, "TP1");
  const target2 = positive(input.target2 ?? existing?.target2, "TP2");
  const target3 = positive(input.target3 ?? existing?.target3, "TP3");
  if (entryPrice !== null && stop !== null && stop >= entryPrice) throw new Error("Uzun kripto işlemde stop giriş fiyatının altında olmalı.");
  for (const [label, target] of [["TP1", target1], ["TP2", target2], ["TP3", target3]]) if (entryPrice !== null && target !== null && target <= entryPrice) throw new Error(`${label} giriş fiyatının üzerinde olmalı.`);
  if (target1 !== null && target2 !== null && target2 <= target1) throw new Error("TP2, TP1'in üzerinde olmalı.");
  if (target2 !== null && target3 !== null && target3 <= target2) throw new Error("TP3, TP2'nin üzerinde olmalı.");
  return {symbol, quantity, entryPrice, orderType, stop, target1, target2, target3, positionValue: entryPrice === null ? null : roundTradingValue(quantity * entryPrice), actualRisk: entryPrice === null || stop === null ? null : roundTradingValue((entryPrice - stop) * quantity), paperOnly: true};
}

function recalculateCryptoPaper(paper) {
  const openValue = (paper.positions || []).filter(position => position.status === "OPEN")
    .reduce((sum, position) => sum + Number(position.current || position.entry || 0) * Number(position.quantity || 0), 0);
  paper.equity = roundTradingValue(Number(paper.cash || 0) + openValue);
  paper.pnl = roundTradingValue(Number(paper.equity) - Number(paper.initialCapital || 0));
  paper.pnlPercent = Number(paper.initialCapital) > 0 ? roundTradingValue(Number(paper.pnl) * 100 / Number(paper.initialCapital)) : 0;
}

function cryptoPaperStateForClient(state) {
  const paper = state.cryptoPaper || createDefaultTradingState().cryptoPaper;
  return {...paper, positions: (paper.positions || []).filter(position => position.status === "OPEN")};
}

async function handleCryptoState(req, res) {
  try {
    const stateResult = await getTradingState();
    return sendJSON(res, 200, {paperOnly: true, cryptoPaper: cryptoPaperStateForClient(stateResult.content)});
  } catch (error) {
    return sendJSON(res, 500, {error: error.message});
  }
}

async function handleCryptoQuotes(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const symbols = [...new Set(String(url.searchParams.get("symbols") || "").split(",").map(value => value.trim().toUpperCase()).filter(value => /^[A-Z0-9]{2,12}$/.test(value)).slice(0, 20))];
  const quotes = {}; const unavailable = [];
  await Promise.all(symbols.map(async symbol => { try { quotes[symbol] = {price: await fetchCryptoPaperMarketPrice(symbol), asOf: new Date().toISOString(), source: "BINANCE_LAST_PRICE"}; } catch { unavailable.push(symbol); } }));
  return sendJSON(res, 200, {quotes, unavailable});
}

function cryptoPaperDecisionFromInput(input, paper, timestamp) {
  const order = normalizeCryptoPaperOrder({
    symbol: input.symbol,
    quantity: input.quantity,
    entryPrice: input.entryPrice,
    orderType: input.orderType || "MARKET",
    stop: input.stop,
    target1: input.target1,
    target2: input.target2,
    target3: input.target3,
  });
  return {
    id: `crypto-${Date.now()}-${order.symbol}-${crypto.randomBytes(4).toString("hex")}`,
    symbol: order.symbol, market: "CRYPTO", action: "BUY SETUP", status: "PENDING_APPROVAL",
    grade: input.grade || "KRİPTO ADAYI", paperOnly: true, timestamp,
    entry: {low: order.entryPrice, high: order.entryPrice, reference: order.entryPrice},
    stop: order.stop, target1: order.target1, target2: order.target2, target3: order.target3,
    fibonacci: input.fibonacci || null, indicators: {score: Number(input.score) || null},
    pendingOrder: {...order, source: input.source || "CRYPTO AI", paperOnly: true, createdAt: timestamp, updatedAt: timestamp},
  };
}

async function handleCryptoPaperQueue(req, res) {
  try {
    const input = await readTradingRequest(req);
    const stateResult = await getTradingState();
    const state = stateResult.content;
    const paper = state.cryptoPaper;
    const timestamp = new Date().toISOString();
    const candidate = cryptoPaperDecisionFromInput(input, paper, timestamp);
    const existing = paper.decisions.find(decision => decision.status === "PENDING_APPROVAL" && decision.symbol === candidate.symbol);
    if (existing) {
      existing.pendingOrder = candidate.pendingOrder;
      existing.entry = candidate.entry; existing.stop = candidate.stop; existing.target1 = candidate.target1; existing.target2 = candidate.target2; existing.target3 = candidate.target3;
    } else paper.decisions = [candidate, ...paper.decisions].slice(0, 100);
    paper.activity = [{timestamp, type: "CRYPTO_PENDING", message: `${candidate.symbol} kripto paper emri onay bekliyor.`}, ...paper.activity].slice(0, 100);
    await saveTradingState(state, stateResult.sha, stateResult.container);
    return sendJSON(res, 201, {paperOnly: true, cryptoPaper: cryptoPaperStateForClient(state)});
  } catch (error) { return sendJSON(res, 400, {error: error.message}); }
}

async function handleCryptoRiskSettings(req, res) {
  try {
    const input = await readTradingRequest(req);
    const stateResult = await getTradingState(); const state = stateResult.content; const paper = state.cryptoPaper;
    const capital = Math.max(100, Number(input.capital) || Number(paper.initialCapital) || 10000);
    const allocation = Math.max(1, Number(input.maxPositionPercent) || Number(paper.risk?.maxPositionPercent) || 20);
    const maxPositions = Math.max(1, Math.floor(Number(input.maxPositions) || Number(paper.risk?.maxPositions) || 5));
    const delta = capital - Number(paper.initialCapital || 0);
    paper.initialCapital = capital; paper.cash = roundTradingValue(Number(paper.cash || 0) + delta);
    paper.risk = {maxPositionPercent: allocation, maxPositions}; recalculateCryptoPaper(paper);
    paper.activity = [{timestamp: new Date().toISOString(), type: "CRYPTO_RISK", message: "Kripto risk ayarları güncellendi."}, ...(paper.activity || [])].slice(0, 100);
    await saveTradingState(state, stateResult.sha, stateResult.container);
    return sendJSON(res, 200, {paperOnly: true, cryptoPaper: cryptoPaperStateForClient(state)});
  } catch (error) { return sendJSON(res, 400, {error: error.message}); }
}

async function handleCryptoPaperUpdate(req, res) {
  try {
    const input = await readTradingRequest(req); const stateResult = await getTradingState(); const state = stateResult.content; const paper = state.cryptoPaper;
    const decision = paper.decisions.find(value => value.id === String(input.decisionId || "") && value.status === "PENDING_APPROVAL");
    if (!decision) throw new Error("Bu kripto emri artık düzenlenemez.");
    const order = normalizeCryptoPaperOrder({...input, symbol: decision.symbol}, {existing: decision.pendingOrder});
    decision.pendingOrder = {...decision.pendingOrder, ...order, updatedAt: new Date().toISOString(), editedAt: new Date().toISOString()};
    decision.entry = {low: order.entryPrice, high: order.entryPrice, reference: order.entryPrice}; decision.stop = order.stop; decision.target1 = order.target1; decision.target2 = order.target2; decision.target3 = order.target3;
    paper.activity = [{timestamp: new Date().toISOString(), type: "CRYPTO_ORDER_EDITED", message: `${decision.symbol} bekleyen kripto emri düzenlendi.`}, ...(paper.activity || [])].slice(0, 100);
    await saveTradingState(state, stateResult.sha, stateResult.container); return sendJSON(res, 200, {paperOnly: true, cryptoPaper: cryptoPaperStateForClient(state)});
  } catch (error) { return sendJSON(res, 400, {error: error.message}); }
}

async function handleCryptoPaperApprove(req, res) {
  try {
    const input = await readTradingRequest(req);
    const stateResult = await getTradingState(); const state = stateResult.content; const paper = state.cryptoPaper;
    const decision = paper.decisions.find(value => value.id === String(input.decisionId || "") && value.status === "PENDING_APPROVAL");
    if (!decision) throw new Error("Bu kripto emri artık onay beklemiyor.");
    const order = decision.pendingOrder;
    const marketPrice = await fetchCryptoPaperMarketPrice(order.symbol);
    if (order.orderType === "LIMIT" && marketPrice > Number(order.entryPrice)) throw new Error(`${order.symbol} limit emri bekliyor: son fiyat $${marketPrice}, limit $${order.entryPrice}.`);
    const entry = order.orderType === "MARKET" ? marketPrice : Math.min(marketPrice, Number(order.entryPrice));
    if (order.stop !== null && Number(order.stop) >= entry) throw new Error("Stop, gerçekleşen giriş fiyatının altında olmalı.");
    const cost = roundTradingValue(entry * Number(order.quantity));
    if (cost > Number(paper.cash)) throw new Error("Kripto paper bakiyesi bu emir için yeterli değil.");
    let position = paper.positions.find(value => value.status === "OPEN" && value.symbol === order.symbol);
    if (position) {
      const combined = Number(position.quantity) + Number(order.quantity);
      position.entry = roundCryptoValue((Number(position.entry) * Number(position.quantity) + entry * Number(order.quantity)) / combined);
      position.quantity = combined; position.current = marketPrice;
    } else {
      const max = Math.max(1, Number(paper.risk?.maxPositions) || 5);
      if (paper.positions.filter(value => value.status === "OPEN").length >= max) throw new Error(`En fazla ${max} açık kripto pozisyonu olabilir.`);
      position = {id: `crypto-pos-${Date.now()}-${order.symbol}`, decisionId: decision.id, symbol: order.symbol, market: "CRYPTO", status: "OPEN", quantity: Number(order.quantity), entry, current: marketPrice, stop: order.stop, target1: order.target1, target2: order.target2, target3: order.target3, openedAt: new Date().toISOString(), paperOnly: true};
      paper.positions = [position, ...paper.positions];
    }
    paper.cash = roundTradingValue(Number(paper.cash) - cost); decision.status = "OPEN";
    paper.activity = [{timestamp: new Date().toISOString(), type: "CRYPTO_OPEN", message: `${order.symbol} kripto paper pozisyonu açıldı.`}, ...paper.activity].slice(0, 100);
    recalculateCryptoPaper(paper); await saveTradingState(state, stateResult.sha, stateResult.container);
    return sendJSON(res, 200, {paperOnly: true, cryptoPaper: cryptoPaperStateForClient(state)});
  } catch (error) { return sendJSON(res, 400, {error: error.message}); }
}

async function handleCryptoPaperReject(req, res) {
  try {
    const input = await readTradingRequest(req); const stateResult = await getTradingState(); const state = stateResult.content; const paper = state.cryptoPaper;
    const decision = paper.decisions.find(value => value.id === String(input.decisionId || "") && value.status === "PENDING_APPROVAL");
    if (!decision) throw new Error("Bu kripto emri artık onay beklemiyor.");
    decision.status = "REJECTED_BY_USER"; paper.history = [{...decision, closedAt: new Date().toISOString()}, ...paper.history].slice(0, 100);
    paper.activity = [{timestamp: new Date().toISOString(), type: "CRYPTO_REJECT", message: `${decision.symbol} kripto emri reddedildi.`}, ...paper.activity].slice(0, 100);
    await saveTradingState(state, stateResult.sha, stateResult.container); return sendJSON(res, 200, {paperOnly: true, cryptoPaper: cryptoPaperStateForClient(state)});
  } catch (error) { return sendJSON(res, 400, {error: error.message}); }
}

async function handleCryptoPaperClose(req, res) {
  try {
    const input = await readTradingRequest(req); const stateResult = await getTradingState(); const state = stateResult.content; const paper = state.cryptoPaper;
    const position = paper.positions.find(value => value.status === "OPEN" && value.id === String(input.positionId || ""));
    if (!position) throw new Error("Açık kripto paper pozisyon bulunamadı.");
    const quantity = Number(input.quantity || position.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > Number(position.quantity)) throw new Error("Satılacak miktar geçersiz.");
    const orderType = String(input.orderType || "MARKET").toUpperCase();
    if (!["MARKET", "LIMIT"].includes(orderType)) throw new Error("Satış emir türü MARKET veya LIMIT olmalı.");
    const marketPrice = await fetchCryptoPaperMarketPrice(position.symbol);
    const limitPrice = Number(input.limitPrice);
    if (orderType === "LIMIT" && (!Number.isFinite(limitPrice) || limitPrice <= 0)) throw new Error("LIMIT satış için geçerli fiyat gerekli.");
    if (orderType === "LIMIT" && marketPrice < limitPrice) throw new Error(`${position.symbol} limit satış bekliyor: son fiyat $${marketPrice}, limit $${limitPrice}.`);
    const price = orderType === "LIMIT" ? Math.max(marketPrice, limitPrice) : marketPrice;
    const proceeds = roundTradingValue(price * quantity); paper.cash = roundTradingValue(Number(paper.cash) + proceeds);
    position.quantity = roundCryptoValue(Number(position.quantity) - quantity); position.current = price;
    const realizedPnl = roundTradingValue((price - Number(position.entry)) * quantity);
    if (position.quantity <= 0) { position.status = "CLOSED"; position.closedAt = new Date().toISOString(); position.realizedPnl = realizedPnl; paper.history = [{...position}, ...paper.history].slice(0, 100); }
    paper.activity = [{timestamp: new Date().toISOString(), type: "CRYPTO_CLOSE", message: `${position.symbol} kripto paper pozisyonu ${orderType} ile kapatıldı.`}, ...paper.activity].slice(0, 100);
    recalculateCryptoPaper(paper); await saveTradingState(state, stateResult.sha, stateResult.container); return sendJSON(res, 200, {paperOnly: true, cryptoPaper: cryptoPaperStateForClient(state)});
  } catch (error) { return sendJSON(res, 400, {error: error.message}); }
}

async function fetchBinanceTopUsdtSymbols(limit = 100) {
  const [exchange, tickers] = await Promise.all([
    fetchBinancePublicJson("/api/v3/exchangeInfo"),
    fetchBinancePublicJson("/api/v3/ticker/24hr")
  ]);
  if (!Array.isArray(exchange?.symbols) || !Array.isArray(tickers)) {
    throw new Error("Binance piyasa listesi geçersiz.");
  }
  const stableBases = new Set(["USDT", "USDC", "FDUSD", "TUSD", "USDP", "DAI", "BUSD", "USDS", "USDE", "USDD"]);
  const eligible = new Set(exchange.symbols
    .filter(item => item?.status === "TRADING" && item?.quoteAsset === "USDT" && item?.isSpotTradingAllowed !== false)
    .filter(item => !stableBases.has(item.baseAsset))
    .filter(item => !/(UP|DOWN|BULL|BEAR)USDT$/i.test(item.symbol))
    .map(item => item.symbol));
  const symbols = tickers
    .filter(item => eligible.has(item?.symbol) && Number(item.quoteVolume) > 0)
    .sort((left, right) => Number(right.quoteVolume) - Number(left.quoteVolume))
    .slice(0, limit)
    .map(item => item.symbol);
  if (!symbols.length) throw new Error("Binance'te uygun USDT spot paritesi bulunamadı.");
  return symbols;
}

async function scanCryptoSymbol(symbol) {
  try {
    const history = await fetchBinanceDailyHistory(symbol);
    const validation = fibonacciEngine.validateDaily(history);
    if (!validation.ok) return {symbol, history, validation, dataStatus: validation.message};
    const baseFib = {valid:false, status:"NO_VALID_STRUCTURE", riskRewardTp2:null, riskRewardTp3:null, volumeConfirmation:"WEAK"};
    const analysis = fibonacciEngine.score(history, baseFib);
    return {symbol, history, validation, dataStatus:"OK", ...analysis, fibonacci:baseFib, timestamp:new Date().toISOString()};
  } catch (error) {
    console.warn(`CRYPTO SCANNER ${symbol}:`, error.message);
    return {symbol, history:null, validation:{ok:false,code:"BINANCE_FETCH_FAILED"}, dataStatus:"VERİ YETERSİZ"};
  }
}

async function handleCryptoScanner(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const jobId = String(url.searchParams.get("jobId") || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  try {
    updateScannerJob(jobId, 3, "Binance hacim verisine göre en büyük 100 USDT paritesi seçiliyor");
    let cryptoSymbols;
    try {
      cryptoSymbols = await fetchBinanceTopUsdtSymbols(100);
    } catch (error) {
      console.warn("CRYPTO UNIVERSE:", error.message);
      cryptoSymbols = BINANCE_CRYPTO_FALLBACK_SYMBOLS;
    }
    updateScannerJob(jobId, 8, `${cryptoSymbols.length} USDT paritesi için günlük mum verileri alınıyor`);
    const results = [];
    for (let index = 0; index < cryptoSymbols.length; index += 8) {
      const batch = cryptoSymbols.slice(index, index + 8);
      results.push(...await Promise.all(batch.map(scanCryptoSymbol)));
      updateScannerJob(jobId, 10 + Math.round(65 * Math.min(index + 8, cryptoSymbols.length) / cryptoSymbols.length), `${Math.min(index + 8, cryptoSymbols.length)}/${cryptoSymbols.length} kripto varlık kontrol edildi`);
    }
    // Kripto günlük mumları BIST'e özgü state alanlarından bağımsızdır;
    // gerçek, sıralı ve yeterli OHLCV dizisi bulunan her parite adaydır.
    const valid = results
      .filter(item => Array.isArray(item.history) && item.history.length >= 220)
      .sort((a,b) => Number(b.score || 0) - Number(a.score || 0));
    updateScannerJob(jobId, 82, "İlk 5 aday için Fibonacci A-B-C hesaplanıyor");
    const ranked = valid.slice(0, 5).map(item => {
      const fibonacci = fibonacciEngine.fibonacciPlan(item.history);
      const analysis = fibonacciEngine.score(item.history, fibonacci);
      return {...item, ...analysis, fibonacci, price:analysis.features.price, ema20:analysis.features.ema20, ema50:analysis.features.ema50, ema200:analysis.features.ema200, rsi:analysis.features.rsi, atr:analysis.features.atr, volumeRatio:analysis.features.volumeRatio};
    });
    // Kripto sinyal geçmişi tarama sonrası kalıcı yazılır; tarayıcı
    // yenilense dahi adayların hangi günde oluştuğu kaybolmaz.
    const stateResult = await getTradingState();
    const state = stateResult.content;
    const signalTime = new Date().toISOString();
    const existingSignals = Array.isArray(state.cryptoPaper?.signals) ? state.cryptoPaper.signals : [];
    const newSignals = ranked.map(item => ({
      id: `crypto-signal-${signalTime}-${item.symbol}`,
      symbol: item.symbol, timestamp: signalTime, score: Number(item.score || 0), grade: item.grade || "KARAR",
      status: item.fibonacci?.status || "NO_VALID_STRUCTURE", price: item.price,
      fibonacci: item.fibonacci || null,
    }));
    const existingKeys = new Set(existingSignals.map(item => `${item.symbol}:${String(item.timestamp || "").slice(0, 10)}`));
    state.cryptoPaper.signals = [...newSignals.filter(item => !existingKeys.has(`${item.symbol}:${signalTime.slice(0, 10)}`)), ...existingSignals].slice(0, 200);
    state.cryptoPaper.activity = [{timestamp: signalTime, type: "CRYPTO_SCAN", message: `${cryptoSymbols.length} USDT paritesi tarandı; ${ranked.length} aday kaydedildi.`}, ...(state.cryptoPaper.activity || [])].slice(0, 100);
    await saveTradingState(state, stateResult.sha, stateResult.container);
    updateScannerJob(jobId, 100, "Kripto taraması tamamlandı", "COMPLETE");
    return sendJSON(res, 200, {success:true, timestamp:signalTime, scanned:cryptoSymbols.length, successful:valid.length, results:ranked, cryptoPaper:cryptoPaperStateForClient(state), source:"BINANCE_PUBLIC", diagnostics:results.map(item=>({symbol:item.symbol, bars:item.history?.length||0, code:item.validation?.code||"OK"}))});
  } catch (error) {
    updateScannerJob(jobId, 100, `Kripto tarama hatası: ${error.message}`, "ERROR");
    return sendJSON(res, 500, {success:false, error:error.message});
  }
}

if (
  req.method === "GET" &&
  pathname === "/api/trading/paper/monitor-status"
) {
  return handlePaperMonitorStatus(req, res);
}

if (
  req.method === "POST" &&
  pathname === "/api/trading/paper/decision/pending"
) {
  return handleDecisionPendingOverride(req, res);
}

if (
  req.method === "POST" &&
  (
    pathname === "/api/trading/paper/pending/update" ||
    pathname === "/api/trading/paper/order/update"
  )
) {
  return handlePendingPaperOrderUpdate(req, res);
}

if (
  req.method === "POST" &&
  (
    pathname === "/api/trading/paper/manual" ||
    pathname === "/api/trading/paper/order/manual"
  )
) {
  return handleManualPaperOrder(req, res);
}

if (
  req.method === "POST" &&
  (
    pathname === "/api/trading/paper/approve" ||
    pathname === "/api/trading/paper/open"
  )
) {
  return handlePaperApproval(req, res);
}

if (
  req.method === "POST" &&
  pathname === "/api/trading/paper/reject"
) {
  return handlePaperRejection(req, res);
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
        runPaperMonitor()
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
        runPaperMonitor()
          .catch(
            error =>
              console.error(
                "PAPER MONITOR ERROR:",
                error.message
              )
          );
      },
      PAPER_MONITOR_INTERVAL_MS
    );

    // Seans kapanışından sonra güncel scanner kaydı varsa tek günlük
    // Telegram özetini yollar. Bir dakika aralık, Render'ın geç uyanması
    // veya taramanın 18:15'ten hemen sonra bitmesi durumunda da yeterlidir.
    setTimeout(
      () => {
        sendDailyTradingSummaryIfDue();
      },
      30000
    );

    setInterval(
      () => {
        sendDailyTradingSummaryIfDue();
      },
      60 * 1000
    );

    sendTelegramNotification(
      "BORSACI bağlantısı aktif. Paper işlem monitörü hazır."
    );

    void configureTelegramWebhook();

    // Render yeniden başlatması veya geçici Telegram hatası webhook'u
    // bozarsa onay butonları kendiliğinden tekrar bağlansın.
    setInterval(
      () => { void configureTelegramWebhook(); },
      30 * 60 * 1000
    );

  }
);
