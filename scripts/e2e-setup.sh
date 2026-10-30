#!/bin/bash
# Gets the machine ready for browser checks / E2E. Standalone and re-runnable. Progress goes to
# stderr; stdout is only `export` lines, so the caller can:
#
#   eval "$(scripts/e2e-setup.sh)"
#   pnpm --filter @notes/web e2e smoke
#
# 1. Reuses a running notes Supabase stack (default, or the alt `notes-organizer-alt`).
# 2. Otherwise starts the default stack; if its ports are taken by another project, starts the
#    notes stack on shifted ports (543xx -> 553xx) from a copy of supabase/ with project_id
#    "notes-organizer-alt". Never stops another project's stack.
# 3. Picks free API / web ports for Playwright and installs the chromium browser if missing.
#
# Exits non-zero (one-line reason) only when Docker isn't running or a stack can't start.

set -uo pipefail

root=$(git rev-parse --show-toplevel) || exit 1
cd "$root" || exit 1

say() { echo "e2e-setup: $*" >&2; }
die() { echo "e2e-setup: $*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1 || die "Docker is not running; start Docker and re-run."

# `supabase` from the repo's node_modules (pnpm bin), falling back to PATH.
supa() { pnpm exec supabase "$@"; }

alt_dir="${TMPDIR:-/tmp}/notes-organizer-alt"
alt_dir="${alt_dir%/}"

running() { docker ps --format '{{.Names}}' | grep -qx "supabase_db_$1"; }

# Copy of supabase/ with every 543xx port shifted to 553xx (and the inspector 8083 -> 8183).
prepare_alt() {
  rm -rf "$alt_dir/supabase" && mkdir -p "$alt_dir" || return 1
  cp -R "$root/supabase" "$alt_dir/supabase" || return 1
  sed -E -e 's/^project_id = .*/project_id = "notes-organizer-alt"/' \
    -e 's/(=[[:space:]]*)543([0-9]{2})/\1553\2/' \
    -e 's/(=[[:space:]]*)8083/\18183/' \
    "$root/supabase/config.toml" >"$alt_dir/supabase/config.toml" || return 1
}

stack=""
if running notes-organizer; then
  stack=default
  say "reusing the running default stack"
elif running notes-organizer-alt; then
  stack=alt
  say "reusing the running alt stack"
else
  say "starting the default stack"
  out=$(supa start 2>&1)
  if [ $? -eq 0 ]; then
    stack=default
  elif grep -qiE "port is already allocated|address already in use|ports are not available" <<<"$out"; then
    say "default ports are taken by another project; starting the alt stack on 553xx"
    prepare_alt || die "could not prepare the alt stack config in $alt_dir."
    out=$(supa --workdir "$alt_dir" start 2>&1) || die "alt stack failed to start: $(tail -1 <<<"$out")"
    stack=alt
  else
    die "supabase start failed: $(tail -1 <<<"$out")"
  fi
fi

if [ "$stack" = alt ]; then
  # Pending migrations: always sync the migrations from the repo into the alt copy first.
  prepare_alt || die "could not prepare the alt stack config in $alt_dir."
  if ! out=$(supa --workdir "$alt_dir" migration up --local 2>&1); then
    if grep -q "MigrationMissingLocalError" <<<"$out"; then
      # The alt stack's history is from a different migration set (older branch); it only holds
      # throwaway test data, so rebuild it from the current migrations.
      say "alt stack has stale migration history; resetting it"
      out=$(supa --workdir "$alt_dir" db reset --local 2>&1) || die "alt db reset failed: $(tail -1 <<<"$out")"
    else
      die "alt migration up failed: $(tail -1 <<<"$out")"
    fi
  fi
  prefix=553
else
  prefix=543
fi

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
export DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:${prefix}22/postgres'
export SUPABASE_URL='http://127.0.0.1:${prefix}21'
export VITE_SUPABASE_URL='http://127.0.0.1:${prefix}21'
export VITE_SUPABASE_ANON_KEY='${anon_key}'
export ALLOWED_EMAILS='${allowed}'
export E2E_API_PORT='${api_port}'
export E2E_WEB_PORT='${web_port}'
OUT
say "ready (${stack} stack)"
