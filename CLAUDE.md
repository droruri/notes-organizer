# CLAUDE.md

Conventions for working in this repo. The design — scope, schema, API contract, test plan — is
in `docs/plan.md`; read the relevant section before starting a ticket.

## Intent: Planning vs Implementing

- If I ask for a plan, a ticket/issue, an explanation, or say "just questions", do NOT edit any
  files. Deliver the plan, issue, or answer, then stop.
- Only write code when I explicitly ask you to implement, build, or fix something, or when a Ralph
  build/review phase prompt tells you to.
- After opening a GitHub issue, report the issue number and URL and stop. Do not announce that you
  will resume coding.

## Layout

pnpm workspaces monorepo on [Vite+](https://viteplus.dev/) (`vp`); lint and format config live
in the root `vite.config.ts`:

- `apps/web` — Vite + React + TS PWA.
- `apps/api` — the single Fastify + TS service.
- `packages/shared` (`@notes/shared`) — Zod schemas and inferred types used by **both** web and
  api. Consumed as TS source (no build step).
- `supabase/` — local stack config and `migrations/` (plain SQL, applied by the Supabase CLI).

## Commands

```sh
pnpm dev          # supabase start + api + web
pnpm lint         # vp lint (Oxlint) + vp fmt --check (Oxfmt)
pnpm format       # vp fmt
pnpm typecheck    # tsc in every package
pnpm test         # vp test (Vitest) in every package
pnpm --filter @notes/api test   # one package
pnpm db:reset     # fresh local DB, all migrations re-applied
pnpm db:new <name>
scripts/test-env.sh up      # this worktree's own test DB + .env.test (down / status / up --fresh)
```

DB-backed tests (`describe.skipIf(!databaseUrl)`) run against this worktree's own database:
`scripts/test-env.sh up` starts it (ports and Docker project derived from the worktree path) and
writes `.env.test`, which `apps/api/vite.config.ts` loads over any shell `DATABASE_URL`. CI has no
`.env.test` and uses its own `DATABASE_URL`. The `pre-push` git hook (`.githooks/pre-push`,
installed by `pnpm install`) runs lint, typecheck and the full suite and refuses a failing push.
Before finishing a change, run `pnpm lint && pnpm typecheck && pnpm test`. (Ralph builds run `scripts/ralph-checks.sh` instead — related tests only; the pre-push hook runs the full suite.)

## Local Test Environment

- Before running DB-backed API tests, run `scripts/test-env.sh up`. Never point tests at another
  project's DB or the shared default stack.
- If it fails, fix the environment (`up --fresh`, or `down` then `up`). Never skip the DB-backed
  tests or mark them as passing or "pending CI".
- Never push with failing lint or typecheck. Fix the failure first.
- This is macOS. Avoid GNU-style `sed -i`; use `sed -i ''` or a small Python/Node script for edits.
- Don't include gitignored paths (e.g. `logs/`) in git pathspecs.

## File placement

- **API:** `src/server.ts` is wiring only (build the Fastify app, register routes, read env).
  `src/routes/*` are thin entry points: parse, authorize, delegate, respond — no domain logic.
  Domain logic lives in `src/domain/<area>/`. `src/db.ts` owns the pool and nothing else.
- **Web:** `src/lib/api.ts` is the **single** typed API client — every request to the API goes
  through it, and every response is parsed against its `@notes/shared` schema there.
  Features live in `src/features/<feature>/`.
- **Web hooks:** every API call a component makes is a React Query hook in
  `src/api/<subject>.queries.ts` (query or mutation, with the subject's key factory), re-exported
  from `src/api/index.ts`. Components import hooks from `src/api`; they never call `api.*` or
  `useQuery`/`useMutation` directly. New endpoint = fetcher in `lib/api.ts` + hook in its subject
  file (new subject = new file + a line in `index.ts`). Mutations own their cache effects
  (invalidate/`setQueryData`). Tests spy on `api`.
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
- Tests: Vitest everywhere, imported from `vite-plus/test` (lint-enforced); API routes through
  `app.inject()` via `buildServer({ db })`; web components through React Testing Library. **No real LLM calls in any test or in CI.**
- UI text is Hebrew, RTL.
- `pg` return types: `timestamptz` → `Date`; `numeric`, `bigint` and `extract(epoch …)` →
  **string**. Cast in SQL (`::float8`, `::int`) or parse explicitly — don't type them as numbers.
- Logging follows `docs/logging.md`: every new domain entry function a route calls gets `timed()`,
  one `info` outcome line, and a `warn` for every failure it catches. A swallowed error without a
  log is a bug. Logs never contain note text, prompts, transcripts, tokens or emails. Use `log()`
  from the logging module, never `console.*` or a logger parameter.

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
A breakdown of 2+ tickets is published as an epic (see "Epics"). Implementation then runs
through the ralph loop (`/ralph-epic epic:<slug>` for an epic).

Every plan that adds or changes an API route, domain function or port says, per ticket, which log
lines it adds (outcome, warnings) — following `docs/logging.md` — and the ticket's acceptance
criteria include a captured-log test for them.

`improve-codebase-architecture` and `to-tickets` are model-disabled skills: Read
`~/.claude/plugins/cache/claude-plugins-official/mattpocock-skills/*/skills/engineering/<name>/SKILL.md`
and follow it instead of calling the Skill tool.

## Git

- Ticket work follows `ralph/*.md` (feature branch → PR → review → green CI → squash-merge).
- Outside a ticket, "commit and push" means commit to the **current** branch and push it — don't
  create a new branch unless asked.
- Outside those two cases, don't commit unless asked.

## GitHub Issues

- Issues must be self-contained. Embed the full plan (context, approach, files to touch,
  acceptance criteria as `- [ ]` checkboxes). Do not just summarize it or link to a local plan
  file.
- If a design doc is referenced (e.g. `docs/*-plan.md`), commit it or inline it in the issue.
- For a simple "open an issue" request, skip plan mode and extra clarifying rounds. Investigate,
  then create the issue directly.
- `gh` can't attach images, so describe screenshots in text.

## Epics

An epic is a parent issue plus its sub-tickets, run with `/ralph-epic epic:<slug>`
(`scripts/ralph-epic.sh`). Publish one for every breakdown of 2+ tickets, or when I ask for an
epic. Use `gh api` REST throughout:

1. Label: `gh label create "epic:<slug>" --color 0E8A16 --force` (`<slug>`: short kebab-case).
2. Parent first: title `[epic] epic:<slug>` (exactly this: `/ralph-epic` finds its status issue
   by that title), label `ralph:epic` only (the ralph loop skips it). Body: the goal, the plan
   summary, and the DAG in words.
3. Sub-tickets, blockers first: label `ready-for-agent` + `epic:<slug>`; body starts with
   `Part of #<parent>`, then the usual self-contained ticket with `## Blocked by` (`- #N` lines,
   or `None (can start immediately)`). Blockers name only issues that exist, never the parent.
4. Link each as a GitHub sub-issue: `gh api repos/{owner}/{repo}/issues/<parent>/sub_issues -F sub_issue_id=<child .id>`
   (the numeric `.id` from the create response, not the issue number).
5. Edit the parent body: add `## Tickets` with one `- [ ] #N <title>` per sub-ticket, in order.
6. Check the DAG: `scripts/ralph-epic.sh plan epic:<slug>`. Fix any cycle or "outside the epic"
   warning. Report the parent URL and the plan, then stop.

`/ralph-epic` posts its live status table on the parent and closes the parent when every
sub-ticket is closed. To add a ticket to a running epic, follow step 3 and step 4; the next tick
picks it up.

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
- Don't run the formatter on `ralph/*.md` or other hand-written planning docs.
- UI changes aren't done until checked in a browser by the `e2e` agent (`.claude/agents/e2e.md`; it runs `scripts/e2e-setup.sh` first). Hand it the criteria; it returns `pass|fail` lines, screenshot paths and `E2E_RESULT`.
