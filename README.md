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
issue #18. After the deploy, sign in on the web URL with an address from `ALLOWED_EMAILS`, then
add everyone else in the app: see [docs/adding-users.md](docs/adding-users.md).

## Ralph

Issues labeled `ready-for-agent` are built by the ralph loop: `./run-ralph.sh` (all unblocked
issues) or `./run-ralph.sh <N>` (one). See `ralph/shared.md`.
