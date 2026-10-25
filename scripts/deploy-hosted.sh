#!/bin/bash
# One-command hosted deploy (README → "Deploying"): hosted Supabase migrations and Google
# provider, the Render API service, the Cloudflare Pages site, the two cron-job.org keep-alive
# jobs, then a live check. Idempotent — safe to re-run; it finds what exists and updates it.
#
# Each part runs only when its keys are in `.env` (see .env.example → "Hosted setup"); a part
# with missing keys is skipped with a warning, and the rest still runs. `pnpm setup:hosted`
# is the wizard that fills `.env`.
#
#   pnpm deploy:hosted

set -uo pipefail
cd "$(dirname "$0")/.."
if [ -f .env ]; then
  set -a; source .env; set +a
fi

# owner/repo from the git remote (https or ssh form).
slug=$(git remote get-url origin 2>/dev/null | sed -E 's#^(git@github.com:|https://github.com/)##; s#\.git$##')
GH_OWNER=${slug%%/*}
GH_REPO=${slug##*/}
RENDER_SERVICE=notes-api
PAGES_PROJECT=notes-web

# Filled in as the parts run; HOSTED_API_URL / HOSTED_WEB_URL in .env stand in for a skipped part.
API_URL=${HOSTED_API_URL:-}
WEB_URL=${HOSTED_WEB_URL:-}
SUPABASE_URL_HOSTED=""
ANON_KEY=""
DB_URL=""
FAILED=0

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
skip() { printf '  \033[33mskipped:\033[0m %s\n' "$*"; }
fail() { printf '  \033[31mFAIL:\033[0m %s\n' "$*"; FAILED=1; }
ok() { printf '  \033[32mok:\033[0m %s\n' "$*"; }
# Prints the names of the given variables that are empty.
missing() { local m=""; for v in "$@"; do [ -z "${!v:-}" ] && m="$m $v"; done; echo "$m"; }

# api <METHOD> <url> <bearer token> [json body] → response body on stdout; non-2xx → error, returns 1.
api() {
  local method=$1 url=$2 token=$3 body=${4:-} out code
  out=$(curl -sS -X "$method" "$url" -H "Authorization: Bearer $token" \
    -H 'Content-Type: application/json' -H 'Accept: application/json' \
    ${body:+--data "$body"} -w '\n%{http_code}') || return 1
  code=${out##*$'\n'}
  out=${out%$'\n'*}
  if [ "${code:0:1}" != 2 ]; then
    printf '  %s %s → HTTP %s: %s\n' "$method" "$url" "$code" "${out:0:300}" >&2
    return 1
  fi
  printf '%s' "$out"
}

# check <label> <url> <jq filter, or "" for any 2xx> — polls up to ~10 min (a fresh or sleeping
# free-tier service takes a while); returns 1 after recording a failure.
check() {
  local label=$1 url=$2 want=$3 i got
  for i in $(seq 1 40); do
    got=$(curl -s --max-time 30 "$url")
    if [ -n "$want" ] && jq -e "$want" <<<"$got" >/dev/null 2>&1; then ok "$label → $got"; return 0; fi
    if [ -z "$want" ] && curl -sf --max-time 30 -o /dev/null "$url"; then ok "$label → 200"; return 0; fi
    sleep 15
  done
  fail "$label ($url) → ${got:0:200}"
  return 1
}

command -v jq >/dev/null || { echo "jq is required (brew install jq)"; exit 1; }

# ── Supabase: keys, pooler string, migrations ────────────────────────────────
say "Supabase"
m=$(missing SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_REF SUPABASE_DB_PASSWORD)
if [ -n "$m" ]; then
  skip "set$m"
else
  SB=https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF
  SUPABASE_URL_HOSTED=https://$SUPABASE_PROJECT_REF.supabase.co
  # Prefer the new publishable key; fall back to the legacy anon key.
  if keys=$(api GET "$SB/api-keys" "$SUPABASE_ACCESS_TOKEN"); then
    ANON_KEY=$(jq -r '(map(select(.type == "publishable")) + map(select(.name == "anon")))[0].api_key // empty' <<<"$keys")
  fi
  [ -n "$ANON_KEY" ] && ok "publishable key found" || fail "no publishable/anon key"
  # Session pooler (port 5432): Render has no IPv6 and the direct host is IPv6-only.
  if pooler=$(api GET "$SB/config/database/pooler" "$SUPABASE_ACCESS_TOKEN"); then
    read -r db_user db_host < <(jq -r 'map(select(.database_type == "PRIMARY"))[0] | "\(.db_user // "") \(.db_host // "")"' <<<"$pooler")
    if [ -z "${db_host:-}" ]; then fail "no primary pooler in the Supabase config"; else
    pw=$(jq -rn --arg p "$SUPABASE_DB_PASSWORD" '$p | @uri')
    DB_URL="postgresql://$db_user:$pw@$db_host:5432/postgres"
    ok "session pooler: $db_host"
    if pnpm exec supabase db push --db-url "$DB_URL" --yes 2>&1 | tail -5 | sed 's/^/  /' && [ "${PIPESTATUS[0]}" -eq 0 ]; then
      ok "migrations pushed"
    else
      fail "supabase db push"
      DB_URL=""
    fi
    fi
  else
    fail "could not read the pooler config"
  fi
fi

# ── Render: find or create the one free service ─────────────────────────────
# Created first so its URL is known; env vars are set after Pages, once WEB_URL is known.
say "Render (API)"
RENDER_ID=""
m=$(missing RENDER_API_KEY)
if [ -n "$m" ]; then
  skip "set$m"
else
  R=https://api.render.com/v1
  settings=$(jq -n '{
    branch: "main", autoDeploy: "yes",
    buildFilter: { paths: ["apps/api/**", "packages/shared/**", "package.json", "pnpm-lock.yaml"], ignoredPaths: [] },
    serviceDetails: {
      healthCheckPath: "/health",
      envSpecificDetails: {
        buildCommand: "npx -y pnpm@10.34.5 install --frozen-lockfile --filter @notes/api...",
        startCommand: "cd apps/api && npm start"
      }
    }
  }')
  if found=$(api GET "$R/services?type=web_service&limit=20" "$RENDER_API_KEY"); then
    # Never a second free service in this workspace: prefer $RENDER_SERVICE by name, else adopt
    # the one web service that's already there, whatever it's called.
    RENDER_ID=$(jq -r --arg n "$RENDER_SERVICE" \
      '(map(select(.service.name == $n)) + (if length == 1 then . else [] end))[0].service.id // empty' <<<"$found")
    count=$(jq length <<<"$found")
    if [ -n "$RENDER_ID" ]; then
      api PATCH "$R/services/$RENDER_ID" "$RENDER_API_KEY" "$settings" >/dev/null \
        && ok "service $RENDER_ID settings applied" || fail "could not update the service settings"
    elif [ "$count" -gt 0 ]; then
      fail "$count web services exist, none named $RENDER_SERVICE — not creating another"
    else
      owner=$(api GET "$R/owners?limit=1" "$RENDER_API_KEY" | jq -r '.[0].owner.id // empty')
      body=$(jq --arg owner "$owner" --arg name "$RENDER_SERVICE" \
        --arg repo "https://github.com/$GH_OWNER/$GH_REPO" '. * {
          type: "web_service", name: $name, ownerId: $owner, repo: $repo,
          serviceDetails: { runtime: "node", plan: "free", region: "frankfurt" }
        }' <<<"$settings")
      if created=$(api POST "$R/services" "$RENDER_API_KEY" "$body"); then
        RENDER_ID=$(jq -r '.service.id' <<<"$created")
        ok "created service $RENDER_ID"
      else
        fail "could not create the service (is GitHub connected in Render → Account settings → Git?)"
      fi
    fi
    if [ -n "$RENDER_ID" ]; then
      if svc_url=$(api GET "$R/services/$RENDER_ID" "$RENDER_API_KEY" | jq -r '.serviceDetails.url // empty') && [ -n "$svc_url" ]; then
        API_URL=$svc_url
        ok "API URL: $API_URL"
      else
        fail "could not read the service URL"
      fi
    fi
  else
    fail "Render API rejected the key"
  fi
fi

# ── Cloudflare Pages: find or create the Git-connected project ──────────────
say "Cloudflare Pages (web)"
m=$(missing CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID)
if [ -n "$m" ]; then
  skip "set$m"
else
  CF=https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects
  [ -z "$API_URL" ] && echo "  note: API URL unknown (Render skipped, no HOSTED_API_URL) — VITE_API_URL left unset"
  [ -z "$ANON_KEY" ] && echo "  note: Supabase skipped — VITE_SUPABASE_* left unset"
  body=$(jq -n --arg name "$PAGES_PROJECT" --arg owner "$GH_OWNER" --arg repo "$GH_REPO" \
    --arg api "$API_URL" --arg sb "$SUPABASE_URL_HOSTED" --arg key "$ANON_KEY" '
    def plain: {type: "plain_text", value: .};
    {
      name: $name, production_branch: "main",
      build_config: { build_command: "pnpm --filter @notes/web build", destination_dir: "apps/web/dist", root_dir: "" },
      source: { type: "github", config: {
        owner: $owner, repo_name: $repo, production_branch: "main",
        production_deployments_enabled: true, pr_comments_enabled: false,
        preview_deployment_setting: "none",
        path_includes: ["apps/web/*", "packages/shared/*", "package.json", "pnpm-lock.yaml"], path_excludes: []
      } },
      deployment_configs: { production: { env_vars: (
        { NODE_VERSION: ("24" | plain), PNPM_VERSION: ("10.34.5" | plain) }
        + (if $api != "" then { VITE_API_URL: ($api | plain) } else {} end)
        + (if $key != "" then { VITE_SUPABASE_URL: ($sb | plain), VITE_SUPABASE_ANON_KEY: ($key | plain) } else {} end)
      ) } }
    }')
  if project=$(api GET "$CF/$PAGES_PROJECT" "$CLOUDFLARE_API_TOKEN" 2>/dev/null); then
    # PATCH replaces the env vars, so with a value unknown (a skipped part) leave them as they are.
    patch=$(jq 'del(.name, .source)' <<<"$body")
    if [ -z "$API_URL" ] || [ -z "$ANON_KEY" ]; then
      patch=$(jq 'del(.deployment_configs)' <<<"$patch")
      echo "  note: a value is unknown, so the existing Pages env vars are kept"
    fi
    if updated=$(api PATCH "$CF/$PAGES_PROJECT" "$CLOUDFLARE_API_TOKEN" "$patch"); then
      project=$updated; ok "updated project $PAGES_PROJECT"
    else
      fail "could not update the project"
    fi
  else
    project=$(api POST "$CF" "$CLOUDFLARE_API_TOKEN" "$body") \
      && ok "created project $PAGES_PROJECT" \
      || fail "could not create the project (is the Cloudflare Pages GitHub app installed on the repo?)"
  fi
  sub=$(jq -r '.result.subdomain // empty' <<<"${project:-}" 2>/dev/null)
  if [ -n "$sub" ]; then
    WEB_URL=https://$sub
    ok "web URL: $WEB_URL"
    # Build main now so the new env vars take effect.
    curl -sSf -X POST "$CF/$PAGES_PROJECT/deployments" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
      -F branch=main -o /dev/null && ok "production build started" || fail "could not start a build"
  fi
fi

# ── Supabase Google provider (needs the web URL for the redirect allow-list) ─
# localhost stays on the allow-list so `pnpm dev:hosted` can sign in against this project.
say "Supabase Google provider"
m=$(missing SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_REF GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET WEB_URL)
if [ -n "$m" ]; then
  skip "set$m (or HOSTED_WEB_URL)"
else
  cfg=$(jq -n --arg id "$GOOGLE_CLIENT_ID" --arg secret "$GOOGLE_CLIENT_SECRET" --arg web "$WEB_URL" \
    '{external_google_enabled: true, external_google_client_id: $id, external_google_secret: $secret,
      site_url: $web, uri_allow_list: ($web + ",http://localhost:5173,http://127.0.0.1:5173")}')
  api PATCH "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/config/auth" "$SUPABASE_ACCESS_TOKEN" "$cfg" >/dev/null \
    && ok "Google provider on, site URL $WEB_URL" || fail "could not set the Google provider"
fi

# ── Render env vars + deploy (now that WEB_URL is known) ─────────────────────
if [ -n "$RENDER_ID" ]; then
  say "Render env vars"
  m=$(missing DB_URL WEB_URL ANTHROPIC_API_KEY GROQ_API_KEY ALLOWED_EMAILS)
  if [ -n "$m" ]; then
    skip "need$m — env vars and deploy not touched"
  elif [ "$ALLOWED_EMAILS" = dev@notes.local ]; then
    skip "ALLOWED_EMAILS is still the local default — env vars and deploy not touched"
  else
    # PUT replaces the whole set, so this is every variable the API reads on Render.
    envs=$(jq -n --arg db "$DB_URL?sslmode=no-verify" --arg sb "$SUPABASE_URL_HOSTED" --arg web "$WEB_URL" \
      --arg allowed "$ALLOWED_EMAILS" --arg ak "$ANTHROPIC_API_KEY" --arg gk "$GROQ_API_KEY" --arg jk "${JINA_API_KEY:-}" \
      '[{key: "NODE_VERSION", value: "24"}, {key: "DATABASE_URL", value: $db},
        {key: "SUPABASE_URL", value: $sb}, {key: "WEB_ORIGIN", value: $web},
        {key: "ALLOWED_EMAILS", value: $allowed},
        {key: "ANTHROPIC_API_KEY", value: $ak}, {key: "GROQ_API_KEY", value: $gk}]
        + (if $jk != "" then [{key: "JINA_API_KEY", value: $jk}] else [] end)')
    api PUT "$R/services/$RENDER_ID/env-vars" "$RENDER_API_KEY" "$envs" >/dev/null \
      && ok "env vars set" || fail "could not set env vars"
    api POST "$R/services/$RENDER_ID/deploys" "$RENDER_API_KEY" '{}' >/dev/null \
      && ok "deploy started" || fail "could not start a deploy"
  fi
fi

# ── cron-job.org: the two keep-alive jobs ────────────────────────────────────
# Wakes the service first: while it sleeps, Render serves a big "waking up" HTML page, which
# cron-job.org aborts and eventually disables the job over. After the upsert, any of our jobs
# that are not enabled are switched back on, so a re-run heals them.
say "cron-job.org"
m=$(missing CRONJOB_API_KEY API_URL)
if [ -n "$m" ]; then
  skip "set$m"
elif ! check "wake /health" "$API_URL/health" '.ok == true'; then
  skip "API not reachable — cron jobs not touched"
else
  C=https://api.cron-job.org
  KEEPALIVE="notes-api keep-alive"
  DEEP="notes-api deep"
  if jobs=$(api GET "$C/jobs" "$CRONJOB_API_KEY"); then
    # upsert <title> <url> <hours json> <minutes json>, matched by title.
    upsert() {
      local job id
      job=$(jq -n --arg t "$1" --arg u "$2" --argjson h "$3" --argjson mi "$4" '{ job: {
        title: $t, url: $u, enabled: true, saveResponses: false,
        schedule: { timezone: "Asia/Jerusalem", expiresAt: 0, hours: $h, minutes: $mi, mdays: [-1], months: [-1], wdays: [-1] },
        notification: { onFailure: true, onSuccess: false, onDisable: true }
      } }')
      id=$(jq -r --arg t "$1" '.jobs[] | select(.title == $t) | .jobId' <<<"$jobs" | head -1)
      sleep 2 # cron-job.org rate-limits back-to-back calls (HTTP 429)
      if [ -n "$id" ]; then
        api PATCH "$C/jobs/$id" "$CRONJOB_API_KEY" "$job" >/dev/null && ok "updated '$1'" || fail "'$1'"
      else
        api PUT "$C/jobs" "$CRONJOB_API_KEY" "$job" >/dev/null && ok "created '$1'" || fail "'$1'"
      fi
    }
    # Every 14 min, 07:00–23:00.
    upsert "$KEEPALIVE" "$API_URL/health" "$(jq -nc '[range(7; 23)]')" '[0,14,28,42,56]'
    # Once a day: one DB query so hosted Supabase never pauses.
    upsert "$DEEP" "$API_URL/health?deep=1" '[12]' '[0]'

    # Self-heal: re-enable our jobs if cron-job.org disabled them.
    sleep 2
    if jobs=$(api GET "$C/jobs" "$CRONJOB_API_KEY"); then
      for id in $(jq -r --arg a "$KEEPALIVE" --arg b "$DEEP" '.jobs[] | select((.title == $a or .title == $b) and (.enabled | not)) | .jobId' <<<"$jobs"); do
        sleep 2
        api PATCH "$C/jobs/$id" "$CRONJOB_API_KEY" '{"job":{"enabled":true}}' >/dev/null \
          && ok "re-enabled job $id" || fail "could not enable job $id"
      done
    fi
  else
    fail "cron-job.org rejected the key"
  fi
fi

# ── Live check ───────────────────────────────────────────────────────────────
say "Live check"
if [ -n "$API_URL" ]; then
  check "/health" "$API_URL/health" '.ok == true'
  check "/health?deep=1" "$API_URL/health?deep=1" '.ok == true and .db == true'
else
  skip "no API URL"
fi
if [ -n "$WEB_URL" ]; then check "web" "$WEB_URL" ""; else skip "no web URL"; fi

echo
[ "$FAILED" = 0 ] && echo "Done." || { echo "Finished with failures (above)."; exit 1; }
