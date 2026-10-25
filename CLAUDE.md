# CLAUDE.md

Conventions for working in this repo. The design — scope, schema, API contract, test plan — is
in `docs/plan.md`; read the relevant section before starting a ticket.

## Layout

pnpm workspaces monorepo:

- `apps/web` — Vite + React + TS PWA.
- `apps/api` — the single Fastify + TS service.
- `packages/shared` (`@notes/shared`) — Zod schemas and inferred types used by **both** web and
  api. Consumed as TS source (no build step).
- `supabase/` — local stack config and `migrations/` (plain SQL, applied by the Supabase CLI).

## Commands

```sh
pnpm dev          # supabase start + api + web
pnpm lint         # eslint + prettier --check
pnpm format       # prettier --write
pnpm typecheck    # tsc in every package
pnpm test         # vitest in every package
pnpm --filter @notes/api test   # one package
pnpm db:reset     # fresh local DB, all migrations re-applied
pnpm db:new <name>
```

DB-backed tests (`describe.skipIf(!databaseUrl)`) run only with the stack up and
`DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres`. CI always runs them.
Before finishing a change, run `pnpm lint && pnpm typecheck && pnpm test`. (Ralph builds run `scripts/ralph-checks.sh` instead — related tests only; CI runs the full suite.)

## File placement

- **API:** `src/server.ts` is wiring only (build the Fastify app, register routes, read env).
  `src/routes/*` are thin entry points: parse, authorize, delegate, respond — no domain logic.
  Domain logic lives in `src/domain/<area>/`. `src/db.ts` owns the pool and nothing else.
- **Web:** `src/lib/api.ts` is the **single** typed API client — every request to the API goes
  through it, and every response is parsed against its `@notes/shared` schema there.
  Features live in `src/features/<feature>/`.
- **Shared:** a schema, type or constant needed by both web and api goes in `packages/shared`,
  defined once.
- **Migrations:** one new file per change via `pnpm db:new`; never edit an applied migration.
  Migrations must be backward-compatible (add first, remove in a later merge).
  Every new table gets `enable row level security` and **no policies** (the API is the only
  reader; it connects as the service role).
- Tests sit next to the code they test: `foo.ts` → `foo.test.ts`.

## Conventions

- TypeScript `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. No non-null
  assertions (`!`, lint-enforced) and no lying `as` casts — narrow with real checks.
- Every boundary is parsed, not trusted: request bodies/queries, env vars, API responses, LLM
  output, fetched pages — Zod `safeParse`, with the failure branch handled.
- Server-derived fields (`created_by`, ids, …) are never accepted from the client.
- Tests: Vitest everywhere; API routes through `app.inject()` via `buildServer({ db })`; web
  components through React Testing Library. **No real LLM calls in any test or in CI.**
- UI text is Hebrew, RTL.
- `pg` return types: `timestamptz` → `Date`; `numeric`, `bigint` and `extract(epoch …)` →
  **string**. Cast in SQL (`::float8`, `::int`) or parse explicitly — don't type them as numbers.

## Planning

Every implementation plan (plan mode, or any "plan X" request) is built with these skills, loaded
before the plan is written:

- `/druri-plan` — always.
- `/mattpocock-skills:codebase-design` — always; its deep-module vocabulary frames the
  architecture step and the ticket boundaries.
- `/vercel-react-best-practices` — only when the plan touches `apps/web`.
- `improve-codebase-architecture` — run its Explore step scoped to the modules the plan touches,
  and fold its `Strong` candidates into the plan as prefactor work. Skip its HTML report and
  grilling loop unless the user asks for them.

After exploring and before writing the design, run `/plan-approaches`: about ten distinct
approaches, scored on the same criteria, top three stress-tested against the code, one chosen. It
writes an `## Approaches considered` section into the plan, with the reason each alternative lost.

The plan ends with a ticket breakdown in `to-tickets` form: tracer-bullet slices, each with
title, blocked-by, and what it delivers.

Once the plan is written, run `/plan-explainer` on it: it writes `<plan>.simple.md` next to the
plan — a plain-language before/after per section, with examples, benefits and a Mermaid flow. In
plan mode only the plan file is editable, so there the same content goes in the chat right before
`ExitPlanMode`, every time the plan is written or updated, and the file is saved once the plan is
approved (hooks in `.claude/settings.json` remind both steps).

Once the user approves the plan, the next action is publishing those tickets with `to-tickets`
(step 5). Plan approval is breakdown approval, so its quiz step is already done. Tracker: GitHub
issues in this repo, label `ready-for-agent`, blockers listed as `#N` under `## Blocked by` — the
format `run-ralph.sh` parses. Create blockers first, so issue number order is work order.
Implementation then runs through the ralph loop.

`improve-codebase-architecture` and `to-tickets` are model-disabled skills: Read
`~/.claude/plugins/cache/claude-plugins-official/mattpocock-skills/*/skills/engineering/<name>/SKILL.md`
and follow it instead of calling the Skill tool.

## Git

- Ticket work follows `ralph/*.md` (feature branch → PR → review → green CI → squash-merge).
- Outside a ticket, "commit and push" means commit to the **current** branch and push it — don't
  create a new branch unless asked.
- Outside those two cases, don't commit unless asked.

## Scope

- Don't change `run-ralph.sh` or `ralph/*.md` unless the request is about the ralph
  loop itself. Other automation (deploy, setup, …) is a standalone re-runnable script in
  `scripts/` that skips — with a warning — any step whose key/token is missing, never blocks on it.
- Never overwrite `.env` or `.env.example`; only append to them.
- After changing `run-ralph.sh`, `ralph/*.md` or a skill in `.claude/skills/`, dry-run
  it once on the smallest unblocked issue before reporting the change as done.
- A change is not done while CI or E2E is red. Fix it, or show the same failure on `main`.

## Tooling gotchas

- If `pnpm` isn't on PATH, use `npx pnpm`.
- Always quote pnpm filters (`pnpm --filter './apps/*'`) — unquoted, the shell expands the glob.
- If `gh pr edit` fails on token scope, use `gh api` (REST) instead.
- Don't run Prettier on `ralph/*.md` or other hand-written planning docs.
- UI changes aren't done until checked in a browser (Playwright from Bash, see `ralph/shared.md`). Open the page, look at it, and say what you saw.
