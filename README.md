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

## Local verification

```powershell
npm install
npm test
```

For a manual check, open the site, log in, then use the normal UI. A request to a protected `/api/*` endpoint without a browser session must return `401 Unauthorized`.
