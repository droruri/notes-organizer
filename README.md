# notes-organizer

The design lives in **[`docs/plan.md`](docs/plan.md)**. Conventions are in [`CLAUDE.md`](CLAUDE.md).

## Setup

Node.js 22.9+, pnpm 10 (`corepack enable`) and Docker (for the local Supabase stack).

```sh
pnpm install
pnpm dev   # Supabase + API on :3000 + web on :5173
```

## Ralph

Issues labeled `ready-for-agent` are built by the ralph loop: `./run-ralph.sh` (all unblocked
issues) or `./run-ralph.sh <N>` (one). See `ralph/shared.md`.
