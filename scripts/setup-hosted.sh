#!/usr/bin/env bash
#
# Hosted setup wizard (README → "Deploying"): walks through the manual account/key steps of #18
# and fills `.env`. Re-runnable: a key that already has a value is skipped, never overwritten.
# Built from the wizard skill template; everything above the STAGES marker is the shared library.
# it. Author the per-step stages below the marker.

set -euo pipefail
cd "$(dirname "$0")/.."

# ──────────────────────────────────────────────────────────────────────────
# Wizard library: delightful, consistent UX, identical across every wizard.
# ──────────────────────────────────────────────────────────────────────────

if [[ -t 1 ]] && command -v tput >/dev/null 2>&1 && [[ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]]; then
  BOLD=$(tput bold); DIM=$(tput dim); RESET=$(tput sgr0)
  BLUE=$(tput setaf 4); GREEN=$(tput setaf 2); YELLOW=$(tput setaf 3)
else
  BOLD=""; DIM=""; RESET=""; BLUE=""; GREEN=""; YELLOW=""
fi

# Author sets this at the top of the stages section.
TOTAL_STAGES=0

_STAGE_INDEX=0
ENV_FILE="${ENV_FILE:-.env}"
WRITTEN_ENV=()    # KEYs written to ENV_FILE this run
WRITTEN_SECRET=() # secret NAMEs set this run
SKIPPED=()        # things we couldn't do (e.g. gh missing)

# _clear wipes the terminal so only the current step is on screen. No-op when
# output isn't a terminal, so piped logs stay readable.
_clear() {
  [[ -t 1 ]] || return 0
  if command -v tput >/dev/null 2>&1 && tput clear 2>/dev/null; then return 0; fi
  printf '\033[2J\033[3J\033[H'
}

# banner "Title" shows the opening frame: what this wizard does.
banner() {
  _clear
  printf '\n%s%s  %s%s\n' "$BOLD" "$BLUE" "$1" "$RESET"
  printf '%s  %s stages%s\n\n' "$DIM" "$TOTAL_STAGES" "$RESET"
  printf '%s  You drive the browser; this wizard tells you exactly what to do and\n' "$DIM"
  printf '  captures the values you copy back. Stop any time with Ctrl-C and re-run\n'
  printf '  later, since it remembers values already saved.%s\n' "$RESET"
  pause "Ready to start?"
}

# stage "Name" clears the screen, then announces a stage and shows progress.
# Clearing keeps only the current step on screen.
stage() {
  _clear
  _STAGE_INDEX=$((_STAGE_INDEX + 1))
  printf '\n%s%s▸ Stage %s/%s · %s%s\n' \
    "$BOLD" "$BLUE" "$_STAGE_INDEX" "$TOTAL_STAGES" "$1" "$RESET"
}

# say "..." prints a plain instruction line.
say()  { printf '  %s\n' "$1"; }
# step "..." is a numbered-feeling action the human takes in the browser.
step() { printf '  %s•%s %s\n' "$BLUE" "$RESET" "$1"; }
note() { printf '  %s%s%s\n' "$DIM" "$1" "$RESET"; }
warn() { printf '  %s⚠ %s%s\n' "$YELLOW" "$1" "$RESET"; }

# open_url URL opens it in the human's browser, cross-platform incl. WSL.
open_url() {
  local url="$1"
  printf '  %s↗ opening%s %s\n' "$GREEN" "$RESET" "$url"
  { if   command -v wslview     >/dev/null 2>&1; then wslview "$url"
    elif command -v explorer.exe >/dev/null 2>&1; then explorer.exe "$url"
    elif command -v xdg-open    >/dev/null 2>&1; then xdg-open "$url"
    elif command -v open        >/dev/null 2>&1; then open "$url"
    else false; fi
  } >/dev/null 2>&1 || warn "couldn't open a browser, so visit it manually: $url"
}

# pause "msg" waits for the human to confirm they've done the manual part.
pause() {
  printf '  %s%s%s ' "$DIM" "${1:-Press Enter to continue}" "$RESET"
  read -r _ || true
}

# confirm "question" is a y/N gate; returns success on yes.
confirm() {
  local reply=""
  printf '  %s? %s [y/N] ' "$YELLOW" "$1"
  read -r reply || true
  [[ "$reply" =~ ^[Yy] ]]
}

# _existing KEY: current value of KEY in ENV_FILE, if any, with write_env's single
# quotes or a plain dotenv double-quoted value undone.
_existing() {
  [[ -f "$ENV_FILE" ]] || return 1
  local line value sq="'\\''"; line=$(grep -E "^${1}=" "$ENV_FILE" | tail -n1) || return 1
  value="${line#*=}"
  if [[ "$value" == \'*\' ]]; then value="${value:1:${#value}-2}"; value="${value//"$sq"/\'}"
  elif [[ "$value" == \"*\" ]]; then
    value="${value:1:${#value}-2}"
    [[ "$value" == *[\\\$\"]* ]] && return 1   # escapes, $ or ": can't decode safely; ask again
  fi
  printf '%s' "$value"
}

# ask KEY "Prompt" reads a value into $KEY. Offers the existing .env value as
# a default on re-runs (Enter keeps it). Visible input (non-secret), edited
# with Readline. Fails at EOF with no input.
ask() {
  local key="$1" prompt="$2" current input s=$'\001' e=$'\002' p rc=0
  current=$(_existing "$key" || true)
  # Readline needs the colour codes wrapped in \001..\002 to place the cursor.
  p="  $s$BOLD$e$prompt$s$RESET$e "
  [[ -n "$current" ]] && p+="$s$DIM$e[Enter keeps current]$s$RESET$e "
  read -e -r -p "$p" input || rc=1
  if (( rc )) && [[ -z "$input" ]]; then return 1; fi
  [[ -z "$input" && -n "$current" ]] && input="$current"
  printf -v "$key" '%s' "$input"
}

# ask_secret KEY "Prompt" is like ask, but input is hidden.
ask_secret() {
  local key="$1" prompt="$2" current input rc=0
  current=$(_existing "$key" || true)
  if [[ -n "$current" ]]; then
    printf '  %s%s%s %s[Enter keeps current]%s ' "$BOLD" "$prompt" "$RESET" "$DIM" "$RESET"
  else
    printf '  %s%s%s ' "$BOLD" "$prompt" "$RESET"
  fi
  read -rs input || rc=1
  printf '\n'
  if (( rc )) && [[ -z "$input" ]]; then return 1; fi
  [[ -z "$input" && -n "$current" ]] && input="$current"
  printf -v "$key" '%s' "$input"
}

# write_env KEY VALUE upserts KEY='VALUE' into ENV_FILE (replaces any existing
# line) and sets $KEY. Idempotent. Creates ENV_FILE at mode 0600; writes through
# a symlink and keeps an existing file's mode.
write_env() {
  local key="$1" value="$2" tmp sq="'\\''"
  [[ -e "$ENV_FILE" ]] || (umask 077 && : > "$ENV_FILE")
  tmp=$(mktemp)
  grep -vE "^${key}=" "$ENV_FILE" > "$tmp" || true
  printf "%s='%s'\n" "$key" "${value//\'/$sq}" >> "$tmp"
  cat "$tmp" > "$ENV_FILE"
  rm -f "$tmp"
  printf -v "$key" '%s' "$value"
  WRITTEN_ENV+=("$key")
  printf '  %s✓ wrote%s %s → %s\n' "$GREEN" "$RESET" "$key" "$ENV_FILE"
}

# set_secret NAME VALUE sets a GitHub Actions repo secret via gh. Falls back
# to a warning (and records it) if gh is unavailable or unauthenticated.
set_secret() {
  local name="$1" value="$2"
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    if printf '%s' "$value" | gh secret set "$name" >/dev/null 2>&1; then
      WRITTEN_SECRET+=("$name")
      printf '  %s✓ set%s GitHub secret %s\n' "$GREEN" "$RESET" "$name"
      return
    fi
  fi
  SKIPPED+=("GitHub secret $name (set it manually: gh secret set $name)")
  warn "skipped GitHub secret $name: gh not ready; set it later"
}

# set_var NAME VALUE sets a GitHub Actions repo variable (non-secret).
set_var() {
  local name="$1" value="$2"
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    if gh variable set "$name" --body "$value" >/dev/null 2>&1; then
      printf '  %s✓ set%s GitHub variable %s\n' "$GREEN" "$RESET" "$name"
      return
    fi
  fi
  SKIPPED+=("GitHub variable $name")
  warn "skipped GitHub variable $name, gh not ready; set it later"
}

# finish clears, then shows a closing summary of everything configured.
finish() {
  _clear
  printf '\n%s%s  ✓ Setup complete%s\n' "$BOLD" "$GREEN" "$RESET"
  (( ${#WRITTEN_ENV[@]} ))    && note "wrote ${#WRITTEN_ENV[@]} value(s) to $ENV_FILE: ${WRITTEN_ENV[*]}"
  (( ${#WRITTEN_SECRET[@]} )) && note "set ${#WRITTEN_SECRET[@]} GitHub secret(s): ${WRITTEN_SECRET[*]}"
  if (( ${#SKIPPED[@]} )); then
    printf '\n'; warn "still to do by hand:"
    for s in "${SKIPPED[@]}"; do note "  - $s"; done
  fi
  printf '\n'
}

# ──────────────────────────────────────────────────────────────────────────
# STAGES
# ──────────────────────────────────────────────────────────────────────────

# Every key this wizard owns, appended (empty) to .env.example when missing. Never a secret.
HOSTED_KEYS=(SUPABASE_PROJECT_REF SUPABASE_DB_PASSWORD SUPABASE_ACCESS_TOKEN GOOGLE_CLIENT_ID
  GOOGLE_CLIENT_SECRET RENDER_API_KEY CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID CRONJOB_API_KEY)

# Creates .env from .env.example when missing; appends missing key names to .env.example.
prepare_files() {
  if [[ ! -f "$ENV_FILE" ]]; then
    (umask 077; if [[ -f .env.example ]]; then cp .env.example "$ENV_FILE"; else : > "$ENV_FILE"; fi)
    say "created $ENV_FILE"
  fi
  local key
  for key in "${HOSTED_KEYS[@]}"; do
    grep -qE "^${key}=" .env.example || printf '%s=\n' "$key" >> .env.example
  done
}

# filled KEY: true when KEY has a non-empty value in .env. ALLOWED_EMAILS counts as empty while it
# holds the local seed user, which would lock everyone out of the hosted app.
filled() {
  local v
  # A value _existing cannot decode (escapes, $) is still a value: never ask over it.
  v=$(_existing "$1") || { grep -qE "^${1}=." "$ENV_FILE" && return 0; return 1; }
  [[ -n "$v" ]] || return 1
  [[ "$1" == ALLOWED_EMAILS && "$v" == dev@notes.local ]] && return 1
  return 0
}

# need KEY plain|secret "Prompt" [optional]: asks for KEY unless .env already has a value. Writes
# only a non-empty answer; an optional key may stay empty.
need() {
  local key=$1 kind=$2 prompt=$3 optional=${4:-}
  if filled "$key"; then note "$key already set — skipping"; return; fi
  local answer=""
  if [[ $kind == secret ]]; then ask_secret "$key" "$prompt" || true; else ask "$key" "$prompt" || true; fi
  answer=${!key:-}
  if [[ -n "$answer" ]]; then write_env "$key" "$answer"
  elif [[ -z "$optional" ]]; then SKIPPED+=("$key (deploy skips the part that needs it)"); warn "$key left empty"; fi
}

run_wizard() {

TOTAL_STAGES=10

banner "Hosted setup"
prepare_files

stage "Supabase project"
open_url "https://supabase.com/dashboard/new"
step "New project, region Frankfurt. Remember the database password you choose."
step "The project ref is the part of the URL after /project/ (Settings → General → Reference ID)."
need SUPABASE_PROJECT_REF plain "Project ref:"
need SUPABASE_DB_PASSWORD secret "Database password:"
open_url "https://supabase.com/dashboard/account/tokens"
step "Generate new token, then copy it."
need SUPABASE_ACCESS_TOKEN secret "Access token:"

stage "Google OAuth client"
open_url "https://console.cloud.google.com/apis/credentials"
step "OAuth consent screen: External, app name, your email. Then Publish app (In production); Testing mode needs every user added by hand."
step "Credentials → Create OAuth client ID → Web application."
if [[ -n "${SUPABASE_PROJECT_REF:-$(_existing SUPABASE_PROJECT_REF || true)}" ]]; then
  step "Authorized redirect URI: https://${SUPABASE_PROJECT_REF:-$(_existing SUPABASE_PROJECT_REF)}.supabase.co/auth/v1/callback"
else
  step "Authorized redirect URI: https://<project-ref>.supabase.co/auth/v1/callback"
fi
need GOOGLE_CLIENT_ID plain "Client ID:"
need GOOGLE_CLIENT_SECRET secret "Client secret:"

stage "Supabase Google provider"
say "Nothing to do: pnpm deploy:hosted turns the provider on with the two values above."
note "By hand instead: Supabase → Authentication → Providers → Google, paste both values."
pause

stage "Who may sign in"
say "Your own Google email (comma-separated list is fine). Add everyone else later in the app: docs/adding-users.md."
need ALLOWED_EMAILS plain "Allowed emails:"

stage "Google Gemini"
open_url "https://aistudio.google.com/apikey"
step "Create a free API key, copy it."
need GOOGLE_GENERATIVE_AI_API_KEY secret "Google AI Studio API key:"

stage "Groq (voice transcription)"
open_url "https://console.groq.com/keys"
step "Create API key, copy it."
need GROQ_API_KEY secret "Groq API key:"

stage "Render"
open_url "https://dashboard.render.com/u/settings#api-keys"
step "Create API key, copy it."
open_url "https://dashboard.render.com/u/settings"
step "Under Git, connect GitHub."
need RENDER_API_KEY secret "Render API key:"

stage "Cloudflare"
open_url "https://dash.cloudflare.com/profile/api-tokens"
step "Create a custom token with permission: Account · Cloudflare Pages · Edit."
need CLOUDFLARE_API_TOKEN secret "API token:"
open_url "https://dash.cloudflare.com/?to=/:account/workers-and-pages"
step "Copy the Account ID from the Workers & Pages overview."
need CLOUDFLARE_ACCOUNT_ID plain "Account ID:"
step "Once: Create → Pages → Connect to Git → install the Cloudflare Pages GitHub app on this repo, then cancel."
pause "App installed? Press Enter"

stage "cron-job.org"
open_url "https://console.cron-job.org/settings"
step "Settings → API → Create API key, copy it."
need CRONJOB_API_KEY secret "cron-job.org API key:"

stage "Jina Reader (optional)"
open_url "https://jina.ai/reader"
say "Free API key; lets the API read sites that block it. Leave empty to skip."
need JINA_API_KEY secret "Jina API key (Enter to skip):" optional

finish
if confirm "Run pnpm deploy:hosted now?"; then
  exec pnpm deploy:hosted
fi
}

run_wizard; exit
