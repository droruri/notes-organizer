#!/bin/bash

set -eo pipefail

# Everything below runs relative to this checkout; each issue's work happens in its own worktree.
RALPH_HOME="$(cd "$(dirname "$0")" && pwd)"
export RALPH_HOME
cd "$RALPH_HOME"

if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi
# Use the claude.ai login (or CLAUDE_CODE_OAUTH_TOKEN in the cloud), never an API key: a stray
# key bills API credits instead.
unset ANTHROPIC_API_KEY

# Non-interactive for every claude run: a command that would prompt (git credentials, a watch
# mode) fails at once instead of hanging the session. CI=true puts tools in their CI mode.
export GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never GH_PROMPT_DISABLED=1 CI=true

REPO="droruri/notes-organizer"
export RALPH_REPO="$REPO"
LOGS_DIR="$RALPH_HOME/logs"
# Per-phase turns and cost, one row per claude run.
COST_LEDGER="$LOGS_DIR/ralph-costs.tsv"
# Marks an issue a ralph run is working on, so a local and a cloud run never take the same one.
LOCK_LABEL="ralph:running"
# Build runs on sonnet by default; run `RALPH_MODEL=opus ./run-ralph.sh` for hard issues. An issue
# still open after all phases on a non-opus model gets one more pass on opus. The review and merge
# phases are mechanical (relay findings, fix, merge) and always run on RALPH_CHEAP_MODEL.
RALPH_MODEL="${RALPH_MODEL:-sonnet}"
RALPH_CHEAP_MODEL="${RALPH_CHEAP_MODEL:-haiku}"
RALPH_SETTINGS='{"disableAllHooks":true,"enabledPlugins":{"mattpocock-skills@claude-plugins-official":true,"caveman@caveman":true}}'
# `./run-ralph.sh <issue>` runs just that issue (all three phases) and exits.
ONLY_ISSUE="${1:-}"
if [ -n "$ONLY_ISSUE" ] && ! [[ "$ONLY_ISSUE" =~ ^[0-9]+$ ]]; then
  echo "Usage: $0 [issue-number]" >&2
  exit 2
fi

mkdir -p "$LOGS_DIR"
[ -f "$COST_LEDGER" ] || printf 'date\tissue\tphase\tmodel\tturns\tcost_usd\tseconds\terror\n' > "$COST_LEDGER"
gh label create "$LOCK_LABEL" --repo "$REPO" --color FBCA04 \
  --description "A ralph run is working on this issue" --force > /dev/null 2>&1 || true

issue_state() {
  gh api "repos/$REPO/issues/$ISSUE_NUM" \
    --jq 'if .state == "closed" then "closed" elif any(.labels[]; .name == "needs-human") then "needs-human" elif any(.labels[]; .name == "blocked") then "blocked" else "open" end'
}

is_locked() {
  gh api "repos/$REPO/issues/$ISSUE_NUM" --jq "any(.labels[]; .name == \"$LOCK_LABEL\")"
}

LOCKED_ISSUE=""
unlock_issue() {
  if [ -n "$LOCKED_ISSUE" ]; then
    gh api -X DELETE "repos/$REPO/issues/$LOCKED_ISSUE/labels/$LOCK_LABEL" > /dev/null 2>&1 || true
    LOCKED_ISSUE=""
  fi
}
trap unlock_issue EXIT
trap 'exit 130' INT TERM

progress() {
  (cd "$WORKTREE" && "$RALPH_HOME/scripts/ralph-progress.sh" "$1" "$ISSUE_NUM")
}

# phase_instructions <phase>: the shared instructions plus the steps of one phase, for the prompt.
# Build also gets the review steps: a small diff is reviewed in the same session.
phase_instructions() {
  local parts=(shared "$1") part
  [ "$1" = build ] && parts+=(review)
  for part in "${parts[@]}"; do
    [ -f "$RALPH_HOME/ralph/$part.md" ] || { echo "missing ralph/$part.md" >&2; exit 1; }
    cat "$RALPH_HOME/ralph/$part.md"
    printf '\n'
  done
}

# run_claude <phase> <model>: one fresh claude run for one phase of the current issue.
run_claude() {
  local phase=$1 model=$2
  local log_file="$LOGS_DIR/issue-$ISSUE_NUM.$phase.log"
  local instructions
  instructions=$(phase_instructions "$phase")
  echo -e "\n--- Issue #$ISSUE_NUM: phase $phase on $model (log: $log_file) ---"

  # stream-json emits one event per line as the run progresses: the raw events go to the
  # log file, and a readable summary (text + tool calls) is printed to the terminal.
  # `fromjson?` skips any non-JSON line (e.g. stderr) instead of killing the pipe.
  # The fixed context (tool, skill and agent definitions, plugin hooks) is re-sent on every turn,
  # so load only what the instructions use: --tools lists the tools they call, an empty MCP
  # config loads no MCP servers, and --setting-sources project with --settings enables just the
  # two plugins they need (mattpocock-skills for the tdd skill, caveman for the reviewer and
  # investigator agents) instead of the user's whole set. $RALPH_SETTINGS also switches hooks off
  # (the Stop hook already skips ralph runs).
  (cd "$WORKTREE" && CLAUDE_CODE_DISABLE_BUNDLED_SKILLS=1 CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS=1 \
    claude --model "$model" --strict-mcp-config --mcp-config '{"mcpServers":{}}' \
    --tools Bash,Read,Edit,Write,Skill,Agent --setting-sources project --settings "$RALPH_SETTINGS" \
    --dangerously-skip-permissions --verbose --print --output-format stream-json "
Execute PHASE $phase of the ralph instructions below for Issue #$ISSUE_NUM. Read only the sections of docs/plan.md the issue body names. \$RALPH_HOME is $RALPH_HOME.

$instructions

Your working directory is this issue's worktree, $WORKTREE, already on branch feature/issue-$ISSUE_NUM. Work only inside it.

ISSUE TITLE: $ISSUE_TITLE

ISSUE DETAILS & CHECKLIST:
$ISSUE_BODY
" 2>&1) | tee "$log_file" | jq --unbuffered -rR '
    fromjson? | select(.type == "assistant") | .message.content[]? |
    if .type == "text" then .text
    elif .type == "tool_use" then "  → \(.name) \(.input | tostring | .[0:150])"
    else empty end' || true

  # A phase log can hold several claude sessions (the agent stops and is re-invoked after
  # background work): turns and time sum over all of them, cost is the final cumulative value.
  local result
  result=$(jq -sR '[split("\n")[] | fromjson? | select(type == "object" and .type == "result")] |
    select(length > 0) | {turns: (map(.num_turns // 0) | add), cost: (last.total_cost_usd // 0),
     seconds: ((map(.duration_ms // 0) | add) / 1000 | floor), error: last.is_error}' "$log_file")
  if [ -n "$result" ]; then
    printf '%s\n' "$result" | jq -r --arg d "$(date -u +%FT%TZ)" --arg i "$ISSUE_NUM" --arg p "$phase" --arg m "$model" \
      '[$d, $i, $p, $m, .turns, .cost, .seconds, .error] | @tsv' >> "$COST_LEDGER"
    ISSUE_COST=$(jq -n "$ISSUE_COST + $(printf '%s\n' "$result" | jq '.cost')")
    printf '%s\n' "$result" | jq -r '"--- phase done: \(.turns) turns, $\(.cost * 100 | round / 100), \(.seconds)s ---"'
  fi

  # A subscription usage limit ends the run early: report when it resets (0 if this wasn't one).
  RESETS_AT=$(jq -rR 'fromjson? | select(.type == "rate_limit_event" and .rate_limit_info.status == "rejected") |
    .rate_limit_info.resetsAt // 0' "$log_file" | tail -1)
  RESETS_AT=${RESETS_AT:-0}
}

# run_phase <phase> <model>: run_claude, waiting out (up to 3) subscription usage limits.
# The progress comment is pulled before and pushed after every run.
run_phase() {
  local phase=$1 model=$2
  for _ in 1 2 3 4; do
    progress pull
    run_claude "$phase" "$model"
    progress push
    [ "$RESETS_AT" = 0 ] && return 0
    local wait=$((RESETS_AT - $(date +%s) + 60))
    [ $wait -lt 60 ] && wait=60
    echo "--- Usage limit reached. Sleeping $((wait / 60)) min until it resets, then resuming phase $phase. ---"
    sleep $wait
  done
  echo "--- Still rate-limited after 3 waits. Giving up on phase $phase. ---"
}

# run_phases <model>: build → review → merge for the current issue, stopping when it leaves "open".
run_phases() {
  local model=$1
  for PHASE in build review merge; do
    # A small diff is reviewed inside the build phase, which then hands off `next: step 10`.
    if [ "$PHASE" = review ] && grep -q '^next: step 10' "$WORKTREE/logs/issue-$ISSUE_NUM.progress.md" 2>/dev/null; then
      echo "--- Issue #$ISSUE_NUM: review already done in build, skipping ---"
      continue
    fi
    # Waiting for CI and merging needs no LLM; claude runs the merge phase only when that fails.
    if [ "$PHASE" = merge ] && "$RALPH_HOME/scripts/ralph-merge.sh" "$ISSUE_NUM"; then
      break
    fi
    # Only build needs the strong model; review and merge relay findings and run commands.
    local phase_model=$model
    [ "$PHASE" != build ] && phase_model=$RALPH_CHEAP_MODEL
    run_phase "$PHASE" "$phase_model"
    # Already closed (found done on main, or merged with human-only items split out), or
    # labeled blocked/needs-human (whole issue stuck): skip the rest.
    if [ "$(issue_state)" != "open" ]; then break; fi
  done
}

while true; do
  if [ -n "$ONLY_ISSUE" ]; then
    ISSUE_NUM=$ONLY_ISSUE
    # Don't start on a closed issue, one a human has to look at first, or one another run holds.
    START_STATE=$(issue_state)
    if [ "$START_STATE" != "open" ]; then
      echo "Issue #$ISSUE_NUM is $START_STATE. Nothing to run."
      [ "$START_STATE" == "closed" ] && exit 0 || exit 1
    fi
    if [ "$(is_locked)" = true ]; then
      echo "Issue #$ISSUE_NUM has the $LOCK_LABEL label: another ralph run is on it. Remove the label if that run died."
      exit 1
    fi
    ISSUE_JSON=$(gh api "repos/$REPO/issues/$ONLY_ISSUE" --jq '{number, title, body}')
  else
    echo -e "\n=========================================="
    echo "=== Fetching next unblocked issue ==="
    echo "=========================================="

    # Fetch the oldest open issue that isn't labeled blocked/needs-human/ralph:running and whose
    # "## Blocked by" section lists no issue that is still open.
    ISSUE_JSON=$(gh api "repos/$REPO/issues?state=open&per_page=100" | jq --arg lock "$LOCK_LABEL" '
      map(select(has("pull_request") | not)) as $issues |
      ($issues | map(.number)) as $open |
      $issues | map(select(
        (any(.labels[]; .name == "blocked" or .name == "needs-human" or .name == $lock) | not) and
        ([(.body // "") | capture("## Blocked by(?<b>[\\s\\S]*?)(\\n## |\\n---|$)").b // "" |
          scan("#([0-9]+)")[0] | tonumber] | any(. as $n | $open | index($n)) | not)
      )) | sort_by(.number) | .[0]')
  fi

  ISSUE_NUM=$(echo "$ISSUE_JSON" | jq -r '.number')
  ISSUE_TITLE=$(echo "$ISSUE_JSON" | jq -r '.title')
  ISSUE_BODY=$(echo "$ISSUE_JSON" | jq -r '.body')

  if [ "$ISSUE_NUM" == "null" ] || [ -z "$ISSUE_NUM" ]; then
    echo "No more unblocked issues found. Ralph Loop finished!"
    break
  fi

  echo "Processing Issue #$ISSUE_NUM: $ISSUE_TITLE"
  gh api "repos/$REPO/issues/$ISSUE_NUM/labels" -f "labels[]=$LOCK_LABEL" > /dev/null
  LOCKED_ISSUE=$ISSUE_NUM
  WORKTREE=$("$RALPH_HOME/scripts/ralph-worktree.sh" create "$ISSUE_NUM")
  ISSUE_COST=0

  # One issue runs as three phases, each a fresh `claude` process: context resets to the
  # baseline between phases instead of carrying the whole implementation history into review
  # and CI. The progress comment on the issue is the hand-off between phases (and machines).
  run_phases "$RALPH_MODEL"
  if [ "$(issue_state)" = open ] && [ "$RALPH_MODEL" != opus ]; then
    echo -e "\n--- Issue #$ISSUE_NUM still open after all phases on $RALPH_MODEL. One more pass on opus. ---"
    run_phases opus
  fi

  ISSUE_STATE=$(issue_state)
  unlock_issue
  echo -e "\n--- Issue #$ISSUE_NUM: total cost \$$(jq -n "$ISSUE_COST * 100 | round / 100") (ledger: $COST_LEDGER) ---"

  if [ "$ISSUE_STATE" == "closed" ]; then
    "$RALPH_HOME/scripts/ralph-worktree.sh" remove "$ISSUE_NUM"
  else
    # Keep the worktree so a human can inspect it.
    PROGRESS_FILE="$WORKTREE/logs/issue-$ISSUE_NUM.progress.md"
    if [ -f "$PROGRESS_FILE" ]; then
      echo -e "\n--- Progress for Issue #$ISSUE_NUM ---"
      cat "$PROGRESS_FILE"
      echo "---"
    fi
    echo "Worktree kept at $WORKTREE."
  fi
  # Stop instead of re-running the same issue forever if the run ended without closing it.
  if [ "$ISSUE_STATE" == "open" ]; then
    echo "Issue #$ISSUE_NUM is still open after all phases. Stopping so you can check $LOGS_DIR/issue-$ISSUE_NUM.*.log."
    exit 1
  fi

  if [ -n "$ONLY_ISSUE" ]; then
    echo -e "\n---> Issue #$ISSUE_NUM $ISSUE_STATE."
    break
  fi

  echo -e "\n---> Issue #$ISSUE_NUM $ISSUE_STATE! Moving to next issue in 5 seconds...\n"
  sleep 5
done
