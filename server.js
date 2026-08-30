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
const precisionEngine = require("./precision/engine");
const dailySummary = require("./trading/daily-summary");
const paperOrders = require("./trading/paper-orders");
const { scannerAction } = require("./trading/decision-policy");
const {
  isNasdaqTradableAsset,
  completedDailyBars,
  alpacaTradingBase,
  buildAlpacaOrderPayload,
} = require("./trading/alpaca-provider");
const {
  liveSpotSafetyPolicy,
  validateLiveSpotOrderSafety,
  liveSpotOrderFingerprint,
} = require("./trading/live-spot-safety");
const {
  compareScannerSnapshots,
  formatScannerDeltaTelegram,
} = require("./trading/scanner-delta");
const {
  normalizeNewsItems,
  normalizeAiReviews,
} = require("./trading/news-review");
const {
  evaluateLongPosition,
  applyConfirmedMonitorEvent,
} = require("./trading/position-monitor");
const {
  createMarketScheduler,
} = require("./trading/market-scheduler");
const {
  createBinanceBroker,
} = require("./trading/broker/binance-broker");
const {
  createAlpacaBroker,
} = require("./trading/broker/alpaca-broker");
const {
  createBistBroker,
} = require("./trading/broker/bist-broker");
const {
  normalizeBinancePrivateGatewayUrl,
  buildBinancePrivateGatewayUrl,
  selectBinanceSignedRequestBases,
} = require("./trading/binance-private-gateway");

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

// Bu anahtarlar yalnızca imzalı Spot hesap sorgusunda sunucu tarafında
// kullanılır. Public piyasa verisi/fallback akışından özellikle ayrıdır.
const BINANCE_API_KEY = String(process.env.BINANCE_API_KEY || "").trim();
const BINANCE_API_SECRET = String(process.env.BINANCE_API_SECRET || "").trim();
// Opsiyonel proxy: yalnız imzalı/private Spot çağrıları buradan geçer.
// Public candle/scanner yolları bu ayardan etkilenmez.
const BINANCE_PRIVATE_GATEWAY_URL = normalizeBinancePrivateGatewayUrl(process.env.BINANCE_PRIVATE_GATEWAY_URL);
// Gateway kullanılırken Worker'ın yalnızca bu Render sunucusundan gelen
// imzalı istekleri kabul etmesi için ayrı bir shared-secret kullanılır.
// Binance anahtarı değildir ve tarayıcıya ya da loglara asla gönderilmez.
const BINANCE_PRIVATE_GATEWAY_TOKEN = String(process.env.BINANCE_PRIVATE_GATEWAY_TOKEN || "").trim();
// İmzalı istekler public market-data aynalarına gönderilemez. Binance'in
// Spot REST belgelerinde belirtilen resmi trading uçları arasında yalnızca
// ağ engeli/rate-limit durumunda güvenli geri dönüş yapılır.
const BINANCE_SPOT_PRIVATE_BASE_URLS = [
  "https://api.binance.com",
  "https://api-gcp.binance.com",
  "https://api1.binance.com",
  "https://api2.binance.com",
  "https://api3.binance.com",
  "https://api4.binance.com"
];
let binanceActiveSpotPrivateBaseUrl = null;
const BINANCE_SPOT_ACCOUNT_RECV_WINDOW = 10000;
let binanceServerTimeOffsetMs = 0;
let binanceServerTimeOffsetFetchedAt = 0;
const BINANCE_LIVE_SPOT_SAFETY = liveSpotSafetyPolicy();
const recentBinanceLiveOrders = new Map();

// NASDAQ yalnızca Alpaca'nın server-side API'si üzerinden okunur. İstemciye
// anahtar veya secret gönderilmez. Basic planda SIP tarihsel verisi yaklaşık
// 15 dakika gecikmeli kullanılabildiğinden varsayılan bitiş zamanı geridedir.
const ALPACA_DATA_BASE_URL = "https://data.alpaca.markets";
const ALPACA_TRADING_MODE = String(process.env.ALPACA_TRADING_MODE || "paper").toLowerCase() === "live" ? "live" : "paper";
const ALPACA_TRADING_ENABLED = String(process.env.ALPACA_TRADING_ENABLED || "false").toLowerCase() === "true";
const ALPACA_DATA_FEED = String(process.env.ALPACA_DATA_FEED || "sip").toLowerCase() === "iex" ? "iex" : "sip";
// NASDAQ taraması önce alfabetik olarak kesilmez. Aktif evrenin önceki
// tamamlanmış günlük mumundaki dolar hacmine göre en likit semboller seçilir;
// yalnız bu küçük evren için teknik geçmiş indirilir. Bu hem A/B/... yanlılığını
// hem de Render belleğinde binlerce uzun fiyat serisi tutmayı önler.
const NASDAQ_UNIVERSE_LIMIT = Math.max(20, Math.min(100, Number(process.env.NASDAQ_UNIVERSE_LIMIT) || 50));
const NASDAQ_HISTORY_DAYS = Math.max(45, Math.min(90, Number(process.env.NASDAQ_HISTORY_DAYS) || 62));

// Scanner ilerlemesi yalnızca kısa süreli arayüz geri bildirimi içindir;
// kalıcı işlem/veri durumunun kaynağı değildir.
const scannerJobs = new Map();
// Bir market için manuel tarama ile saatlik worker aynı anda çalışırsa,
// ikisi de aynı GitHub state dosyasını kaydetmeye çalışır. Bu yalnızca
// çakışma değil küçük Render instance'ında bellek baskısı da yaratıyordu.
// Kilit market bazlıdır: BIST'in taranması kripto/NASDAQ isteğini engellemez.
const activeScannerMarkets = new Set();
let paperMonitorRunning = false;
let marketPaperMonitorRunning = false;
let unifiedPositionMonitorRunning = false;
// Kripto route'ları HTTP callback'i içinde tanımlı olduğundan, aynı server
// process'indeki scheduler bunlara yalnız bu küçük köprü üzerinden erişir.
// Köprü yalnız fonksiyon referansı taşır; secret veya kullanıcı verisi tutmaz.
let cryptoRuntimeBridge = null;
let tradingStateMutationTail = Promise.resolve();
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

const integrationHealth = {
  telegram: {lastSuccessAt:null, webhookConfiguredAt:null, deliveryError:null, webhookError:null},
  alpaca: {lastSuccessAt:null, lastCheckedAt:null, lastError:null},
  binance: {lastSuccessAt:null, lastCheckedAt:null, lastError:null},
};

// Otomasyon, aynı Render process'inde scanner/monitor state yazılarını
// sıraya alır. GitHub Contents SHA çakışmalarını tamamen ortadan kaldıramasa
// da kendi worker'larımızın birbirinin güncellemesini ezmesini önler.
function withTradingStateMutation(label, mutation) {
  const run = tradingStateMutationTail
    .catch(() => undefined)
    .then(async () => mutation());
  tradingStateMutationTail = run.catch(() => undefined);
  return run;
}

const automationRuntimeStatus = {
  scanner: {
    BIST: {running:false,lastRunAt:null,lastSuccessAt:null,lastError:null,lastErrorAt:null,nextRunAt:null},
    CRYPTO: {running:false,lastRunAt:null,lastSuccessAt:null,lastError:null,lastErrorAt:null,nextRunAt:null},
    NASDAQ: {running:false,lastRunAt:null,lastSuccessAt:null,lastError:null,lastErrorAt:null,nextRunAt:null},
  },
  monitor: {
    running:false,
    lastStartedAt:null,
    lastFinishedAt:null,
    lastError:null,
    lastErrorAt:null,
    nextRunAt:null,
  },
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

function acquireScannerExecution(market) {
  const normalized = String(market || "").toUpperCase();
  if (activeScannerMarkets.has(normalized)) return false;
  activeScannerMarkets.add(normalized);
  return true;
}

function releaseScannerExecution(market) {
  activeScannerMarkets.delete(String(market || "").toUpperCase());
}

async function sendTelegramNotification(
  message,
  replyMarkup = null,
  {queueOnFailure = true} = {}
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
    integrationHealth.telegram.lastSuccessAt = new Date().toISOString();
    integrationHealth.telegram.deliveryError = null;
    return true;

  } catch (error) {

    console.error(
      "TELEGRAM NOTIFICATION ERROR:",
      error.message
    );
    integrationHealth.telegram.deliveryError = String(error.message || "Telegram gönderimi başarısız.").slice(0, 300);
    if (queueOnFailure) void enqueueTelegramOutbox(message, replyMarkup, error);

    return false;

  }

}

function telegramOutboxKey(message, replyMarkup) {
  return crypto.createHash("sha256").update(JSON.stringify([String(message || ""), replyMarkup || null])).digest("hex");
}

async function enqueueTelegramOutbox(message, replyMarkup, error) {
  if (!message) return;
  await withTradingStateMutation("telegram-outbox-enqueue", async () => {
    const saved = await getTradingState();
    const state = saved.content;
    const key = telegramOutboxKey(message, replyMarkup);
    const rows = Array.isArray(state.telegramOutbox) ? state.telegramOutbox : [];
    if (!rows.some(item => item.key === key)) {
      state.telegramOutbox = [{key, message:String(message).slice(0,4000), replyMarkup:replyMarkup || null, attempts:0, createdAt:new Date().toISOString(), lastError:String(error?.message || "Teslimat başarısız.").slice(0,300)}, ...rows].slice(0,100);
      await saveTradingState(state, saved.sha, saved.container);
    }
  }).catch(outboxError => console.error("TELEGRAM OUTBOX ERROR:", outboxError.message));
}

let telegramOutboxFlushRunning = false;
async function flushTelegramOutbox() {
  if (telegramOutboxFlushRunning || !TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  telegramOutboxFlushRunning = true;
  try {
    const saved = await getTradingState();
    const rows = (Array.isArray(saved.content.telegramOutbox) ? saved.content.telegramOutbox : []).slice().reverse().slice(0,10);
    if (!rows.length) return;
    const delivered = new Set();
    for (const item of rows) {
      if (await sendTelegramNotification(item.message, item.replyMarkup, {queueOnFailure:false})) delivered.add(item.key);
      else item.attempts = Number(item.attempts || 0) + 1;
    }
    const latest = await getTradingState();
    latest.content.telegramOutbox = (latest.content.telegramOutbox || []).filter(item => !delivered.has(item.key)).map(item => rows.find(row => row.key === item.key) || item);
    await saveTradingState(latest.content, latest.sha, latest.container);
  } catch (error) {
    console.error("TELEGRAM OUTBOX FLUSH ERROR:", error.message);
  } finally {
    telegramOutboxFlushRunning = false;
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

    if (state.dailySummary?.sessionKey === snapshotSessionKey && state.dailySummary?.status === "SENT") {
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
      status: "PENDING",
      attempts: Number(state.dailySummary?.attempts || 0) + 1,
    };

    // Önce kalıcı rezervasyon, ardından dış Telegram çağrısı: restart
    // veya timer çakışması aynı seans özetini iki kez gönderemez.
    await saveTradingState(
      state,
      stateResult.sha,
      stateResult.container
    );

    const delivered = await sendTelegramNotification(message, null, {queueOnFailure:false});

    if (delivered) {
      const deliveredState = await getTradingState();
      if (deliveredState.content.dailySummary?.sessionKey === snapshotSessionKey) {
        deliveredState.content.dailySummary = {
          ...deliveredState.content.dailySummary,
          status: "SENT",
          sentAt: new Date().toISOString(),
          lastError: null,
        };
        await saveTradingState(deliveredState.content, deliveredState.sha, deliveredState.container);
      }
      console.log("TELEGRAM DAILY SUMMARY SENT");
    } else {
      const failedState = await getTradingState();
      if (failedState.content.dailySummary?.sessionKey === snapshotSessionKey) {
        failedState.content.dailySummary = {
          ...failedState.content.dailySummary,
          status: "FAILED_RETRYABLE",
          lastError: "Telegram teslimatı başarısız.",
        };
        await saveTradingState(failedState.content, failedState.sha, failedState.container);
      }
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
    integrationHealth.telegram.webhookConfiguredAt = new Date().toISOString();
    integrationHealth.telegram.webhookError = null;
    console.log("TELEGRAM APPROVAL WEBHOOK CONFIGURED");
    return true;
  } catch (error) {
    integrationHealth.telegram.webhookError = String(error.message || "Webhook yapılandırılamadı.").slice(0, 300);
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

function createOptionalAiClient(apiKey, baseURL) {
  return apiKey ? new OpenAI({apiKey, baseURL}) : null;
}

const groqAI = createOptionalAiClient(process.env.GROQ_API_KEY, "https://api.groq.com/openai/v1");
const geminiAI = createOptionalAiClient(process.env.GEMINI_API_KEY, "https://generativelanguage.googleapis.com/v1beta/openai/");
const mistralAI = createOptionalAiClient(process.env.MISTRAL_API_KEY, "https://api.mistral.ai/v1");


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
  const endpoint =
    `https://api.github.com/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/contents/data/watchlist.json`;
  let lastError = null;
  let lastSha = null;

  // GitHub Contents API occasionally returns a partially written blob while a
  // concurrent state update is being committed.  Never let that one bad read
  // take down the scanner, monitors, or the authenticated UI.
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${endpoint}?ref=main&_=${Date.now()}-${attempt}`, {
        headers: {
          "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`,
          "Accept": "application/vnd.github+json",
          "User-Agent": "BorsaCI",
          "Cache-Control": "no-cache",
        },
      });

      if (!response.ok) {
        throw new Error(`GitHub watchlist okunamadı: HTTP ${response.status}`);
      }

      const data = await response.json();
      lastSha = typeof data?.sha === "string" ? data.sha : lastSha;
      // Contents API yaklaşık 1 MB üzerindeki dosyalarda `content` alanını
      // boş döndürebilir. Bu durumda /raw/main kullanmak tehlikelidir: Contents
      // cevabındaki SHA yeni commit'e, raw CDN ise birkaç saniye önceki commit'e
      // ait olabilir. State ile SHA'nın farklı commitlerden gelmesi eski paper
      // pozisyonlarının yeniden dirilmesine ve pending decision ID'lerinin
      // kaybolmasına yol açıyordu. Bu nedenle içeriği MUTLAKA aynı blob SHA'dan
      // okuyoruz.
      let decoded = typeof data?.content === "string"
        ? Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8").trim()
        : "";
      if (!decoded) {
        if (!data?.sha) {
          throw new Error("GitHub watchlist blob SHA alınamadı.");
        }
        const blobEndpoint = `https://api.github.com/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/git/blobs/${data.sha}`;
        const blobResponse = await fetch(blobEndpoint, {
          headers: {
            "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`,
            "Accept": "application/vnd.github+json",
            "User-Agent": "BorsaCI",
            "Cache-Control": "no-cache",
          },
        });
        if (!blobResponse.ok) {
          throw new Error(`GitHub watchlist blob içeriği okunamadı: HTTP ${blobResponse.status}`);
        }
        const blob = await blobResponse.json();
        if (String(blob?.encoding || "").toLowerCase() !== "base64" || typeof blob?.content !== "string") {
          throw new Error("GitHub watchlist blob kodlaması geçersiz.");
        }
        decoded = Buffer.from(blob.content.replace(/\n/g, ""), "base64").toString("utf8").trim();
      }
      if (!decoded) {
        throw new Error("GitHub watchlist çözümlendikten sonra boş kaldı.");
      }

      const parsed = JSON.parse(decoded);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("GitHub watchlist kökü geçerli bir nesne değil.");
      }

      return { content: parsed, sha: data.sha, recovered: false };
    } catch (error) {
      lastError = error;
      console.error(`WATCHLIST READ RETRY ${attempt}/3: ${error.message}`);
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 250));
      }
    }
  }

  // Uzak state okunamadığında deploy paketindeki eski JSON'u güncel SHA ile
  // geri yazmak veri kaybına yol açar. Geçici GitHub hatasında işlemi durdurmak,
  // eski pozisyon/emir snapshot'ını canlı state'in üzerine yazmaktan güvenlidir.
  throw new Error(`GitHub watchlist okunamadı: ${lastError?.message || "bilinmeyen hata"}`);

}


const WATCHLIST_RETENTION_MAX_BYTES = 1_000_000;
const WATCHLIST_RETENTION_TARGET_BYTES = 750_000;
const WATCHLIST_RETENTION_MIN_RECENT = 5;

function watchlistStorageBytes(value) {
  return Buffer.byteLength(
    JSON.stringify(value, null, 2),
    "utf8"
  );
}

function retentionRecordTimestamp(item) {
  const candidates = [
    item?.closedAt,
    item?.lifecycle?.closedAt,
    item?.updatedAt,
    item?.editedAt,
    item?.openedAt,
    item?.lifecycle?.openedAt,
    item?.approvedAt,
    item?.createdAt,
    item?.timestamp,
  ];

  for (const value of candidates) {
    const time = new Date(value || 0).getTime();
    if (Number.isFinite(time) && time > 0) return time;
  }

  // Tarihsiz eski kayıtlar önce temizlenir.
  return 0;
}

function nestedRetentionArray(root, path) {
  let current = root;
  for (const key of path) {
    if (!current || typeof current !== "object") return null;
    current = current[key];
  }
  return Array.isArray(current) ? current : null;
}

function retentionCandidates(root, definitions) {
  const candidates = [];

  for (const definition of definitions) {
    const records = nestedRetentionArray(root, definition.path);
    if (!records?.length) continue;

    const eligible = records
      .map((item, index) => ({
        item,
        index,
        timestamp: retentionRecordTimestamp(item),
      }))
      .filter(entry => !definition.filter || definition.filter(entry.item));

    // Her geçmiş dizisinde en az birkaç yeni kayıt kalsın. Açık/bekleyen
    // emirler bu listelere zaten dahil edilmez; bu koruma yalnız geçmiş/log
    // görünümünün tamamen sıfırlanmamasını sağlar.
    const protectedIndexes = new Set(
      [...eligible]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, Math.max(0, Number(definition.minKeep ?? WATCHLIST_RETENTION_MIN_RECENT)))
        .map(entry => entry.index)
    );

    for (const entry of eligible) {
      if (protectedIndexes.has(entry.index)) continue;
      candidates.push({
        ...entry,
        path: definition.path,
        label: definition.label,
      });
    }
  }

  return candidates.sort((a, b) => a.timestamp - b.timestamp);
}

function removeRetentionCandidate(root, candidate) {
  const records = nestedRetentionArray(root, candidate.path);
  if (!records) return false;

  // Aynı obje referansı clone içinde korunur. Yine de olası primitive/eski
  // kayıtlar için orijinal indeks güvenli geri dönüş olarak kullanılır.
  let index = records.indexOf(candidate.item);
  if (index < 0 && candidate.index >= 0 && candidate.index < records.length) {
    index = candidate.index;
  }
  if (index < 0) return false;

  records.splice(index, 1);
  return true;
}

function pruneWatchlistHistoryForStorage(watchlist) {
  const beforeBytes = watchlistStorageBytes(watchlist);
  if (beforeBytes < WATCHLIST_RETENTION_MAX_BYTES) {
    return watchlist;
  }

  // Çağıranın canlı state nesnesini değiştirmiyoruz. Sadece GitHub'a
  // yazılacak snapshot küçültülür. Açık pozisyonlar, bekleyen emirler,
  // güncel scanner sonucu, risk ve kill-switch state'i korunur.
  const compact = JSON.parse(JSON.stringify(watchlist));

  const historicalDefinitions = [
    {path:["trading", "history"], label:"BIST_HISTORY"},
    {path:["trading", "activity"], label:"BIST_ACTIVITY"},
    {path:["trading", "automation", "monitor", "events"], label:"MONITOR_EVENTS"},
    {path:["trading", "cryptoPaper", "history"], label:"CRYPTO_HISTORY"},
    {path:["trading", "cryptoPaper", "signals"], label:"CRYPTO_SIGNALS"},
    {path:["trading", "cryptoPaper", "activity"], label:"CRYPTO_ACTIVITY"},
    {path:["trading", "cryptoLive", "history"], label:"CRYPTO_LIVE_HISTORY"},
    {path:["trading", "cryptoLive", "activity"], label:"CRYPTO_LIVE_ACTIVITY"},
    {path:["trading", "nasdaqPaper", "history"], label:"NASDAQ_HISTORY"},
    {path:["trading", "nasdaqPaper", "signals"], label:"NASDAQ_SIGNALS"},
    {path:["trading", "nasdaqPaper", "activity"], label:"NASDAQ_ACTIVITY"},
  ];

  // Önce yalnız kullanıcı arayüzünden kaldırdığımız geçmiş/sinyal/log
  // kayıtlarını global zaman sırasına göre en eskiden başlayarak temizle.
  // Böylece herhangi bir marketin açık/bekleyen state'i sırf dosya büyüdü
  // diye kaybolmaz.
  const candidates = retentionCandidates(compact, historicalDefinitions);
  let removed = 0;
  const removedByType = {};
  let currentBytes = beforeBytes;

  for (const candidate of candidates) {
    if (currentBytes <= WATCHLIST_RETENTION_TARGET_BYTES) break;
    if (!removeRetentionCandidate(compact, candidate)) continue;

    removed += 1;
    removedByType[candidate.label] = (removedByType[candidate.label] || 0) + 1;

    // Her kayıtta 1 MB JSON'u yeniden stringify etmek yerine küçük gruplar
    // halinde ölç. Hedef geçildiğinde son ölçüm kesin boyutu doğrular.
    if (removed % 8 === 0) {
      currentBytes = watchlistStorageBytes(compact);
    }
  }

  currentBytes = watchlistStorageBytes(compact);

  // Geçmiş/log kayıtlarının tamamına yakını temizlense bile dosya hedefin
  // üzerindeyse yalnız KAPANMIŞ pozisyonlardan en eskileri ikinci aşamada
  // budanabilir. OPEN veya broker/pending pozisyonlara asla dokunulmaz.
  if (currentBytes > WATCHLIST_RETENTION_TARGET_BYTES) {
    const closedPositionDefinitions = [
      {path:["trading", "paper", "positions"], label:"BIST_CLOSED_POSITION", minKeep:10, filter:item => ["CLOSED", "STOPPED"].includes(String(item?.status || "").toUpperCase())},
      {path:["trading", "cryptoPaper", "positions"], label:"CRYPTO_CLOSED_POSITION", minKeep:10, filter:item => ["CLOSED", "STOPPED"].includes(String(item?.status || "").toUpperCase())},
      {path:["trading", "cryptoLive", "positions"], label:"CRYPTO_LIVE_CLOSED_POSITION", minKeep:10, filter:item => ["CLOSED", "STOPPED"].includes(String(item?.status || "").toUpperCase())},
      {path:["trading", "nasdaqPaper", "positions"], label:"NASDAQ_CLOSED_POSITION", minKeep:10, filter:item => ["CLOSED", "STOPPED"].includes(String(item?.status || "").toUpperCase())},
    ];

    for (const candidate of retentionCandidates(compact, closedPositionDefinitions)) {
      if (currentBytes <= WATCHLIST_RETENTION_TARGET_BYTES) break;
      if (!removeRetentionCandidate(compact, candidate)) continue;
      removed += 1;
      removedByType[candidate.label] = (removedByType[candidate.label] || 0) + 1;
      if (removed % 8 === 0) {
        currentBytes = watchlistStorageBytes(compact);
      }
    }

    currentBytes = watchlistStorageBytes(compact);
  }

  if (removed > 0) {
    console.log(
      `WATCHLIST RETENTION: ${beforeBytes} -> ${currentBytes} bytes; ${removed} eski kayıt silindi`,
      removedByType
    );
  }

  if (currentBytes > WATCHLIST_RETENTION_TARGET_BYTES) {
    console.warn(
      `WATCHLIST RETENTION WARNING: güvenli geçmiş kayıtları temizlendi ancak state ${currentBytes} byte; açık/bekleyen işlemler korunarak hedefin üzerinde bırakıldı.`
    );
  }

  return compact;
}


async function saveWatchlist(
  watchlist,
  sha
) {

  const retainedWatchlist =
    pruneWatchlistHistoryForStorage(watchlist);

  const content =
    Buffer.from(
      JSON.stringify(
        retainedWatchlist,
        null,
        2
      )
    ).toString("base64");

  const endpoint =
    `https://api.github.com/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/contents/data/watchlist.json`;

  const response = await fetch(endpoint, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "BorsaCI",
    },
    body: JSON.stringify({
      message: "Update watchlist",
      content,
      ...(sha ? {sha} : {}),
    }),
  });

  if (response.ok) {
    return await response.json();
  }

  const errorText = await response.text();
  const error = new Error(`GitHub watchlist kaydedilemedi: HTTP ${response.status}: ${errorText}`);
  error.status = response.status;
  throw error;
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
      // Son taramanın hafif özeti saklanır. Mum serilerini burada tutmuyoruz;
      // GitHub state dosyası şişmeden yenileme sonrasında karar kartları geri gelir.
      scanner: {timestamp: null, scanned: 0, successful: 0, results: []},
      risk: {maxPositionPercent: 20, maxPositions: 5},
      // Kripto acil durdurma BIST ve NASDAQ hesaplarından bağımsızdır.
      killSwitch: {active: false, activatedAt: null},
    },

    // Binance Spot'ta gerçekten açılan ve TP/SL planı taşıyan işlemler paper
    // kaydından ayrı tutulur. Borsa yanıtı doğrulanmadan burada CLOSED yazılmaz.
    cryptoLive: {
      positions: [],
      activity: [],
      history: [],
    },

    // ABD hisseleri BIST ve kripto paper hesaplarından ayrı tutulur.
    nasdaqPaper: {
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
      scanner: {timestamp: null, scanned: 0, successful: 0, results: [], source: null},
      risk: {maxPositionPercent: 20, maxPositions: 5},
      killSwitch: {active: false, activatedAt: null},
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
      status: null,
      attempts: 0,
      sentAt: null,
      lastError: null,
    },

    telegramOutbox: [],

    // Saatlik tarama snapshot'ları ve pozisyon takip event'leri yeniden
    // başlatma sonrası da korunur. Burada yalnız hafif sonuçlar tutulur;
    // günlük OHLCV serileri state'e yazılmaz.
    automation: {
      scanner: {
        BIST: {snapshot:null,lastSuccessAt:null,lastError:null,lastErrorAt:null},
        CRYPTO: {snapshot:null,lastSuccessAt:null,lastError:null,lastErrorAt:null},
        NASDAQ: {snapshot:null,lastSuccessAt:null,lastError:null,lastErrorAt:null},
      },
      monitor: {
        events: [],
        lastSuccessAt: null,
        lastError: null,
        lastErrorAt: null,
      },
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
      scanner: {
        ...fallback.cryptoPaper.scanner,
        ...((value || {}).cryptoPaper?.scanner || {}),
        results: Array.isArray((value || {}).cryptoPaper?.scanner?.results)
          ? (value || {}).cryptoPaper.scanner.results
          : [],
      },
      risk: {...fallback.cryptoPaper.risk, ...((value || {}).cryptoPaper?.risk || {})},
      killSwitch: {
        ...fallback.cryptoPaper.killSwitch,
        ...((value || {}).cryptoPaper?.killSwitch || {}),
        active: Boolean((value || {}).cryptoPaper?.killSwitch?.active),
      },
    },

    cryptoLive: {
      ...fallback.cryptoLive,
      ...((value || {}).cryptoLive || {}),
      positions: Array.isArray((value || {}).cryptoLive?.positions)
        ? (value || {}).cryptoLive.positions
        : [],
      activity: Array.isArray((value || {}).cryptoLive?.activity)
        ? (value || {}).cryptoLive.activity
        : [],
      history: Array.isArray((value || {}).cryptoLive?.history)
        ? (value || {}).cryptoLive.history
        : [],
    },

    nasdaqPaper: {
      ...fallback.nasdaqPaper,
      ...((value || {}).nasdaqPaper || {}),
      positions: Array.isArray((value || {}).nasdaqPaper?.positions) ? (value || {}).nasdaqPaper.positions : [],
      decisions: Array.isArray((value || {}).nasdaqPaper?.decisions) ? (value || {}).nasdaqPaper.decisions : [],
      history: Array.isArray((value || {}).nasdaqPaper?.history) ? (value || {}).nasdaqPaper.history : [],
      signals: Array.isArray((value || {}).nasdaqPaper?.signals) ? (value || {}).nasdaqPaper.signals : [],
      activity: Array.isArray((value || {}).nasdaqPaper?.activity) ? (value || {}).nasdaqPaper.activity : [],
      scanner: {
        ...fallback.nasdaqPaper.scanner,
        ...((value || {}).nasdaqPaper?.scanner || {}),
        results: Array.isArray((value || {}).nasdaqPaper?.scanner?.results)
          ? (value || {}).nasdaqPaper.scanner.results
          : [],
      },
      risk: {...fallback.nasdaqPaper.risk, ...((value || {}).nasdaqPaper?.risk || {})},
      killSwitch: {
        ...fallback.nasdaqPaper.killSwitch,
        ...((value || {}).nasdaqPaper?.killSwitch || {}),
        active: Boolean((value || {}).nasdaqPaper?.killSwitch?.active),
      },
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

    automation: {
      ...fallback.automation,
      ...((value || {}).automation || {}),
      scanner: {
        ...fallback.automation.scanner,
        ...((value || {}).automation?.scanner || {}),
        BIST: {
          ...fallback.automation.scanner.BIST,
          ...((value || {}).automation?.scanner?.BIST || {}),
        },
        CRYPTO: {
          ...fallback.automation.scanner.CRYPTO,
          ...((value || {}).automation?.scanner?.CRYPTO || {}),
        },
        NASDAQ: {
          ...fallback.automation.scanner.NASDAQ,
          ...((value || {}).automation?.scanner?.NASDAQ || {}),
        },
      },
      monitor: {
        ...fallback.automation.monitor,
        ...((value || {}).automation?.monitor || {}),
        events: Array.isArray((value || {}).automation?.monitor?.events)
          ? (value || {}).automation.monitor.events.slice(0, 300)
          : [],
      },
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
  const desired = normalizeTradingState(state);
  const baseTrading = normalizeTradingState(container?.trading);
  const allKeys = new Set([
    ...Object.keys(baseTrading || {}),
    ...Object.keys(desired || {}),
  ]);
  const changedKeys = [...allKeys].filter(key =>
    JSON.stringify(baseTrading?.[key]) !== JSON.stringify(desired?.[key])
  );

  const buildWatchlist = (base = {}, trading = desired) => ({
    ...base,
    symbols: Array.isArray(base?.symbols) ? base.symbols : [],
    trading,
  });

  try {
    return await saveWatchlist(buildWatchlist(container), sha);
  } catch (error) {
    if (Number(error?.status) !== 409) throw error;

    // Başka market/worker önce yazdıysa eski TAM snapshot'ı yeni SHA ile tekrar
    // basmıyoruz. Son state'i yeniden okuyup yalnız bu mutasyonda gerçekten
    // değişen üst seviye trading dallarını uygularız. Böylece örneğin NASDAQ
    // yazımı BIST pending emrini veya BIST yazımı crypto state'ini geri alamaz.
    const latest = await getWatchlist();
    const mergedTrading = normalizeTradingState(latest.content?.trading);
    for (const key of changedKeys) {
      mergedTrading[key] = desired[key];
    }
    return await saveWatchlist(
      buildWatchlist(latest.content, mergedTrading),
      latest.sha
    );
  }
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
  // İlk üç teknik aday her zaman karar ekranına gelir. Fibonacci planı
  // yoksa/uygun değilse bunlar İZLE olarak gösterilir; uydurma seviye veya
  // başka bir hisseden gelen emir planı üretmeyiz.
  // Yapısal seviyeler (A/B/C, tetik, SL ve hedefler) ile emir
  // uygunluğu ayrı kavramlardır. Örneğin alçalan tepe trend çizgisi
  // bulunamadığında ALARK gibi bir yapı emir için kapalı kalır; fakat
  // backend'in gerçek veriden çıkardığı Fibonacci seviyeleri kartta
  // gizlenmez.
  const structuralEntry = Number(
    fib.entryPrice ?? fib.entryZoneLow ?? fib.entryTriggerPrice
  );
  const hasPlan = Boolean(
    Number.isFinite(structuralEntry) && structuralEntry > 0 &&
    Number.isFinite(Number(fib.stopLoss))
  );
  const fallback = !hasPlan && item.fallbackPlan ? item.fallbackPlan : null;
  const usablePlan = hasPlan;
  const plan = fib;
  const capital=Math.max(1000,Number(riskSettings.capital)||100000), allocation=Math.max(1,Number(riskSettings.maxPositionPercent)||31);
  const entry=hasPlan ? structuralEntry : null;
  const stop=usablePlan ? Number(plan.stopLoss) : null;
  const quantity=entry ? Math.floor(capital*allocation/100/entry) : 0;
  const hasEntryUpper=hasPlan&&Number.isFinite(Number(fib.entryZoneHigh))&&Number(fib.entryZoneHigh)>Number(fib.entryZoneLow);
  // Trend direnci olmadan giriş üst limiti yoktur; bu durumda onaya
  // düşebilecek bir BUY SETUP üretmeyiz.
  const active=Boolean(fib.status === "ACTIVE" && fib.confirmationPassed && hasEntryUpper);
  const action=hasPlan ? scannerAction({active,score:item.score}) : "WATCH";
  const status=action==="BUY SETUP"?"PENDING_APPROVAL":action==="NO TRADE"?"REJECTED":"PENDING";
  const now=new Date().toISOString();
  const decision = {
    id:`${Date.now()}-${item.symbol}`,rank,symbol:item.symbol,action,status,confidence:null,
    entry:{low:hasPlan?roundTradingValue(fib.entryZoneLow):null,high:hasEntryUpper?roundTradingValue(fib.entryZoneHigh):null,reference:entry===null?null:roundTradingValue(entry)},
    stop:stop===null?null:roundTradingValue(stop),target1:usablePlan?roundTradingValue(plan.tp1):null,target2:usablePlan?roundTradingValue(plan.tp2):null,target3:usablePlan?roundTradingValue(plan.tp3):null,
    riskReward:{tp1:usablePlan?plan.riskRewardTp1??null:null,tp2:usablePlan?plan.riskRewardTp2??null:null,tp3:usablePlan?plan.riskRewardTp3??null:null},
    riskPlan:{capital,targetPositionValue:usablePlan?roundTradingValue(capital*allocation/100):null,reservePercent:Math.max(0,100-allocation*Math.max(1,Number(riskSettings.maxPositions)||3)),quantity,positionValue:usablePlan?roundTradingValue(quantity*entry):null,actualRisk:usablePlan?roundTradingValue(quantity*Math.max(0,entry-stop)):null,maxPositionPercent:allocation,maxPositions:Math.max(1,Number(riskSettings.maxPositions)||3)},
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
    currentScan: true,
    reason:hasPlan?(active?"A-B-C yapısı %2,70 üzerinde tamamlanmış günlük kapanışla teyit edildi.":(fib.invalidReason||"C'den dönüş için günlük teyit bekleniyor.")):(fallback?.message||fib.invalidReason||"Geçerli Fibonacci işlem planı henüz oluşmadı; teknik aday izleniyor."),
    invalidation:hasPlan?`C seviyesinin %2 altındaki stop (${fib.stopLoss}) planı geçersiz kılar.`:"Fibonacci teyidi oluşmadan bu alternatif seviyeler işlem emri üretmez.",
    timestamp:now,
  };

  return ensurePendingOrder(decision, now);
}


function createAiDecisions(
  results,
  riskSettings = {}
) {

  // Karar havuzu scanner'ın sıraladığı ilk beş adaydan bağımsız yeni bir
  // sıralama yapmaz: teknik puana göre tam ilk üç sembol seçilir.
  return (Array.isArray(results) ? results : [])
    .filter(item => item?.validation?.ok)
    .slice()
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, 3)
    .map((item, index) => buildAiDecision(item, index + 1, riskSettings))
    .filter(Boolean);

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
  const normalized = String(symbol || "").trim().toUpperCase();
  // Açık pozisyon takibinde güncel fiyat kullanılabilir; fakat strateji ve
  // sinyal motoruna hiçbir intraday mum sokmamak için burada Yahoo quote
  // uç noktası kullanılır. Quote geçici olarak yoksa yalnız tamamlanmış 1G
  // kapanışına güvenli biçimde geri dönülür.
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(`${normalized}.IS`)}`, {
        headers:{"User-Agent":"Mozilla/5.0 BorsaCI/1.0", Accept:"application/json"},
        signal:controller.signal,
      });
      if (response.ok) {
        const payload = await response.json();
        const row = payload?.quoteResponse?.result?.[0];
        const price = Number(row?.regularMarketPrice ?? row?.postMarketPrice ?? row?.preMarketPrice);
        if (Number.isFinite(price) && price > 0) return roundTradingValue(price);
      }
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    // Quote kaynağı kapalıysa aşağıdaki tamamlanmış günlük kapanış kullanılır.
  }
  const yahoo = await fetchYahooChart(normalized, "1mo", "1d", 12000);
  const history = fibonacciEngine.completedDailyHistory(yahoo.history, Date.now(), {market:"BIST"});
  const price = Number(history.at(-1)?.close);
  if (!Number.isFinite(price) || price <= 0) throw new Error(`${normalized} için doğrulanmış piyasa fiyatı alınamadı.`);
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
    source: "YAHOO_QUOTE_OR_COMPLETED_DAILY",
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

function closeBistPaperPosition(
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


/*
 * BIST brokeri henüz yapılandırılmadığı için bu yalnızca yerel/paper
 * gerçeklemesini state'e işler. Karar ortak position-monitor'den gelir;
 * böylece TP1/TP2/SL aynı olayı yeniden üretemez.
 */
function settleBistPaperMonitorEvent(state, position, event, price, timestamp) {
  if (!event?.type || !Number.isFinite(Number(event.closeQuantity)) || Number(event.closeQuantity) <= 0) {
    return null;
  }

  const paper = state.paper;
  const closeQuantity = Number(event.closeQuantity);
  const entry = Number(position.entry || position.entryPrice || 0);
  const exitCommission = roundTradingValue(price * closeQuantity * PAPER_COMMISSION_RATE);
  const closingPnl = roundTradingValue((price - entry) * closeQuantity - exitCommission);
  const totalRealized = roundTradingValue(Number(position.realizedPnl || 0) + closingPnl);
  const next = applyConfirmedMonitorEvent(position, event, {timestamp});

  paper.cash = roundTradingValue(Number(paper.cash || 0) + price * closeQuantity - exitCommission);
  paper.pnl = roundTradingValue(Number(paper.pnl || 0) + closingPnl);

  if (event.type === "TP1") {
    Object.assign(position, {
      ...next,
      current: price,
      realizedPnl: totalRealized,
      pnl: roundTradingValue(totalRealized + (price - entry) * Number(next.quantity || 0)),
    });
    addTradingActivity(
      state,
      "TP1",
      `${position.symbol} TP1: ${closeQuantity} lot kapatıldı, SL maliyete çekildi.`,
      timestamp
    );
    return `BORSACI PAPER TP1\n${position.symbol}\n${closeQuantity} lot kapandı · ₺${(price * closeQuantity).toFixed(2)}\nKalan: ${next.quantity} lot\nSL maliyete çekildi.`;
  }

  const reason = event.type === "TP2" ? "TP2_REACHED" : "STOP_REACHED";
  state.paper.positions = state.paper.positions.map(item => item.id === position.id
    ? {
        ...item,
        ...next,
        current: price,
        pnl: totalRealized,
        realizedPnl: totalRealized,
        closedAt: timestamp,
        closeReason: reason,
      }
    : item);

  for (const decisionId of new Set(position.decisionIds || [position.decisionId])) {
    archivePaperDecision(state, decisionId, "CLOSED", reason, timestamp, totalRealized);
  }
  addTradingActivity(
    state,
    event.type,
    `${position.symbol} paper pozisyonu kapatıldı: ${reason} · ₺${totalRealized.toFixed(2)}.`,
    timestamp
  );
  return buildPaperCloseNotification(position, price, "CLOSED", reason, totalRealized);
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

  const openingNotifications = [];
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
      openingNotifications.push(buildPaperOpenNotification(position));
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
      // TP/SL takibi anlık quote kullanabilir; bu yol strateji/scanner
      // hesaplarına mum eklemez ve 4H/intraday mum tüketmez.
      const current = Number((await fetchCachedPaperMarketPrice(savedPosition.symbol)).price);

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

      // Strateji/sinyal hesaplamasi yalnız tamamlanmış günlük mumdan gelir.
      // Burada sadece açık pozisyonun güncel quote ile yürütülmesi var.
      const monitorEvent = evaluateLongPosition({...position, remainingQuantity: position.quantity}, current, {quantityPrecision:0});
      if (monitorEvent) {
        settleBistPaperMonitorEvent(state, position, monitorEvent, current, timestamp);
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

  for (const notification of openingNotifications) {
    void sendTelegramNotification(notification);
  }

  // Telegram teslimi unified position-monitor tarafından tekil olay anahtarı
  // ile yapılır. Burada doğrudan gönderim yaparsak aynı TP/SL için iki mesaj
  // oluşur.

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
          decision?.status === "PENDING" &&
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
        // Aynı sembolde açık pozisyon varsa Fibonacci seviyeleri tarama
        // arasında değişse bile ikinci bir karar kartı üretme. Açık planın
        // kimliği korunur; yeni teknik sırası yalnızca bu karta yansır.
        const previous =
          existingByFingerprint.get(
            decisionFingerprint(decision)
          ) || existing.find(item =>
            item?.symbol === decision.symbol &&
            ["PENDING_APPROVAL", "PENDING_LIMIT", "OPEN"].includes(item?.status) &&
            !isManualPaperDecision(item)
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

        const queued = ["PENDING_APPROVAL", "PENDING_LIMIT"].includes(previous.status);
        const next = {
          ...decision,
          id: previous.id,
          action:
            hasOpenPosition || queued
              ? previous.action
              : decision.action,
          status:
            hasOpenPosition
              ? "OPEN"
              : queued
                ? previous.status
                : decision.status,
          lifecycle:
            hasOpenPosition
              ? {
                  ...(previous.lifecycle || decision.lifecycle || {}),
                  stage: "OPEN",
                  openedAt:
                    previous.lifecycle?.openedAt ||
                    previous.timestamp ||
                    now,
                }
              : queued
                ? {
                    ...(decision.lifecycle || {}),
                    ...(previous.lifecycle || {}),
                    stage: previous.status,
                  }
                : decision.lifecycle,
          manualOverride: Boolean(previous.manualOverride || decision.manualOverride),
          // Onaya alınmış emir artık scanner taslağı değildir. Yeni tarama
          // teknik kartı güncelleyebilir fakat lot/fiyat/order type ve karar ID'si
          // kullanıcı onaylayana/reddedene kadar sabit kalır.
          pendingOrder:
            queued
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
  ).map(decision => ({...decision, currentScan: false}));
  // Manuel paper emirleri scanner kriterine bağlı değildir. Yeni scanner
  // snapshot'ı bunları expire/replace etmez; kullanıcı onaylayana,
  // reddedene veya işlem kapanana kadar yaşarlar.
  const retainedManualDecisions = existing.filter(
    decision =>
      isManualPaperDecision(decision) &&
      ["PENDING_APPROVAL", "PENDING_LIMIT", "OPEN"].includes(decision?.status) &&
      !state.decisions.some(next => next.id === decision.id)
  );
  const nowMs = Date.parse(now);
  const retainedQueuedDecisions = existing.filter(decision => {
    if (isManualPaperDecision(decision)) return false;
    if (!["PENDING_APPROVAL", "PENDING_LIMIT"].includes(decision?.status)) return false;
    if (state.decisions.some(next => next.id === decision.id)) return false;
    const expiresAt = Date.parse(decision?.lifecycle?.expiresAt || "");
    return !Number.isFinite(expiresAt) || expiresAt > nowMs;
  }).map(decision => ({...decision, currentScan: false}));
  state.decisions = [
    ...state.decisions,
    ...retainedOpenDecisions,
    ...retainedQueuedDecisions,
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

    const decisionId = String(
      input.decisionId || input.orderId || ""
    ).trim();

const symbol = String(
  input.symbol || ""
).trim().toUpperCase();

if (!decisionId && !symbol) {
  throw new Error("Bekleyen emir kimliği veya sembol gerekli.");
}

const stateResult = await getTradingState();
const state = stateResult.content;

const decision = resolvePendingPaperDecision(state, {
  decisionId,
  orderId: input.orderId,
  symbol,
});

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
          const marketPrice = Number((await fetchCachedPaperMarketPrice(position.symbol)).price);

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
          closeBistPaperPosition(
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

async function approvePaperDecision(decisionId, source, {orderId = "", symbol = ""} = {}) {
  const stateResult = await getTradingState();
  const state = stateResult.content;
  const decision = resolvePendingPaperDecision(state, {decisionId, orderId, symbol});
  if (!decision) {
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

function resolvePendingPaperDecision(
  state,
  {decisionId = "", orderId = "", symbol = ""} = {}
) {
  const normalizedDecisionId = String(decisionId || "").trim();
  const normalizedOrderId = String(orderId || "").trim();
  const normalizedSymbol = String(symbol || "").trim().toUpperCase();
  const pending = (Array.isArray(state?.decisions) ? state.decisions : []).filter(
    item =>
      ["PENDING_APPROVAL", "PENDING_LIMIT"].includes(item?.status) &&
      isPaperApprovableDecision(item)
  );

  const exactIds = new Set([normalizedDecisionId, normalizedOrderId].filter(Boolean));
  if (exactIds.size) {
    const exact = pending.find(item => exactIds.has(String(item?.id || "")));
    if (exact) return exact;
  }

  if (!normalizedSymbol) return null;
  const symbolMatches = pending.filter(
    item => String(item?.symbol || "").trim().toUpperCase() === normalizedSymbol
  );
  return symbolMatches.length === 1 ? symbolMatches[0] : null;
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

async function rejectPaperDecision(decisionId, source, {orderId = "", symbol = ""} = {}) {
  const stateResult = await getTradingState();
  const state = stateResult.content;
  const decision = resolvePendingPaperDecision(state, {decisionId, orderId, symbol});
  if (!decision) {
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
    const orderId = String(input.orderId || "").trim();
    const symbol = String(input.symbol || "").trim().toUpperCase();
    if (!decisionId && !symbol) throw new Error("Karar kimliği veya sembol gerekli.");
    return sendJSON(
      res,
      200,
      tradingStateForClient(
        await approvePaperDecision(decisionId, "SITE", {orderId, symbol})
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
    const orderId = String(input.orderId || "").trim();
    const symbol = String(input.symbol || "").trim().toUpperCase();
    if (!decisionId && !symbol) throw new Error("Karar kimliği veya sembol gerekli.");
    return sendJSON(
      res,
      200,
      tradingStateForClient(
        await rejectPaperDecision(decisionId, "SITE", {orderId, symbol})
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
        await withTradingStateMutation("paper-telegram-approve", () => approvePaperDecision(match[2], "TELEGRAM"));
      } else {
        await withTradingStateMutation("paper-telegram-reject", () => rejectPaperDecision(match[2], "TELEGRAM"));
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
    return await withTradingStateMutation("paper-close", async () => {
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
      notification = closeBistPaperPosition(
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
    });
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
 * Sistem sağlık özeti yalnızca durum bilgisi döndürür. Anahtar, secret,
 * oturum veya bakiye içermez; dış servislerde yan etki yaratacak bir istek
 * yapmaz. Böylece kontrol ekranı güvenli biçimde Render yapılandırmasını ve
 * son kalıcı çalışma durumunu gösterir.
 */
function systemHealthItem(label, ready, detail) {
  return {
    label,
    status: ready ? "READY" : "NEEDS_ATTENTION",
    detail: String(detail || ""),
  };
}

async function handleSystemHealth(req, res) {
  try {
    const checkDue = item => !item.lastCheckedAt || Date.now() - new Date(item.lastCheckedAt).getTime() > (item.lastError ? 60 * 1000 : 5 * 60 * 1000);
    const checks = [];
    if (process.env.ALPACA_API_KEY_ID && process.env.ALPACA_API_SECRET_KEY && checkDue(integrationHealth.alpaca)) {
      integrationHealth.alpaca.lastCheckedAt = new Date().toISOString();
      checks.push(alpacaJson(`${ALPACA_DATA_BASE_URL}/v2/stocks/AAPL/bars?timeframe=1Day&limit=1&feed=${encodeURIComponent(ALPACA_DATA_FEED)}`));
    }
    if (BINANCE_API_KEY && BINANCE_API_SECRET && checkDue(integrationHealth.binance)) {
      integrationHealth.binance.lastCheckedAt = new Date().toISOString();
      checks.push(fetchBinanceSpotAccount());
    }
    if (checks.length) await Promise.allSettled(checks);
    const saved = await getTradingState();
    const state = saved.content || {};
    const cryptoPaper = state.cryptoPaper || {};
    const nasdaqPaper = state.nasdaqPaper || {};
    // Güncel BIST scanner, mum serilerini şişirmeden scannerSnapshot içinde
    // saklanır. Eski state.scanner alanı yalnız başına kontrol edilirse sağlık
    // paneli tarama yapılmış olsa bile yanlışlıkla "Dikkat gerekiyor" der.
    const bistScanner = state.scannerSnapshot || state.scanner || {};
    const bistScanTimestamp = bistScanner.createdAt || bistScanner.timestamp || null;
    const aiProviderCount = [process.env.GROQ_API_KEY, process.env.GEMINI_API_KEY, process.env.MISTRAL_API_KEY]
      .filter(Boolean).length;
    const recent = (value, maxAgeMs) => Boolean(value && Date.now() - new Date(value).getTime() <= maxAgeMs);
    const bistFresh = recent(bistScanTimestamp, 72 * 60 * 60 * 1000);
    const cryptoFresh = recent(cryptoPaper.scanner?.timestamp, 2 * 60 * 60 * 1000);
    const nasdaqFresh = recent(nasdaqPaper.scanner?.timestamp, 72 * 60 * 60 * 1000);
    const items = [
      systemHealthItem("OTURUM GÜVENLİĞİ", Boolean(process.env.AUTH_PASSWORD_HASH && process.env.SESSION_SECRET), "Sunucu oturumu"),
      systemHealthItem("KALICI DURUM", Boolean(process.env.GITHUB_OWNER && process.env.GITHUB_REPO && process.env.GITHUB_TOKEN), "GitHub state deposu"),
      systemHealthItem("YZ SAĞLAYICILARI", aiProviderCount > 0, aiProviderCount ? `${aiProviderCount} sağlayıcı hazır` : "YZ anahtarı eksik"),
      systemHealthItem("TELEGRAM", Boolean(integrationHealth.telegram.webhookConfiguredAt && integrationHealth.telegram.lastSuccessAt && !integrationHealth.telegram.webhookError && !integrationHealth.telegram.deliveryError), integrationHealth.telegram.webhookError || integrationHealth.telegram.deliveryError || (integrationHealth.telegram.webhookConfiguredAt ? `Son teslim: ${integrationHealth.telegram.lastSuccessAt}` : "Webhook doğrulanmadı")),
      systemHealthItem("BIST VERİSİ", bistFresh, bistScanTimestamp ? `Son tarama: ${bistScanTimestamp}` : "Henüz BIST taraması yok"),
      systemHealthItem("BİNANCE", Boolean(integrationHealth.binance.lastSuccessAt && !integrationHealth.binance.lastError), integrationHealth.binance.lastError || (integrationHealth.binance.lastSuccessAt ? `Son bağlantı: ${integrationHealth.binance.lastSuccessAt}` : "Spot bağlantısı doğrulanmadı")),
      systemHealthItem("KRİPTO VERİSİ", cryptoFresh, cryptoPaper.scanner?.timestamp ? `Son tarama: ${cryptoPaper.scanner.timestamp}` : "Henüz kripto taraması yok"),
      systemHealthItem("ALPACA", Boolean(integrationHealth.alpaca.lastSuccessAt && !integrationHealth.alpaca.lastError), integrationHealth.alpaca.lastError || (integrationHealth.alpaca.lastSuccessAt ? `Son bağlantı: ${integrationHealth.alpaca.lastSuccessAt} · ${ALPACA_DATA_FEED.toUpperCase()}` : "Alpaca bağlantısı doğrulanmadı")),
      systemHealthItem("NASDAQ VERİSİ", nasdaqFresh, nasdaqPaper.scanner?.timestamp ? `Son tarama: ${nasdaqPaper.scanner.timestamp}` : "Henüz NASDAQ taraması yok"),
      systemHealthItem("BIST İZLEYİCİ", Boolean(paperMonitorStatus.lastFinishedAt && !paperMonitorStatus.lastError), paperMonitorStatus.lastError || (paperMonitorStatus.lastFinishedAt ? `Son kontrol: ${paperMonitorStatus.lastFinishedAt}` : "İlk kontrol bekleniyor")),
      {label:"PİYASA İZLEYİCİ", status: unifiedPositionMonitorRunning || marketPaperMonitorRunning ? "RUNNING" : (automationRuntimeStatus.monitor.lastError ? "NEEDS_ATTENTION" : "READY"), detail: automationRuntimeStatus.monitor.lastError || (unifiedPositionMonitorRunning || marketPaperMonitorRunning ? "Kontrol çalışıyor" : `Sonraki kontrolü bekliyor${automationRuntimeStatus.monitor.lastFinishedAt ? ` · Son: ${automationRuntimeStatus.monitor.lastFinishedAt}` : ""}`)},
    ];
    return sendJSON(res, 200, {
      timestamp: new Date().toISOString(),
      healthy: items.filter(item => item.status === "READY" || item.status === "RUNNING").length,
      total: items.length,
      items,
    });
  } catch (error) {
    return sendJSON(res, 500, {error: "Sistem sağlık bilgisi alınamadı."});
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
const SCANNER_SNAPSHOT_VERSION = "daily-top-five-v6";
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

    return normalizeNewsItems(payload?.news, {limit:3});
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

    const reviewBySymbol = normalizeAiReviews(
      parsed,
      list.map(item => item.symbol),
      provider
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


async function scanSymbol(symbol) {
  try {
    // Taramanın her satırı aynı kısa süre içinde ya sonuçlanır ya da
    // fail-closed olur. Bir tek sembol tüm 106 hisseyi kilitlemez.
    const yahoo = await fetchYahooChart(symbol, "2y", "1d", 6000);
    // Scanner, Fibonacci ve AI stratejisi yalnız tamamlanmış günlük mumlarla
    // çalışır. Aynı fail-closed filtre BIST/XU100/kripto/NASDAQ için analiz
    // motorunda merkezi tutulur; burada ikinci bir saatlik veya 4H yol yoktur.
    const history = fibonacciEngine.completedDailyHistory(yahoo.history, Date.now(), {market:"BIST"});
    const validation = fibonacciEngine.validateDaily(history);
    if (!validation.ok) return { symbol, history, validation, dataStatus: validation.message };
    const precisionValidation = precisionEngine.validateHistory(history, {requireComplete:false});
    const precision = precisionValidation.ok
      ? {status:"VALIDATED", dataQuality:"PASSED", calibration:"KALIBRE_EDILMEDI"}
      : {status:"UNAVAILABLE", dataQuality:"FAILED", calibration:"KALIBRE_EDILMEDI", errors:precisionValidation.errors};
    const baseFib = { valid:false, status:"NO_VALID_STRUCTURE", riskRewardTp2:null, riskRewardTp3:null, volumeConfirmation:"WEAK" };
    const analysis = fibonacciEngine.score(history, baseFib);
    return { symbol, history, validation, precision, dataStatus:"OK", ...analysis, fibonacci:baseFib, timestamp:new Date().toISOString() };
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
  if (!acquireScannerExecution("BIST")) {
    return sendJSON(res, 409, {success:false, error:"BIST taraması zaten çalışıyor. Mevcut taramanın tamamlanmasını bekleyin."});
  }
  let jobId = "";
  try {
    const url=new URL(req.url,`http://${req.headers.host||"localhost"}`);
    const riskSettings={capital:url.searchParams.get("capital"),maxPositionPercent:url.searchParams.get("maxPositionPercent"),maxPositions:url.searchParams.get("maxPositions")};
    // Otomasyon piyasa kapalıyken son tamamlanmış günlük snapshot'ı
    // kullanabilir. Kullanıcının başlattığı tarama ise hiçbir zaman eski
    // snapshot'ı geri döndürmez.
    const forceRefresh=url.searchParams.get("force")==="1";
    jobId=String(url.searchParams.get("jobId")||"").replace(/[^a-zA-Z0-9_-]/g,"").slice(0,80);
    updateScannerJob(jobId,2,"Teknik tarama başlatıldı");
    const existingStateResult=await getTradingState();
    const existingState=existingStateResult.content;
    if(!forceRefresh && canReuseScannerSnapshot(existingState.scannerSnapshot,riskSettings)){
      const snapshot=existingState.scannerSnapshot;
      // Piyasa kapalıyken günlük mumları yeniden indirmeyiz; ancak eski
      // sürümden kalmış karar kartlarını aynen döndürmek de yanlış seçim
      // üretir. Aynı ilk beş snapshot'tan güncel ilk üç karar kümesini
      // yeniden kurup kalıcı state'i tekilleştiriyoruz.
      const cachedDecisions=createAiDecisions(snapshot.results,riskSettings);
      const state=await recordAiDecisions(cachedDecisions,snapshot);
      updateScannerJob(jobId,100,"Piyasa kapalı: son tamamlanmış günlük tarama aynen kullanıldı","COMPLETE");
      return sendJSON(res,200,{success:true,cached:true,timestamp:new Date().toISOString(),scanned:snapshot.scanned,successful:snapshot.successful,complete:true,xu100:{status:"BİLİNMİYOR",description:"XU100 görünümü bilgilendirme amaçlıdır; hisselerin teknik kalite skorunu ve sıralamasını engellemez."},results:snapshot.results,decisions:state.decisions,paper:paperStateForClient(state),activity:state.activity,history:state.history,risk:state.risk});
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
      fetchYahooChart("XU100","2y","1d",3000).then(value=>fibonacciEngine.xu100Info(
        fibonacciEngine.completedDailyHistory(value.history, Date.now(), {market:"BIST"})
      )),
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
    const technicalShortlist=valid.slice(0,12);
    updateScannerJob(jobId,60,`Teknik puanla ilk ${technicalShortlist.length} aday kısa listeye alındı`);
    updateScannerJob(jobId,70,"Seçilen 5 aday için günlük Fibonacci A-B-C hesaplanıyor");
    updateScannerJob(jobId,82,"Günlük alçalan tepe kırılımı ve %3 giriş üst seviyesi doğrulanıyor");
    const enriched=fibonacciEngine.rankCandidatesWithFibonacci(technicalShortlist,Date.now(),{market:"BIST"},{limit:5,shortlistLimit:12}).map(item=>({
      ...item,price:item.features.price,ema20:item.features.ema20,ema50:item.features.ema50,ema200:item.features.ema200,
      rsi:item.features.rsi,macd:item.features.macd,atr:item.features.atr,volumeRatio:item.features.volumeRatio,turnover:item.features.turnover
    }));
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
    // Scanner sonucu state'e tek sıralı olarak yazılır. Böylece eşzamanlı
    // monitor veya başka bir kullanıcı işlemi eski karar kümesini yeniden
    // kaydedip yeni taramanın üstüne yazamaz.
    const state=await withTradingStateMutation("bist-scanner-commit",()=>recordAiDecisions(decisions,snapshot));
    updateScannerJob(jobId,100,`${state.paper?.positions?.filter(item=>item.status==="OPEN").length||0} açık paper pozisyon · Tarama tamamlandı`,"COMPLETE");
    return sendJSON(res,200,{success:true,timestamp:new Date().toISOString(),scanned,successful:valid.length,complete:scanned===BIST100_SYMBOLS.length,xu100,results:ranked,decisions:state.decisions,paper:paperStateForClient(state),activity:state.activity,history:state.history,risk:state.risk});
  } catch(error) { updateScannerJob(jobId,100,`Tarama hatası: ${error.message}`,"ERROR"); console.error("TRADING SCANNER ERROR:",error.message);return sendJSON(res,500,{success:false,error:error.message}); }
  finally { releaseScannerExecution("BIST"); }
}

function handleTradingScannerStatus(req,res) {
  const url=new URL(req.url,`http://${req.headers.host||"localhost"}`);
  const jobId=String(url.searchParams.get("jobId")||"").replace(/[^a-zA-Z0-9_-]/g,"").slice(0,80);
  const job=scannerJobs.get(jobId);
  return sendJSON(res,200,job||{progress:0,message:"Tarama durumu bekleniyor",status:"PENDING"});
}

/* ========================================================
   NASDAQ / ALPACA PROVIDER + PAPER WORKSPACE
   ======================================================== */

function alpacaHeaders() {
  const key = String(process.env.ALPACA_API_KEY_ID || "").trim();
  const secret = String(process.env.ALPACA_API_SECRET_KEY || "").trim();
  if (!key || !secret) throw new Error("Alpaca API yapılandırması gerekli. Render'a ALPACA_API_KEY_ID ve ALPACA_API_SECRET_KEY ekleyin.");
  return {"APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret, Accept: "application/json"};
}

async function alpacaJson(url, {method = "GET", body = null} = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {method, headers: {...alpacaHeaders(), ...(body ? {"Content-Type":"application/json"} : {})}, body: body ? JSON.stringify(body) : undefined, signal: controller.signal});
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(payload?.message || `Alpaca HTTP ${response.status}`).slice(0, 240));
    integrationHealth.alpaca.lastSuccessAt = new Date().toISOString();
    integrationHealth.alpaca.lastError = null;
    return payload;
  } catch (error) {
    integrationHealth.alpaca.lastError = String(error.message || "Alpaca bağlantısı başarısız.").slice(0, 300);
    throw error;
  } finally { clearTimeout(timeout); }
}

function nasdaqSafeSymbol(value) {
  const symbol = String(value || "").trim().toUpperCase();
  if (!/^[A-Z]{1,8}$/.test(symbol)) throw new Error("Geçerli NASDAQ sembolü gerekli.");
  return symbol;
}

function nasdaqPreviousDailyBar(snapshot) {
  const bar = snapshot?.prevDailyBar || snapshot?.prev_daily_bar || null;
  const close = Number(bar?.c ?? bar?.close);
  const volume = Number(bar?.v ?? bar?.volume);
  return Number.isFinite(close) && close > 0 && Number.isFinite(volume) && volume > 0
    ? { close, volume, dollarVolume: close * volume }
    : null;
}

async function fetchNasdaqLiquiditySnapshots(symbols, feed) {
  const ranked = [];
  const chunks = [];
  for (let index = 0; index < symbols.length; index += 100) chunks.push(symbols.slice(index, index + 100));
  // Dört küçük istek paralel ilerler; cevaplarda yalnız sembol + dolar hacmi
  // tutulur, ham snapshot/seri bellekte biriktirilmez.
  for (let index = 0; index < chunks.length; index += 4) {
    const batch = chunks.slice(index, index + 4);
    const responses = await Promise.all(batch.map(async group => {
      const query = new URLSearchParams({ symbols: group.join(","), feed });
      return alpacaJson(`${ALPACA_DATA_BASE_URL}/v2/stocks/snapshots?${query.toString()}`);
    }));
    for (const payload of responses) {
      for (const [symbol, snapshot] of Object.entries(payload || {})) {
        const previous = nasdaqPreviousDailyBar(snapshot);
        if (previous) ranked.push({ symbol: String(symbol).toUpperCase(), ...previous });
      }
    }
  }
  return ranked;
}

async function fetchNasdaqUniverse() {
  const assets = await alpacaJson("https://paper-api.alpaca.markets/v2/assets?status=active&asset_class=us_equity&exchange=NASDAQ");
  const symbols = (Array.isArray(assets) ? assets : [])
    .filter(isNasdaqTradableAsset)
    .map(asset => String(asset.symbol).toUpperCase())
    .sort((left, right) => left.localeCompare(right, "en"));
  if (!symbols.length) throw new Error("Alpaca NASDAQ varlık listesi boş döndü. API anahtarlarının Paper hesabına ait olduğunu ve Render'da tam kaydedildiğini kontrol edin.");
  let ranked = [];
  let feedUsed = ALPACA_DATA_FEED;
  try {
    ranked = await fetchNasdaqLiquiditySnapshots(symbols, feedUsed);
  } catch (error) {
    if (ALPACA_DATA_FEED !== "sip") throw error;
    // Ücretsiz hesaplarda SIP snapshot yetkisi bulunmayabilir. Aynı önceki
    // günlük mum verisini IEX'ten alır; intraday günlük mum kullanılmaz.
    feedUsed = "iex";
    ranked = await fetchNasdaqLiquiditySnapshots(symbols, feedUsed);
  }
  if (!ranked.length) throw new Error("NASDAQ likidite verisi alınamadı. Alpaca günlük snapshot erişimini kontrol edin.");
  ranked.sort((left, right) => Number(right.dollarVolume) - Number(left.dollarVolume) || left.symbol.localeCompare(right.symbol, "en"));
  return {
    symbols: ranked.slice(0, NASDAQ_UNIVERSE_LIMIT).map(item => item.symbol),
    totalAssets: symbols.length,
    liquidityFeed: feedUsed,
  };
}

function alpacaHistoricalEnd() {
  // Basic SIP gecikmesini karşılamak için tamamlanmış piyasa verisinin daima
  // gerisinde kalır; açık gün mumu ayrıca completedDailyBars ile atılır.
  return new Date(Date.now() - 16 * 60 * 1000).toISOString();
}

async function fetchNasdaqBars(symbols, feed = ALPACA_DATA_FEED) {
  const barsBySymbol = new Map((symbols || []).map(symbol => [symbol, []]));
  let pageToken = null;
  const end = alpacaHistoricalEnd();
  // NASDAQ teknik/Fibonacci penceresi iki takvim ayıyla sınırlıdır. Açık gün
  // mumu completedDailyBars tarafından ayrıca atılır.
  const start = new Date(Date.now() - NASDAQ_HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  do {
    const query = new URLSearchParams({symbols: symbols.join(","), timeframe:"1Day", start, end, limit:"10000", feed});
    if (pageToken) query.set("page_token", pageToken);
    const payload = await alpacaJson(`${ALPACA_DATA_BASE_URL}/v2/stocks/bars?${query.toString()}`);
    for (const [symbol, rows] of Object.entries(payload?.bars || {})) {
      barsBySymbol.set(symbol, [...(barsBySymbol.get(symbol) || []), ...(Array.isArray(rows) ? rows : [])]);
    }
    pageToken = payload?.next_page_token || null;
  } while (pageToken);
  return {feed, barsBySymbol: new Map([...barsBySymbol].map(([symbol, rows]) => [symbol, completedDailyBars(rows)]))};
}

async function fetchNasdaqBarsWithFallback(symbols) {
  try { return await fetchNasdaqBars(symbols, ALPACA_DATA_FEED); }
  catch (error) {
    if (ALPACA_DATA_FEED !== "sip") throw error;
    // Basic SIP yetkisi/uygun gecikme yoksa ücretsiz IEX verisini açıkça
    // kaynak etiketiyle kullanırız; SIP gibi gösterilmez.
    return await fetchNasdaqBars(symbols, "iex");
  }
}

async function fetchNasdaqDailyClose(symbol) {
  const result = await fetchNasdaqBarsWithFallback([nasdaqSafeSymbol(symbol)]);
  const history = result.barsBySymbol.get(nasdaqSafeSymbol(symbol)) || [];
  const latest = history.at(-1);
  if (!latest || !Number.isFinite(Number(latest.close)) || Number(latest.close) <= 0) throw new Error(`${symbol} için tamamlanmış günlük Alpaca fiyatı alınamadı.`);
  return {price: roundTradingValue(latest.close), asOf: new Date(latest.time * 1000).toISOString(), source: `ALPACA_${String(result.feed).toUpperCase()}_1DAY`};
}

// Bu fonksiyon YALNIZCA acik pozisyon/limit emir izlemede kullanilir.
// Scanner ve Fibonacci stratejisi fetchNasdaqBars -> completedDailyBars
// yolundan baska hicbir zaman dilimi okumaz.
async function fetchNasdaqMonitorPrice(symbol) {
  const safe = nasdaqSafeSymbol(symbol);
  const feeds = [...new Set([ALPACA_DATA_FEED, "iex"])];
  for (const feed of feeds) {
    try {
      const payload = await alpacaJson(`${ALPACA_DATA_BASE_URL}/v2/stocks/${encodeURIComponent(safe)}/trades/latest?feed=${encodeURIComponent(feed)}`);
      const price = Number(payload?.trade?.p ?? payload?.trade?.price);
      if (Number.isFinite(price) && price > 0) {
        return {price:roundTradingValue(price), asOf:payload?.trade?.t || new Date().toISOString(), source:`ALPACA_${String(feed).toUpperCase()}_LATEST_TRADE`};
      }
    } catch {
      // SIP/Basic yetkisi yoksa veya seans disindaysa diger feed denenir.
    }
  }
  return fetchNasdaqDailyClose(safe);
}

async function fetchNasdaqNews(symbol) {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&newsCount=5`, {headers:{"User-Agent":"Mozilla/5.0",Accept:"application/json"}, signal:controller.signal});
    if (!response.ok) return [];
    const payload = await response.json();
    return normalizeNewsItems(payload?.news, {limit:5});
  } catch { return []; } finally { clearTimeout(timeout); }
}

async function evaluateNasdaqCandidatesWithAi(candidates) {
  const list = (Array.isArray(candidates) ? candidates : []).slice(0, 3);
  const fallback = new Map(list.map(item => [item.symbol, {available:false, provider:"UNAVAILABLE", verdict:"INFO", score:null, newsComment:"Doğrulanmış haber başlığı alınamadı.", expertComment:"Analist görüşü veya hedef fiyat, doğrulanmış kaynak olmadan gösterilmez.", summary:"AI bilgi akışı için yapılandırılmış kaynak bekleniyor."}]));
  if (!list.length || (!process.env.GROQ_API_KEY && !process.env.GEMINI_API_KEY && !process.env.MISTRAL_API_KEY)) return fallback;
  const input = await Promise.all(list.map(async item => ({symbol:item.symbol, news:await fetchNasdaqNews(item.symbol)})));
  const prompt = [
    "NASDAQ hisseleri için yalnızca verilen doğrulanmış haber başlıklarını kısa Türkçe özetle.",
    "Teknik değer, puan, giriş, stop, hedef, AL/SAT kararı veya başarı olasılığı üretme/değiştirme.",
    "Şirket gelişmesi, analist görüşü veya hedef fiyat ancak verilen başlıkta açıkça varsa anılabilir; yoksa uydurma.",
    "Sadece JSON döndür: {\\\"reviews\\\":[{\\\"symbol\\\":\\\"AAPL\\\",\\\"newsComment\\\":\\\"...\\\",\\\"expertComment\\\":\\\"...\\\",\\\"summary\\\":\\\"...\\\"}]}",
    JSON.stringify(input),
  ].join("\\n\\n");
  let response; let provider = "GROQ";
  const messages = [{role:"system",content:"Temkinli ABD hisse araştırma asistanısın. Yalnızca geçerli JSON."},{role:"user",content:prompt}];
  try {
    if (process.env.GROQ_API_KEY) response = await groqAI.chat.completions.create({model:TRADING_AI_MODEL,messages,temperature:0.1,response_format:{type:"json_object"},max_tokens:1100},{timeout:12000});
    else if (process.env.GEMINI_API_KEY) { provider="GEMINI"; response=await geminiAI.chat.completions.create({model:VISION_MODEL,messages,temperature:0.1,max_tokens:1100},{timeout:12000}); }
    else { provider="MISTRAL"; response=await mistralAI.chat.completions.create({model:"mistral-small-latest",messages,temperature:0.1,max_tokens:1100},{timeout:12000}); }
    const parsed = parseTradingAiJson(response?.choices?.[0]?.message?.content);
    const reviews = normalizeAiReviews(parsed,list.map(item=>item.symbol),provider,{newsComment:160,expertComment:160,summary:180});
    return new Map(list.map(item => [item.symbol, reviews.get(item.symbol) || fallback.get(item.symbol)]));
  } catch (error) {
    console.warn("NASDAQ AI:", String(error?.message || "unavailable").slice(0, 180));
    return fallback;
  }
}

function nasdaqPaperStateForClient(state) {
  const paper = state.nasdaqPaper || createDefaultTradingState().nasdaqPaper;
  return {...paper, broker:{configured:Boolean(process.env.ALPACA_API_KEY_ID && process.env.ALPACA_API_SECRET_KEY), mode:ALPACA_TRADING_MODE.toUpperCase(), orderSubmissionEnabled:ALPACA_TRADING_ENABLED, dataFeed:ALPACA_DATA_FEED.toUpperCase()}, positions:(paper.positions || []).filter(position => position.status === "OPEN")};
}

function recalculateNasdaqPaper(paper) {
  const openValue = (paper.positions || []).filter(position => position.status === "OPEN").reduce((sum, position) => sum + Number(position.current || position.entry || 0) * Number(position.quantity || 0), 0);
  paper.equity = roundTradingValue(Number(paper.cash || 0) + openValue);
  paper.pnl = roundTradingValue(Number(paper.equity) - Number(paper.initialCapital || 0));
  paper.pnlPercent = Number(paper.initialCapital) > 0 ? roundTradingValue(Number(paper.pnl) * 100 / Number(paper.initialCapital)) : 0;
}

function normalizeNasdaqPaperOrder(input = {}, {existing = null} = {}) {
  const symbol = nasdaqSafeSymbol(input.symbol ?? existing?.symbol);
  const orderType = String(input.orderType ?? existing?.orderType ?? "MARKET").trim().toUpperCase();
  if (!["MARKET","LIMIT"].includes(orderType)) throw new Error("Emir türü PİYASA veya LİMİT olmalı.");
  const number = (value, label, required = false) => { if (value === undefined || value === null || value === "") { if (required) throw new Error(`${label} gerekli.`); return null; } const parsed=Number(value); if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} geçerli olmalı.`); return roundTradingValue(parsed); };
  const quantity = number(input.quantity ?? existing?.quantity, "Miktar", true);
  if (!Number.isInteger(quantity)) throw new Error("NASDAQ hisse miktarı tam sayı olmalı.");
  const entryPrice = orderType === "MARKET" ? null : number(input.entryPrice ?? input.price ?? existing?.entryPrice, "Limit fiyatı", true);
  const stop=number(input.stop ?? existing?.stop,"Stop"), target1=number(input.target1 ?? existing?.target1,"TP1"), target2=number(input.target2 ?? existing?.target2,"TP2"), target3=number(input.target3 ?? existing?.target3,"TP3");
  if (entryPrice !== null && stop !== null && stop >= entryPrice) throw new Error("Uzun işlemde stop girişin altında olmalı.");
  for (const [label, target] of [["TP1",target1],["TP2",target2],["TP3",target3]]) if (entryPrice !== null && target !== null && target <= entryPrice) throw new Error(`${label} girişin üzerinde olmalı.`);
  return {symbol,quantity,entryPrice,orderType,stop,target1,target2,target3,paperOnly:!ALPACA_TRADING_ENABLED};
}

function nasdaqDecisionFromInput(input, timestamp) {
  const order=normalizeNasdaqPaperOrder(input);
  return {id:`nasdaq-${Date.now()}-${order.symbol}-${crypto.randomBytes(4).toString("hex")}`,symbol:order.symbol,market:"NASDAQ",action:"BUY SETUP",status:"PENDING_APPROVAL",grade:input.grade || "NASDAQ ADAYI",timestamp,entry:{low:order.entryPrice,high:order.entryPrice,reference:order.entryPrice},stop:order.stop,target1:order.target1,target2:order.target2,target3:order.target3,fibonacci:input.fibonacci || null,indicators:{score:Number(input.score) || null},pendingOrder:{...order,source:input.source || "NASDAQ AI",createdAt:timestamp,updatedAt:timestamp}};
}

function mergeNasdaqScannerDecisions(incoming, existing, timestamp = new Date()) {
  const now = new Date(timestamp).getTime();
  const selectedSymbols = new Set((incoming || []).map(item => item.symbol));
  const retainedSymbols = new Set();
  const retained = (existing || []).filter(item => {
    if (item.status !== "PENDING") return !(item.status === "PENDING_APPROVAL" && selectedSymbols.has(item.symbol));
    const expiresAt = new Date(item.lifecycle?.expiresAt || 0).getTime();
    if (Number.isFinite(expiresAt) && expiresAt > 0 && expiresAt <= now) return false;
    if (selectedSymbols.has(item.symbol) || retainedSymbols.has(item.symbol)) return false;
    retainedSymbols.add(item.symbol);
    return true;
  });
  return [...(incoming || []), ...retained].slice(0, 100);
}

async function submitAlpacaPaperOrLiveOrder(order) {
  if (!ALPACA_TRADING_ENABLED) return {submitted:false, mode:"LOCAL_PAPER"};
  const clientOrderId = order.clientOrderId || `bci-entry-${crypto.createHash("sha256").update(String(order.decisionId || `${order.symbol}:${order.quantity}:${order.orderType}:${order.entryPrice}`)).digest("hex").slice(0,24)}`;
  const payload = buildAlpacaOrderPayload({...order, clientOrderId});
  const result = await alpacaJson(`${alpacaTradingBase(ALPACA_TRADING_MODE)}/v2/orders`, {method:"POST", body:payload});
  const brokerOrderId = String(result?.id || "").trim();
  if (!brokerOrderId) throw new Error("Alpaca emri kabul ettiğini doğrulayan order ID döndürmedi.");
  return {
    submitted:true,
    mode:ALPACA_TRADING_MODE.toUpperCase(),
    brokerOrderId,
    clientOrderId:String(result?.client_order_id || clientOrderId),
    status:String(result?.status || "submitted").toLowerCase(),
    filledQuantity:Number(result?.filled_qty || 0) || 0,
    filledAveragePrice:Number(result?.filled_avg_price || 0) || 0,
  };
}

function automationBrokerClientOrderId(market, position, monitorEvent) {
  const seed = `${String(market || "MARKET").toUpperCase()}:${String(position?.id || position?.symbol || "POSITION")}:${String(monitorEvent?.idempotencyKey || monitorEvent?.type || "EVENT")}`;
  // Binance en fazla 36 karakterlik client id kabul eder; Alpaca'da da aynı
  // kısa, tekrarlanabilir id ile restart sonrasında yeni bir exit üretmeyiz.
  return `bci-${String(market || "m").toLowerCase().slice(0, 4)}-${crypto.createHash("sha256").update(seed).digest("hex").slice(0, 24)}`;
}

function alpacaOrderIsFullyFilled(order, quantity) {
  const status = String(order?.status || "").toLowerCase();
  const filled = Number(order?.filled_qty ?? order?.filledQuantity ?? 0);
  return status === "filled" && Number.isFinite(filled) && filled + 1e-12 >= Number(quantity || 0);
}

function createAlpacaMonitorBroker() {
  return createAlpacaBroker({
    enabled: ALPACA_TRADING_ENABLED,
    submitOrder: body => alpacaJson(`${alpacaTradingBase(ALPACA_TRADING_MODE)}/v2/orders`, {method:"POST", body}),
    fetchOrder: ({orderId}) => alpacaJson(`${alpacaTradingBase(ALPACA_TRADING_MODE)}/v2/orders/${encodeURIComponent(String(orderId || ""))}`),
    cancelOrder: async ({orderId}) => {
      await alpacaJson(`${alpacaTradingBase(ALPACA_TRADING_MODE)}/v2/orders/${encodeURIComponent(String(orderId || ""))}`, {method:"DELETE"});
      return {status:"canceled", cancelled:true};
    },
  });
}

async function placeNasdaqEmergencyStop(position, timestamp = new Date().toISOString()) {
  const quantity = Number(position?.remainingQuantity ?? position?.quantity ?? 0);
  const stopPrice = Number(position?.stop);
  if (!ALPACA_TRADING_ENABLED || !position?.broker?.submitted || position.status !== "OPEN" || !Number.isInteger(quantity) || quantity <= 0 || !Number.isFinite(stopPrice) || stopPrice <= 0) return false;
  if (Number.isFinite(Number(position.entry)) && stopPrice >= Number(position.entry)) {
    position.broker = {...position.broker, protectionError:"Acil stop fiyatı gerçekleşen girişin altında değil.", protectionCheckedAt:timestamp};
    return true;
  }
  if (position.broker?.protection?.orderId) return false;
  const clientOrderId = `bci-stop-${crypto.createHash("sha256").update(`${position.id}:${quantity}:${stopPrice}`).digest("hex").slice(0,24)}`;
  const result = await createAlpacaMonitorBroker().placeProtection({symbol:position.symbol, qty:String(quantity), side:"sell", type:"stop", stop_price:String(stopPrice), time_in_force:"gtc", client_order_id:clientOrderId});
  if (!result.accepted || !result.order?.orderId) {
    position.broker = {...position.broker, protectionError:String(result.message || result.code || "Alpaca acil stop emri kabul edilmedi."), protectionCheckedAt:timestamp};
    return true;
  }
  position.broker = {...position.broker, protection:{orderId:result.order.orderId, clientOrderId:result.order.clientOrderId || clientOrderId, status:result.status, quantity, stopPrice, createdAt:timestamp}, protectionError:null, protectionCheckedAt:timestamp};
  return true;
}

async function cancelNasdaqEmergencyStop(position, timestamp = new Date().toISOString()) {
  const orderId = position?.broker?.protection?.orderId;
  if (!orderId) return true;
  const result = await createAlpacaMonitorBroker().cancelOrder({orderId});
  if (!result.cancelled) {
    position.broker = {...position.broker, protectionError:String(result.message || result.code || "Alpaca acil stop emri iptal edilemedi."), protectionCheckedAt:timestamp};
    return false;
  }
  position.broker = {...position.broker, protection:null, protectionError:null, protectionCheckedAt:timestamp};
  return true;
}

async function reconcileNasdaqEmergencyStop(paper, position, timestamp) {
  const protection = position?.broker?.protection;
  if (!protection?.orderId) return false;
  let order;
  try {
    order = await alpacaJson(`${alpacaTradingBase(ALPACA_TRADING_MODE)}/v2/orders/${encodeURIComponent(String(protection.orderId))}`);
  } catch (error) {
    const message = String(error?.message || "Alpaca acil stop emri okunamadı.");
    if (position.broker?.protectionError === message) return false;
    position.broker = {...position.broker, protectionError:message, protectionCheckedAt:timestamp};
    return true;
  }
  const status = String(order?.status || "").toLowerCase();
  const remaining = Number(position.remainingQuantity ?? position.quantity ?? 0);
  if (alpacaOrderIsFullyFilled(order, remaining)) {
    const before = {...position};
    const price = Number(order?.filled_avg_price || protection.stopPrice || position.stop || position.current || position.entry);
    const event = evaluateLongPosition(before, Math.min(price, Number(before.stop)), {quantityPrecision:0});
    if (!event || event.type !== "SL") return false;
    event.idempotencyKey = `ALPACA_STOP:${protection.orderId}`;
    return settleNasdaqMonitorEvent(paper, position, before, event, price, timestamp, {live:true, averagePrice:price});
  }
  if (["canceled", "expired", "rejected", "suspended", "stopped"].includes(status)) {
    position.broker = {...position.broker, protection:null, protectionError:`Alpaca acil stop emri ${status}; yeniden kurulacak.`, protectionCheckedAt:timestamp};
    return true;
  }
  const changed = protection.status !== status || position.broker?.protectionError;
  position.broker = {...position.broker, protection:{...protection,status}, protectionError:null, protectionCheckedAt:timestamp};
  return Boolean(changed);
}

async function resolveAlpacaMonitorExit(position) {
  const pending = position?.monitor?.pendingBrokerExit;
  if (!pending?.orderId || !pending?.event) return null;
  const order = await alpacaJson(`${alpacaTradingBase(ALPACA_TRADING_MODE)}/v2/orders/${encodeURIComponent(String(pending.orderId))}`);
  const requested = Number(pending.event.closeQuantity || 0);
  if (alpacaOrderIsFullyFilled(order, requested)) {
    return {
      confirmed:true,
      event:pending.event,
      averagePrice:Number(order?.filled_avg_price || pending.event.executionPrice || 0) || pending.event.executionPrice,
      order,
    };
  }
  const terminal = ["canceled", "expired", "rejected", "suspended", "stopped"].includes(String(order?.status || "").toLowerCase());
  return {confirmed:false, pending:!terminal, terminal, order};
}

// Canlı Alpaca kapatmaları, kullanıcı manuel kapatsa veya acil durdurma ile
// başlatsa dahi önce broker dolumunu doğrular. Bu nedenle aynı pozisyon yerel
// ekranda "kapalı" görünmeden önce filled_qty tamamen gelmiş olmalıdır.
async function submitNasdaqBrokerExit(position, quantity, {orderType = "MARKET", limitPrice = null, reason = "MANUAL"} = {}) {
  const type = String(orderType || "MARKET").toUpperCase();
  const amount = Number(quantity);
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("Satılacak NASDAQ hisse adedi geçersiz.");
  if (!position?.symbol) throw new Error("NASDAQ pozisyon sembolü bulunamadı.");
  if (!['MARKET', 'LIMIT'].includes(type)) throw new Error("NASDAQ satış emri türü PİYASA veya LİMİT olmalı.");
  if (type === "LIMIT" && (!Number.isFinite(Number(limitPrice)) || Number(limitPrice) <= 0)) {
    throw new Error("LIMIT satış için fiyat gerekli.");
  }
  const clientOrderId = automationBrokerClientOrderId("NASDAQ", position, {
    type: `MANUAL_${reason}`,
    idempotencyKey: `${reason}:${Date.now()}:${amount}:${type}:${limitPrice || ""}`,
  });
  const order = await alpacaJson(`${alpacaTradingBase(ALPACA_TRADING_MODE)}/v2/orders`, {
    method:"POST",
    body:{
      symbol:position.symbol,
      qty:String(amount),
      side:"sell",
      type:type.toLowerCase(),
      time_in_force:"day",
      ...(type === "LIMIT" ? {limit_price:String(Number(limitPrice))} : {}),
      client_order_id:clientOrderId,
    },
  });
  return {
    orderId:String(order?.id || "") || null,
    clientOrderId:String(order?.client_order_id || clientOrderId),
    status:String(order?.status || "submitted").toLowerCase(),
    filledQuantity:Number(order?.filled_qty || 0) || 0,
    averagePrice:Number(order?.filled_avg_price || 0) || null,
    confirmed:alpacaOrderIsFullyFilled(order, amount),
    raw:order,
  };
}

function settleNasdaqManualExit(paper, position, price, quantity, timestamp, {reason = "MANUAL", live = false, orderType = "MARKET"} = {}) {
  const sold = Number(quantity);
  const executionPrice = Number(price);
  if (!Number.isInteger(sold) || sold <= 0 || !Number.isFinite(executionPrice) || executionPrice <= 0) return false;
  const before = {...position};
  const realized = roundTradingValue((executionPrice - Number(before.entry || 0)) * sold);
  const type = live ? `NASDAQ_BROKER_${reason}_FILLED` : `NASDAQ_${reason}`;
  const message = `${position.symbol} NASDAQ ${reason === "KILL_SWITCH" ? "acil durdurma" : "manuel"} ${String(orderType).toUpperCase()} satış emri ${sold} hisse için $${roundTradingValue(executionPrice)} ile gerçekleşti.`;
  if (!closeMonitoredPaperPosition(paper, position, executionPrice, timestamp, type, message, sold)) return false;
  position.remainingQuantity = Math.max(0, Number(before.remainingQuantity ?? before.quantity ?? 0) - sold);
  position.realizedPnl = roundTradingValue(Number(before.realizedPnl || 0) + realized);
  position.monitor = {...(position.monitor || {}), pendingManualExit:null, lastManualExitAt:timestamp, lastManualExitPrice:executionPrice};
  if (live) position.broker = {...(position.broker || {}), lastConfirmedExitAt:timestamp, lastConfirmedExitPrice:executionPrice};
  if (position.status === "CLOSED" && Array.isArray(paper.history) && paper.history[0]?.id === position.id) {
    paper.history[0] = {...position};
  }
  return true;
}

async function resolveNasdaqPendingManualExit(position) {
  const pending = position?.monitor?.pendingManualExit;
  if (!pending?.orderId || !pending?.quantity) return null;
  const order = await alpacaJson(`${alpacaTradingBase(ALPACA_TRADING_MODE)}/v2/orders/${encodeURIComponent(String(pending.orderId))}`);
  if (alpacaOrderIsFullyFilled(order, pending.quantity)) {
    return {confirmed:true, pending, order, averagePrice:Number(order?.filled_avg_price || pending.referencePrice || 0) || pending.referencePrice};
  }
  const terminal = ["canceled", "expired", "rejected", "suspended", "stopped"].includes(String(order?.status || "").toLowerCase());
  return {confirmed:false, pending:!terminal, terminal, order};
}

// Ekrandaki NASDAQ kâğıt pozisyonlarını son tamamlanmış günlük Alpaca
// fiyatıyla işaretler. Bu işlem sadece GET cevabını günceller; GitHub state'i
// yazılmaz ve hiçbir broker emri ya da pozisyonu değiştirilmez.
async function refreshNasdaqDisplayPrices(paper) {
  const positions = Array.isArray(paper?.positions)
    ? paper.positions.filter(position => String(position?.status || "").toUpperCase() === "OPEN")
    : [];
  if (!positions.length) return;

  await Promise.all(positions.map(async position => {
    try {
      const quote = await fetchNasdaqDailyClose(position.symbol);
      const price = Number(quote?.price);
      if (!Number.isFinite(price) || price <= 0) return;
      position.current = roundTradingValue(price);
      position.lastPriceAt = quote.asOf || new Date().toISOString();
      position.priceSource = quote.source || "ALPACA_DAILY";
    } catch {
      // Bir sembolün fiyatı yoksa kayıtlı son fiyatı koru; diğer pozisyonlar
      // yine de güncellenebilsin.
    }
  }));
  recalculateNasdaqPaper(paper);
}

async function handleNasdaqState(req,res) { try { const saved=await getTradingState(); await refreshNasdaqDisplayPrices(saved.content.nasdaqPaper); return sendJSON(res,200,{nasdaqPaper:nasdaqPaperStateForClient(saved.content)}); } catch(error) { return sendJSON(res,500,{error:error.message}); } }
async function handleNasdaqQuotes(req,res) { const url=new URL(req.url,`http://${req.headers.host || "localhost"}`); const symbols=[...new Set(String(url.searchParams.get("symbols") || "").split(",").map(value=>value.trim().toUpperCase()).filter(value=>/^[A-Z]{1,8}$/.test(value)).slice(0,30))]; const quotes={}; const unavailable=[]; await Promise.all(symbols.map(async symbol=>{try { quotes[symbol]=await fetchNasdaqDailyClose(symbol); } catch { unavailable.push(symbol); }})); return sendJSON(res,200,{quotes,unavailable}); }

async function handleNasdaqRiskSettings(req,res) { try { const input=await readTradingRequest(req); const saved=await getTradingState(); const paper=saved.content.nasdaqPaper; const capital=Math.max(100,Number(input.capital)||Number(paper.initialCapital)||10000), allocation=Math.max(1,Number(input.maxPositionPercent)||Number(paper.risk?.maxPositionPercent)||20), maxPositions=Math.max(1,Math.floor(Number(input.maxPositions)||Number(paper.risk?.maxPositions)||5)); paper.cash=roundTradingValue(Number(paper.cash || 0)+capital-Number(paper.initialCapital || 0)); paper.initialCapital=capital; paper.risk={maxPositionPercent:allocation,maxPositions}; recalculateNasdaqPaper(paper); paper.activity=[{timestamp:new Date().toISOString(),type:"NASDAQ_RISK",message:"NASDAQ risk ayarları güncellendi."},...(paper.activity||[])].slice(0,100); await saveTradingState(saved.content,saved.sha,saved.container); return sendJSON(res,200,{nasdaqPaper:nasdaqPaperStateForClient(saved.content)}); } catch(error) { return sendJSON(res,400,{error:error.message}); } }

async function handleNasdaqKillSwitch(req, res) {
  try {
    const input = await readTradingRequest(req);
    const expectedPassword = String(process.env.KILL_SWITCH_PASSWORD || "");
    if (!expectedPassword) throw new Error("KILL_SWITCH_PASSWORD Render ortamında ayarlı değil.");
    if (String(input.password || "") !== expectedPassword) throw new Error("Acil durdurma şifresi yanlış.");

    const saved = await getTradingState();
    const paper = saved.content.nasdaqPaper;
    const timestamp = new Date().toISOString();
    const activate = input.action === "activate";
    paper.killSwitch = {active: activate, activatedAt: activate ? timestamp : null};

    let closed = 0;
    let brokerPending = 0;
    let brokerFailed = 0;
    if (activate) {
      const liveBroker = createAlpacaMonitorBroker();
      for (const position of paper.positions || []) {
        if (position.status === "PENDING_BROKER_ENTRY" && position.broker?.brokerOrderId && ALPACA_TRADING_ENABLED) {
          const cancelled = await liveBroker.cancelOrder({orderId:position.broker.brokerOrderId});
          if (cancelled.cancelled) {
            position.status = "BROKER_ENTRY_CANCELLED";
            position.closedAt = timestamp;
            const decision = (paper.decisions || []).find(item => item.id === position.decisionId);
            if (decision) { decision.status = "CANCELLED"; decision.closedAt = timestamp; paper.history = [{...decision}, ...(paper.history || [])].slice(0,100); }
          } else brokerFailed += 1;
          continue;
        }
        if (position.status !== "OPEN") continue;
        const quantity = Number(position.remainingQuantity ?? position.quantity ?? 0);
        const brokerBacked = Boolean(ALPACA_TRADING_ENABLED && position.broker?.submitted);
        if (brokerBacked) {
          try {
            if (!await cancelNasdaqEmergencyStop(position, timestamp)) {
              brokerFailed += 1;
              continue;
            }
            const result = await submitNasdaqBrokerExit(position, quantity, {reason:"KILL_SWITCH"});
            if (result.confirmed) {
              closed += settleNasdaqManualExit(paper, position, result.averagePrice || Number(position.current) || Number(position.entry), quantity, timestamp, {reason:"KILL_SWITCH", live:true}) ? 1 : 0;
            } else if (result.orderId) {
              position.monitor = {...(position.monitor || {}), pendingManualExit:{orderId:result.orderId, quantity, reason:"KILL_SWITCH", submittedAt:timestamp, referencePrice:Number(position.current) || Number(position.entry)} };
              brokerPending += 1;
            } else {
              await placeNasdaqEmergencyStop(position, timestamp);
              brokerFailed += 1;
            }
          } catch (error) {
            await placeNasdaqEmergencyStop(position, timestamp).catch(() => undefined);
            position.monitor = {...(position.monitor || {}), lastBrokerError:String(error?.message || "Alpaca acil satış emri gönderilemedi.")};
            brokerFailed += 1;
          }
          continue;
        }
        let closePrice = Number(position.current) || Number(position.entry);
        try {
          const quote = await fetchNasdaqMonitorPrice(position.symbol);
          if (Number.isFinite(Number(quote?.price)) && Number(quote.price) > 0) closePrice = Number(quote.price);
        } catch {}
        closed += settleNasdaqManualExit(paper, position, closePrice, quantity, timestamp, {reason:"KILL_SWITCH"}) ? 1 : 0;
      }
      (paper.decisions || []).forEach(decision => {
        if (["PENDING_APPROVAL", "PENDING_LIMIT"].includes(decision.status)) {
          decision.status = "CANCELLED";
          decision.closedAt = timestamp;
          paper.history = [{...decision}, ...(paper.history || [])].slice(0, 100);
        }
      });
      recalculateNasdaqPaper(paper);
    }

    const message = activate
      ? `NASDAQ ACİL DURDURMA: ${closed} pozisyon broker/kağıt dolumuyla kapatıldı; ${brokerPending} broker satışı teyit bekliyor, ${brokerFailed} işlem doğrulanamadı. Yalnız NASDAQ bekleyen emirleri iptal edildi.`
      : "NASDAQ acil durdurma kapatıldı; yalnız NASDAQ yeni emirleri yeniden açılabilir.";
    paper.activity = [{timestamp, type:"NASDAQ_KILL_SWITCH", message}, ...(paper.activity || [])].slice(0, 100);
    await saveTradingState(saved.content, saved.sha, saved.container);
    void sendTelegramNotification(`${activate ? "🛑" : "🟢"} BORSACI ${message}`);
    return sendJSON(res, 200, {nasdaqPaper:nasdaqPaperStateForClient(saved.content)});
  } catch (error) {
    console.error("NASDAQ KILL SWITCH ERROR:", error.message);
    return sendJSON(res, 400, {error:error.message});
  }
}

async function handleNasdaqPaperQueue(req,res) {
  try {
    const input = await readTradingRequest(req);
    const saved = await getTradingState();
    const paper = saved.content.nasdaqPaper;
    if (paper.killSwitch?.active) throw new Error("NASDAQ acil durdurma aktif; bu sayfada yeni emir oluşturulamaz.");

    const timestamp = new Date().toISOString();
    const candidate = nasdaqDecisionFromInput(input, timestamp);
    const manual = String(candidate.pendingOrder.source).toUpperCase() === "MANUAL";
    const isSameQueue = item => (String(item.pendingOrder?.source || "").toUpperCase() === "MANUAL") === manual;

    // Her panel tek bir taslak emir gösterir. Yeni plan aynı paneldeki eski
    // PENDING_APPROVAL kaydını tamamen değiştirir; onay/red geçmişi korunur.
    paper.decisions = [
      candidate,
      ...(paper.decisions || []).filter(item => !["PENDING_APPROVAL", "PENDING_LIMIT"].includes(item.status) || !isSameQueue(item)),
    ].slice(0, 100);
    paper.activity = [{timestamp, type:"NASDAQ_PENDING", message:`${candidate.symbol} NASDAQ emri onay bekliyor.`}, ...(paper.activity || [])].slice(0,100);
    await saveTradingState(saved.content, saved.sha, saved.container);
    return sendJSON(res, 201, {nasdaqPaper:nasdaqPaperStateForClient(saved.content)});
  } catch(error) {
    return sendJSON(res,400,{error:error.message});
  }
}

async function handleNasdaqPaperUpdate(req,res) { try { const input=await readTradingRequest(req), saved=await getTradingState(), paper=saved.content.nasdaqPaper, decision=(paper.decisions||[]).find(item=>item.id===String(input.decisionId||"")&&item.status==="PENDING_APPROVAL"); if(!decision) throw new Error("Bu NASDAQ emri artık düzenlenemez."); const order=normalizeNasdaqPaperOrder({...input,symbol:decision.symbol},{existing:decision.pendingOrder}); decision.pendingOrder={...decision.pendingOrder,...order,updatedAt:new Date().toISOString(),editedAt:new Date().toISOString()}; decision.entry={low:order.entryPrice,high:order.entryPrice,reference:order.entryPrice}; decision.stop=order.stop;decision.target1=order.target1;decision.target2=order.target2;decision.target3=order.target3; await saveTradingState(saved.content,saved.sha,saved.container); return sendJSON(res,200,{nasdaqPaper:nasdaqPaperStateForClient(saved.content)}); }catch(error){return sendJSON(res,400,{error:error.message});} }

async function handleNasdaqPaperApprove(req, res) {
  try {
    const input = await readTradingRequest(req);
    const saved = await getTradingState();
    const paper = saved.content.nasdaqPaper;
    if (paper.killSwitch?.active) throw new Error("NASDAQ acil durdurma aktif; bu sayfada emir onaylanamaz.");
    const decision = (paper.decisions || []).find(item => item.id === String(input.decisionId || "") && item.status === "PENDING_APPROVAL");
    if (!decision) throw new Error("Bu NASDAQ emri artık onay beklemiyor.");
    // Onay aşamasında değiştirilebilir taslağı yeniden normalize et. Broker'a
    // yalnız daha önce kaydedilmiş ve güncel kurallardan tekrar geçmiş emir
    // gönderilir; ham/eski state alanlarına doğrudan güvenilmez.
    const order = normalizeNasdaqPaperOrder(
      {...decision.pendingOrder, symbol:decision.symbol},
      {existing:decision.pendingOrder}
    );
    decision.pendingOrder = {...decision.pendingOrder, ...order};
    const quote = await fetchNasdaqDailyClose(order.symbol);
    const marketPrice = Number(quote.price);
    const timestamp = new Date().toISOString();
    if (!ALPACA_TRADING_ENABLED && order.orderType === "LIMIT" && marketPrice > Number(order.entryPrice)) {
      decision.status = "PENDING_LIMIT";
      decision.pendingOrder = {...order, status:"PENDING_LIMIT", lastMarketPrice:marketPrice, updatedAt:timestamp};
      decision.lifecycle = {...(decision.lifecycle || {}), stage:"PENDING_LIMIT", lastCheckedAt:timestamp, lastMarketPrice:marketPrice};
      paper.activity = [{timestamp, type:"NASDAQ_LIMIT_PENDING", message:`${order.symbol} limit alış emri $${Number(order.entryPrice).toFixed(2)} seviyesinde izleniyor.`}, ...(paper.activity || [])].slice(0,100);
      await saveTradingState(saved.content, saved.sha, saved.container);
      return sendJSON(res,200,{nasdaqPaper:nasdaqPaperStateForClient(saved.content)});
    }
    const entry = order.orderType === "MARKET" ? marketPrice : Number(order.entryPrice);
    if (order.stop !== null && Number(order.stop) >= entry) throw new Error("Stop gerçekleşen girişin altında olmalı.");
    const plannedCost = roundTradingValue(entry * Number(order.quantity));
    const reservedCash = (paper.positions || []).filter(item => item.status === "PENDING_BROKER_ENTRY").reduce((sum, item) => sum + Number(item.plannedEntry || 0) * Number(item.quantity || 0), 0);
    if (plannedCost > Number(paper.cash) - reservedCash) throw new Error("NASDAQ kullanılabilir bakiyesi bu emir için yeterli değil.");
    const existingPosition = (paper.positions || []).find(item => ["OPEN", "PENDING_BROKER_ENTRY"].includes(item.status) && item.symbol === order.symbol);
    if (existingPosition) throw new Error(`${order.symbol} için açık veya broker teyidi bekleyen NASDAQ pozisyonu zaten var.`);
    const occupiedSlots = (paper.positions || []).filter(item => ["OPEN", "PENDING_BROKER_ENTRY"].includes(item.status)).length;
    const maxPositions = Number(paper.risk?.maxPositions) || 5;
    if (!existingPosition && occupiedSlots >= maxPositions) throw new Error(`En fazla ${maxPositions} açık veya broker teyidi bekleyen NASDAQ pozisyonu olabilir.`);
    const broker = await submitAlpacaPaperOrLiveOrder({...order, entryPrice:entry, decisionId:decision.id});
    const liveBrokerOrder = Boolean(broker.submitted);
    const brokerFilled = liveBrokerOrder && String(broker.status || "").toLowerCase() === "filled" && Number(broker.filledQuantity || 0) + 1e-12 >= Number(order.quantity);

    // Canlı/paper Alpaca hesabında accepted/new yanıtı gerçek fill değildir.
    // Yerel portföyü açık pozisyon gibi göstermeden önce broker tarafında
    // `filled` doğrulamasını bekleriz; 60 sn monitör bu kaydı daha sonra açar.
    if (liveBrokerOrder && !brokerFilled) {
      const pendingPosition = {
        id:`nasdaq-broker-entry-${Date.now()}-${order.symbol}`,
        decisionId:decision.id,
        symbol:order.symbol,
        market:"NASDAQ",
        status:"PENDING_BROKER_ENTRY",
        quantity:Number(order.quantity),
        remainingQuantity:Number(order.quantity),
        plannedEntry:entry,
        current:marketPrice,
        stop:order.stop,
        target1:order.target1,
        target2:order.target2,
        target3:order.target3,
        openedAt:timestamp,
        broker:{...broker, submitted:true},
      };
      paper.positions = [pendingPosition, ...(paper.positions || [])];
      decision.status = "PENDING_BROKER_ENTRY";
      decision.lifecycle = {...(decision.lifecycle || {}), stage:"PENDING_BROKER_ENTRY", brokerOrderId:broker.brokerOrderId, lastCheckedAt:timestamp};
      paper.activity = [{timestamp, type:"NASDAQ_BROKER_ENTRY_PENDING", message:`${order.symbol} Alpaca emri gönderildi; broker fill doğrulaması bekleniyor.`}, ...(paper.activity || [])].slice(0,100);
      await saveTradingState(saved.content,saved.sha,saved.container);
      return sendJSON(res,202,{nasdaqPaper:nasdaqPaperStateForClient(saved.content)});
    }

    const executedQuantity = brokerFilled ? Number(broker.filledQuantity) : Number(order.quantity);
    const executedEntry = brokerFilled && Number(broker.filledAveragePrice) > 0 ? Number(broker.filledAveragePrice) : entry;
    const cost = roundTradingValue(executedEntry * executedQuantity);
    let position = (paper.positions || []).find(item => item.status === "OPEN" && item.symbol === order.symbol);
    if (position) {
      const total = Number(position.quantity) + executedQuantity;
      position.entry = roundTradingValue((Number(position.entry) * Number(position.quantity) + executedEntry * executedQuantity) / total);
      position.quantity = total; position.remainingQuantity = total; position.current = marketPrice;
    } else {
      position = {id:`nasdaq-pos-${Date.now()}-${order.symbol}`,decisionId:decision.id,symbol:order.symbol,market:"NASDAQ",status:"OPEN",quantity:executedQuantity,remainingQuantity:executedQuantity,originalQuantity:executedQuantity,entry:executedEntry,current:marketPrice,stop:order.stop,target1:order.target1,target2:order.target2,target3:order.target3,openedAt:timestamp,broker};
      paper.positions = [position, ...(paper.positions || [])];
    }
    paper.cash = roundTradingValue(Number(paper.cash) - cost);
    decision.status = "OPEN";
    if (brokerFilled) await placeNasdaqEmergencyStop(position, timestamp);
    paper.activity = [{timestamp, type:"NASDAQ_OPEN", message:`${order.symbol} NASDAQ ${broker.mode} pozisyonu açıldı.`}, ...(paper.activity || [])].slice(0,100);
    recalculateNasdaqPaper(paper);
    await saveTradingState(saved.content,saved.sha,saved.container);
    return sendJSON(res,200,{nasdaqPaper:nasdaqPaperStateForClient(saved.content)});
  } catch(error) { return sendJSON(res,400,{error:error.message}); }
}

async function handleNasdaqPaperReject(req,res) {
  try {
    const input=await readTradingRequest(req),saved=await getTradingState(),paper=saved.content.nasdaqPaper;
    const decision=(paper.decisions||[]).find(item=>item.id===String(input.decisionId||"")&&["PENDING_APPROVAL","PENDING_LIMIT"].includes(item.status));
    if(!decision)throw new Error("Bu NASDAQ emri artık beklemiyor.");
    decision.status="REJECTED";decision.closedAt=new Date().toISOString();
    paper.history=[decision,...(paper.history||[])].slice(0,100);
    paper.activity=[{timestamp:decision.closedAt,type:"NASDAQ_REJECT",message:`${decision.symbol} NASDAQ emri reddedildi.`},...(paper.activity||[])].slice(0,100);
    await saveTradingState(saved.content,saved.sha,saved.container);
    return sendJSON(res,200,{nasdaqPaper:nasdaqPaperStateForClient(saved.content)});
  }catch(error){return sendJSON(res,400,{error:error.message});}
}

async function handleNasdaqPaperClose(req, res) {
  try {
    const input = await readTradingRequest(req);
    const saved = await getTradingState();
    const paper = saved.content.nasdaqPaper;
    const position = (paper.positions || []).find(item => item.status === "OPEN" && item.id === String(input.positionId || ""));
    if (!position) throw new Error("Açık NASDAQ pozisyon bulunamadı.");

    const quantity = Number(input.quantity ?? position.remainingQuantity ?? position.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > Number(position.remainingQuantity ?? position.quantity ?? 0)) {
      throw new Error("Satılacak hisse adedi geçersiz.");
    }
    const orderType = String(input.orderType || "MARKET").toUpperCase();
    const limitPrice = Number(input.limitPrice);
    if (!['MARKET', 'LIMIT'].includes(orderType)) throw new Error("Emir türü PİYASA veya LİMİT olmalı.");
    if (orderType === "LIMIT" && (!Number.isFinite(limitPrice) || limitPrice <= 0)) throw new Error("LIMIT satış için fiyat gerekli.");

    const quote = await fetchNasdaqMonitorPrice(position.symbol);
    const marketPrice = Number(quote?.price);
    if (!Number.isFinite(marketPrice) || marketPrice <= 0) throw new Error("NASDAQ güncel takip fiyatı alınamadı.");
    const brokerBacked = Boolean(ALPACA_TRADING_ENABLED && position.broker?.submitted);
    const timestamp = new Date().toISOString();

    if (brokerBacked) {
      if (position.monitor?.pendingManualExit || position.monitor?.pendingBrokerExit) {
        throw new Error("Bu NASDAQ pozisyonu için broker satış teyidi zaten bekleniyor.");
      }
      if (!await cancelNasdaqEmergencyStop(position, timestamp)) throw new Error("Alpaca acil stop emri iptal edilmeden satış gönderilemez.");
      let broker;
      try {
        broker = await submitNasdaqBrokerExit(position, quantity, {orderType, limitPrice, reason:"MANUAL"});
      } catch (error) {
        await placeNasdaqEmergencyStop(position, timestamp);
        throw error;
      }
      if (broker.confirmed) {
        settleNasdaqManualExit(paper, position, broker.averagePrice || marketPrice, quantity, timestamp, {reason:"MANUAL", live:true, orderType});
        if (position.status === "OPEN") await placeNasdaqEmergencyStop(position, timestamp);
        recalculateNasdaqPaper(paper);
        await saveTradingState(saved.content, saved.sha, saved.container);
        return sendJSON(res, 200, {nasdaqPaper:nasdaqPaperStateForClient(saved.content), broker:{confirmed:true}});
      }
      if (!broker.orderId) {
        await placeNasdaqEmergencyStop(position, timestamp);
        throw new Error("Alpaca satış emri broker tarafından kabul edilmedi.");
      }
      position.monitor = {...(position.monitor || {}), pendingManualExit:{orderId:broker.orderId, quantity, reason:"MANUAL", orderType, submittedAt:timestamp, referencePrice:marketPrice}};
      paper.activity = [{timestamp, type:"NASDAQ_BROKER_MANUAL_PENDING", message:`${position.symbol} Alpaca ${orderType} satış emri gönderildi; broker dolum teyidi bekleniyor.`}, ...(paper.activity || [])].slice(0,100);
      await saveTradingState(saved.content, saved.sha, saved.container);
      return sendJSON(res, 202, {nasdaqPaper:nasdaqPaperStateForClient(saved.content), broker:{confirmed:false, orderId:broker.orderId}});
    }

    if (orderType === "LIMIT" && marketPrice < limitPrice) {
      throw new Error(`${position.symbol} limit satış bekliyor: güncel takip fiyatı $${marketPrice}, limit $${limitPrice}.`);
    }
    const price = orderType === "LIMIT" ? Math.max(marketPrice, limitPrice) : marketPrice;
    settleNasdaqManualExit(paper, position, price, quantity, timestamp, {reason:"MANUAL", orderType});
    recalculateNasdaqPaper(paper);
    await saveTradingState(saved.content, saved.sha, saved.container);
    return sendJSON(res, 200, {nasdaqPaper:nasdaqPaperStateForClient(saved.content), broker:{confirmed:false, mode:"LOCAL_PAPER"}});
  } catch (error) {
    return sendJSON(res, 400, {error:error.message});
  }
}

async function handleNasdaqScanner(req,res) {
  if (!acquireScannerExecution("NASDAQ")) {
    return sendJSON(res, 409, {success:false, error:"NASDAQ taraması zaten çalışıyor. Mevcut taramanın tamamlanmasını bekleyin."});
  }
  const url=new URL(req.url,`http://${req.headers.host||"localhost"}`);const jobId=String(url.searchParams.get("jobId")||"").replace(/[^a-zA-Z0-9_-]/g,"").slice(0,80);
  try {
    updateScannerJob(jobId,2,"Alpaca'dan aktif NASDAQ evreni ve günlük likidite alınıyor");
    const nasdaqUniverse=await fetchNasdaqUniverse();
    const symbols=nasdaqUniverse.symbols;
    updateScannerJob(jobId,8,`${nasdaqUniverse.totalAssets} aktif hisseden likiditeye göre seçilen ${symbols.length} NASDAQ hissesi için iki aylık günlük OHLCV alınıyor`);
    // Likidite ön filtresinden geçen 50 sembolün iki aylık mumları işlenir.
    // Her partide yalnız teknik olarak ilk 12 aday bellekte tutulur; sonuç
    // yine ilk 5'tir.
    const shortlist=[];let successful=0;let feedUsed=ALPACA_DATA_FEED;
    const compareNasdaqCandidate=(left,right)=>Number(right.score||0)-Number(left.score||0)||left.symbol.localeCompare(right.symbol,"en");
    for(let index=0;index<symbols.length;index+=20){const group=symbols.slice(index,index+20);const batch=await fetchNasdaqBarsWithFallback(group);feedUsed=batch.feed;for(const symbol of group){const history=batch.barsBySymbol.get(symbol)||[];const validation=fibonacciEngine.validateDaily(history,{minDailyBars:40});if(validation.ok){successful+=1;const baseFib={valid:false,status:"NO_VALID_STRUCTURE",riskRewardTp2:null,riskRewardTp3:null,volumeConfirmation:"WEAK"};shortlist.push({symbol,history,validation,dataStatus:"OK",...fibonacciEngine.score(history,baseFib),fibonacci:baseFib});shortlist.sort(compareNasdaqCandidate);if(shortlist.length>12)shortlist.length=12;}}updateScannerJob(jobId,10+Math.round(62*Math.min(index+group.length,symbols.length)/symbols.length),`${Math.min(index+group.length,symbols.length)}/${symbols.length} NASDAQ hissesi işlendi`);}
    const valid=shortlist.sort(compareNasdaqCandidate);updateScannerJob(jobId,75,"Teknik kısa listede Fibonacci hesaplanıyor");const ranked=fibonacciEngine.rankCandidatesWithFibonacci(valid,Date.now(),{market:"NASDAQ"},{limit:5,shortlistLimit:12}).map(item=>({...item,price:item.features.price,ema20:item.features.ema20,ema50:item.features.ema50,ema200:item.features.ema200,rsi:item.features.rsi,macd:item.features.macd,atr:item.features.atr,volumeRatio:item.features.volumeRatio,turnover:item.features.turnover}));
    updateScannerJob(jobId,86,"İlk 3 aday için doğrulanmış haber başlıkları değerlendiriliyor");const ai=await evaluateNasdaqCandidatesWithAi(ranked.slice(0,3));const enriched=ranked.map(item=>({...item,aiReview:ai.get(item.symbol)||{available:false,provider:"UNAVAILABLE",summary:"Doğrulanmış haber başlığı alınamadı."}}));const saved=await getTradingState(),paper=saved.content.nasdaqPaper,timestamp=new Date().toISOString(),activePositionSymbols=new Set((paper.positions||[]).filter(item=>["OPEN","PENDING_BROKER_ENTRY"].includes(item.status)).map(item=>item.symbol)),decisions=createAiDecisions(enriched,{...paper.risk,capital:paper.initialCapital}).filter(item=>!activePositionSymbols.has(item.symbol));const signals=enriched.map(item=>({id:`nasdaq-signal-${timestamp}-${item.symbol}`,symbol:item.symbol,timestamp,score:Number(item.score||0),grade:item.grade||"KARAR",status:item.fibonacci?.status||"NO_VALID_STRUCTURE",price:item.price,fibonacci:item.fibonacci||null,fallbackPlan:item.fallbackPlan||null}));const existing=new Set((paper.signals||[]).map(item=>`${item.symbol}:${String(item.timestamp||"").slice(0,10)}`));paper.signals=[...signals.filter(item=>!existing.has(`${item.symbol}:${timestamp.slice(0,10)}`)),...(paper.signals||[])].slice(0,200);paper.scanner={timestamp,scanned:symbols.length,successful,results:enriched.map(item=>{const {history,...rest}=item;return rest;}),source:`ALPACA_${String(feedUsed).toUpperCase()}_1DAY`};paper.decisions=mergeNasdaqScannerDecisions(decisions,paper.decisions.filter(item=>!activePositionSymbols.has(item.symbol)),timestamp);paper.activity=[{timestamp,type:"NASDAQ_SCAN",message:`${symbols.length} NASDAQ hissesi tarandı; ${enriched.length} aday kaydedildi (${String(feedUsed).toUpperCase()} günlük veri).`},...(paper.activity||[])].slice(0,100);await saveTradingState(saved.content,saved.sha,saved.container);updateScannerJob(jobId,100,"NASDAQ taraması tamamlandı","COMPLETE");return sendJSON(res,200,{success:true,timestamp,scanned:symbols.length,successful,results:enriched,decisions,paper:nasdaqPaperStateForClient(saved.content),nasdaqPaper:nasdaqPaperStateForClient(saved.content),source:`ALPACA_${String(feedUsed).toUpperCase()}_1DAY`});
  } catch(error) {updateScannerJob(jobId,100,`NASDAQ tarama hatası: ${error.message}`,"ERROR");console.error("NASDAQ SCANNER:",String(error.message||"error").slice(0,240));return sendJSON(res,500,{success:false,error:error.message});}
  finally { releaseScannerExecution("NASDAQ"); }
}

/* ========================================================
   UNIFIED AUTOMATION: HOURLY SCANNER + POSITION MONITOR
   ======================================================== */

// Dahili scheduler HTTP katmanini atlar; yine de mevcut scanner handler'larini
// yeniden kullanmak icin onlarin JSON cevabini küçük bir bellek ici response
// ile toplar. Bu istek tarayicidan gelmez ve oturum/auth katmanini atlayan
// yeni bir dis endpoint olusturmaz.
function invokeAutomationHandler(handler, pathname) {
  return new Promise((resolve, reject) => {
    let statusCode = 200;
    let settled = false;
    const finish = body => {
      if (settled) return;
      settled = true;
      let payload = body;
      try { payload = typeof body === "string" ? JSON.parse(body) : body; } catch { /* plain response */ }
      resolve({statusCode, payload});
    };
    const syntheticReq = {method:"GET", url:pathname, headers:{host:"localhost"}};
    const syntheticRes = {
      writeHead(code) { statusCode = Number(code) || 500; },
      end: finish,
      setHeader() {},
    };
    Promise.resolve(handler(syntheticReq, syntheticRes)).then(result => {
      if (!settled && result !== undefined) finish(result);
    }).catch(reject);
  });
}

function automationSessionKey(timestamp = new Date()) {
  const value = timestamp instanceof Date ? timestamp : new Date(timestamp);
  return Number.isNaN(value.getTime()) ? new Date().toISOString().slice(0, 13) : value.toISOString().slice(0, 13);
}

function compactAutomationCandidate(item = {}) {
  const score = Number(item.score ?? item.technicalScore);
  const fibonacci = item.fibonacci || null;
  const action = String(
    item.action || item.decision || item.grade ||
    scannerAction({active:fibonacci?.status === "ACTIVE", score: Number.isFinite(score) ? score : 0})
  ).trim();
  return {
    symbol: String(item.symbol || "").trim().toUpperCase(),
    score: Number.isFinite(score) ? score : null,
    grade: String(item.grade || item.decision || "").trim(),
    action,
    fibonacciStatus: fibonacci?.status || item.status || null,
    planStatus: item.planStatus || null,
  };
}

function buildAutomationSnapshot(market, payload = {}, timestamp = new Date()) {
  const rows = Array.isArray(payload.results) ? payload.results : [];
  const topCandidates = rows.map(compactAutomationCandidate).filter(item => item.symbol).slice(0, 5);
  return {
    market,
    timestamp: (timestamp instanceof Date ? timestamp : new Date(timestamp)).toISOString(),
    sessionKey: automationSessionKey(timestamp),
    scanned: Number(payload.scanned || 0),
    successful: Number(payload.successful || 0),
    topCandidates,
  };
}

function automationBucket(state, market) {
  state.automation = state.automation || {};
  state.automation.scanner = state.automation.scanner || {};
  state.automation.scanner[market] = state.automation.scanner[market] || {
    snapshot:null, lastSuccessAt:null, lastError:null, lastErrorAt:null,
  };
  return state.automation.scanner[market];
}

async function invokeMarketScanner(market) {
  if (market === "BIST") {
    return invokeAutomationHandler(handleTradingScanner, "/api/trading/scanner?automation=1");
  }
  if (market === "NASDAQ") {
    return invokeAutomationHandler(handleNasdaqScanner, "/api/nasdaq/scanner?automation=1");
  }
  if (market === "CRYPTO") {
    if (!cryptoRuntimeBridge?.runScanner) throw new Error("Kripto çalışma köprüsü henüz hazır değil.");
    return cryptoRuntimeBridge.runScanner();
  }
  throw new Error("Bilinmeyen piyasa otomasyonu.");
}

async function runAutomatedMarketScanner(market, {timestamp = new Date()} = {}) {
  const normalized = String(market || "").toUpperCase();
  const runtime = automationRuntimeStatus.scanner[normalized];
  if (!runtime) throw new Error("Bilinmeyen market scanner.");
  runtime.running = true;
  runtime.lastRunAt = new Date(timestamp).toISOString();

  try {
    const result = await withTradingStateMutation(`scanner:${normalized}`, async () => {
      const response = await invokeMarketScanner(normalized);
      if (response.statusCode >= 400 || !response.payload?.success) {
        throw new Error(String(response.payload?.error || `${normalized} taraması tamamlanamadı.`));
      }

      const stateResult = await getTradingState();
      const state = stateResult.content;
      const bucket = automationBucket(state, normalized);
      const previous = bucket.snapshot || null;
      const snapshot = buildAutomationSnapshot(normalized, response.payload, timestamp);
      const delta = previous ? compareScannerSnapshots(previous, snapshot, {scoreDeltaThreshold:5}) : null;
      const recovered = Boolean(bucket.lastError);

      bucket.snapshot = snapshot;
      bucket.lastSuccessAt = new Date().toISOString();
      bucket.lastError = null;
      bucket.lastErrorAt = null;
      await saveTradingState(state, stateResult.sha, stateResult.container);

      // Ilk otomatik calisma sadece baseline kaydidir; Telegram ancak sonraki
      // anlamli degisiklikte suskunluktan cikar.
      if (delta?.hasMeaningfulChanges) {
        const message = formatScannerDeltaTelegram(delta, {market:normalized, timestamp});
        if (message) void sendTelegramNotification(message);
      }
      if (recovered) {
        void sendTelegramNotification(`✅ BORSACI · ${normalized} SCANNER\nTarama yeniden sağlıklı çalıştı.`);
      }
      return {snapshot, delta, recovered, payload:response.payload};
    });

    runtime.lastSuccessAt = new Date().toISOString();
    runtime.lastError = null;
    runtime.lastErrorAt = null;
    return result;
  } catch (error) {
    const detail = String(error?.message || "Tarama hatası").slice(0, 500);
    runtime.lastError = detail;
    runtime.lastErrorAt = new Date().toISOString();
    await withTradingStateMutation(`scanner-error:${normalized}`, async () => {
      const stateResult = await getTradingState();
      const bucket = automationBucket(stateResult.content, normalized);
      bucket.lastError = detail;
      bucket.lastErrorAt = new Date().toISOString();
      await saveTradingState(stateResult.content, stateResult.sha, stateResult.container);
    }).catch(saveError => console.error(`AUTOMATION ${normalized} ERROR STATE:`, saveError.message));
    throw error;
  } finally {
    runtime.running = false;
  }
}

const marketScheduler = createMarketScheduler({
  runMarket: (market, options) => runAutomatedMarketScanner(market, options),
  onResult: result => {
    const source = result.market;
    const target = automationRuntimeStatus.scanner[source];
    if (!target) return;
    const status = marketScheduler.getStatus()[source];
    Object.assign(target, status);
  },
});

function monitorActivityRows(state, since) {
  const after = new Date(since).getTime();
  const sources = [
    ["BIST", state?.activity || []],
    ["CRYPTO", state?.cryptoPaper?.activity || []],
    ["NASDAQ", state?.nasdaqPaper?.activity || []],
    ["CRYPTO", state?.cryptoLive?.activity || []],
  ];
  const accepted = /(^|_)(TP1|TP2|STOP|SL)(_|$)/;
  return sources.flatMap(([market, rows]) => (Array.isArray(rows) ? rows : [])
    .filter(item => accepted.test(String(item?.type || "").toUpperCase()))
    .filter(item => new Date(item?.timestamp || 0).getTime() >= after)
    .map(item => ({market, ...item})));
}

function monitoringTelegramMessage(event) {
  const type = String(event.type || "EVENT").replace(/^.*_(TP1|TP2|STOP|SL).*$/, "$1");
  const label = type === "STOP" || type === "SL" ? "SL" : type;
  const symbol = String(event.symbol || event.message || "POZİSYON").split(/\s+/)[0];
  return `🎯 BORSACI · ${event.market} ${label}\n${symbol}\n${String(event.message || "Pozisyon olayı doğrulandı.").slice(0, 500)}`;
}

async function persistMonitorNotificationKeys(rows) {
  if (!rows.length) return [];
  return withTradingStateMutation("monitor-events", async () => {
    const stateResult = await getTradingState();
    const state = stateResult.content;
    state.automation = state.automation || {};
    state.automation.monitor = state.automation.monitor || {events:[]};
    const existing = new Set((state.automation.monitor.events || []).map(item => item.key));
    const fresh = rows.filter(row => {
      const key = `${row.market}:${row.type}:${row.timestamp}:${row.message}`;
      row.key = key;
      return !existing.has(key);
    });
    if (!fresh.length) return [];
    state.automation.monitor.events = [
      ...fresh.map(row => ({key:row.key, market:row.market, type:row.type, timestamp:row.timestamp})),
      ...(state.automation.monitor.events || []),
    ].slice(0, 300);
    state.automation.monitor.lastSuccessAt = new Date().toISOString();
    state.automation.monitor.lastError = null;
    state.automation.monitor.lastErrorAt = null;
    await saveTradingState(state, stateResult.sha, stateResult.container);
    return fresh;
  });
}

async function runUnifiedPositionMonitor() {
  if (unifiedPositionMonitorRunning) return {skipped:true, reason:"IN_FLIGHT"};
  // Tarama sırasında GitHub state yazısı scanner'a aittir. Monitor bir
  // dakika sonra tekrar çalışır; burada atlamak, uzun tarama sonunda 409
  // yüzünden tüm scanner'ın hata vermesini önler.
  if (activeScannerMarkets.size > 0) {
    return {skipped:true, reason:"SCANNER_ACTIVE", markets:[...activeScannerMarkets]};
  }
  unifiedPositionMonitorRunning = true;
  const startedAt = new Date().toISOString();
  const runtime = automationRuntimeStatus.monitor;
  runtime.running = true;
  runtime.lastStartedAt = startedAt;
  runtime.lastError = null;

  try {
    await withTradingStateMutation("position-monitor", async () => {
      // BIST monitor only uses the latest price for already-open exposure;
      // its scanner continues to use completed daily bars exclusively.
      await runPaperMonitor();
      // Crypto/NASDAQ implementations live in the HTTP callback scope. The
      // bridge lets them share the same in-flight lock without exporting API
      // keys or adding an unauthenticated route.
      if (cryptoRuntimeBridge?.runMarketPaperMonitors) {
        await cryptoRuntimeBridge.runMarketPaperMonitors();
      }
    });

    const stateResult = await getTradingState();
    const newEvents = monitorActivityRows(stateResult.content, startedAt);
    const deliveredEvents = [];
    const existingKeys = new Set((stateResult.content.automation?.monitor?.events || []).map(item => item.key));
    for (const event of newEvents) {
      event.key = `${event.market}:${event.type}:${event.timestamp}:${event.message}`;
      if (existingKeys.has(event.key)) continue;
      if (await sendTelegramNotification(monitoringTelegramMessage(event), null, {queueOnFailure:false})) deliveredEvents.push(event);
    }
    const freshEvents = await persistMonitorNotificationKeys(deliveredEvents);

    runtime.lastSuccessAt = new Date().toISOString();
    runtime.lastFinishedAt = new Date().toISOString();
    runtime.nextRunAt = new Date(Date.now() + PAPER_MONITOR_INTERVAL_MS).toISOString();
    return {changed:freshEvents.length > 0, events:freshEvents.length};
  } catch (error) {
    const detail = String(error?.message || "Pozisyon izleme hatası").slice(0, 500);
    runtime.lastError = detail;
    runtime.lastErrorAt = new Date().toISOString();
    runtime.lastFinishedAt = new Date().toISOString();
    await withTradingStateMutation("monitor-error", async () => {
      const stateResult = await getTradingState();
      stateResult.content.automation = stateResult.content.automation || {};
      stateResult.content.automation.monitor = stateResult.content.automation.monitor || {events:[]};
      stateResult.content.automation.monitor.lastError = detail;
      stateResult.content.automation.monitor.lastErrorAt = new Date().toISOString();
      await saveTradingState(stateResult.content, stateResult.sha, stateResult.container);
    }).catch(saveError => console.error("MONITOR ERROR STATE:", saveError.message));
    throw error;
  } finally {
    runtime.running = false;
    unifiedPositionMonitorRunning = false;
  }
}

function handleAutomationStatus(req, res) {
  return sendJSON(res, 200, {
    scanner: {...automationRuntimeStatus.scanner, scheduler:marketScheduler.getStatus()},
    monitor: automationRuntimeStatus.monitor,
    intervals: {scanner:"hourly", positionMonitorSeconds:Math.round(PAPER_MONITOR_INTERVAL_MS / 1000)},
  });
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

      // Kripto kodu bu callback kapsaminda tutuluyor. Ilk istekte runtime
      // köprüsünü kurarak scheduler'in ayni fonksiyonlari kullanmasini
      // saglariz; bu köprü dis dünyaya endpoint açmaz.
      if (!cryptoRuntimeBridge) {
        cryptoRuntimeBridge = {
          runScanner: () => invokeAutomationHandler(handleCryptoScanner, "/api/crypto/scanner?automation=1"),
          runMarketPaperMonitors: () => runMarketPaperMonitors(),
          getCurrentPrice: symbol => fetchCryptoPaperMarketPrice(symbol),
        };
      }

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

if (req.method === "GET" && pathname === "/api/system/health") return handleSystemHealth(req, res);

if (
  req.method === "GET" &&
  pathname === "/api/crypto/scanner"
) {
  return handleCryptoScanner(req, res);
}

if (req.method === "GET" && pathname === "/api/crypto/state") return handleCryptoState(req, res);
if (req.method === "GET" && pathname === "/api/crypto/quotes") return handleCryptoQuotes(req, res);
if (req.method === "GET" && pathname === "/api/trading/crypto/account") return handleCryptoSpotAccount(req, res);
if (req.method === "GET" && pathname === "/api/trading/crypto/safety") return handleCryptoSpotSafety(req, res);
if (req.method === "GET" && pathname === "/api/trading/crypto/open-orders") return handleCryptoSpotOpenOrders(req, res);
if (req.method === "GET" && pathname === "/api/trading/crypto/recent-activity") return handleCryptoSpotRecentActivity(req, res);
if (req.method === "POST" && pathname === "/api/trading/crypto/order") return handleCryptoSpotOrder(req, res);
if (req.method === "POST" && pathname === "/api/trading/crypto/order/cancel") return handleCryptoSpotOrderCancel(req, res);
if (req.method === "POST" && pathname === "/api/trading/crypto/kill-switch") return handleCryptoSpotKillSwitch(req, res);
if (req.method === "POST" && pathname === "/api/crypto/risk-settings") return handleCryptoRiskSettings(req, res);
if (req.method === "POST" && pathname === "/api/crypto/kill-switch") return handleCryptoKillSwitch(req, res);
if (req.method === "POST" && pathname === "/api/crypto/paper/queue") return handleCryptoPaperQueue(req, res);
if (req.method === "POST" && pathname === "/api/crypto/paper/update") return handleCryptoPaperUpdate(req, res);
if (req.method === "POST" && pathname === "/api/crypto/paper/approve") return handleCryptoPaperApprove(req, res);
if (req.method === "POST" && pathname === "/api/crypto/paper/reject") return handleCryptoPaperReject(req, res);
if (req.method === "POST" && pathname === "/api/crypto/paper/close") return handleCryptoPaperClose(req, res);

// NASDAQ endpointleri de merkezi /api oturum korumasından otomatik geçer.
if (req.method === "GET" && pathname === "/api/nasdaq/scanner") return handleNasdaqScanner(req, res);
if (req.method === "GET" && pathname === "/api/nasdaq/state") return handleNasdaqState(req, res);
if (req.method === "GET" && pathname === "/api/nasdaq/quotes") return handleNasdaqQuotes(req, res);
if (req.method === "POST" && pathname === "/api/nasdaq/risk-settings") return handleNasdaqRiskSettings(req, res);
if (req.method === "POST" && pathname === "/api/nasdaq/kill-switch") return handleNasdaqKillSwitch(req, res);
if (req.method === "POST" && pathname === "/api/nasdaq/paper/queue") return withTradingStateMutation("nasdaq-paper-queue", () => handleNasdaqPaperQueue(req, res));
if (req.method === "POST" && pathname === "/api/nasdaq/paper/update") return withTradingStateMutation("nasdaq-paper-update", () => handleNasdaqPaperUpdate(req, res));
if (req.method === "POST" && pathname === "/api/nasdaq/paper/approve") return withTradingStateMutation("nasdaq-paper-approve", () => handleNasdaqPaperApprove(req, res));
if (req.method === "POST" && pathname === "/api/nasdaq/paper/reject") return withTradingStateMutation("nasdaq-paper-reject", () => handleNasdaqPaperReject(req, res));
if (req.method === "POST" && pathname === "/api/nasdaq/paper/close") return withTradingStateMutation("nasdaq-paper-close", () => handleNasdaqPaperClose(req, res));

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

function createBinanceAccountError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function binanceAccountErrorForStatus(status) {
  let error;
  if (status === 401 || status === 403) {
    error = createBinanceAccountError(
      "BINANCE_AUTH_FAILED",
      "Binance kimlik doğrulaması başarısız. Render API anahtarlarını kontrol edin."
    );
  } else if (status === 418 || status === 451) {
    error = createBinanceAccountError(
      "BINANCE_NETWORK_RESTRICTED",
      "Binance Spot hesabına bu sunucu konumundan erişilemiyor."
    );
  } else if (status === 429) {
    error = createBinanceAccountError(
      "BINANCE_RATE_LIMITED",
      "Binance istek limiti geçici olarak aşıldı."
    );
  } else {
    error = createBinanceAccountError(
      "BINANCE_ACCOUNT_UNAVAILABLE",
      "Binance Spot hesap bilgisi şu anda alınamadı."
    );
  }
  error.status = Number(status);
  return error;
}

function numberFromBinanceBalance(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : 0;
}

function binancePrivateBaseUrls() {
  return binanceActiveSpotPrivateBaseUrl
    ? [binanceActiveSpotPrivateBaseUrl, ...BINANCE_SPOT_PRIVATE_BASE_URLS.filter(baseUrl => baseUrl !== binanceActiveSpotPrivateBaseUrl)]
    : BINANCE_SPOT_PRIVATE_BASE_URLS;
}

function binanceSignedRequestBaseUrls() {
  return selectBinanceSignedRequestBases({
    gatewayUrl: BINANCE_PRIVATE_GATEWAY_URL,
    activeBaseUrl: binanceActiveSpotPrivateBaseUrl,
    fallbackBaseUrls: BINANCE_SPOT_PRIVATE_BASE_URLS,
  });
}

function isBinanceRouteBlockedStatus(status) {
  return [418, 451, 502, 503, 504].includes(Number(status));
}

function binanceErrorForResponse(status, payload) {
  const gatewayCode = String(payload?.code || "").toUpperCase();
  const exchangeCode = Number(payload?.code);
  let error;
  if (gatewayCode === "BINANCE_NETWORK_RESTRICTED") {
    error = createBinanceAccountError("BINANCE_NETWORK_RESTRICTED", "Binance Spot hesabına gateway üzerinden şu anda erişilemiyor.");
  } else if (gatewayCode === "BINANCE_AUTH_FAILED") {
    error = createBinanceAccountError("BINANCE_AUTH_FAILED", "Binance kimlik doğrulaması başarısız. Render API anahtarlarını ve Spot yetkisini kontrol edin.");
  } else if (gatewayCode === "BINANCE_CLOCK_SKEW") {
    error = createBinanceAccountError("BINANCE_CLOCK_SKEW", "Binance zaman doğrulaması geçici olarak başarısız oldu; bağlantı yeniden denenebilir.");
  } else if (gatewayCode === "BINANCE_RATE_LIMITED") {
    error = createBinanceAccountError("BINANCE_RATE_LIMITED", "Binance istek limiti geçici olarak aşıldı. Kısa süre sonra yeniden deneyin.");
  } else if (gatewayCode === "BINANCE_ACCOUNT_UNAVAILABLE") {
    error = createBinanceAccountError("BINANCE_ACCOUNT_UNAVAILABLE", "Binance Spot hesap bilgisi şu anda alınamadı.");
  } else if (exchangeCode === -1021) {
    error = createBinanceAccountError(
      "BINANCE_CLOCK_SKEW",
      "Binance zaman doğrulaması geçici olarak başarısız oldu; bağlantı yeniden denenebilir."
    );
  } else if (exchangeCode === -2014 || exchangeCode === -2015) {
    error = createBinanceAccountError(
      "BINANCE_AUTH_FAILED",
      "Binance kimlik doğrulaması başarısız. Render API anahtarlarını ve Spot yetkisini kontrol edin."
    );
  } else if (exchangeCode === -1003 || Number(status) === 429) {
    error = createBinanceAccountError(
      "BINANCE_RATE_LIMITED",
      "Binance istek limiti geçici olarak aşıldı. Kısa süre sonra yeniden deneyin."
    );
  } else {
    error = safeBinanceOrderError(status);
  }
  error.status = Number(status);
  return error;
}

async function refreshBinanceServerTimeOffset(baseUrl) {
  const now = Date.now();
  if (now - binanceServerTimeOffsetFetchedAt < 5 * 60 * 1000) return;
  try {
    const response = await fetch(`${baseUrl}/api/v3/time`, {
      headers: {
        Accept: "application/json",
        ...binancePrivateGatewayHeaders()
      }
    });
    const payload = response.ok ? await response.json() : null;
    const serverTime = Number(payload?.serverTime);
    if (Number.isFinite(serverTime) && serverTime > 0) {
      binanceServerTimeOffsetMs = serverTime - Date.now();
      binanceServerTimeOffsetFetchedAt = Date.now();
    }
  } catch {
    // Yerel saatle imzalama güvenli varsayılandır; bu yardımcı sorgunun
    // başarısızlığı tek başına hesabı kullanılmaz hâle getirmez.
  }
}

function binancePrivateGatewayHeaders() {
  if (!BINANCE_PRIVATE_GATEWAY_URL) return {};
  if (!BINANCE_PRIVATE_GATEWAY_TOKEN) {
    throw createBinanceAccountError(
      "BINANCE_GATEWAY_NOT_CONFIGURED",
      "Binance private gateway token Render ortamında tanımlı değil."
    );
  }
  return {"X-Borsaci-Gateway-Token": BINANCE_PRIVATE_GATEWAY_TOKEN};
}

async function fetchBinanceSpotAccount() {
  if (!BINANCE_API_KEY || !BINANCE_API_SECRET) {
    throw createBinanceAccountError(
      "BINANCE_NOT_CONFIGURED",
      "Binance API anahtarı veya secret Render ortamında tanımlı değil."
    );
  }

  try {
    const account = await requestBinanceSpotSigned("GET", "/api/v3/account");
    if (!Array.isArray(account?.balances)) {
      throw createBinanceAccountError(
        "BINANCE_ACCOUNT_INVALID_RESPONSE",
        "Binance Spot hesap yanıtı doğrulanamadı."
      );
    }

    const balances = account.balances
      .map(balance => {
        const free = numberFromBinanceBalance(balance?.free);
        const locked = numberFromBinanceBalance(balance?.locked);
        return {
          asset: String(balance?.asset || "").toUpperCase(),
          free,
          locked,
          total: free + locked
        };
      })
      .filter(balance => balance.asset && balance.total > 0)
      .sort((left, right) => left.asset.localeCompare(right.asset));

    integrationHealth.binance.lastSuccessAt = new Date().toISOString();
    integrationHealth.binance.lastError = null;

    return {
      accountType: String(account.accountType || "SPOT"),
      canTrade: account.canTrade === true,
      balances
    };
  } catch (error) {
    integrationHealth.binance.lastError = String(error.message || "Binance bağlantısı başarısız.").slice(0, 300);
    if (String(error?.code || "").startsWith("BINANCE_")) throw error;
    throw createBinanceAccountError(
      "BINANCE_ACCOUNT_UNAVAILABLE",
      "Binance Spot hesap bilgisi şu anda alınamadı."
    );
  }
}

async function handleCryptoSpotAccount(req, res) {
  try {
    const account = await fetchBinanceSpotAccount();
    return sendJSON(res, 200, {
      connected: true,
      readOnly: false,
      account: {
        type: account.accountType,
        canTrade: account.canTrade
      },
      balances: account.balances,
      error: null
    });
  } catch (error) {
    return sendJSON(res, 200, {
      connected: false,
      readOnly: false,
      account: null,
      balances: [],
      error: {
        code: String(error?.code || "BINANCE_ACCOUNT_UNAVAILABLE"),
        message: String(error?.message || "Binance Spot hesap bilgisi şu anda alınamadı.")
      }
    });
  }
}

function cryptoSpotSafetyForClient() {
  return {
    finalConfirmationRequired: true,
    maxOrderNotionalUsdt: BINANCE_LIVE_SPOT_SAFETY.maxOrderNotionalUsdt,
    maxLimitDeviationPercent: BINANCE_LIVE_SPOT_SAFETY.maxLimitDeviationPercent,
    duplicateWindowSeconds: Math.round(BINANCE_LIVE_SPOT_SAFETY.duplicateWindowMs / 1000)
  };
}

async function handleCryptoSpotSafety(req, res) {
  try {
    const account = await fetchBinanceSpotAccount();
    return sendJSON(res, 200, {connected:true, canTrade:account.canTrade, policy:cryptoSpotSafetyForClient(), error:null});
  } catch (error) {
    return sendJSON(res, 200, {connected:false, canTrade:false, policy:cryptoSpotSafetyForClient(), error:{code:String(error?.code || "BINANCE_ACCOUNT_UNAVAILABLE"), message:String(error?.message || "Binance Spot bağlantısı doğrulanamadı.")}});
  }
}

function assertNoRecentBinanceLiveDuplicate(fingerprint) {
  const now = Date.now();
  for (const [key, createdAt] of recentBinanceLiveOrders.entries()) {
    if (now - createdAt > BINANCE_LIVE_SPOT_SAFETY.duplicateWindowMs) recentBinanceLiveOrders.delete(key);
  }
  const previous = recentBinanceLiveOrders.get(fingerprint);
  if (previous && now - previous <= BINANCE_LIVE_SPOT_SAFETY.duplicateWindowMs) {
    throw createBinanceAccountError("BINANCE_DUPLICATE_ORDER_BLOCKED", `Aynı canlı emir son ${Math.round(BINANCE_LIVE_SPOT_SAFETY.duplicateWindowMs / 1000)} saniye içinde zaten gönderildi. Binance açık emirleri ve işlem kaydını kontrol edin.`);
  }
}

function normalizeBinanceDecimal(value, fieldName) {
  const raw = String(value ?? "").trim();
  if (!/^\d+(?:\.\d+)?$/.test(raw)) {
    throw createBinanceAccountError("BINANCE_INVALID_ORDER", `${fieldName} geçerli bir pozitif sayı olmalı.`);
  }
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw createBinanceAccountError("BINANCE_INVALID_ORDER", `${fieldName} sıfırdan büyük olmalı.`);
  }
  return raw.replace(/^0+(?=\d)/, "").replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

function binanceDecimalParts(value) {
  const normalized = normalizeBinanceDecimal(value, "Değer");
  const [whole, fraction = ""] = normalized.split(".");
  return {digits: BigInt(`${whole}${fraction}`), scale: fraction.length};
}

function binanceStepMatches(value, step) {
  const valueParts = binanceDecimalParts(value);
  const stepParts = binanceDecimalParts(step);
  const scale = Math.max(valueParts.scale, stepParts.scale);
  const valueAtScale = valueParts.digits * (10n ** BigInt(scale - valueParts.scale));
  const stepAtScale = stepParts.digits * (10n ** BigInt(scale - stepParts.scale));
  return stepAtScale > 0n && valueAtScale % stepAtScale === 0n;
}

function numberFromBinanceFilter(filter, key) {
  const value = Number(filter?.[key]);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function safeBinanceOrderError(status) {
  if (status === 400) {
    return createBinanceAccountError("BINANCE_ORDER_REJECTED", "Binance emri reddetti. Miktar, fiyat adımı, minimum tutar ve bakiyeyi kontrol edin.");
  }
  return binanceAccountErrorForStatus(status);
}

async function fetchBinanceSpotPublic(pathname) {
  let lastError = null;
  // Sembol kuralları gibi public doğrulamalar gateway'e gitmez; crypto
  // scanner/candle akışı ve mevcut public fallback zinciri bundan bağımsızdır.
  for (const baseUrl of binancePrivateBaseUrls()) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(`${baseUrl}${pathname}`, {
        headers: {Accept: "application/json"},
        signal: controller.signal
      });
      if (!response.ok) {
        const error = safeBinanceOrderError(response.status);
        if (isBinanceRouteBlockedStatus(response.status)) {
          lastError = error;
          continue;
        }
        throw error;
      }
      binanceActiveSpotPrivateBaseUrl = baseUrl;
      return response.json();
    } catch (error) {
      const retryable = error?.code === "BINANCE_NETWORK_RESTRICTED" || isBinanceRouteBlockedStatus(error?.status);
      if (String(error?.code || "").startsWith("BINANCE_") && !retryable) throw error;
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw createBinanceAccountError("BINANCE_NETWORK_RESTRICTED", lastError?.message || "Binance Spot servisine bu sunucudan erişilemiyor.");
}

async function requestBinanceSpotSigned(method, pathname, params = {}) {
  if (!BINANCE_API_KEY || !BINANCE_API_SECRET) {
    throw createBinanceAccountError("BINANCE_NOT_CONFIGURED", "Binance API anahtarı veya secret Render ortamında tanımlı değil.");
  }
  if (BINANCE_PRIVATE_GATEWAY_URL && !BINANCE_PRIVATE_GATEWAY_TOKEN) {
    throw createBinanceAccountError(
      "BINANCE_GATEWAY_NOT_CONFIGURED",
      "Binance private gateway token Render ortamında tanımlı değil."
    );
  }
  const normalizedMethod = String(method || "GET").toUpperCase();
  const isQueryRequest = ["GET", "DELETE"].includes(normalizedMethod);
  let lastError = null;
  // Gateway tanımlıysa yalnızca gateway denenir. Tanımlı değilse bugünkü
  // Binance private endpoint fallback zinciri aynen korunur.
  for (const baseUrl of binanceSignedRequestBaseUrls()) {
    // Her alternatif endpoint denemesinde timestamp/signature yenilenir;
    // önceki ağ gecikmesi recvWindow'u geçersiz kılmamalıdır.
    await refreshBinanceServerTimeOffset(baseUrl);
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
    });
    search.set("recvWindow", String(BINANCE_SPOT_ACCOUNT_RECV_WINDOW));
    search.set("timestamp", String(Date.now() + binanceServerTimeOffsetMs));
    const query = search.toString();
    const signature = crypto.createHmac("sha256", BINANCE_API_SECRET).update(query).digest("hex");
    const signedQuery = `${query}&signature=${signature}`;
    const useGateway = Boolean(BINANCE_PRIVATE_GATEWAY_URL);
    const requestUrl = useGateway
      ? buildBinancePrivateGatewayUrl(baseUrl, pathname, isQueryRequest ? signedQuery : "")
      : (isQueryRequest ? `${baseUrl}${pathname}?${signedQuery}` : `${baseUrl}${pathname}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(requestUrl, {
        method: normalizedMethod,
        headers: {
          Accept: "application/json",
          "X-MBX-APIKEY": BINANCE_API_KEY,
          ...binancePrivateGatewayHeaders(),
          ...(isQueryRequest ? {} : {"Content-Type": "application/x-www-form-urlencoded"})
        },
        body: isQueryRequest ? undefined : signedQuery,
        signal: controller.signal
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const error = binanceErrorForResponse(response.status, payload);
        if (error?.code === "BINANCE_NETWORK_RESTRICTED" || (isQueryRequest && isBinanceRouteBlockedStatus(response.status))) {
          lastError = error;
          continue;
        }
        throw error;
      }
      if (!useGateway) binanceActiveSpotPrivateBaseUrl = baseUrl;
      return response.json();
    } catch (error) {
      const retryable = error?.code === "BINANCE_NETWORK_RESTRICTED" || (isQueryRequest && isBinanceRouteBlockedStatus(error?.status));
      if (String(error?.code || "").startsWith("BINANCE_") && !retryable) throw error;
      // POST sırasında bağlantının cevap gelmeden kesilmesi, emrin Binance'e
      // ulaşıp ulaşmadığını belirsiz bırakır. Bu durumda ikinci kez gönderip
      // çift emir yaratmak yerine kullanıcıyı Binance tarafını kontrol etmeye yönlendir.
      if (!isQueryRequest && !retryable) {
        throw createBinanceAccountError(
          "BINANCE_ORDER_STATUS_UNKNOWN",
          "Binance bağlantısı emir sırasında kesildi. Aynı emri tekrar göndermeden önce Binance açık emirler ve işlem geçmişini kontrol edin."
        );
      }
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw createBinanceAccountError("BINANCE_NETWORK_RESTRICTED", lastError?.message || "Binance Spot işlemi şu anda gerçekleştirilemedi.");
}

async function getBinanceSpotSymbolRules(symbol) {
  const normalizedSymbol = String(symbol || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{5,20}$/.test(normalizedSymbol)) {
    throw createBinanceAccountError("BINANCE_INVALID_ORDER", "Geçerli bir Binance Spot paritesi girin.");
  }
  const payload = await fetchBinanceSpotPublic(`/api/v3/exchangeInfo?symbol=${encodeURIComponent(normalizedSymbol)}`);
  const market = Array.isArray(payload?.symbols) ? payload.symbols[0] : null;
  if (!market || market.symbol !== normalizedSymbol || market.status !== "TRADING" || market.isSpotTradingAllowed === false) {
    throw createBinanceAccountError("BINANCE_SYMBOL_UNAVAILABLE", "Bu parite Binance Spot'ta işleme açık değil.");
  }
  const filters = Array.isArray(market.filters) ? market.filters : [];
  const getFilter = type => filters.find(filter => filter?.filterType === type) || {};
  return {
    symbol: normalizedSymbol,
    baseAsset: String(market.baseAsset || "").toUpperCase(),
    quoteAsset: String(market.quoteAsset || "").toUpperCase(),
    lotSize: getFilter("LOT_SIZE"),
    marketLotSize: getFilter("MARKET_LOT_SIZE"),
    priceFilter: getFilter("PRICE_FILTER"),
    notionalFilter: getFilter("NOTIONAL").filterType ? getFilter("NOTIONAL") : getFilter("MIN_NOTIONAL")
  };
}

function validateBinanceOrderRules({quantity, price, orderType, rules}) {
  const quantityNumber = Number(quantity);
  const lot = orderType === "MARKET" && numberFromBinanceFilter(rules.marketLotSize, "minQty") > 0
    ? rules.marketLotSize
    : rules.lotSize;
  const minQty = numberFromBinanceFilter(lot, "minQty");
  const maxQty = numberFromBinanceFilter(lot, "maxQty");
  const stepSize = String(lot?.stepSize || "");
  if (minQty !== null && quantityNumber < minQty) throw createBinanceAccountError("BINANCE_INVALID_ORDER", `Miktar Binance minimumu olan ${lot.minQty}'den düşük.`);
  if (maxQty !== null && maxQty > 0 && quantityNumber > maxQty) throw createBinanceAccountError("BINANCE_INVALID_ORDER", `Miktar Binance maksimumunu aşıyor.`);
  if (stepSize && Number(stepSize) > 0 && !binanceStepMatches(quantity, stepSize)) throw createBinanceAccountError("BINANCE_INVALID_ORDER", `Miktar ${stepSize} adımına uymuyor.`);
  if (orderType === "LIMIT") {
    const priceNumber = Number(price);
    const minPrice = numberFromBinanceFilter(rules.priceFilter, "minPrice");
    const maxPrice = numberFromBinanceFilter(rules.priceFilter, "maxPrice");
    const tickSize = String(rules.priceFilter?.tickSize || "");
    if (minPrice !== null && priceNumber < minPrice) throw createBinanceAccountError("BINANCE_INVALID_ORDER", `Limit fiyatı Binance minimumu olan ${rules.priceFilter.minPrice}'den düşük.`);
    if (maxPrice !== null && maxPrice > 0 && priceNumber > maxPrice) throw createBinanceAccountError("BINANCE_INVALID_ORDER", "Limit fiyatı Binance maksimumunu aşıyor.");
    if (tickSize && Number(tickSize) > 0 && !binanceStepMatches(price, tickSize)) throw createBinanceAccountError("BINANCE_INVALID_ORDER", `Limit fiyatı ${tickSize} fiyat adımına uymuyor.`);
  }
}

function sanitizeBinanceOrder(order) {
  return {
    orderId: String(order?.orderId || ""),
    clientOrderId: String(order?.clientOrderId || ""),
    symbol: String(order?.symbol || "").toUpperCase(),
    side: String(order?.side || "").toUpperCase(),
    type: String(order?.type || "").toUpperCase(),
    status: String(order?.status || ""),
    price: String(order?.price || "0"),
    origQty: String(order?.origQty || "0"),
    executedQty: String(order?.executedQty || "0"),
    cumulativeQuoteQty: String(order?.cummulativeQuoteQty || order?.cumulativeQuoteQty || "0"),
    timeInForce: String(order?.timeInForce || ""),
    transactTime: Number(order?.transactTime || order?.updateTime || Date.now()),
    fills: Array.isArray(order?.fills) ? order.fills.map(fill => ({
      price: String(fill?.price || "0"), qty: String(fill?.qty || "0"),
      commission: String(fill?.commission || "0"), commissionAsset: String(fill?.commissionAsset || "")
    })) : []
  };
}

function sanitizeBinanceTrade(trade) {
  return {
    id: String(trade?.id || ""),
    orderId: String(trade?.orderId || ""),
    symbol: String(trade?.symbol || "").toUpperCase(),
    side: trade?.isBuyer === true ? "BUY" : "SELL",
    price: String(trade?.price || "0"),
    quantity: String(trade?.qty || "0"),
    quoteQuantity: String(trade?.quoteQty || "0"),
    commission: String(trade?.commission || "0"),
    commissionAsset: String(trade?.commissionAsset || ""),
    time: Number(trade?.time || Date.now()),
    maker: trade?.isMaker === true
  };
}

function cryptoSpotActivitySymbol(req) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const symbol = String(url.searchParams.get("symbol") || "BTCUSDT").trim().toUpperCase();
  if (!/^[A-Z0-9]{5,20}$/.test(symbol)) {
    throw createBinanceAccountError("BINANCE_INVALID_SYMBOL", "İşlem geçmişi için geçerli bir Spot paritesi girin.");
  }
  return symbol;
}

async function handleCryptoSpotOpenOrders(req, res) {
  try {
    const orders = await requestBinanceSpotSigned("GET", "/api/v3/openOrders");
    return sendJSON(res, 200, {connected: true, orders: Array.isArray(orders) ? orders.map(sanitizeBinanceOrder) : []});
  } catch (error) {
    return sendJSON(res, 200, {connected: false, orders: [], error: {code: String(error?.code || "BINANCE_SPOT_UNAVAILABLE"), message: String(error?.message || "Açık emirler alınamadı.")}});
  }
}

async function handleCryptoSpotRecentActivity(req, res) {
  try {
    const symbol = cryptoSpotActivitySymbol(req);
    const [orders, trades] = await Promise.all([
      requestBinanceSpotSigned("GET", "/api/v3/allOrders", {symbol, limit: 20}),
      requestBinanceSpotSigned("GET", "/api/v3/myTrades", {symbol, limit: 20})
    ]);
    return sendJSON(res, 200, {
      connected: true,
      symbol,
      orders: Array.isArray(orders) ? orders.map(sanitizeBinanceOrder) : [],
      trades: Array.isArray(trades) ? trades.map(sanitizeBinanceTrade) : []
    });
  } catch (error) {
    return sendJSON(res, 200, {
      connected: false,
      orders: [],
      trades: [],
      error: {
        code: String(error?.code || "BINANCE_SPOT_UNAVAILABLE"),
        message: String(error?.message || "Binance işlem kaydı alınamadı.")
      }
    });
  }
}

function binanceOrderAveragePrice(order, fallback = null) {
  const quantity = Number(order?.executedQty || 0);
  const quote = Number(order?.cummulativeQuoteQty ?? order?.cumulativeQuoteQty ?? 0);
  const direct = Number(order?.price || 0);
  if (Number.isFinite(direct) && direct > 0) return direct;
  if (Number.isFinite(quantity) && quantity > 0 && Number.isFinite(quote) && quote > 0) return quote / quantity;
  return Number(fallback) || null;
}

function readCryptoLiveProtectionPlan(input, entry) {
  const read = key => {
    const value = input?.[key];
    if (value === undefined || value === null || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  };
  const stop = read("stop");
  const target1 = read("target1") ?? read("tp1");
  const target2 = read("target2") ?? read("tp2");
  const target3 = read("target3") ?? read("tp3");
  // Koruma planı isteğe bağlıdır: form seviyeleri göndermiyorsa cüzdandaki
  // varlığa otomatik satış emri bağlamayız. Gönderilmişse ise geçersiz bir
  // seviyeyi sessizce kabul etmek yerine takip kaydı oluşturmuyoruz.
  if (!stop && !target1 && !target2 && !target3) return null;
  if (!stop || !target1 || !target2 || stop >= entry || target1 <= entry || target2 <= entry) return null;
  return {stop,target1,target2,target3};
}

async function recordBinanceLiveEntry(order, input, referencePrice) {
  if (String(order?.side || "").toUpperCase() !== "BUY") return {tracked:false};
  const requestedQuantity = Number(order?.origQty || input?.quantity || 0);
  const executedQuantity = Number(order?.executedQty || 0);
  const entry = binanceOrderAveragePrice(order, referencePrice);
  const plan = readCryptoLiveProtectionPlan(input, entry);
  if (!plan || !Number.isFinite(requestedQuantity) || requestedQuantity <= 0 || !entry) {
    return {tracked:false, reason:"Koruma seviyeleri olmadan canlı Spot emir otomatik TP/SL takibine eklenmedi."};
  }
  const brokerOrderId = String(order?.orderId || "");
  if (!brokerOrderId) return {tracked:false, reason:"Binance emir kimliği alınamadı."};
  const timestamp = new Date().toISOString();
  return withTradingStateMutation("binance-live-entry", async () => {
    const stateResult = await getTradingState();
    const live = stateResult.content.cryptoLive || (stateResult.content.cryptoLive = {positions:[],activity:[]});
    const existing = (live.positions || []).find(position => String(position?.broker?.brokerOrderId || "") === brokerOrderId);
    if (existing) return {tracked:true, positionId:existing.id, status:existing.status};
    const filled = String(order?.status || "").toUpperCase() === "FILLED" && executedQuantity > 0;
    const position = {
      id:`binance-live-${brokerOrderId}`,
      market:"CRYPTO",
      symbol:String(order?.symbol || input?.symbol || "").toUpperCase(),
      side:"LONG",
      status:filled ? "OPEN" : "PENDING_BROKER_ENTRY",
      quantity:filled ? executedQuantity : requestedQuantity,
      remainingQuantity:filled ? executedQuantity : requestedQuantity,
      originalQuantity:requestedQuantity,
      entry:filled ? entry : null,
      plannedEntry:entry,
      current:entry,
      stop:plan.stop,
      target1:plan.target1,
      target2:plan.target2,
      target3:plan.target3,
      openedAt:timestamp,
      broker:{brokerOrderId, clientOrderId:String(order?.clientOrderId || "") || null, status:String(order?.status || "").toUpperCase(), submitted:true, filledQuantity:executedQuantity, filledAveragePrice:filled ? entry : null},
    };
    live.positions = [position, ...(live.positions || [])].slice(0,100);
    live.activity = [{timestamp,type:filled ? "CRYPTO_LIVE_ENTRY_FILLED" : "CRYPTO_LIVE_ENTRY_PENDING",symbol:position.symbol,message:filled ? `${position.symbol} Binance Spot alış emri gerçekleşti; TP/SL takibi aktif.` : `${position.symbol} Binance Spot alış emri gönderildi; fill doğrulaması bekleniyor.`}, ...(live.activity || [])].slice(0,200);
    await saveTradingState(stateResult.content, stateResult.sha, stateResult.container);
    return {tracked:true, positionId:position.id, status:position.status};
  });
}

function createBinanceMonitorBroker() {
  return createBinanceBroker({
    submitOrder: payload => requestBinanceSpotSigned("POST", "/api/v3/order", {...payload, newOrderRespType:"FULL"}),
    fetchOrder: ({symbol, orderId}) => requestBinanceSpotSigned("GET", "/api/v3/order", {symbol, orderId}),
    cancelOrder: ({symbol, orderId}) => requestBinanceSpotSigned("DELETE", "/api/v3/order", {symbol, orderId}),
  });
}

async function resolveBinanceMonitorExit(position) {
  const pending = position?.monitor?.pendingBrokerExit;
  if (!pending?.orderId || !pending?.event) return null;
  const order = await requestBinanceSpotSigned("GET", "/api/v3/order", {symbol:position.symbol, orderId:pending.orderId});
  const executed = Number(order?.executedQty || 0);
  const requested = Number(pending.event.closeQuantity || 0);
  if (String(order?.status || "").toUpperCase() === "FILLED" && executed + 1e-12 >= requested) {
    return {confirmed:true, event:pending.event, averagePrice:binanceOrderAveragePrice(order, pending.event.executionPrice), order};
  }
  const terminal = ["CANCELED", "REJECTED", "EXPIRED"].includes(String(order?.status || "").toUpperCase());
  return {confirmed:false, pending:!terminal, terminal, order};
}

async function handleCryptoSpotOrder(req, res) {
  try {
    const input = await readTradingRequest(req);
    if (input?.confirm !== true) throw createBinanceAccountError("BINANCE_CONFIRMATION_REQUIRED", "Gerçek emir için son onay gerekli.");
    const side = String(input?.side || "").trim().toUpperCase();
    const orderType = String(input?.orderType || "").trim().toUpperCase();
    if (!["BUY", "SELL"].includes(side) || !["MARKET", "LIMIT"].includes(orderType)) throw createBinanceAccountError("BINANCE_INVALID_ORDER", "Yalnız Spot AL/SAT ve PİYASA/LİMİT emirleri desteklenir.");
    const rules = await getBinanceSpotSymbolRules(input?.symbol);
    const quantity = normalizeBinanceDecimal(input?.quantity, "Miktar");
    const price = orderType === "LIMIT" ? normalizeBinanceDecimal(input?.price, "Limit fiyatı") : null;
    validateBinanceOrderRules({quantity, price, orderType, rules});
    const account = await fetchBinanceSpotAccount();
    if (!account.canTrade) throw createBinanceAccountError("BINANCE_TRADING_DISABLED", "Bu Binance API anahtarında Spot işlem yetkisi açık değil.");
    const pricePayload = await fetchBinanceSpotPublic(`/api/v3/ticker/price?symbol=${encodeURIComponent(rules.symbol)}`);
    const referencePrice = Number(pricePayload?.price);
    if (!Number.isFinite(referencePrice) || referencePrice <= 0) throw createBinanceAccountError("BINANCE_PRICE_UNAVAILABLE", "Emir öncesi doğrulanmış Spot fiyat alınamadı.");
    let safety;
    try {
      safety = validateLiveSpotOrderSafety({orderType, quantity, limitPrice: price, referencePrice, policy: BINANCE_LIVE_SPOT_SAFETY});
    } catch (error) {
      throw createBinanceAccountError("BINANCE_LIVE_SAFETY_BLOCKED", error.message);
    }
    const fingerprint = liveSpotOrderFingerprint({symbol: rules.symbol, side, orderType, quantity, price});
    assertNoRecentBinanceLiveDuplicate(fingerprint);
    const notional = safety.notional;
    const minNotional = numberFromBinanceFilter(rules.notionalFilter, "minNotional");
    if (minNotional !== null && notional < minNotional) throw createBinanceAccountError("BINANCE_INVALID_ORDER", `Emir tutarı Binance minimumu olan ${rules.notionalFilter.minNotional}'den düşük.`);
    const balance = account.balances.find(item => item.asset === (side === "BUY" ? rules.quoteAsset : rules.baseAsset));
    const available = Number(balance?.free || 0);
    const required = side === "BUY" ? notional * 1.002 : Number(quantity);
    if (!Number.isFinite(available) || available + 1e-12 < required) throw createBinanceAccountError("BINANCE_INSUFFICIENT_BALANCE", side === "BUY" ? `${rules.quoteAsset} bakiyesi emir ve ücret payı için yeterli değil.` : `${rules.baseAsset} kullanılabilir bakiyesi yeterli değil.`);
    const order = await requestBinanceSpotSigned("POST", "/api/v3/order", {
      symbol: rules.symbol, side, type: orderType, quantity, price,
      timeInForce: orderType === "LIMIT" ? "GTC" : undefined,
      newOrderRespType: "FULL",
      newClientOrderId: `borsaci${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`
    });
    recentBinanceLiveOrders.set(fingerprint, Date.now());
    // Kullanıcı tarafından son onayla gönderilen gerçek AL emri, ancak
    // geçerli TP/SL seviyeleri de formdan geldiyse izlemeye alınır. İzleme
    // kaydı broker emrinden ayrı tutulur ve fill doğrulanmadan OPEN olmaz.
    let protectionTracking;
    try {
      protectionTracking = await recordBinanceLiveEntry(order, input, referencePrice);
    } catch (trackingError) {
      // Broker emri çoktan kabul edilmiş olabilir. State yazımı başarısızsa
      // bu cevabı "emir reddedildi" gibi göstermeyiz; kullanıcı broker
      // hesabını görerek pozisyonu manuel güvene alabilsin.
      console.error("BINANCE LIVE TRACKING ERROR:", String(trackingError?.message || "state yazılamadı").slice(0, 240));
      protectionTracking = {tracked:false, error:"Emir gönderildi ancak otomatik TP/SL takip kaydı oluşturulamadı."};
    }
    return sendJSON(res, 201, {
      success: true,
      order: sanitizeBinanceOrder(order),
      protectionTracking,
      safety: {notional: safety.notional, marketPrice: safety.marketPrice, limitDeviationPercent: safety.deviationPercent}
    });
  } catch (error) {
    return sendJSON(res, 400, {success: false, error: {code: String(error?.code || "BINANCE_ORDER_REJECTED"), message: String(error?.message || "Gerçek Binance emri gönderilemedi.")}});
  }
}

async function handleCryptoSpotOrderCancel(req, res) {
  try {
    const input = await readTradingRequest(req);
    if (input?.confirm !== true) throw createBinanceAccountError("BINANCE_CONFIRMATION_REQUIRED", "Emir iptali için son onay gerekli.");
    const symbol = String(input?.symbol || "").trim().toUpperCase();
    const orderId = String(input?.orderId || "").trim();
    if (!/^[A-Z0-9]{5,20}$/.test(symbol) || !/^\d+$/.test(orderId)) throw createBinanceAccountError("BINANCE_INVALID_ORDER", "İptal edilecek emir bilgisi geçersiz.");
    const order = await requestBinanceSpotSigned("DELETE", "/api/v3/order", {symbol, orderId});
    return sendJSON(res, 200, {success: true, order: sanitizeBinanceOrder(order)});
  } catch (error) {
    return sendJSON(res, 400, {success: false, error: {code: String(error?.code || "BINANCE_ORDER_REJECTED"), message: String(error?.message || "Binance emri iptal edilemedi.")}});
  }
}

async function handleCryptoSpotKillSwitch(req, res) {
  try {
    const input = await readTradingRequest(req);
    const expectedPassword = String(process.env.KILL_SWITCH_PASSWORD || "");
    if (!expectedPassword) throw createBinanceAccountError("BINANCE_KILL_SWITCH_UNAVAILABLE", "Acil durdurma şifresi Render ortamında ayarlı değil.");
    if (input?.confirm !== true) throw createBinanceAccountError("BINANCE_CONFIRMATION_REQUIRED", "Açık Spot emirlerini iptal etmek için son onay gerekli.");
    if (String(input?.password || "") !== expectedPassword) throw createBinanceAccountError("BINANCE_KILL_SWITCH_PASSWORD_INVALID", "Acil durdurma şifresi yanlış.");
    const activate = String(input?.action || "activate").toLowerCase() !== "deactivate";
    const result = await withTradingStateMutation("binance-live-kill-switch", async () => {
      const stateResult = await getTradingState();
      const state = stateResult.content;
      const live = state.cryptoLive || (state.cryptoLive = {positions:[], activity:[], history:[]});
      const timestamp = new Date().toISOString();
      live.killSwitch = {active:activate, activatedAt:activate ? timestamp : null};
      if (!activate) {
        addCryptoLiveActivity(live, timestamp, "CRYPTO_LIVE_KILL_SWITCH", "", "Binance Spot acil durdurma kapatıldı; yalnız BorsaCI'nin yeni canlı emirleri yeniden açılabilir.");
        await saveTradingState(state, stateResult.sha, stateResult.container);
        return {activate, cancelled:[], failed:[], closed:0, pending:0, message:"Binance Spot acil durdurma kapatıldı."};
      }

      // Bu sayfa yalnız BorsaCI'nin oluşturduğu ya da takip ettiği emirleri
      // yönetir. Kullanıcının Binance'te bağımsız açtığı emirler asla bu
      // switch tarafından iptal edilmez veya satılmaz.
      const managedOrderIds = new Set();
      for (const position of live.positions || []) {
        for (const orderId of [position?.broker?.brokerOrderId, position?.monitor?.pendingBrokerExit?.orderId, position?.monitor?.pendingManualExit?.orderId]) {
          if (orderId) managedOrderIds.add(String(orderId));
        }
      }

      const openOrders = await requestBinanceSpotSigned("GET", "/api/v3/openOrders");
      const cancelled = [];
      const failed = [];
      for (const order of Array.isArray(openOrders) ? openOrders : []) {
        const symbol = String(order?.symbol || "").toUpperCase();
        const orderId = String(order?.orderId || "");
        const clientOrderId = String(order?.clientOrderId || order?.origClientOrderId || "");
        const belongsToBorsaci = managedOrderIds.has(orderId) || /^(?:borsaci|bci-)/i.test(clientOrderId);
        if (!belongsToBorsaci || !/^[A-Z0-9]{5,20}$/.test(symbol) || !/^\d+$/.test(orderId)) continue;
        try {
          const cancelledOrder = await requestBinanceSpotSigned("DELETE", "/api/v3/order", {symbol, orderId});
          cancelled.push(sanitizeBinanceOrder(cancelledOrder));
        } catch (error) {
          failed.push({symbol, orderId, message: String(error?.message || "Emir iptal edilemedi.")});
        }
      }

      const cancelledIds = new Set(cancelled.map(order => String(order?.orderId || "")));
      const broker = createBinanceMonitorBroker();
      let closed = 0;
      let pending = 0;
      for (const position of live.positions || []) {
        if (position.status === "PENDING_BROKER_ENTRY") {
          const orderId = String(position?.broker?.brokerOrderId || "");
          if (cancelledIds.has(orderId)) {
            position.status = "BROKER_ENTRY_CANCELLED";
            position.closedAt = timestamp;
            position.broker = {...(position.broker || {}), status:"CANCELED", cancelledAt:timestamp};
            addCryptoLiveActivity(live, timestamp, "CRYPTO_LIVE_ENTRY_CANCELLED", position.symbol, `${position.symbol} BorsaCI Binance giriş emri acil durdurma ile iptal edildi.`);
          }
          continue;
        }
        if (position.status !== "OPEN") continue;

        // Önceden gönderilmiş bir TP/SL ya da manuel çıkış emri varsa önce
        // broker kaydını uzlaştır. Kısmi dolumda ikinci satış emri göndermek
        // yanlış miktar satabileceği için güvenli biçimde bekletilir.
        const pendingExit = position.monitor?.pendingManualExit || position.monitor?.pendingBrokerExit;
        if (pendingExit?.orderId) {
          try {
            const order = await requestBinanceSpotSigned("GET", "/api/v3/order", {symbol:position.symbol, orderId:pendingExit.orderId});
            const executed = Number(order?.executedQty || 0);
            const requested = Number(pendingExit.quantity || pendingExit.event?.closeQuantity || 0);
            const full = String(order?.status || "").toUpperCase() === "FILLED" && executed + 1e-12 >= requested;
            if (full && position.monitor?.pendingManualExit) {
              closed += settleCryptoLiveManualExit(live, position, binanceOrderAveragePrice(order, Number(position.current) || Number(position.entry)), requested, timestamp, {reason:pendingExit.reason || "KILL_SWITCH", orderType:pendingExit.orderType || "MARKET"}) ? 1 : 0;
              continue;
            }
            if (full && position.monitor?.pendingBrokerExit?.event) {
              closed += settleCryptoLiveMonitorEvent(live, position, {...position}, pendingExit.event, Number(position.current) || Number(position.entry), timestamp, binanceOrderAveragePrice(order, Number(position.current) || Number(position.entry))) ? 1 : 0;
              continue;
            }
            if (executed > 0) {
              position.monitor = {...(position.monitor || {}), exitBlocked:true, lastBrokerError:"Acil durdurma sırasında önceki Binance çıkış emri kısmen doldu; broker uzlaştırması gerekli."};
              addCryptoLiveActivity(live, timestamp, "CRYPTO_LIVE_KILL_RECONCILIATION", position.symbol, `${position.symbol} için önceki Binance çıkış emri kısmen doldu; ikinci satış güvenlik nedeniyle gönderilmedi.`);
              failed.push({symbol:position.symbol, orderId:String(pendingExit.orderId), message:"Kısmi broker dolumu uzlaştırma bekliyor."});
              continue;
            }
          } catch (error) {
            failed.push({symbol:position.symbol, orderId:String(pendingExit.orderId), message:String(error?.message || "Önceki çıkış emri okunamadı.")});
            continue;
          }
        }

        const quantity = Number(position.remainingQuantity ?? position.quantity ?? 0);
        if (!Number.isFinite(quantity) || quantity <= 0) continue;
        const exit = await broker.executeExit({symbol:position.symbol, quantity, clientOrderId:`borsaci${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`});
        if (exit.confirmed) {
          closed += settleCryptoLiveManualExit(live, position, exit.averagePrice || Number(position.current) || Number(position.entry), quantity, timestamp, {reason:"KILL_SWITCH"}) ? 1 : 0;
        } else if (exit.order?.orderId) {
          position.monitor = {...(position.monitor || {}), pendingManualExit:{orderId:exit.order.orderId, quantity, reason:"KILL_SWITCH", orderType:"MARKET", submittedAt:timestamp, referencePrice:Number(position.current) || Number(position.entry)}};
          pending += 1;
        } else {
          const message = String(exit.message || exit.code || "Binance acil satış emri gönderilemedi.");
          position.monitor = {...(position.monitor || {}), lastBrokerError:message};
          failed.push({symbol:position.symbol, orderId:"", message});
        }
      }
      addCryptoLiveActivity(live, timestamp, "CRYPTO_LIVE_KILL_SWITCH", "", `Binance Spot acil durdurma: ${closed} takip edilen pozisyon kapandı, ${pending} broker satışı dolum teyidi bekliyor.`);
      await saveTradingState(state, stateResult.sha, stateResult.container);
      return {activate, cancelled, failed, closed, pending, message:`Binance Spot acil durdurma: ${closed} BorsaCI pozisyonu kapandı, ${pending} broker satış emri teyit bekliyor; ${cancelled.length} BorsaCI açık emri iptal edildi.`};
    });
    void sendTelegramNotification(`🛑 BORSACI · CRYPTO ACİL DURDURMA\n${result.message}`);
    return sendJSON(res, 200, {success:result.failed.length === 0, ...result});
  } catch (error) {
    return sendJSON(res, 400, {
      success: false,
      cancelled: [],
      failed: [],
      error: {
        code: String(error?.code || "BINANCE_KILL_SWITCH_FAILED"),
        message: String(error?.message || "Binance Spot acil durdurma tamamlanamadı.")
      }
    });
  }
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
    // closeTime tam olarak simdiye esit olsa bile mum kapanisi kaynaga
    // yerlesmeden stratejiye girmesin; acik gunluk mum fail-closed atilir.
    .filter(row => Number(row?.[6]) < Date.now())
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

function compactCryptoAiPendingOrders(paper, timestamp = new Date().toISOString()) {
  const active = ["PENDING_APPROVAL", "PENDING_LIMIT"];
  const groups = new Map();
  for (const decision of paper.decisions || []) {
    if (!active.includes(decision.status)) continue;
    const group = String(decision.pendingOrder?.source || decision.source || "").toUpperCase() === "MANUAL" ? "MANUAL" : "AI";
    groups.set(group, [...(groups.get(group) || []), decision]);
  }
  const superseded = [...groups.values()].flatMap(items =>
    items.sort((a, b) => String(b.pendingOrder?.updatedAt || b.timestamp || "").localeCompare(String(a.pendingOrder?.updatedAt || a.timestamp || ""))).slice(1)
  );
  if (!superseded.length) return false;
  paper.history = superseded.map(decision => ({
    ...decision,
    status: "SUPERSEDED",
    closedAt: timestamp,
  })).concat(paper.history || []).slice(0, 100);
  paper.decisions = paper.decisions.filter(decision => !superseded.includes(decision));
  paper.activity = [{
    timestamp,
    type: "CRYPTO_PENDING_COMPACTED",
    message: "Eski kripto bekleyen emir taslakları tek güncel planla birleştirildi.",
  }, ...(paper.activity || [])].slice(0, 100);
  return true;
}

async function handleCryptoState(req, res) {
  try {
    const stateResult = await getTradingState();
    const state = stateResult.content;
    if (compactCryptoAiPendingOrders(state.cryptoPaper)) {
      await saveTradingState(state, stateResult.sha, stateResult.container);
    }
    return sendJSON(res, 200, {paperOnly: true, cryptoPaper: cryptoPaperStateForClient(state)});
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

async function handleCryptoKillSwitch(req, res) {
  try {
    const input = await readTradingRequest(req);
    const expectedPassword = String(process.env.KILL_SWITCH_PASSWORD || "");
    if (!expectedPassword) throw new Error("KILL_SWITCH_PASSWORD Render ortamında ayarlı değil.");
    if (String(input.password || "") !== expectedPassword) throw new Error("Acil durdurma şifresi yanlış.");

    const stateResult = await getTradingState();
    const state = stateResult.content;
    const paper = state.cryptoPaper;
    const timestamp = new Date().toISOString();
    const active = input.action === "activate";
    paper.killSwitch = {active, activatedAt: active ? timestamp : null};
    let closed = 0;

    if (active) {
      for (const position of paper.positions || []) {
        if (position.status !== "OPEN") continue;
        let price = Number(position.current || position.entry || 0);
        try {
          const quote = await fetchCryptoPaperMarketPrice(position.symbol);
          if (Number.isFinite(Number(quote)) && Number(quote) > 0) price = Number(quote);
        } catch {}
        const quantity = Number(position.quantity || 0);
        position.current = price;
        position.status = "CLOSED";
        position.closedAt = timestamp;
        position.realizedPnl = roundTradingValue((price - Number(position.entry || 0)) * quantity);
        paper.cash = roundTradingValue(Number(paper.cash || 0) + price * quantity);
        paper.history = [{...position}, ...(paper.history || [])].slice(0, 100);
        closed += 1;
      }
      for (const decision of paper.decisions || []) {
        if (!["PENDING_APPROVAL", "PENDING_LIMIT"].includes(decision.status)) continue;
        decision.status = "CANCELLED";
        decision.closedAt = timestamp;
        paper.history = [{...decision}, ...(paper.history || [])].slice(0, 100);
      }
      recalculateCryptoPaper(paper);
    }

    const message = active
      ? `KRİPTO ACİL DURDURMA: ${closed} açık kripto pozisyon kapatıldı; yalnız kripto bekleyen emirleri iptal edildi.`
      : "KRİPTO acil durdurma kapatıldı; yalnız kripto yeni emirleri yeniden açılabilir.";
    paper.activity = [{timestamp, type: "CRYPTO_KILL_SWITCH", message}, ...(paper.activity || [])].slice(0, 100);
    await saveTradingState(state, stateResult.sha, stateResult.container);
    void sendTelegramNotification(`${active ? "🛑" : "🟢"} BORSACI ${message}`);
    return sendJSON(res, 200, {paperOnly: true, cryptoPaper: cryptoPaperStateForClient(state)});
  } catch (error) {
    console.error("CRYPTO KILL SWITCH ERROR:", error.message);
    return sendJSON(res, 400, {error: error.message});
  }
}

async function handleCryptoPaperQueue(req, res) {
  try {
    const input = await readTradingRequest(req);
    const stateResult = await getTradingState();
    const state = stateResult.content;
    const paper = state.cryptoPaper;
    if (paper.killSwitch?.active) throw new Error("KRİPTO acil durdurma aktif; bu sayfada yeni emir oluşturulamaz.");
    const timestamp = new Date().toISOString();
    const candidate = cryptoPaperDecisionFromInput(input, paper, timestamp);
    const isManual = String(candidate.pendingOrder?.source || "").toUpperCase() === "MANUAL";

    // YZ ve manuel panellerin her biri yalnız bir aktif taslak taşır.
    // Yeni coin planı geldiğinde aynı paneldeki eski taslak geçmişe aktarılır.
    const superseded = (paper.decisions || []).filter(decision =>
      ["PENDING_APPROVAL", "PENDING_LIMIT"].includes(decision.status) &&
      (String(decision.pendingOrder?.source || decision.source || "").toUpperCase() === "MANUAL") === isManual &&
      decision.symbol !== candidate.symbol
    );
    if (superseded.length) {
      paper.history = superseded.map(decision => ({
        ...decision,
        status: "SUPERSEDED",
        closedAt: timestamp,
      })).concat(paper.history || []).slice(0, 100);
      paper.decisions = paper.decisions.filter(decision => !superseded.includes(decision));
    }
    const existing = paper.decisions.find(decision =>
      ["PENDING_APPROVAL", "PENDING_LIMIT"].includes(decision.status) &&
      decision.symbol === candidate.symbol &&
      (String(decision.pendingOrder?.source || decision.source || "").toUpperCase() === "MANUAL") === isManual
    );
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
    if (paper.killSwitch?.active) throw new Error("KRİPTO acil durdurma aktif; bu sayfada emir onaylanamaz.");
    const decision = paper.decisions.find(value => value.id === String(input.decisionId || "") && value.status === "PENDING_APPROVAL");
    if (!decision) throw new Error("Bu kripto emri artık onay beklemiyor.");
    const order = decision.pendingOrder;
    const marketPrice = await fetchCryptoPaperMarketPrice(order.symbol);
    if (order.orderType === "LIMIT" && marketPrice > Number(order.entryPrice)) {
      const timestamp = new Date().toISOString();
      decision.status = "PENDING_LIMIT";
      decision.pendingOrder = {...order, status:"PENDING_LIMIT", lastMarketPrice:marketPrice, updatedAt:timestamp};
      decision.lifecycle = {...(decision.lifecycle || {}), stage:"PENDING_LIMIT", lastCheckedAt:timestamp, lastMarketPrice:marketPrice};
      paper.activity = [{timestamp, type:"CRYPTO_LIMIT_PENDING", message:`${order.symbol} limit alış emri $${Number(order.entryPrice)} seviyesinde izleniyor.`}, ...(paper.activity || [])].slice(0,100);
      await saveTradingState(state, stateResult.sha, stateResult.container);
      return sendJSON(res, 200, {paperOnly:true, cryptoPaper:cryptoPaperStateForClient(state)});
    }
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
    const decision = paper.decisions.find(value => value.id === String(input.decisionId || "") && ["PENDING_APPROVAL", "PENDING_LIMIT"].includes(value.status));
    if (!decision) throw new Error("Bu kripto emri artık beklemiyor.");
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

function closeMonitoredPaperPosition(paper, position, price, timestamp, type, message, quantity = Number(position.quantity || 0), roundQuantity = value => value) {
  const sold = roundQuantity(quantity);
  if (!Number.isFinite(sold) || sold <= 0) return false;
  const proceeds = roundTradingValue(price * sold);
  paper.cash = roundTradingValue(Number(paper.cash || 0) + proceeds);
  position.quantity = roundQuantity(Number(position.quantity || 0) - sold);
  position.current = price;
  const realizedPnl = roundTradingValue((price - Number(position.entry || 0)) * sold);
  if (position.quantity <= 0) {
    position.status = "CLOSED";
    position.closedAt = timestamp;
    position.realizedPnl = realizedPnl;
    paper.history = [{...position}, ...(paper.history || [])].slice(0, 100);
  }
  paper.activity = [{timestamp, type, message}, ...(paper.activity || [])].slice(0, 100);
  return true;
}

async function monitorCryptoPaperTrading(paper, timestamp) {
  if (paper.killSwitch?.active) return false;
  let changed = false;
  for (const decision of paper.decisions || []) {
    if (decision.status !== "PENDING_LIMIT") continue;
    const order = decision.pendingOrder || {};
    let price;
    try { price = await fetchCryptoPaperMarketPrice(order.symbol); } catch { continue; }
    if (!Number.isFinite(price) || price > Number(order.entryPrice || 0)) continue;
    const cost = roundTradingValue(price * Number(order.quantity || 0));
    if (cost > Number(paper.cash || 0)) continue;
    let position = (paper.positions || []).find(item => item.status === "OPEN" && item.symbol === order.symbol);
    if (!position && (paper.positions || []).filter(item => item.status === "OPEN").length >= Math.max(1, Number(paper.risk?.maxPositions) || 5)) continue;
    if (position) {
      const total = Number(position.quantity) + Number(order.quantity);
      position.entry = roundCryptoValue((Number(position.entry) * Number(position.quantity) + price * Number(order.quantity)) / total);
      position.quantity = total;
      position.current = price;
    } else {
      position = {id:`crypto-pos-${Date.now()}-${order.symbol}`, decisionId:decision.id, symbol:order.symbol, market:"CRYPTO", status:"OPEN", quantity:Number(order.quantity), entry:price, current:price, stop:order.stop, target1:order.target1, target2:order.target2, target3:order.target3, openedAt:timestamp, paperOnly:true};
      paper.positions = [position, ...(paper.positions || [])];
    }
    paper.cash = roundTradingValue(Number(paper.cash) - cost);
    decision.status = "OPEN";
    decision.lifecycle = {...(decision.lifecycle || {}), stage:"FILLED", filledAt:timestamp, lastMarketPrice:price};
    paper.activity = [{timestamp,type:"CRYPTO_LIMIT_FILLED",message:`${order.symbol} limit alış emri $${roundTradingValue(price)} ile gerçekleşti.`},...(paper.activity || [])].slice(0,100);
    changed = true;
  }
  for (const position of paper.positions || []) {
    if (position.status !== "OPEN") continue;
    let price;
    try { price = await fetchCryptoPaperMarketPrice(position.symbol); } catch { continue; }
    const before = {...position};
    const event = evaluateLongPosition(before, price, {quantityPrecision:8});
    if (!event) continue;
    const label = event.type === "TP1" ? "CRYPTO_TP1" : event.type === "TP2" ? "CRYPTO_TP2" : "CRYPTO_STOP";
    const message = event.type === "TP1"
      ? `${position.symbol} kripto TP1'de ${event.closeQuantity} miktar kapatıldı; stop girişe çekildi.`
      : event.type === "TP2"
        ? `${position.symbol} kripto TP2 hedefiyle kalan miktar kapatıldı.`
        : `${position.symbol} kripto stop seviyesiyle kalan miktar kapatıldı.`;
    const executed = closeMonitoredPaperPosition(paper, position, price, timestamp, label, message, event.closeQuantity, roundCryptoValue);
    if (!executed) continue;
    Object.assign(position, applyConfirmedMonitorEvent(before, event, {timestamp}));
    changed = true;
  }
  if (changed) recalculateCryptoPaper(paper);
  return changed;
}

function addCryptoLiveActivity(live, timestamp, type, symbol, message) {
  live.activity = [{timestamp, type, symbol, message}, ...(live.activity || [])].slice(0, 200);
}

function settleCryptoLiveMonitorEvent(live, position, before, event, price, timestamp, averagePrice = null) {
  const executionPrice = Number(averagePrice) > 0 ? Number(averagePrice) : Number(price);
  if (!Number.isFinite(executionPrice) || executionPrice <= 0) return false;
  const realized = roundTradingValue((executionPrice - Number(before.entry || 0)) * Number(event.closeQuantity || 0));
  const label = event.type === "TP1" ? "CRYPTO_LIVE_TP1" : event.type === "TP2" ? "CRYPTO_LIVE_TP2" : "CRYPTO_LIVE_STOP";
  const message = event.type === "TP1"
    ? `${position.symbol} Binance Spot TP1: ${event.closeQuantity} gerçekleşti; kalan ${event.remainingQuantity}, stop girişe çekildi. Gerçekleşen P&L: $${realized}.`
    : event.type === "TP2"
      ? `${position.symbol} Binance Spot TP2: kalan ${event.closeQuantity} gerçekleşti. Gerçekleşen P&L: $${realized}.`
      : `${position.symbol} Binance Spot SL: ${event.closeQuantity} gerçekleşti. Gerçekleşen P&L: $${realized}.`;
  Object.assign(position, applyConfirmedMonitorEvent(before, event, {timestamp}));
  position.current = executionPrice;
  position.realizedPnl = roundTradingValue(Number(before.realizedPnl || 0) + realized);
  position.broker = {...(position.broker || {}), lastConfirmedExitAt:timestamp, lastConfirmedExitPrice:executionPrice};
  position.monitor = {...(position.monitor || {}), pendingBrokerExit:null, exitBlocked:false};
  addCryptoLiveActivity(live, timestamp, label, position.symbol, message);
  if (position.status === "CLOSED") {
    position.closedAt = timestamp;
    live.history = [{...position}, ...(live.history || [])].slice(0, 200);
  }
  return true;
}

// Manuel/kill-switch çıkışlarında TP1/TP2 kurallarını yeniden çalıştırmak
// istemeyiz. Bu yardımcı yalnız broker emri TAM DOLDU olarak doğrulandığında
// kalan gerçek miktarı azaltır; kısmi dolumda pozisyon yerelde açık kalır.
function settleCryptoLiveManualExit(live, position, price, quantity, timestamp, {reason = "MANUAL", orderType = "MARKET"} = {}) {
  const executionPrice = Number(price);
  const sold = Number(quantity);
  const beforeRemaining = Number(position?.remainingQuantity ?? position?.quantity ?? 0);
  if (!Number.isFinite(executionPrice) || executionPrice <= 0 || !Number.isFinite(sold) || sold <= 0 || sold > beforeRemaining + 1e-12) return false;
  const remaining = Math.max(0, roundCryptoValue(beforeRemaining - sold));
  const realized = roundTradingValue((executionPrice - Number(position.entry || 0)) * sold);
  position.current = executionPrice;
  position.remainingQuantity = remaining;
  position.quantity = remaining;
  position.realizedPnl = roundTradingValue(Number(position.realizedPnl || 0) + realized);
  position.monitor = {...(position.monitor || {}), pendingManualExit:null, lastManualExitAt:timestamp, lastManualExitPrice:executionPrice, exitBlocked:false};
  position.broker = {...(position.broker || {}), lastConfirmedExitAt:timestamp, lastConfirmedExitPrice:executionPrice};
  const action = reason === "KILL_SWITCH" ? "acil durdurma" : "manuel";
  addCryptoLiveActivity(live, timestamp, `CRYPTO_LIVE_${reason}_FILLED`, position.symbol, `${position.symbol} Binance Spot ${action} ${String(orderType).toUpperCase()} satışı ${sold} miktar için $${roundCryptoValue(executionPrice)} ile gerçekleşti. Gerçekleşen P&L: $${realized}.`);
  if (remaining <= 1e-12) {
    position.status = "CLOSED";
    position.closedAt = timestamp;
    live.history = [{...position}, ...(live.history || [])].slice(0, 200);
  }
  return true;
}

async function resolveBinancePendingManualExit(position) {
  const pending = position?.monitor?.pendingManualExit;
  if (!pending?.orderId || !pending?.quantity) return null;
  const order = await requestBinanceSpotSigned("GET", "/api/v3/order", {symbol:position.symbol, orderId:pending.orderId});
  const executed = Number(order?.executedQty || 0);
  if (String(order?.status || "").toUpperCase() === "FILLED" && executed + 1e-12 >= Number(pending.quantity)) {
    return {confirmed:true, pending, order, averagePrice:binanceOrderAveragePrice(order, pending.referencePrice)};
  }
  const terminal = ["CANCELED", "REJECTED", "EXPIRED"].includes(String(order?.status || "").toUpperCase());
  return {confirmed:false, pending:!terminal, terminal, order};
}

async function monitorCryptoLiveEntry(live, position, timestamp) {
  const orderId = String(position?.broker?.brokerOrderId || "");
  if (!orderId) return false;
  let order;
  try {
    order = await requestBinanceSpotSigned("GET", "/api/v3/order", {symbol:position.symbol, orderId});
  } catch (error) {
    const message = String(error?.message || "Binance giriş emri okunamadı.");
    if (position?.broker?.lastError === message) return false;
    position.broker = {...(position.broker || {}), lastError:message};
    return true;
  }
  const status = String(order?.status || "").toUpperCase();
  const executedQuantity = Number(order?.executedQty || 0);
  const requestedQuantity = Number(position.originalQuantity || position.quantity || 0);
  if (status === "FILLED" && executedQuantity + 1e-12 >= requestedQuantity) {
    const entry = binanceOrderAveragePrice(order, position.plannedEntry);
    if (!Number.isFinite(entry) || entry <= 0) return false;
    position.status = "OPEN";
    position.entry = entry;
    position.current = entry;
    position.quantity = executedQuantity;
    position.remainingQuantity = executedQuantity;
    position.originalQuantity = executedQuantity;
    position.openedAt = timestamp;
    position.broker = {...(position.broker || {}), status, filledQuantity:executedQuantity, filledAveragePrice:entry, entryFilledAt:timestamp};
    addCryptoLiveActivity(live, timestamp, "CRYPTO_LIVE_ENTRY_FILLED", position.symbol, `${position.symbol} Binance Spot alış emri $${roundTradingValue(entry)} ile gerçekleşti; TP/SL takibi aktif.`);
    return true;
  }
  if (["CANCELED", "REJECTED", "EXPIRED"].includes(status)) {
    position.status = "BROKER_ENTRY_FAILED";
    position.closedAt = timestamp;
    position.broker = {...(position.broker || {}), status, filledQuantity:executedQuantity};
    addCryptoLiveActivity(live, timestamp, "CRYPTO_LIVE_ENTRY_FAILED", position.symbol, `${position.symbol} Binance Spot giriş emri ${status} durumuyla gerçekleşmedi.`);
    return true;
  }
  if (String(position?.broker?.status || "").toUpperCase() === status) return false;
  position.broker = {...(position.broker || {}), status, filledQuantity:executedQuantity};
  return true;
}

async function monitorCryptoLiveTrading(live, timestamp) {
  if (!live) return false;
  const killActive = Boolean(live.killSwitch?.active);
  let changed = false;
  for (const position of live.positions || []) {
    if (position.status !== "PENDING_BROKER_ENTRY") continue;
    if (killActive) continue;
    changed = (await monitorCryptoLiveEntry(live, position, timestamp)) || changed;
  }

  const broker = createBinanceMonitorBroker();
  for (const position of live.positions || []) {
    if (position.status !== "OPEN") continue;
    const pendingManualExit = position.monitor?.pendingManualExit;
    if (pendingManualExit?.orderId) {
      try {
        const resolved = await resolveBinancePendingManualExit(position);
        if (resolved?.confirmed) {
          changed = settleCryptoLiveManualExit(
            live,
            position,
            resolved.averagePrice || Number(pendingManualExit.referencePrice) || Number(position.current) || Number(position.entry),
            Number(pendingManualExit.quantity),
            timestamp,
            {reason:pendingManualExit.reason || "MANUAL", orderType:pendingManualExit.orderType || "MARKET"}
          ) || changed;
        } else if (resolved?.terminal) {
          position.monitor = {...(position.monitor || {}), pendingManualExit:null, exitBlocked:true, lastBrokerError:`Binance manuel çıkış emri ${String(resolved.order?.status || "tamamlanmadı")}; broker dolumu doğrulanmadı.`};
          addCryptoLiveActivity(live, timestamp, "CRYPTO_LIVE_MANUAL_EXIT_RECONCILIATION", position.symbol, `${position.symbol} Binance manuel çıkış emri tam dolmadı; yerel pozisyon açık bırakıldı.`);
          changed = true;
        }
      } catch (error) {
        const message = String(error?.message || "Binance manuel satış emri kontrol edilemedi.");
        if (position.monitor?.lastBrokerError !== message) {
          position.monitor = {...(position.monitor || {}), lastBrokerError:message};
          changed = true;
        }
      }
      continue;
    }
    if (killActive) continue;
    let price;
    try { price = await fetchCryptoPaperMarketPrice(position.symbol); } catch { continue; }
    if (!Number.isFinite(price) || price <= 0) continue;
    // Fiyat sadece monitor eşiği için anlık kullanılır. Her dakika state
    // yazmamak için tek başına kalıcı değişiklik kabul edilmez.
    position.current = price;
    const before = {...position};
    const pending = position.monitor?.pendingBrokerExit;
    if (pending?.orderId && pending?.event) {
      try {
        const resolved = await resolveBinanceMonitorExit(position);
        if (resolved?.confirmed) {
          changed = settleCryptoLiveMonitorEvent(live, position, before, resolved.event, price, timestamp, resolved.averagePrice) || changed;
        } else if (resolved?.terminal) {
          position.monitor = {...(position.monitor || {}), pendingBrokerExit:null, exitBlocked:true, lastBrokerError:`Binance çıkış emri ${String(resolved.order?.status || "tamamlanmadı")}; otomatik tekrar gönderilmedi.`};
          addCryptoLiveActivity(live, timestamp, "CRYPTO_LIVE_EXIT_RECONCILIATION", position.symbol, `${position.symbol} Binance çıkış emri tam dolmadı; broker gerçekleşmesi doğrulanmadan yerel pozisyon kapatılmadı.`);
          changed = true;
        }
      } catch (error) {
        const message = String(error?.message || "Binance çıkış emri kontrol edilemedi.");
        if (position.monitor?.lastBrokerError !== message) {
          position.monitor = {...(position.monitor || {}), lastBrokerError:message};
          changed = true;
        }
      }
      continue;
    }
    if (position.monitor?.exitBlocked) continue;

    const event = evaluateLongPosition(before, price, {quantityPrecision:8});
    if (!event) continue;
    const result = await broker.executeExit({symbol:position.symbol, quantity:event.closeQuantity, clientOrderId:`borsaci${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`});
    if (result.confirmed) {
      changed = settleCryptoLiveMonitorEvent(live, position, before, event, price, timestamp, result.averagePrice) || changed;
    } else if (result.order?.orderId) {
      position.monitor = {...(position.monitor || {}), pendingBrokerExit:{orderId:result.order.orderId, event, submittedAt:timestamp}, lastBrokerError:null};
      changed = true;
    } else {
      const message = String(result.message || result.code || "Binance exit doğrulanamadı.");
      if (position.monitor?.lastBrokerError !== message) {
        position.monitor = {...(position.monitor || {}), lastBrokerError:message};
        changed = true;
      }
    }
  }
  return changed;
}

function settleNasdaqMonitorEvent(paper, position, before, event, price, timestamp, {live = false, averagePrice = null} = {}) {
  const executionPrice = Number(averagePrice) > 0 ? Number(averagePrice) : price;
  const label = event.type === "TP1" ? "NASDAQ_TP1" : event.type === "TP2" ? "NASDAQ_TP2" : "NASDAQ_STOP";
  const realized = roundTradingValue((executionPrice - Number(before.entry || 0)) * Number(event.closeQuantity || 0));
  const message = event.type === "TP1"
    ? `${position.symbol} NASDAQ TP1'de ${event.closeQuantity} hisse kapatıldı; stop girişe çekildi. Gerçekleşen P&L: $${realized}.`
    : event.type === "TP2"
      ? `${position.symbol} NASDAQ TP2 hedefiyle kalan miktar kapatıldı. Gerçekleşen P&L: $${realized}.`
      : `${position.symbol} NASDAQ stop seviyesiyle kalan miktar kapatıldı. Gerçekleşen P&L: $${realized}.`;
  if (!closeMonitoredPaperPosition(paper, position, executionPrice, timestamp, label, message, event.closeQuantity)) return false;
  Object.assign(position, applyConfirmedMonitorEvent(before, event, {timestamp}));
  position.current = executionPrice;
  position.realizedPnl = roundTradingValue(Number(before.realizedPnl || 0) + realized);
  if (position.status === "CLOSED" && Array.isArray(paper.history) && paper.history[0]?.id === position.id) paper.history[0] = {...position};
  if (live) position.broker = {...(position.broker || {}), lastConfirmedExitAt:timestamp};
  return true;
}

async function monitorNasdaqBrokerEntry(paper, position, timestamp) {
  const orderId = position?.broker?.brokerOrderId;
  if (!ALPACA_TRADING_ENABLED || !orderId) return false;
  const previousStatus = String(position?.broker?.status || "").toLowerCase();
  const previousError = String(position?.broker?.lastError || "");
  const previousFilledQuantity = Number(position?.broker?.filledQuantity || 0);
  let order;
  try {
    order = await alpacaJson(`${alpacaTradingBase(ALPACA_TRADING_MODE)}/v2/orders/${encodeURIComponent(String(orderId))}`);
  } catch (error) {
    const message = String(error?.message || "Alpaca giriş emri okunamadı.");
    if (previousError === message) return false;
    position.broker = {...(position.broker || {}), lastError:message, lastCheckedAt:timestamp};
    return true;
  }
  const status = String(order?.status || "").toLowerCase();
  const quantity = Number(order?.filled_qty || 0);
  const fullRequested = Number(position.quantity || position.remainingQuantity || 0);
  if (status === "filled" && quantity + 1e-12 >= fullRequested) {
    const entry = Number(order?.filled_avg_price || position.plannedEntry || 0);
    if (!Number.isFinite(entry) || entry <= 0) return false;
    const cost = roundTradingValue(entry * quantity);
    position.status = "OPEN";
    position.entry = entry;
    position.current = entry;
    position.quantity = quantity;
    position.remainingQuantity = quantity;
    position.originalQuantity = quantity;
    position.openedAt = timestamp;
    position.broker = {...(position.broker || {}), status, filledQuantity:quantity, filledAveragePrice:entry, entryFilledAt:timestamp, lastCheckedAt:timestamp};
    paper.cash = roundTradingValue(Number(paper.cash || 0) - cost);
    const decision = (paper.decisions || []).find(item => item.id === position.decisionId);
    if (decision) {
      decision.status = "OPEN";
      decision.lifecycle = {...(decision.lifecycle || {}), stage:"FILLED", filledAt:timestamp, brokerOrderId:orderId};
    }
    paper.activity = [{timestamp,type:"NASDAQ_BROKER_ENTRY_FILLED",message:`${position.symbol} Alpaca emri broker tarafından $${roundTradingValue(entry)} ile gerçekleşti.`},...(paper.activity || [])].slice(0,100);
    await placeNasdaqEmergencyStop(position, timestamp);
    return true;
  }
  if (["canceled", "expired", "rejected", "suspended", "stopped"].includes(status)) {
    position.status = "BROKER_ENTRY_FAILED";
    position.closedAt = timestamp;
    position.broker = {...(position.broker || {}), status, lastCheckedAt:timestamp};
    const decision = (paper.decisions || []).find(item => item.id === position.decisionId);
    if (decision) {
      decision.status = "REJECTED";
      decision.closedAt = timestamp;
      paper.history = [{...decision}, ...(paper.history || [])].slice(0,100);
    }
    paper.activity = [{timestamp,type:"NASDAQ_BROKER_ENTRY_FAILED",message:`${position.symbol} Alpaca giriş emri ${status} durumuyla gerçekleşmedi.`},...(paper.activity || [])].slice(0,100);
    return true;
  }
  if (previousStatus === status && previousFilledQuantity === quantity && !previousError) return false;
  position.broker = {...(position.broker || {}), status, filledQuantity:quantity, lastError:null, lastCheckedAt:timestamp};
  return true;
}

async function monitorNasdaqPaperTrading(paper, timestamp) {
  const killActive = Boolean(paper?.killSwitch?.active);
  let changed = false;

  // Yerel paper limit emirleri yalnız canlı Alpaca emir akışı kapalıysa local
  // fiyatla doldurulur. Canlı modda onay emri doğrudan broker'a gider ve
  // PENDING_BROKER_ENTRY olarak broker fill'i bekler.
  if (!killActive && !ALPACA_TRADING_ENABLED) {
    for (const decision of paper.decisions || []) {
      if (decision.status !== "PENDING_LIMIT") continue;
      const order = decision.pendingOrder || {};
      let quote;
      try { quote = await fetchNasdaqMonitorPrice(order.symbol); } catch { continue; }
      const price = Number(quote?.price);
      if (!Number.isFinite(price) || price > Number(order.entryPrice || 0)) continue;
      const cost = roundTradingValue(price * Number(order.quantity || 0));
      if (cost > Number(paper.cash || 0)) continue;
      let position = (paper.positions || []).find(item => item.status === "OPEN" && item.symbol === order.symbol);
      if (!position && (paper.positions || []).filter(item => item.status === "OPEN").length >= Math.max(1, Number(paper.risk?.maxPositions) || 5)) continue;
      if (position) {
        const total = Number(position.quantity) + Number(order.quantity);
        position.entry = roundTradingValue((Number(position.entry) * Number(position.quantity) + price * Number(order.quantity)) / total);
        position.quantity = total; position.remainingQuantity = total; position.current = price;
      } else {
        position = {id:`nasdaq-pos-${Date.now()}-${order.symbol}`,decisionId:decision.id,symbol:order.symbol,market:"NASDAQ",status:"OPEN",quantity:Number(order.quantity),remainingQuantity:Number(order.quantity),originalQuantity:Number(order.quantity),entry:price,current:price,stop:order.stop,target1:order.target1,target2:order.target2,target3:order.target3,openedAt:timestamp,broker:{submitted:false,mode:"LOCAL_PAPER"}};
        paper.positions = [position, ...(paper.positions || [])];
      }
      paper.cash = roundTradingValue(Number(paper.cash) - cost);
      decision.status = "OPEN";
      decision.lifecycle = {...(decision.lifecycle || {}), stage:"FILLED", filledAt:timestamp, lastMarketPrice:price};
      paper.activity = [{timestamp,type:"NASDAQ_LIMIT_FILLED",message:`${order.symbol} NASDAQ limit alış emri $${roundTradingValue(price)} ile gerçekleşti.`},...(paper.activity || [])].slice(0,100);
      changed = true;
    }
  }

  for (const position of paper.positions || []) {
    if (position.status !== "PENDING_BROKER_ENTRY") continue;
    if (killActive) continue;
    changed = (await monitorNasdaqBrokerEntry(paper, position, timestamp)) || changed;
  }

  const liveBroker = createAlpacaMonitorBroker();
  for (const position of paper.positions || []) {
    if (position.status !== "OPEN") continue;
    const isBrokerBacked = Boolean(ALPACA_TRADING_ENABLED && position.broker?.submitted);
    if (isBrokerBacked) {
      changed = (await reconcileNasdaqEmergencyStop(paper, position, timestamp)) || changed;
      if (position.status !== "OPEN") continue;
      if (!position.broker?.protection?.orderId && !position.monitor?.pendingManualExit && !position.monitor?.pendingBrokerExit) {
        changed = (await placeNasdaqEmergencyStop(position, timestamp)) || changed;
      }
    }
    const pendingManualExit = position.monitor?.pendingManualExit;
    if (isBrokerBacked && pendingManualExit?.orderId) {
      try {
        const resolved = await resolveNasdaqPendingManualExit(position);
        if (resolved?.confirmed) {
          const settled = settleNasdaqManualExit(
            paper,
            position,
            resolved.averagePrice || Number(pendingManualExit.referencePrice) || Number(position.current) || Number(position.entry),
            Number(pendingManualExit.quantity),
            timestamp,
            {reason:pendingManualExit.reason || "MANUAL", live:true, orderType:pendingManualExit.orderType || "MARKET"}
          );
          changed = settled || changed;
          if (settled && position.status === "OPEN") changed = (await placeNasdaqEmergencyStop(position, timestamp)) || changed;
        } else if (resolved?.terminal) {
          position.monitor = {...(position.monitor || {}), pendingManualExit:null, lastBrokerError:`Alpaca manuel çıkış emri ${String(resolved.order?.status || "tamamlanmadı")}; broker dolumu doğrulanmadı.`};
          paper.activity = [{timestamp, type:"NASDAQ_BROKER_EXIT_RECONCILIATION", message:`${position.symbol} NASDAQ broker satışı tam dolmadı; yerel pozisyon açık bırakıldı.`}, ...(paper.activity || [])].slice(0,100);
          changed = true;
        }
      } catch (error) {
        const message = String(error?.message || "Alpaca manuel satış emri kontrol edilemedi.");
        if (position.monitor?.lastBrokerError !== message) {
          position.monitor = {...(position.monitor || {}), lastBrokerError:message};
          changed = true;
        }
      }
      continue;
    }

    if (killActive) continue;
    let quote;
    try { quote = await fetchNasdaqMonitorPrice(position.symbol); } catch { continue; }
    const price = Number(quote?.price);
    if (!Number.isFinite(price)) continue;
    // Güncel fiyat sadece monitor kararında kullanılır. Her 60 saniyede GitHub
    // state'ine yazılmaması için fiyat değişimi tek başına `changed` sayılmaz.
    position.current = price;
    const before = {...position};

    if (isBrokerBacked && position.monitor?.pendingBrokerExit) {
      try {
        const resolved = await resolveAlpacaMonitorExit(position);
        if (resolved?.confirmed) {
          const settled = settleNasdaqMonitorEvent(paper, position, before, resolved.event, price, timestamp, {live:true, averagePrice:resolved.averagePrice});
          changed = settled || changed;
          if (settled && position.status === "OPEN") changed = (await placeNasdaqEmergencyStop(position, timestamp)) || changed;
        } else if (resolved?.terminal) {
          position.monitor = {...(position.monitor || {}), pendingBrokerExit:null, lastBrokerError:`Alpaca çıkış emri ${String(resolved.order?.status || "tamamlanmadı")}.`};
          changed = true;
        }
      } catch (error) {
        position.monitor = {...(position.monitor || {}), lastBrokerError:String(error?.message || "Alpaca çıkış emri kontrol edilemedi."), lastBrokerCheckAt:timestamp};
        changed = true;
      }
      continue;
    }

    const event = evaluateLongPosition(before, price, {quantityPrecision:0});
    if (!event) continue;
    if (!isBrokerBacked) {
      changed = settleNasdaqMonitorEvent(paper, position, before, event, price, timestamp) || changed;
      continue;
    }

    if (!await cancelNasdaqEmergencyStop(position, timestamp)) continue;
    const result = await liveBroker.executeExit({symbol:position.symbol, quantity:event.closeQuantity, clientOrderId:automationBrokerClientOrderId("NASDAQ", position, event)});
    if (result.confirmed) {
      const settled = settleNasdaqMonitorEvent(paper, position, before, event, price, timestamp, {live:true, averagePrice:result.averagePrice});
      changed = settled || changed;
      if (settled && position.status === "OPEN") changed = (await placeNasdaqEmergencyStop(position, timestamp)) || changed;
    } else if (result.order?.orderId) {
      position.monitor = {...(position.monitor || {}), pendingBrokerExit:{orderId:result.order.orderId, event, submittedAt:timestamp}, lastBrokerCheckAt:timestamp};
      changed = true;
    } else {
      position.monitor = {...(position.monitor || {}), lastBrokerError:String(result.message || result.code || "Alpaca exit doğrulanamadı."), lastBrokerCheckAt:timestamp};
      changed = (await placeNasdaqEmergencyStop(position, timestamp)) || changed;
      changed = true;
    }
  }
  if (changed) recalculateNasdaqPaper(paper);
  return changed;
}

async function runMarketPaperMonitors() {
  if (marketPaperMonitorRunning) return;
  marketPaperMonitorRunning = true;
  try {
    const saved = await getTradingState();
    const timestamp = new Date().toISOString();
    const cryptoChanged = await monitorCryptoPaperTrading(saved.content.cryptoPaper, timestamp);
    const cryptoLiveChanged = await monitorCryptoLiveTrading(saved.content.cryptoLive, timestamp);
    const nasdaqChanged = await monitorNasdaqPaperTrading(saved.content.nasdaqPaper, timestamp);
    if (cryptoChanged || cryptoLiveChanged || nasdaqChanged) await saveTradingState(saved.content, saved.sha, saved.container);
  } finally { marketPaperMonitorRunning = false; }
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
  if (!acquireScannerExecution("CRYPTO")) {
    return sendJSON(res, 409, {success:false, error:"Kripto taraması zaten çalışıyor. Mevcut taramanın tamamlanmasını bekleyin."});
  }
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
    const ranked = fibonacciEngine.rankCandidatesWithFibonacci(valid,Date.now(),{market:"CRYPTO"},{limit:5,shortlistLimit:12}).map(item=>({
      ...item,price:item.features.price,ema20:item.features.ema20,ema50:item.features.ema50,ema200:item.features.ema200,
      rsi:item.features.rsi,macd:item.features.macd,atr:item.features.atr,volumeRatio:item.features.volumeRatio,turnover:item.features.turnover
    }));
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
      fallbackPlan: item.fallbackPlan || null,
    }));
    const existingKeys = new Set(existingSignals.map(item => `${item.symbol}:${String(item.timestamp || "").slice(0, 10)}`));
    state.cryptoPaper.signals = [...newSignals.filter(item => !existingKeys.has(`${item.symbol}:${signalTime.slice(0, 10)}`)), ...existingSignals].slice(0, 200);
    // Karar kartlarını sayfa yenilemesinden sonra da yeniden kurabilmek için
    // sadece görselde gereken sonuç alanlarını sakla. Tam OHLCV geçmişi
    // bilinçli olarak saklanmaz; grafik yeni taramada tekrar gerçek veriden kurulur.
    state.cryptoPaper.scanner = {
      timestamp: signalTime,
      scanned: cryptoSymbols.length,
      successful: valid.length,
      results: ranked.map(item => {
        const {history, ...persisted} = item;
        return persisted;
      }).slice(0, 5),
    };
    state.cryptoPaper.activity = [{timestamp: signalTime, type: "CRYPTO_SCAN", message: `${cryptoSymbols.length} USDT paritesi tarandı; ${ranked.length} aday kaydedildi.`}, ...(state.cryptoPaper.activity || [])].slice(0, 100);
    await saveTradingState(state, stateResult.sha, stateResult.container);
    updateScannerJob(jobId, 100, "Kripto taraması tamamlandı", "COMPLETE");
    return sendJSON(res, 200, {success:true, timestamp:signalTime, scanned:cryptoSymbols.length, successful:valid.length, results:ranked, cryptoPaper:cryptoPaperStateForClient(state), source:"BINANCE_PUBLIC", diagnostics:results.map(item=>({symbol:item.symbol, bars:item.history?.length||0, code:item.validation?.code||"OK"}))});
  } catch (error) {
    updateScannerJob(jobId, 100, `Kripto tarama hatası: ${error.message}`, "ERROR");
    return sendJSON(res, 500, {success:false, error:error.message});
  } finally { releaseScannerExecution("CRYPTO"); }
}

if (
  req.method === "GET" &&
  pathname === "/api/trading/paper/monitor-status"
) {
  return handlePaperMonitorStatus(req, res);
}

if (
  req.method === "GET" &&
  pathname === "/api/trading/automation/status"
) {
  return handleAutomationStatus(req, res);
}

if (
  req.method === "POST" &&
  pathname === "/api/trading/paper/decision/pending"
) {
  return withTradingStateMutation("paper-pending-override", () => handleDecisionPendingOverride(req, res));
}

if (
  req.method === "POST" &&
  (
    pathname === "/api/trading/paper/pending/update" ||
    pathname === "/api/trading/paper/order/update"
  )
) {
  return withTradingStateMutation("paper-order-update", () => handlePendingPaperOrderUpdate(req, res));
}

if (
  req.method === "POST" &&
  (
    pathname === "/api/trading/paper/manual" ||
    pathname === "/api/trading/paper/order/manual"
  )
) {
  return withTradingStateMutation("paper-manual-order", () => handleManualPaperOrder(req, res));
}

if (
  req.method === "POST" &&
  (
    pathname === "/api/trading/paper/approve" ||
    pathname === "/api/trading/paper/open"
  )
) {
  return withTradingStateMutation("paper-approval", () => handlePaperApproval(req, res));
}

if (
  req.method === "POST" &&
  pathname === "/api/trading/paper/reject"
) {
  return withTradingStateMutation("paper-rejection", () => handlePaperRejection(req, res));
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
BRAND ICONS
========================================================
*/

if (
  req.method === "GET" &&
  pathname === "/borsaci-crescent-star.png"
) {

  return serveFile(
    res,
    path.join(
      __dirname,
      "public",
      "borsaci-crescent-star.png"
    ),
    "image/png"
  );

}

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

    // Kripto callback köprüsünü browser beklemeden hazırla. Başarısız
    // olursa ilk gerçek HTTP isteği aynı köprüyü kurar; sunucu çalışmaya
    // devam eder.
    void fetch(`http://127.0.0.1:${PORT}/`, {headers:{host:"localhost"}})
      .catch(() => undefined);

    // Tek ortak pozisyon worker'i: BIST, kripto ve NASDAQ ayni 60 saniyelik
    // kilit altında izlenir. Eski ayri timer'lar kaldirildi; böylece ayni
    // TP/SL olayi iki kez islenmez ve callback-scope kripto fonksiyonuna
    // doğrudan erişim hatasi yaşanmaz.
    const triggerUnifiedPositionMonitor = source => {
      void runUnifiedPositionMonitor().catch(error => {
        console.error(`UNIFIED POSITION MONITOR ${source} ERROR:`, error.message);
      });
    };
    setTimeout(() => triggerUnifiedPositionMonitor("START"), 15000);
    setInterval(() => triggerUnifiedPositionMonitor("CYCLE"), PAPER_MONITOR_INTERVAL_MS);

    // Scheduler bir sonraki tam saatte otomatik tarama yapar. BIST ve
    // NASDAQ piyasa kapaliyken atlanir, kripto ise 7/24 calisir. Her scanner
    // yine yalniz tamamlanmis DAILY mumlari kullanir.
    marketScheduler.start();

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

    setTimeout(() => { void flushTelegramOutbox(); }, 20000);
    setInterval(() => { void flushTelegramOutbox(); }, 60 * 1000);

  }
);

