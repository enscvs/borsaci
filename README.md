# BorsaCI

BorsaCI is a single-user BIST analysis and paper-trading terminal.

## Secure access setup

The app is locked by default. Set these variables in Render before deploying:

- `AUTH_PASSWORD_HASH` — bcrypt hash of your login password, never the plaintext password.
- `SESSION_SECRET` — a cryptographically random secret used to sign server sessions.

Generate a password hash without putting the password in source code:

```powershell
node -e "const bcrypt=require('bcryptjs'); const readline=require('readline'); const rl=readline.createInterface({input:process.stdin,output:process.stdout}); rl.question('Password: ', async p => { console.log(await bcrypt.hash(p, 12)); rl.close(); });"
```

Generate a session secret:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Copy each generated value into its matching Render environment variable. Do not commit either value.

Sessions expire after 12 hours and are removed on logout or server restart. API requests require an authenticated session; state-changing requests also require same-origin and CSRF validation.

AI sağlayıcıları opsiyoneldir. `GROQ_API_KEY`, `GEMINI_API_KEY` veya `MISTRAL_API_KEY` değişkenlerinden en az biri tanımlıysa analiz bu sağlayıcılarla sırayla çalışır; hiçbiri tanımlı değilse piyasa, scanner ve paper özellikleri açık kalır, yalnız AI değerlendirmesi kullanılamaz.

## Telegram paper approval

Paper işlemleri tarama sonunda otomatik açılmaz. Uygun adaylar önce sitedeki `PAPER TRADE APPROVAL` kutusunda ve Telegram'da onay bekler. Telegram içi onay düğmesi için Render'a şu değişkenleri ekleyin:

- `TELEGRAM_WEBHOOK_SECRET` — uzun, rastgele ve yalnızca Render'da saklanan bir değer.
- `PUBLIC_BASE_URL` — örneğin `https://gemini-borsaci.onrender.com` (Render `RENDER_EXTERNAL_URL` veriyorsa gerekmez).

Servis yeniden başlatıldığında webhook otomatik kaydedilir. Telegram onayı, yalnızca yapılandırılmış chat ID'den gelen ve webhook secret ile doğrulanan callback'lerde paper işlem açar.

## Local verification

```powershell
npm install
npm test
```

For a manual check, open the site, log in, then use the normal UI. A request to a protected `/api/*` endpoint without a browser session must return `401 Unauthorized`.

## NASDAQ / Alpaca

The NASDAQ tab uses the same scanner, technical score, Fibonacci plan, approval flow and paper-position UI as BIST, while keeping its state separate. Market data is requested server-side from Alpaca in completed `1Day` bars; no Alpaca credential reaches the browser.

Add these Render environment variables before using the NASDAQ scanner:

- `ALPACA_API_KEY_ID`
- `ALPACA_API_SECRET_KEY`
- `ALPACA_DATA_FEED=sip` (the app labels an IEX fallback when SIP is unavailable)
- `NASDAQ_UNIVERSE_LIMIT=50` (optional, allowed range 20–100; aktif NASDAQ evreni önce önceki tamamlanmış günlük mumdaki dolar hacmine göre sıralanır)
- `NASDAQ_HISTORY_DAYS=62` (optional, allowed range 45–90; NASDAQ teknik/Fibonacci analizi için yaklaşık iki aylık günlük pencere)
- `ALPACA_TRADING_MODE=paper`
- `ALPACA_TRADING_ENABLED=false`

With the default `false`, approvals create only local NASDAQ paper positions. The server-side Alpaca order path is prepared but does not submit an external order. Enable it only after testing an Alpaca paper account by setting `ALPACA_TRADING_ENABLED=true`; use `ALPACA_TRADING_MODE=live` only when intentionally authorizing live Alpaca orders.

## Binance private Spot gateway (optional)

Public crypto candles, prices and the scanner continue to use `BINANCE_PUBLIC_BASE_URLS`. If Render cannot reach Binance Global private Spot endpoints, set `BINANCE_PRIVATE_GATEWAY_URL` to a trusted HTTPS proxy base URL and set a long random `BINANCE_PRIVATE_GATEWAY_TOKEN`. Leave both empty to retain the direct Binance fallback behavior.

The BorsaCI server still creates the HMAC signature and keeps `BINANCE_API_KEY` / `BINANCE_API_SECRET` server-side. The gateway receives the same Binance request shape: `GET`/`DELETE` requests keep the exact signed `/api/v3/...` query string, while `POST` requests use the exact signed form body and `X-MBX-APIKEY` header. It must forward only `/api/v3/*` to Binance Global without logging the API-key header or request body/query. It must also forward `GET /api/v3/time` for clock synchronization. Configure the same random value as Worker secret `BORSACI_GATEWAY_TOKEN`; the server sends it only as `X-Borsaci-Gateway-Token` to the gateway.


## Precision Engine

Scanner artık doğrulanmamış 0–100 puanını başarı olasılığı olarak kullanmaz. Günlük OHLCV verisi doğrulanır, XU100 piyasa rejimi ve göreceli güç hesaplanır; ilk strateji yalnızca trend içindeki kontrollü geri çekilme ve teyittir. Model artefaktı kalibre edilene kadar sonuçlar `KALİBRE EDİLMEDİ`, `İZLE` veya `İŞLEM YOK` olur ve yeni paper işlem açılmaz.

Backtest etiketleri sinyalden sonraki seansın açılışından başlar; aynı günlük mumda hedef ve stop birlikte görülürse muhafazakâr olarak LOSS sayılır. Walk-forward doğrulama kronolojiktir ve purge/embargo uygular. Geçmiş sonuçlar garanti değildir.



## iPhone PWA OneSignal Web Push

Bu entegrasyon Apple Developer Program üyeliği veya PostgreSQL gerektirmez.
Cihaz aboneliği ve bildirim teslimatı OneSignal tarafından tutulur. BorsaCI'nin
zaten çalışan sunucusu sinyal oluştuğunda OneSignal REST API'sine yalnızca
sunucudan sunucuya bir HTTPS isteği gönderir; ek Render veritabanı veya disk
servisi kullanılmaz.

OneSignal paneli:

1. Web platformunu **Custom Code** olarak yapılandırın.
2. Site URL'sini `https://gemini-borsaci.onrender.com` yapın.
3. App ID `37d4853e-17da-4ebe-9220-372f2964a8e4` olmalıdır.
4. Service Worker yolu `push/onesignal/OneSignalSDKWorker.js`, kapsamı
   `/push/onesignal/` olarak kalır. Kök kapsamındaki `/sw.js` PWA'ya aittir.
5. Otomatik izin isteme kapalıdır; izin yalnız Kontrol sekmesindeki düğmeden istenir.

Mevcut BorsaCI sunucusunun environment değişkenleri:

- `ONESIGNAL_APP_ID=37d4853e-17da-4ebe-9220-372f2964a8e4`
- `ONESIGNAL_APP_API_KEY=<OneSignal App API Key>`
- `ONESIGNAL_ALLOWED_SUBSCRIPTION_ID=<yalnız iPhone cihaz ID'si>`
- `WEB_PUSH_PROVIDER=legacy` (ilk gerçek cihaz doğrulamasına kadar)
- `ONESIGNAL_API_TIMEOUT_MS=5000` (opsiyonel)

`ONESIGNAL_APP_API_KEY` tarayıcıya, repoya veya loglara yazılmaz. Tarayıcıdan
gelen bir cihaz ID'si sunucu hedefini otomatik değiştirmez. Sunucu yalnız
environment'taki tek `ONESIGNAL_ALLOWED_SUBSCRIPTION_ID` değerini
`include_subscription_ids` ile hedefler; segment veya tüm aboneler kullanılmaz.

İlk cihaz kaydı ve test:

1. iOS/iPadOS 16.4 veya yenisinde siteyi Safari'de açın ve Ana Ekrana ekleyin.
2. PWA'yı simgesinden açıp BorsaCI oturumuna giriş yapın.
3. Kontrol > iPhone Bildirimleri bölümünde OneSignal'ı etkinleştirin.
4. Gösterilen Subscription ID'yi kopyalayıp sunucu environment'ına
   `ONESIGNAL_ALLOWED_SUBSCRIPTION_ID` olarak ekleyin ve mevcut servisi yeniden dağıtın.
5. Kontrol ekranındaki **TEST BİLDİRİMİ GÖNDER** düğmesini kullanın.
6. Bildirimin iPhone'a gerçekten geldiğini ve dokununca doğru sekmenin açıldığını
   doğruladıktan sonra `WEB_PUSH_PROVIDER=onesignal` yapın.

`WEB_PUSH_PROVIDER` tek kanal seçer; bu nedenle aynı telefona legacy VAPID ve
OneSignal üzerinden çift bildirim gönderilmez. Eski `WEB_PUSH_*` kodu ilk
aşamada geri dönüş seçeneği olarak korunur. Telegram teslimatı, outbox ve retry
akışı OneSignal'dan bağımsızdır.

Service Worker'lar hiçbir `/api/*` yanıtını, finansal veriyi veya kimlik
doğrulama yanıtını önbelleğe almaz. OneSignal yapılandırma ve test uçları mevcut
session cookie, same-origin ve CSRF korumasından geçer.
