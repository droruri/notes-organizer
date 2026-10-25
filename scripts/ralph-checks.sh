#!/bin/bash
# Local checks for a ralph build: lint, typecheck, and only the tests related to files changed
# against origin/main (per package). CI runs the full suite before the merge, so it is not
# repeated here.
#
#   scripts/ralph-checks.sh   (from the repo root / worktree)

set -uo pipefail

root=$(git rev-parse --show-toplevel) || exit 1
cd "$root" || exit 1

echo "== lint =="
pnpm lint 2>&1 | tail -30
[ "${PIPESTATUS[0]}" -eq 0 ] || { echo "lint FAILED"; exit 1; }

echo "== typecheck =="
pnpm typecheck 2>&1 | tail -30
[ "${PIPESTATUS[0]}" -eq 0 ] || { echo "typecheck FAILED"; exit 1; }

# Committed, staged, unstaged and untracked changes against origin/main.
changed=$( { git diff --name-only --diff-filter=d origin/main; git ls-files --others --exclude-standard; } | sort -u)

echo "== tests related to changed files (CI runs the full suite before merge) =="
status=0
for pkg in apps/web apps/api packages/shared; do
  files=()
  while IFS= read -r f; do
    case "$f" in
      "$pkg"/*.ts | "$pkg"/*.tsx) files+=("$root/$f") ;;
      # web and api import @notes/shared, so its changes also select their dependent tests.
      packages/shared/*.ts | packages/shared/*.tsx) [ "$pkg" != packages/shared ] && files+=("$root/$f") ;;
    esac
  done <<<"$changed"
  if [ "${#files[@]}" -eq 0 ]; then
    echo "-- $pkg: no changed ts/tsx files, skipped"
    continue
  fi
  echo "-- $pkg: ${#files[@]} changed file(s)"
  (cd "$pkg" && pnpm exec vitest related --run --passWithNoTests --reporter=dot "${files[@]}" 2>&1 | tail -40)
  [ "${PIPESTATUS[0]}" -eq 0 ] || { echo "$pkg tests FAILED"; status=1; }
done
exit $status
