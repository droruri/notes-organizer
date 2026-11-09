# apps/api — backend

The single Fastify + TS service. Postgres (Supabase) through `pg`, AI through the AI SDK. Shared
repo rules are in the root `CLAUDE.md`; the design is in `docs/plan.md` (`Architecture`,
`apps/api/src/`, `Database schema`, `Auth`, `API contract`, `AI`, `Link previews`, `Test plan`
sections), logging in `docs/logging.md`, decisions in `docs/adr/`.

## Commands

```sh
scripts/test-env.sh up              # this worktree's test DB + .env.test (run before DB tests)
pnpm --filter @notes/api test       # Vitest
pnpm --filter @notes/api typecheck
pnpm --filter @notes/api dev        # api only, env from .env.example + .env
LOG_LEVEL=debug pnpm dev            # follow a request by its reqId
```

## Layout (DDD-lite, plain functions, no classes or DI container)

- `src/server.ts` — wiring only: `buildServer({ db, ai, verifyToken, allowedEmails, … })`,
  register routes, read env, apply logging decorators once.
- `src/routes/<area>.ts` — controller: parse, authorize, delegate, respond. No domain logic.
  Pattern: `safeParse` params/body → `400 { error: 'invalid_body' }` / `404 { error: 'not_found' }`;
  call the service with `currentUser(req).id`; map `Result` failures to status codes with a
  `STATUS` record (see `routes/workspaces.ts`).
- `src/domain/<area>/service.ts` — application service: transaction + orchestration, returns
  `{ ok: true, value } | { ok: false, error }`.
- `src/domain/<area>/<model>.ts` — pure rules (no DB).
- `src/domain/<area>/repository.ts` — SQL only.
- `src/db.ts` — the pool and nothing else. `src/tx.ts` — `withTransaction(db, fn)`, `guarded()`
  (unique violation → `name_taken`), `Queryable`.
- `src/auth.ts` — Supabase JWT via JWKS (jose) + allowlist → `401` / `403 not_allowed`.
- `src/ai/provider.ts` — **the only place a model is called** (`Ai = { extract, chat, transcribe }`,
  Gemini + Groq fallback, scripted fake with `AI_FAKE=1`). See ADR 0001.
- `src/push/provider.ts` — web push port (fake by default in tests).
- `src/requestLog.ts` — `log()`, `timed()`, `errorSummary()`, `addLogFields()`.

## Rules

- Server-derived fields (`created_by`, ids, `userId`, …) are never accepted from the client.
- Every boundary is parsed with Zod `safeParse` and the failure branch handled: bodies, queries,
  params, env, LLM output, fetched pages. Request/response schemas come from `@notes/shared`.
- Another user's ids → `404` / `422`, never data.
- `pg` return types: `timestamptz` → `Date`; `numeric`, `bigint` and `extract(epoch …)` →
  **string**. Cast in SQL (`::float8`, `::int`) or parse explicitly; don't type them as numbers.
- A new external service gets a port plus a logging decorator in its own file (like
  `withLogging`, `withLinkLogging`), applied once in `buildServer`.
- Schema changes are migrations under `supabase/migrations/` (rules in the root `CLAUDE.md`). New
  tables: `enable row level security`, no policies — the API connects as the service role.

## Logging (`docs/logging.md`)

- Every new domain entry function a route calls is wrapped in `timed(name, fields, fn)`, logs one
  `info` outcome line, and a `warn` for every failure it catches. A swallowed error without a log
  is a bug.
- Use `log()`. Never `console.*`, never a logger parameter.
- Short lowercase past-tense messages (`draft saved`); data in the object. Field names: `noteId`,
  `userId`, `ms`, `count`, `error` (domain code), `err` (`errorSummary(err)`), `host`.
- Never log note text, prompts, transcripts, chat messages, tokens, emails or full URLs.

## Tests

- Vitest, imported from `vite-plus/test`. Tests sit next to the code: `foo.ts` → `foo.test.ts`.
- Routes through `app.inject()` on `buildServer({ db, ai: createFakeAi(…), verifyToken: fakeVerifyToken, … })`.
  Test users and stand-in DBs are in `src/test-auth.ts` (`ALLOWED_USER`, `OTHER_USER`,
  `allowListDb`).
- DB-backed suites use `describe.skipIf(!databaseUrl)` against this worktree's DB
  (`scripts/test-env.sh up` writes `.env.test`, loaded by `vite.config.ts`). If the env fails, fix
  it (`up --fresh`); never skip these tests or call them "pending CI".
- Log assertions: `captureLogs({ db })` from `src/test-logs.ts`. Assert the outcome line and the
  failure `warn`; add a privacy check that a secret in the input never reaches any line.
- **No real LLM, Groq or push calls in any test or in CI.**
