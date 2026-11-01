#!/bin/bash
# Hermetic test database for THIS worktree: its own Supabase Postgres (+ auth, for auth.users),
# on its own ports, with its own Docker volumes. Two worktrees never share a database, so their
# DB-backed tests can't delete each other's rows.
#
#   scripts/test-env.sh up [--fresh]   start (or reuse) the stack, apply every migration, seed it,
#                                      write .env.test. --fresh rebuilds the database from scratch.
#   scripts/test-env.sh down           stop the stack, delete its volumes, .env.test and .test-env/
#   scripts/test-env.sh status         print whether it runs and the .env.test it wrote
#
# Identity comes from the worktree path: project_id `notes-t-<hash>` and a block of 10 ports at
# 20000 + 10 * (hash % 1000), so the ports stay out of the OS ephemeral ranges and the last digit
# matches the default 5432x ports (…1 API, …2 DB, …0 shadow DB). A block that is taken by
# something else moves to the next one. apps/api's Vitest config loads .env.test, so its
# DATABASE_URL wins over whatever DATABASE_URL the shell has.
#
# Exits non-zero, with one `test-env:` line saying why, when anything fails. Progress goes to
# stderr; stdout is only the DATABASE_URL (for `up`).

set -uo pipefail

root=$(git rev-parse --show-toplevel) || exit 1
cd "$root" || exit 1

say() { echo "test-env: $*" >&2; }
die() { echo "test-env: $*" >&2; exit 1; }
supa() { pnpm exec supabase "$@"; }

hash=$(printf '%s' "$root" | cksum | cut -d' ' -f1)
project_id="notes-t-$(printf '%06d' $((hash % 1000000)))"
work_dir="$root/.test-env"
slot_file="$work_dir/slot"
env_file="$root/.env.test"
db_container="supabase_db_$project_id"
# Only the db, auth (owns auth.users / auth.identities), rest and kong containers; the same set CI runs.
exclude=studio,imgproxy,storage-api,edge-runtime,logflare,vector,realtime,supavisor,postgres-meta,mailpit

running() { docker ps --format '{{.Names}}' | grep -qx "$db_container"; }
in_use() { (echo >"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
psql_db() { docker exec "$db_container" psql -U postgres -d postgres -tAc "$1"; }

# write_config <slot>: copy supabase/ (migrations + seed) into .test-env/ and point it at the slot's ports.
write_config() {
  local base=$((20000 + 10 * $1))
  rm -rf "$work_dir/supabase" && mkdir -p "$work_dir" || return 1
  cp -R "$root/supabase" "$work_dir/supabase" || return 1
  rm -rf "$work_dir/supabase/.temp" "$work_dir/supabase/.branches"
  # Every default 543xN port becomes base+N; the edge-runtime inspector (8083) becomes base+8.
  sed -E -e "s/^project_id = .*/project_id = \"$project_id\"/" \
    -e "s/^([[:space:]]*[a-z_]*port[[:space:]]*=[[:space:]]*)543[0-9]([0-9])/\1$((base / 10))\2/" \
    -e "s/^(inspector_port[[:space:]]*=[[:space:]]*)8083/\1$((base + 8))/" \
    "$root/supabase/config.toml" >"$work_dir/supabase/config.toml" || return 1
  echo "$1" >"$slot_file"
}

cmd_up() {
  local fresh=${1:-}
  command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1 ||
    die "Docker is not running; start Docker and re-run."

  local slot out
  if running && [ -f "$slot_file" ]; then
    slot=$(cat "$slot_file")
    write_config "$slot" || die "could not write $work_dir/supabase."
    say "reusing $project_id (slot $slot)"
    if [ "$fresh" = --fresh ]; then
      say "rebuilding the database (--fresh)"
      out=$(supa --workdir "$work_dir" db reset --local 2>&1) || die "db reset failed: $(tail -1 <<<"$out")"
    elif ! out=$(supa --workdir "$work_dir" migration up --local 2>&1); then
      # History from another branch's migrations: the data is throwaway, so rebuild it.
      grep -q "MigrationMissingLocalError\|not found locally" <<<"$out" ||
        die "migration up failed: $(tail -1 <<<"$out")"
      say "migration history is from another branch; rebuilding the database"
      out=$(supa --workdir "$work_dir" db reset --local 2>&1) || die "db reset failed: $(tail -1 <<<"$out")"
    fi
  else
    # A stopped or half-started stack of ours: clear it so the start below is clean.
    supa stop --project-id "$project_id" --no-backup >/dev/null 2>&1
    slot=$((hash % 1000))
    local tries=0 base
    while :; do
      base=$((20000 + 10 * slot))
      if ! in_use $((base + 0)) && ! in_use $((base + 1)) && ! in_use $((base + 2)); then
        write_config "$slot" || die "could not write $work_dir/supabase."
        say "starting $project_id on ports $base-$((base + 9))"
        if out=$(supa --workdir "$work_dir" start -x "$exclude" 2>&1); then break; fi
        grep -qiE "port is already allocated|address already in use|ports are not available" <<<"$out" ||
          die "supabase start failed: $(tail -1 <<<"$out")"
        supa stop --project-id "$project_id" --no-backup >/dev/null 2>&1
      fi
      tries=$((tries + 1))
      [ $tries -lt 20 ] || die "no free port block after 20 tries (last tried $base)."
      slot=$(((slot + 1) % 1000))
    done
  fi

  # Prove it: every migration file is applied and the seed's dev user exists.
  local want have seeded
  want=$(find "$root/supabase/migrations" -name '*.sql' | wc -l | tr -d ' ')
  have=$(psql_db "select count(*) from supabase_migrations.schema_migrations") ||
    die "can't query $db_container."
  [ "$have" = "$want" ] || die "$have of $want migrations applied; run 'scripts/test-env.sh up --fresh'."
  seeded=$(psql_db "select count(*) from auth.users where email = 'dev@notes.local'")
  [ "$seeded" = 1 ] || die "seed fixtures missing; run 'scripts/test-env.sh up --fresh'."

  local base=$((20000 + 10 * slot))
  local url="postgresql://postgres:postgres@127.0.0.1:$((base + 2))/postgres"
  cat >"$env_file" <<ENV
# Written by scripts/test-env.sh for this worktree only. Do not edit; 'scripts/test-env.sh down' removes it.
TEST_ENV_PROJECT_ID=$project_id
DATABASE_URL=$url
SUPABASE_URL=http://127.0.0.1:$((base + 1))
ENV
  say "ready: $project_id, $want migrations, seed ok, wrote .env.test"
  echo "$url"
}

cmd_down() {
  say "stopping $project_id and deleting its volumes"
  supa stop --project-id "$project_id" --no-backup >/dev/null 2>&1 ||
    { running && die "could not stop $project_id."; }
  rm -rf "$work_dir" "$env_file"
  say "down"
}

cmd_status() {
  if running; then say "$project_id is running"; else say "$project_id is not running"; fi
  [ -f "$env_file" ] && cat "$env_file"
  running
}

case "${1:-up}" in
  up) cmd_up "${2:-}" ;;
  down) cmd_down ;;
  status) cmd_status ;;
  *) echo "Usage: $0 up [--fresh] | down | status" >&2; exit 2 ;;
esac
