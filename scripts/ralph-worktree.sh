#!/bin/bash
# One git worktree per ralph issue, so a run never switches branches in the main checkout.
#
#   scripts/ralph-worktree.sh create <issue>   prints the worktree path (reuses an existing one)
#   scripts/ralph-worktree.sh remove <issue>   removes the worktree and the local branch
#
# The worktree lives at <main checkout>/.ralph/wt/issue-<issue> on branch feature/issue-<issue>:
# the existing local or remote branch if there is one, else a new branch from origin/main.

set -euo pipefail

cmd="${1:-}"
issue="${2:-}"
if [[ ! "$cmd" =~ ^(create|remove)$ ]] || [[ ! "$issue" =~ ^[0-9]+$ ]]; then
  echo "Usage: $0 create|remove <issue-number>" >&2
  exit 2
fi

# The main checkout, also when this runs from inside a worktree.
root=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
wt="$root/.ralph/wt/issue-$issue"
branch="feature/issue-$issue"

case "$cmd" in
  create)
    git -C "$root" fetch origin --quiet --prune
    if [ ! -d "$wt" ]; then
      git -C "$root" worktree prune
      # Progress goes to stderr: stdout is only the path.
      if git -C "$root" show-ref --verify --quiet "refs/heads/$branch"; then
        git -C "$root" worktree add --quiet "$wt" "$branch" >&2
      elif git -C "$root" show-ref --verify --quiet "refs/remotes/origin/$branch"; then
        git -C "$root" worktree add --quiet --track -b "$branch" "$wt" "origin/$branch" >&2
      else
        git -C "$root" worktree add --quiet --no-track -b "$branch" "$wt" origin/main >&2
      fi
      [ -f "$root/.env" ] && ln -sf "$root/.env" "$wt/.env"
      pnpm=pnpm
      command -v pnpm > /dev/null || pnpm="npx pnpm"
      (cd "$wt" && $pnpm install --frozen-lockfile 2>&1 | tail -3) >&2
    fi
    echo "$wt"
    ;;
  remove)
    if [ -d "$wt" ]; then
      git -C "$root" worktree remove --force "$wt"
    fi
    git -C "$root" worktree prune
    git -C "$root" branch -D "$branch" > /dev/null 2>&1 || true
    ;;
esac
