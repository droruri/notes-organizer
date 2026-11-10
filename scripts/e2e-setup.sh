#!/bin/bash
# Gets the machine ready for browser checks / E2E. Standalone and re-runnable. Progress goes to
# stderr; stdout is only `export` lines, so the caller can:
#
#   eval "$(scripts/e2e-setup.sh)"
#   pnpm --filter @notes/web e2e smoke
#
# 1. Starts (or refreshes) THIS worktree's own Supabase stack with `scripts/test-env.sh up --fresh`:
#    db, auth, rest and kong, the same set CI runs, rebuilt from the migrations and seeded from
#    supabase/seed.sql, so no data carries over between runs. Never the shared default/alt stack,
#    and never another project's or worktree's stack.
# 2. Reads the stack's URLs from the .env.test that test-env.sh wrote.
# 3. Picks free API / web ports for Playwright and installs the chromium browser if missing.
#
# Exits non-zero (one-line reason) only when Docker isn't running or the stack can't start.

set -uo pipefail

root=$(git rev-parse --show-toplevel) || exit 1
cd "$root" || exit 1

say() { echo "e2e-setup: $*" >&2; }
die() { echo "e2e-setup: $*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1 || die "Docker is not running; start Docker and re-run."

say "starting a fresh per-worktree stack"
scripts/test-env.sh up --fresh >/dev/null || die "test-env failed (see the test-env: line above)."

env_value() { sed -n "s/^$1=//p" .env.test | head -1; }
db_url=$(env_value DATABASE_URL)
supabase_url=$(env_value SUPABASE_URL)
[ -n "$db_url" ] && [ -n "$supabase_url" ] || die ".env.test lacks DATABASE_URL or SUPABASE_URL."

free_port() {
  node -e "const s=require('net').createServer().listen(0,()=>{console.log(s.address().port);s.close()})"
}

api_port=$(free_port)
web_port=$(free_port)

# Playwright browser: install only when missing.
missing=$(cd apps/web && pnpm exec node -e "
const fs=require('fs');
const p=require('@playwright/test').chromium.executablePath();
process.stdout.write(fs.existsSync(p)?'ok':'missing');" 2>/dev/null)
if [ "$missing" != ok ]; then
  say "installing the Playwright chromium browser"
  (cd apps/web && pnpm exec playwright install chromium) >&2 || die "playwright chromium install failed."
else
  say "Playwright chromium already installed"
fi

# The local stack's anon key is the same for every local stack; pin it from .env.example so a
# hosted key in the caller's environment can't leak into the run.
anon_key=$(sed -n 's/^VITE_SUPABASE_ANON_KEY=//p' .env.example | head -1)
# Same for the dev sign-in's allowlist: a personal .env must not lock the dev user out.
allowed=$(sed -n 's/^ALLOWED_EMAILS=//p' .env.example | head -1)

cat <<OUT
export DATABASE_URL='${db_url}'
export SUPABASE_URL='${supabase_url}'
export VITE_SUPABASE_URL='${supabase_url}'
export VITE_SUPABASE_ANON_KEY='${anon_key}'
export ALLOWED_EMAILS='${allowed}'
export E2E_API_PORT='${api_port}'
export E2E_WEB_PORT='${web_port}'
OUT
say "ready (per-worktree stack)"
