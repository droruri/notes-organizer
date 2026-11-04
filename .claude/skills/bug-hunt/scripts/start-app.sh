#!/bin/bash
# App-specific (notes-organizer). Starts the local stack, the API (fake LLM) and the web dev
# server on free ports. Progress goes to stderr; stdout is only `export` lines:
#
#   out=$(.claude/skills/bug-hunt/scripts/start-app.sh "$RUN_DIR") && eval "$out"
#
# Contract (keep it when porting to another app): exports WEB_URL, API_URL and BH_STOP (a command
# that stops what this script started); exits non-zero with a one-line reason.

set -uo pipefail

run_dir=${1:?usage: start-app.sh <run-dir>}
root=$(git rev-parse --show-toplevel) || exit 1
cd "$root" || exit 1
mkdir -p "$run_dir" || exit 1

say() { echo "start-app: $*" >&2; }
die() { echo "start-app: $*" >&2; exit 1; }

setup=$(scripts/e2e-setup.sh) || die "scripts/e2e-setup.sh failed (see its message above)."
eval "$setup"

api_url="http://localhost:${E2E_API_PORT}"
web_url="http://localhost:${E2E_WEB_PORT}"

# Shell env wins over the API's --env-file and over Vite's .env files, so a personal .env with
# hosted URLs or real LLM keys cannot leak into the run.
export AI_FAKE=1 PORT="$E2E_API_PORT" WEB_ORIGIN="$web_url" VITE_API_URL="$api_url"

say "starting API on $api_url"
nohup pnpm --filter @notes/api dev >"$run_dir/api.log" 2>&1 &
disown

say "starting web on $web_url"
(cd apps/web && nohup pnpm exec vp dev --port "$E2E_WEB_PORT" --strictPort >"$run_dir/web.log" 2>&1 &)

stop="lsof -ti tcp:${E2E_API_PORT},${E2E_WEB_PORT} -sTCP:LISTEN | xargs kill 2>/dev/null"

wait_for() {
  for _ in $(seq 1 90); do
    curl -fsS -o /dev/null "$1" 2>/dev/null && return 0
    sleep 1
  done
  return 1
}
wait_for "$api_url/health" || { eval "$stop"; die "API did not answer /health in 90s; see $run_dir/api.log"; }
wait_for "$web_url" || { eval "$stop"; die "web did not start in 90s; see $run_dir/web.log"; }
say "ready"

cat <<OUT
export DATABASE_URL='${DATABASE_URL}'
export WEB_URL='${web_url}'
export API_URL='${api_url}'
export BH_STOP='${stop}'
OUT
