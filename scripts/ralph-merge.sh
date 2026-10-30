#!/bin/bash
# The deterministic part of ralph's merge phase (steps 10 and 11 of ralph/*.md):
# wait for CI on the issue's PR, squash-merge it when green, close the issue, unblock dependents.
#
#   scripts/ralph-merge.sh <issue>
#
# Exit 0: merged (or nothing to merge and the issue is closed). Exit 1: needs the LLM merge phase
# (no open PR, CI red, or the merge failed).

set -uo pipefail

REPO="${RALPH_REPO:-droruri/notes-organizer}"

issue="${1:-}"
if [[ ! "$issue" =~ ^[0-9]+$ ]]; then
  echo "Usage: $0 <issue-number>" >&2
  exit 2
fi
branch="feature/issue-$issue"

# REST only: cloud sessions block GitHub GraphQL (HTTP 403), which `gh issue|pr <subcommand>` uses.

# Removes `blocked` from every open issue whose "## Blocked by" issues are all closed.
unblock_dependents() {
  gh api --paginate "repos/$REPO/issues?state=open&per_page=100" | jq -s 'add | map(select(has("pull_request") | not))' | jq -r '
    (map(.number)) as $open |
    .[] | select(any(.labels[]; .name == "blocked")) |
    select([(.body // "") | capture("## Blocked by(?<b>[\\s\\S]*?)(\\n## |\\n---|$)").b // "" |
      scan("#([0-9]+)")[0] | tonumber] | any(. as $n | $open | index($n)) | not) |
    .number' | while read -r n; do
    echo "Unblocking #$n"
    gh api -X DELETE "repos/$REPO/issues/$n/labels/blocked" > /dev/null
  done
}

owner="${REPO%%/*}"
pr_info=$(gh api "repos/$REPO/pulls?head=$owner:$branch&state=open" --jq '.[0] | select(.) | "\(.number) \(.head.sha)"') || {
  echo "GitHub API lookup of the PR for $branch failed."
  exit 1
}
read -r pr sha <<< "$pr_info"
if [ -z "${pr:-}" ]; then
  echo "No open PR for $branch."
  exit 1
fi

# check_state: prints none (no runs yet), pending, red or green for the PR head commit.
# Reads check runs and legacy commit statuses; an API failure prints "error", which the wait loop retries.
check_state() {
  local runs status
  runs=$(gh api --paginate "repos/$REPO/commits/$sha/check-runs?per_page=100" | jq -rs '
    [.[].check_runs[]] as $r |
    if ($r | length) == 0 then "none"
    elif any($r[]; .status != "completed") then "pending"
    elif any($r[]; .conclusion | IN("success", "neutral", "skipped") | not) then "red"
    else "green" end') || { echo error; return; }
  status=$(gh api "repos/$REPO/commits/$sha/status" --jq '
    if .total_count == 0 then "none" elif .state == "success" then "green" else .state end') || { echo error; return; }
  case "$status" in
    failure | error) echo red; return ;;
    pending) [ "$runs" = green ] && { echo pending; return; } ;;
  esac
  echo "$runs"
}

# failing_checks <sha>: prints the names of failing check runs and legacy statuses, one per line, sorted.
# Returns non-zero on an API failure.
failing_checks() {
  local runs statuses
  runs=$(gh api --paginate "repos/$REPO/commits/$1/check-runs?per_page=100" | jq -rs '
    .[].check_runs[] | select(.status == "completed" and (.conclusion | IN("success", "neutral", "skipped") | not)) | .name') || return 1
  statuses=$(gh api "repos/$REPO/commits/$1/status" --jq '.statuses[] | select(.state | IN("failure", "error")) | .context') || return 1
  printf '%s\n%s\n' "$runs" "$statuses" | sed '/^$/d' | sort -u
}

# Finds or creates the open `main is red: <check>` issue for a check.
ensure_main_red_issue() {
  local title="main is red: $1" found
  found=$(gh api -X GET search/issues -f q="repo:$REPO is:issue is:open in:title \"$title\"" |
    jq --arg t "$title" '[.items[] | select(.title == $t)] | length') || found=""
  if [ "${found:-}" = 0 ]; then
    gh api "repos/$REPO/issues" -f title="$title" -f 'labels[]=ready-for-agent' \
      -f body="The check \`$1\` is failing on \`main\`. Found while merging PR #$pr, which was red only on checks also red on main. Fix the check, or remove it if it is not ours." > /dev/null \
      && echo "Opened issue: $title"
  fi
}

# Set when CI is red only on checks that also fail on main's latest commit.
merge_note=""
red_only_on_main() {
  local pr_fail main_fail main_sha extra
  main_sha=$(gh api "repos/$REPO/commits/main" --jq .sha) || return 1
  pr_fail=$(failing_checks "$sha") || return 1
  main_fail=$(failing_checks "$main_sha") || return 1
  [ -n "$pr_fail" ] || return 1
  extra=$(comm -23 <(printf '%s\n' "$pr_fail") <(printf '%s\n' "$main_fail"))
  [ -z "$extra" ] || return 1
  merge_note="$pr_fail"
}

# Checks can take a moment to register after the last push; CI itself can take a while.
echo "Waiting for CI on PR #$pr..."
state=none
for i in $(seq 1 360); do
  state=$(check_state)
  case "$state" in
    green | red) break ;;
    none) [ "$i" -gt 12 ] && break ;;
  esac
  sleep 10
done
if [ "$state" = red ] && red_only_on_main; then
  echo "PR #$pr is red only on checks also red on main; merging anyway."
elif [ "$state" != green ]; then
  echo "CI is not green on PR #$pr ($state)."
  exit 1
fi

# The branch is checked out in the issue's worktree, so it is not deleted via the API.
# ralph-worktree.sh removes the local branch; the remote one is deleted here.
if ! gh api -X PUT "repos/$REPO/pulls/$pr/merge" -f merge_method=squash > /dev/null; then
  echo "Merge of PR #$pr failed."
  exit 1
fi
if [ -n "$merge_note" ]; then
  names=$(printf '%s' "$merge_note" | paste -sd, - | sed 's/,/, /g')
  gh api "repos/$REPO/issues/$pr/comments" -f body="Merged with checks also red on main: $names" > /dev/null
  while IFS= read -r name; do ensure_main_red_issue "$name"; done <<< "$merge_note"
fi
git push origin --delete "$branch" > /dev/null 2>&1 || true

# "Closes #N" normally closes the issue; close it explicitly if the PR body lacked it.
if [ "$(gh api "repos/$REPO/issues/$issue" --jq .state)" != closed ]; then
  gh api "repos/$REPO/issues/$issue/comments" -f body="Merged in #$pr." > /dev/null
  gh api -X PATCH "repos/$REPO/issues/$issue" -f state=closed > /dev/null
fi
unblock_dependents
echo "PR #$pr merged; issue #$issue closed."
