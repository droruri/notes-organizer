#!/bin/bash
# Runs a set of ralph issues (an epic) in dependency order, up to RALPH_EPIC_MAX at a time.
#
#   scripts/ralph-epic.sh plan <selector>                     dry run: print the DAG and plan, change nothing
#   scripts/ralph-epic.sh run  <selector> [--status-issue N]  run the epic
#
# <selector>: a label (workspaces), a range (152-157) or a list (152,153,156).
#
# Dependencies come from each issue body: the `## Blocked by` section and any "Depends on #N" line.
# Every issue runs through `run-ralph.sh <N>` (build -> PR -> review -> CI -> squash-merge) in its
# own worktree. After every finished run the DAG is re-read from GitHub and newly unblocked issues
# start. A whole-issue blocker (ralph labeled the issue needs-human) is split into its own
# needs-human issue that the parent now waits on; the other branches carry on. A live status
# table is kept in one comment on a tracking issue labeled ralph:epic (pinned when possible).
#
# Re-runnable: all state is read from GitHub, so after a human closes a blocker issue, run it again.

set -uo pipefail

RALPH_HOME="$(cd "$(dirname "$0")/.." && pwd)"
REPO="${RALPH_REPO:-droruri/notes-organizer}"
OWNER="${REPO%%/*}"
MAX="${RALPH_EPIC_MAX:-3}"
TICK="${RALPH_EPIC_TICK:-60}"
EPIC_LABEL="ralph:epic"
STATUS_MARKER="<!-- ralph-epic-status -->"
LOG_DIR="$RALPH_HOME/logs/epic"

usage() {
  echo "Usage: $0 plan|run <label | N-M | N,N,...> [--status-issue N]" >&2
  exit 2
}

cmd="${1:-}"
selector="${2:-}"
[[ "$cmd" =~ ^(plan|run)$ ]] && [ -n "$selector" ] || usage
shift 2
status_issue=""
while [ $# -gt 0 ]; do
  case "$1" in
    --status-issue) status_issue="${2:-}"; shift 2 ;;
    *) usage ;;
  esac
done
[ -z "$status_issue" ] || [[ "$status_issue" =~ ^[0-9]+$ ]] || usage

# "#152–#157" -> "152-157"
sel="${selector//#/}"
sel="${sel//–/-}"
sel="${sel//—/-}"
sel="${sel// /}"
numbers=""
if [[ "$sel" =~ ^([0-9]+)-([0-9]+)$ ]]; then
  numbers=$(seq "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}")
elif [[ "$sel" =~ ^[0-9]+(,[0-9]+)*$ ]]; then
  numbers=$(printf '%s' "$sel" | tr , '\n')
fi

say() { printf 'epic: %s %s\n' "$(date +%H:%M:%S)" "$*"; }

# Shared jq definitions. st() is an issue's status; every decision below is made from it.
JQ_DEFS='
def deps: (.body // "") as $b | .number as $self |
  ([$b | capture("## Blocked by(?<b>[\\s\\S]*?)(\\n## |\\n---|$)").b // "" | scan("#([0-9]+)")[0] | tonumber]
   + [$b | scan("(?i)depends on[^\\n]*") | scan("#([0-9]+)")[0] | tonumber])
  | unique | map(select(. != $self));

def model: {
  issues: [.[] | select((has("pull_request") | not) and (any(.labels[]; .name == "ralph:epic") | not))
    | {number, title, state, labels: [.labels[].name], deps: deps}] | sort_by(.number),
  skipped: [.[] | select(has("pull_request")) | .number]
};

def has_label($l): any(.labels[]; . == $l);

# $m: model (+ .ext: outside-epic deps by number), $run / $fail: issue numbers.
def st($m; $run; $fail; $n; $seen):
  (first($m.issues[] | select(.number == $n)) // null) as $i |
  if $i == null then
    ($m.ext[$n | tostring] // null) as $e |
    if $e == null then "unknown"
    elif $e.state == "closed" then "done"
    elif ($e | has_label("needs-human")) then "needs-human"
    else "open outside epic" end
  elif any($seen[]; . == $n) then "cycle"
  elif $i.state == "closed" then "done"
  elif any($run[]; . == $n) then "running"
  elif ($i | has_label("needs-human")) then "needs-human"
  elif any($fail[]; . == $n) then "failed"
  else
    [$i.deps[] | {d: ., s: st($m; $run; $fail; .; $seen + [$n])}] as $ds |
    ($ds | map(select(.s | IN("needs-human", "failed", "cycle", "unknown") or startswith("stuck")))) as $bad |
    ($ds | map(select(.s != "done"))) as $open |
    if ($bad | length) > 0 then "stuck on " + ($bad | map("#\(.d)") | join(" "))
    elif ($open | length) > 0 then "waiting on " + ($open | map("#\(.d)") | join(" "))
    elif ($i | has_label("ralph:running")) then "held by another ralph run"
    else "ready" end
  end;
def st($m; $run; $fail; $n): st($m; $run; $fail; $n; []);

def ready($m; $run; $fail): [$m.issues[] | select(st($m; $run; $fail; .number) == "ready") | .number];

def table($m; $run; $fail; $prs):
  "| Issue | Title | Blocked by | Status | PR |\n|---|---|---|---|---|\n" +
  ([$m.issues[] | "| #\(.number) | \(.title | gsub("\\|"; "\\|")) | " +
    (if (.deps | length) > 0 then (.deps | map("#\(.)") | join(" ")) else "-" end) +
    " | \(st($m; $run; $fail; .number)) | \($prs[.number | tostring] // "") |"] | join("\n"));

# Wave = 1 + the deepest in-epic blocker; a cycle gets 0.
def lvl($m; $n; $seen):
  if any($seen[]; . == $n) then -1e9 else
  (first($m.issues[] | select(.number == $n))) as $i |
  (([$i.deps[] | select(. as $d | any($m.issues[]; .number == $d)) | lvl($m; .; $seen + [$n])] | max) // 0) + 1 end;
'

# load_model: sets MODEL (the epic issues + their outside-epic blockers) from GitHub.
load_model() {
  local raw ext_nums ext
  if [ -n "$numbers" ]; then
    raw=$(for n in $numbers; do gh api "repos/$REPO/issues/$n" || echo '{}'; done | jq -s 'map(select(has("number")))') || return 1
  else
    raw=$(gh api --paginate "repos/$REPO/issues?state=all&per_page=100&labels=$(jq -rn --arg l "$selector" '$l | @uri')" \
      | jq -s 'add // []') || return 1
  fi
  MODEL=$(printf '%s' "$raw" | jq "$JQ_DEFS model") || return 1
  ext_nums=$(printf '%s' "$MODEL" | jq -r '[.issues[].number] as $s | [.issues[].deps[]] | unique | .[] | select(IN($s[]) | not)')
  ext=$(for d in $ext_nums; do
    gh api "repos/$REPO/issues/$d" --jq '{number, state, title, labels: [.labels[].name]}' 2> /dev/null
  done | jq -s 'map({key: (.number | tostring), value: .}) | from_entries')
  MODEL=$(printf '%s' "$MODEL" | jq --argjson e "$ext" '.ext = $e')
}

PRS='{}'
# refresh_prs: fills PRS with the PR of each issue that has one (feature/issue-N, any state).
refresh_prs() {
  local n pr
  for n in $(printf '%s' "$MODEL" | jq -r '.issues[].number'); do
    [ "$(printf '%s' "$PRS" | jq --arg n "$n" 'has($n)')" = true ] && continue
    pr=$(gh api "repos/$REPO/pulls?head=$OWNER:feature/issue-$n&state=all" --jq '.[0] | select(.) | "#\(.number)"' 2> /dev/null)
    # A closed issue's PR won't change: cache even "none". An open one is looked up again next tick.
    if [ -n "$pr" ] || [ "$(printf '%s' "$MODEL" | jq --argjson n "$n" '.issues[] | select(.number == $n) | .state')" = '"closed"' ]; then
      PRS=$(printf '%s' "$PRS" | jq --arg n "$n" --arg pr "$pr" '.[$n] = $pr')
    fi
  done
}

# ---------- plan (dry run) ----------

if [ "$cmd" = plan ]; then
  load_model || { echo "Could not read the issues from GitHub." >&2; exit 1; }
  refresh_prs
  printf '%s' "$MODEL" | jq -r --arg sel "$selector" --argjson max "$MAX" --argjson prs "$PRS" "$JQ_DEFS"'
    . as $m | [] as $run | [] as $fail |
    ([$m.issues[] | {n: .number, l: lvl($m; .number; []), done: (.state == "closed")}]) as $lv |
    ready($m; $run; $fail) as $ready |
    "Epic \($sel): \($m.issues | length) issues, up to \($max) at a time. DRY RUN: nothing was changed.\n\n" +
    table($m; $run; $fail; $prs) + "\n\n" +
    "Execution order (each issue starts as soon as its own blockers merge, so waves overlap):\n" +
    ([$lv[] | select(.l > 0)] | group_by(.l) | map(
      "  wave \(.[0].l): " + (map("#\(.n)" + (if .done then " (done)" else "" end)) | join(", ")) +
      (if (map(select(.done | not)) | length) > $max then "  [\($max) at a time]" else "" end)
    ) | join("\n")) + "\n\n" +
    "Would start now: " + (if ($ready | length) == 0 then "nothing" else ($ready[:$max] | map("#\(.)") | join(", ")) +
      (if ($ready | length) > $max then "; queued: " + ($ready[$max:] | map("#\(.)") | join(", ")) else "" end) end) +
    "\n" +
    ([
      ($m.skipped | select(length > 0) | "skipped (pull requests, not issues): " + (map("#\(.)") | join(", "))),
      ($m.ext | to_entries[] | "blocker outside the epic: #\(.key) \(.value.title) [\(.value.state)]"),
      ($lv[] | select(.l <= 0) | "dependency cycle through #\(.n): it will never start"),
      ($m.issues[] | st($m; $run; $fail; .number) as $s | select($s | test("^(stuck|needs-human|unknown)")) | "#\(.number): \($s)")
    ] | if length > 0 then "\nWarnings:\n" + (map("  - " + .) | join("\n")) else "" end) +
    (if ($m.issues | length) == 0 then "\nNo issues match this selector."
     elif all($m.issues[]; .state == "closed") then "\nAll issues are closed: a run would do nothing." else "" end)'
  exit 0
fi

# ---------- run ----------

mkdir -p "$LOG_DIR"
RUNNING=""   # "issue:pid" pairs
FAILED='[]'  # issues whose run ended still open, without a needs-human label

running_json() {
  local e
  for e in $RUNNING; do echo "${e%%:*}"; done | jq -s '.'
}

ensure_status_issue() {
  local title="[epic] $selector"
  if [ -z "$status_issue" ]; then
    status_issue=$(gh api --paginate "repos/$REPO/issues?state=open&labels=$EPIC_LABEL&per_page=100" \
      | jq -rs --arg t "$title" 'add // [] | map(select(.title == $t)) | .[0].number // empty')
  fi
  if [ -z "$status_issue" ]; then
    gh label create "$EPIC_LABEL" --repo "$REPO" --color 5319E7 \
      --description "Epic status issue; the ralph loop skips it" --force > /dev/null 2>&1 || true
    status_issue=$(gh api "repos/$REPO/issues" -f title="$title" -f "labels[]=$EPIC_LABEL" \
      -f body="Live status of \`/ralph-epic $selector\` (scripts/ralph-epic.sh). The ralph loop skips issues labeled \`$EPIC_LABEL\`. Close this issue when the epic is done." \
      --jq .number) || { echo "Could not create the status issue." >&2; exit 1; }
    say "status issue #$status_issue created"
  fi
  # Pinning is GraphQL only; cloud sessions block it.
  gh issue pin "$status_issue" --repo "$REPO" > /dev/null 2>&1 || say "warn: could not pin #$status_issue (pin it by hand)"
}

LAST_TABLE=""
# push_status [final]: rewrites the status comment when the table changed.
push_status() {
  local table body id file
  table=$(printf '%s' "$MODEL" | jq -r --argjson run "$(running_json)" --argjson fail "$FAILED" --argjson prs "$PRS" \
    "$JQ_DEFS"'. as $m | table($m; $run; $fail; $prs)')
  [ "$table" = "$LAST_TABLE" ] && [ "${1:-}" != final ] && return 0
  LAST_TABLE=$table
  file=$(mktemp)
  {
    echo "$STATUS_MARKER"
    echo "**Epic \`$selector\`**: $( [ "${1:-}" = final ] && echo "finished" || echo "running $(running_json | jq length)/$MAX") (updated $(date -u '+%Y-%m-%d %H:%M UTC'))"
    echo
    echo "$table"
    echo
    echo "Logs: \`logs/epic/issue-N.out\` and \`logs/issue-N.<phase>.log\` on the machine running the epic."
  } > "$file"
  id=$(gh api --paginate "repos/$REPO/issues/$status_issue/comments" \
    --jq ".[] | select(.body | startswith(\"$STATUS_MARKER\")) | .id" | head -1)
  if [ -n "$id" ]; then
    gh api -X PATCH "repos/$REPO/issues/comments/$id" -F "body=@$file" > /dev/null || say "warn: status comment update failed"
  else
    gh api "repos/$REPO/issues/$status_issue/comments" -F "body=@$file" > /dev/null || say "warn: status comment create failed"
  fi
  rm -f "$file"
}

issue_field() { printf '%s' "$MODEL" | jq -r --argjson n "$1" ".issues[] | select(.number == \$n) | $2"; }

launch() {
  local n=$1 pid
  # ralph-merge.sh drops `blocked` only after a merge; a blocker closed another way leaves it behind.
  if [ "$(issue_field "$n" 'any(.labels[]; . == "blocked")')" = true ]; then
    gh api -X DELETE "repos/$REPO/issues/$n/labels/blocked" > /dev/null 2>&1 || true
  fi
  # Create the worktree here, one at a time: parallel `git fetch` / `worktree add` race on git's locks.
  "$RALPH_HOME/scripts/ralph-worktree.sh" create "$n" > /dev/null || { say "#$n: worktree create failed"; FAILED=$(printf '%s' "$FAILED" | jq ". + [$n]"); return; }
  "$RALPH_HOME/run-ralph.sh" "$n" > "$LOG_DIR/issue-$n.out" 2>&1 &
  pid=$!
  RUNNING="$RUNNING $n:$pid"
  say "#$n started (pid $pid, log logs/epic/issue-$n.out)"
}

# split_blocker <n>: moves a whole-issue blocker into its own needs-human issue the parent waits on.
split_blocker() {
  local n=$1 prefix="Blocker split from #$1 " m pr pr_ref src reason file title
  m=$(gh api --paginate "repos/$REPO/issues?state=open&labels=needs-human&per_page=100" \
    | jq -rs --arg p "$prefix" 'add // [] | map(select((.body // "") | startswith($p))) | .[0].number // empty')
  if [ -z "$m" ]; then
    pr=$(gh api "repos/$REPO/pulls?head=$OWNER:feature/issue-$n&state=open" --jq '.[0].number // empty')
    src=${pr:-$n}
    pr_ref=none
    [ -n "$pr" ] && pr_ref="#$pr"
    # ralph's "If blocked" comment: the newest comment that isn't a marker comment.
    reason=$(gh api --paginate "repos/$REPO/issues/$src/comments" \
      | jq -rs 'add // [] | map(select(.body | startswith("<!--") | not)) | last.body // "(ralph left no comment; see the logs)"')
    title=$(issue_field "$n" .title)
    file=$(mktemp)
    cat > "$file" << EOF
$prefix(PR: $pr_ref), found by \`/ralph-epic $selector\`.

## Blocker (ralph's comment on #$src)

$reason

## To do (human)
- [ ] Resolve the blocker above, then close this issue.

## Then
#$n is blocked by this issue. After closing it, re-run \`/ralph-epic $selector\` and #$n restarts from its progress comment.
EOF
    local labels=(-f "labels[]=needs-human")
    [ -z "$numbers" ] && labels+=(-f "labels[]=$selector")
    m=$(gh api "repos/$REPO/issues" -f title="[needs-human] $title: blocker" "${labels[@]}" -F "body=@$file" --jq .number) || {
      rm -f "$file"; say "#$n: could not open the blocker issue; #$n stays needs-human"; return
    }
    rm -f "$file"
  fi
  # The parent now waits on #m like any other blocker: `blocked` instead of `needs-human`.
  gh api "repos/$REPO/issues/$n" --jq '.body // ""' | jq -Rrs --arg m "$m" '
    if test("#\($m)\\b") then .
    elif test("## Blocked by") then sub("## Blocked by[^\\n]*\\n"; "## Blocked by\n\n- #\($m)\n") | gsub("\\nNone \\(can start immediately\\)"; "")
    else . + "\n\n## Blocked by\n\n- #\($m)\n" end' > "$LOG_DIR/issue-$n.body.md"
  gh api -X PATCH "repos/$REPO/issues/$n" -F "body=@$LOG_DIR/issue-$n.body.md" > /dev/null
  gh api "repos/$REPO/issues/$n/labels" -f "labels[]=blocked" > /dev/null
  gh api -X DELETE "repos/$REPO/issues/$n/labels/needs-human" > /dev/null 2>&1 || true
  gh api "repos/$REPO/issues/$n/comments" \
    -f body="Ralph hit a blocker only a human can clear; it is now #$m (needs-human), and this issue waits on it. The epic \`$selector\` carries on with the other issues." > /dev/null
  say "#$n: blocker split to #$m; dependents wait, other branches continue"
}

# reap: handles every run that ended since the last tick.
reap() {
  local e n pid still="" state labels
  for e in $RUNNING; do
    n=${e%%:*}
    pid=${e##*:}
    if kill -0 "$pid" 2> /dev/null; then still="$still $e"; continue; fi
    wait "$pid" 2> /dev/null
    read -r state labels <<< "$(gh api "repos/$REPO/issues/$n" --jq '"\(.state) \([.labels[].name] | join(","))"')"
    if [ "$state" = closed ]; then
      say "#$n merged and closed"
    elif [[ ",$labels," == *",needs-human,"* ]]; then
      split_blocker "$n"
    else
      FAILED=$(printf '%s' "$FAILED" | jq ". + [$n]")
      say "#$n: run ended with the issue still open; dependents wait (see logs/issue-$n.*.log)"
    fi
  done
  RUNNING=$still
}

stop_all() {
  local e
  say "stopping"
  for e in $RUNNING; do
    pkill -TERM -P "${e##*:}" 2> /dev/null
    kill -TERM "${e##*:}" 2> /dev/null
  done
  wait
  exit 130
}
trap stop_all INT TERM

load_model || { echo "Could not read the issues from GitHub." >&2; exit 1; }
ensure_status_issue
say "epic $selector: $(printf '%s' "$MODEL" | jq '.issues | length') issues, up to $MAX at a time, status in #$status_issue"

while true; do
  reap
  load_model || { say "warn: GitHub read failed; retrying next tick"; sleep "$TICK"; continue; }
  for n in $(printf '%s' "$MODEL" | jq -r --argjson run "$(running_json)" --argjson fail "$FAILED" "$JQ_DEFS"'. as $m | ready($m; $run; $fail)[]'); do
    [ "$(running_json | jq length)" -ge "$MAX" ] && break
    launch "$n"
    sleep 5
  done
  refresh_prs
  if [ -z "${RUNNING// /}" ]; then
    push_status final
    break
  fi
  push_status
  sleep "$TICK"
done

summary=$(printf '%s' "$MODEL" | jq -r --argjson fail "$FAILED" "$JQ_DEFS"'. as $m |
  [$m.issues[] | "#\(.number) \(st($m; []; $fail; .number))"] | join("\n")')
say "finished; status in #$status_issue"
echo "$summary"
if printf '%s' "$MODEL" | jq -e '(.issues | length) > 0 and all(.issues[]; .state == "closed")' > /dev/null; then
  gh api "repos/$REPO/issues/$status_issue/comments" -f body="Every issue in \`$selector\` is closed. Closing the epic." > /dev/null \
    && gh api -X PATCH "repos/$REPO/issues/$status_issue" -f state=closed > /dev/null \
    && say "epic issue #$status_issue closed" || say "warn: could not close #$status_issue"
  exit 0
fi
exit 1
