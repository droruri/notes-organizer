# App profile — notes-organizer

Everything app-specific the bug hunt needs. When the skill moves to another app, replace this
file (template: `profile-template.md`).

## What the app is

A Hebrew, RTL notes PWA. Users write text or voice notes; an LLM suggests a workspace, category
and tags; notes are organised into workspaces and categories, searched, and edited. There is a
chat assistant and an import flow.

## Start

From the repo root:

```bash
mkdir -p "$RUN_DIR"
out=$(.claude/skills/bug-hunt/scripts/start-app.sh "$RUN_DIR") && eval "$out"
echo "$WEB_URL $API_URL"
```

`start-app.sh` runs `scripts/e2e-setup.sh` (local Supabase stack, shifted ports if another
project holds the default ones), then starts the API with `AI_FAKE=1` and the web dev server on
free ports. Server logs: `$RUN_DIR/api.log`, `$RUN_DIR/web.log`. Stop with
`eval "$BH_STOP"`. If it fails with "Docker is not running", tell the user — do not try to
start Docker.

## Safe targets

- Web: `http://localhost:<E2E_WEB_PORT>`; API: `http://localhost:<E2E_API_PORT>`.
- DB: `127.0.0.1:54322` or `127.0.0.1:55322` (alt stack). Anything else: stop.
- LLM: fake provider only (`AI_FAKE=1`). Never set a real provider key.

## Scripts

- Crawler: `--pw apps/web` (Playwright is installed there), `--script Hebrew`.
- Route dirs for `discover-routes.mjs`: `apps/api/src/routes`.

## Remote targets

Used when the message names an environment but gives no URL. Any URL the user passes wins.

None recorded yet. When the user names an environment without a URL, ask for it and add it here
(for example `- production: https://…`).

Remote notes:

- Sign-in is Google OAuth through Supabase (`features/auth/SignIn.tsx`), and `ALLOWED_EMAILS` limits who gets in. The user signs in in
  the Playwright browser; the dev button `כניסת פיתוח` does not exist there.
- The API origin differs from the web origin. Read it from the network log after sign-in.
- Routes that cost money (real LLM): `POST /notes`, `POST /notes/:id/analyze`, `POST /chat`,
  `POST /imports/analyze`. At most two calls each per run.
- The API token snippet below works the same way on remote.

## Sign in

Click the button `כניסת פיתוח` (dev sign-in, only on the dev server). It signs in as the seeded
user `dev@notes.local`. Signed in when the heading `כללי` is visible.

There is no second test user, so the ownership probes from `probes.md` cannot run with two real
users. Use random UUIDs for foreign ids instead and note it in coverage.

## API token for curl

After sign-in, run in `browser_evaluate`:

```js
() => {
  const k = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
  return k ? JSON.parse(localStorage[k]).access_token : null;
}
```

Export it in Bash as `TOKEN` and call `curl -H "Authorization: Bearer $TOKEN" "$API_URL/notes"`.
Never print it into the report or `actions.log`.

## Routes

- Route code: `apps/api/src/routes/` (Fastify; `app.get('/notes', …)`). Test files
  (`*.test.ts`) are skipped by the finder.
- No `/api` prefix: routes sit at the API origin root (`/notes`, `/workspaces`, `/taxonomy`,
  `/categories`, `/tags`, `/settings`, `/chat`, `/imports/*`, `/links/preview`, `/me`, `/health`).
- Every route except `/health` needs the bearer token.
- Rate-limited (LLM): `POST /notes`, `POST /notes/:id/analyze`, `POST /chat`,
  `POST /imports/analyze`. With `AI_FAKE=1` they are safe to call, but stop at the first 429.
- Request and response shapes: Zod schemas in `packages/shared/src/`. Read them to build
  wrong-type and extra-field probes.

## UI conventions (oracles)

- UI text is Hebrew, RTL. English UI text, left-aligned paragraphs, or mirrored icons that point
  the wrong way are findings.
- Main screen heading: `כללי` (default workspace). New note button: `פתק חדש`. App menu: button
  `תפריט`.
- Deletes are soft (notes, categories, tags have `/restore`), so check that an undo exists in
  the UI and that it restores everything.
- Offline: the app has an outbox for notes written offline. Playwright MCP cannot toggle the
  network; skip offline probes and say so in coverage.

## Scope hints

- A web feature folder `apps/web/src/features/<f>/` maps to the screens of that feature; grep its
  `.tsx` files for Hebrew strings and `aria-label`.
- An API route file `apps/api/src/routes/<x>.ts` maps to its domain in
  `apps/api/src/domain/<x>/`; the routes in the file are the API targets.
- `packages/shared` files: find the routes and components that import the schema, and target
  both.

## Test data

Test data stays in the local DB; other E2E specs share the dev user. Prefix every note, category
and workspace you create with `BH ` so it is easy to spot. Do not wipe the DB.
