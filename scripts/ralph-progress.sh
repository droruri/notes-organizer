#!/bin/bash
# Syncs a ralph progress file with one GitHub issue comment, so a run on any machine (local or
# cloud) can resume from it. The comment is marked with RALPH_MARKER and edited in place.
#
#   scripts/ralph-progress.sh pull <issue>   comment → logs/issue-<issue>.progress.md (cwd)
#   scripts/ralph-progress.sh push <issue>   logs/issue-<issue>.progress.md (cwd) → comment
#
# `pull` with no comment leaves no file. `push` with no file does nothing.

set -euo pipefail

REPO="${RALPH_REPO:-droruri/notes-organizer}"
RALPH_MARKER='<!-- ralph-progress -->'

cmd="${1:-}"
issue="${2:-}"
if [[ ! "$cmd" =~ ^(pull|push)$ ]] || [[ ! "$issue" =~ ^[0-9]+$ ]]; then
  echo "Usage: $0 pull|push <issue-number>" >&2
  exit 2
fi

file="logs/issue-$issue.progress.md"

comment_id() {
  gh api --paginate "repos/$REPO/issues/$issue/comments" \
    --jq ".[] | select(.body | startswith(\"$RALPH_MARKER\")) | .id" | head -1
}

case "$cmd" in
  pull)
    id=$(comment_id)
    [ -z "$id" ] && exit 0
    mkdir -p logs
    # Drop the marker, the opening fence and the closing fence.
    gh api "repos/$REPO/issues/comments/$id" --jq .body | sed '1,2d;$d' > "$file"
    ;;
  push)
    [ -f "$file" ] || exit 0
    body=$(mktemp)
    trap 'rm -f "$body"' EXIT
    { echo "$RALPH_MARKER"; echo '```text'; cat "$file"; echo '```'; } > "$body"
    id=$(comment_id)
    if [ -n "$id" ]; then
      gh api -X PATCH "repos/$REPO/issues/comments/$id" -F "body=@$body" > /dev/null
    else
      gh api "repos/$REPO/issues/$issue/comments" -F "body=@$body" > /dev/null
    fi
    ;;
esac
