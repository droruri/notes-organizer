# notes-organizer

The design lives in **[`docs/plan.md`](docs/plan.md)**. Conventions are in [`CLAUDE.md`](CLAUDE.md).

## Setup

Node.js 22.9+, pnpm 10 (`corepack enable`) and Docker (for the local Supabase stack).

```sh
pnpm install
pnpm dev   # Supabase + API on :3000 + web on :5173
```

## Deploying

Free hosting: Supabase (database + Google sign-in), Render (API), Cloudflare Pages (web),
cron-job.org (keep-alive pings: `/health` every 14 min 07:00–23:00, `/health?deep=1` daily).

```sh
pnpm setup:hosted    # wizard: walks through the accounts and keys, fills .env (re-runnable)
pnpm deploy:hosted   # idempotent; a part whose keys are missing is skipped with a warning
```

Needs `jq`. The keys are listed under "Hosted setup" in `.env.example`; the manual steps are in
issue #18. After the deploy, sign in on the web URL with an address from `ALLOWED_EMAILS`.

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
