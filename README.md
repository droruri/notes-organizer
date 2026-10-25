# notes-organizer

The design lives in **[`docs/plan.md`](docs/plan.md)**. Conventions are in [`CLAUDE.md`](CLAUDE.md).

## Setup

Node.js 22.9+, pnpm 10 (`corepack enable`) and Docker (for the local Supabase stack).

```sh
pnpm install
pnpm dev   # Supabase + API on :3000 + web on :5173
```

### Local apps against hosted Supabase + real AI

```sh
pnpm dev:hosted   # API on :3000 (debugger on :9229) + web on :5173, no local Supabase
```

Env layers: `.env.example`, then `.env`, then the git-ignored root `.env.hosted` (overrides only).
The API fails at start if `.env.hosted` is missing. The API keys (`ANTHROPIC_API_KEY`,
`GROQ_API_KEY`, `JINA_API_KEY`) stay in `.env`; `WEB_ORIGIN`, `PORT` and `VITE_API_URL` stay local.

```sh
# .env.hosted
DATABASE_URL=postgresql://postgres.<ref>:<db-password>@<pooler-host>:5432/postgres?sslmode=no-verify
SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<hosted publishable key>
ALLOWED_EMAILS=<same value as the hosted API>
AI_FAKE=
```

> **Warning:** writes hit the real database, and AI calls (Claude, Groq Whisper) are real, paid calls.

The Node debugger listens on port 9229 (attach from WebStorm or `chrome://inspect`). One manual
step: in the Supabase dashboard, open Authentication → URL Configuration and add
`http://localhost:5173` as a redirect URL.

## Deploying

Free hosting: Supabase (database + Google sign-in), Render (API), Cloudflare Pages (web),
cron-job.org (keep-alive pings: `/health` every 14 min 07:00–23:00, `/health?deep=1` daily).

```sh
pnpm setup:hosted    # wizard: walks through the accounts and keys, fills .env (re-runnable)
pnpm deploy:hosted   # idempotent; a part whose keys are missing is skipped with a warning
```

Needs `jq`. The keys are listed under "Hosted setup" in `.env.example`; the manual steps are in
issue #18. After the deploy, sign in on the web URL with an address from `ALLOWED_EMAILS`, then
add everyone else in the app: see [docs/adding-users.md](docs/adding-users.md).

## Android

The hosted PWA packaged as a Trusted Web Activity ([Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap), config in `apps/web/twa-manifest.json`). Needs JDK 17+ and `jq`.

```sh
# 1. once: keytool -genkeypair -keystore android.keystore -alias notes -keyalg RSA -keysize 2048 -validity 10000
#    then put ANDROID_KEYSTORE, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS and
#    ANDROID_KEYSTORE_SHA256 (from `keytool -list -v -keystore android.keystore`) in .env
pnpm build:android   # skips with a warning when ANDROID_KEYSTORE* is unset
pnpm deploy:hosted   # publishes the regenerated .well-known/assetlinks.json with the web
adb install apps/web/android/app-release-signed.apk
```

The build writes `app-release-bundle.aab` (Play Store) and `app-release-signed.apk` to `apps/web/android/`, and regenerates `apps/web/public/.well-known/assetlinks.json` from the fingerprint, so deploy the web after building. Set `HOSTED_WEB_URL` if the web host differs from the one in `twa-manifest.json`.

Share-target check: in YouTube or Chrome tap Share, pick the notes app, and the add-note screen opens with the link prefilled. If a browser address bar shows, the asset links don't match the signing key.

## Ralph

Issues labeled `ready-for-agent` are built by the ralph loop: `./run-ralph.sh` (all unblocked
issues) or `./run-ralph.sh <N>` (one). See `ralph/shared.md`.
