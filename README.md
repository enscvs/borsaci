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


## Precision Engine

Scanner artık doğrulanmamış 0–100 puanını başarı olasılığı olarak kullanmaz. Günlük OHLCV verisi doğrulanır, XU100 piyasa rejimi ve göreceli güç hesaplanır; ilk strateji yalnızca trend içindeki kontrollü geri çekilme ve teyittir. Model artefaktı kalibre edilene kadar sonuçlar `KALİBRE EDİLMEDİ`, `İZLE` veya `İŞLEM YOK` olur ve yeni paper işlem açılmaz.

Backtest etiketleri sinyalden sonraki seansın açılışından başlar; aynı günlük mumda hedef ve stop birlikte görülürse muhafazakâr olarak LOSS sayılır. Walk-forward doğrulama kronolojiktir ve purge/embargo uygular. Geçmiş sonuçlar garanti değildir.

`data/precision-model.json` yalnızca doğrulanmış, ayrı kalibrasyon ve test dönemleriyle üretilmiş model artefaktı ile güncellenmelidir. Yayın eşiği: en az 300 test dışı sinyal, masraf sonrası pozitif beklenti, profit factor ≥ 1.5, yeterli kalibrasyon ve en az 100 paper işlem. Güncel evrenle yapılan tarihsel test survivorship bias taşıyabilir; bu raporda açıkça belirtilmelidir.
