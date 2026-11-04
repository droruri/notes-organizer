# App profile — <app name>

Fill every section from the repo. Ask the user only for what the repo cannot tell you.

## What the app is

Two or three sentences: who uses it and what for. Do not copy marketing copy; describe what the
first screen lets a user do.

## Start

The command block that starts the app locally and sets `WEB_URL`, `API_URL` and `BH_STOP` (via `scripts/start-app.sh`). Where the server logs go. What to do when a dependency
(Docker, DB) is missing.

## Safe targets

The local hosts and ports the hunt may touch, and the DB URL pattern that proves it is a local
DB. Any external service (LLM, payments, email) and how it is faked locally. If it cannot be
faked, list the routes and buttons that call it so the hunt skips them.

## Scripts

- Crawler: `--pw <dir where playwright is installed>`, `--script <Unicode script of the UI text,
  e.g. Latin, Hebrew, Arabic>`.
- Route dirs for `discover-routes.mjs`.

## Remote targets

Named deployed environments (staging, preview, production) and their web URLs, how a user signs
in there, where the API lives, and which routes cost money (LLM, email, payments).

## Sign in

The test account or dev sign-in, and what on screen proves the user is signed in. A second test
user, if one exists (for ownership probes).

## API token for curl

How to get a bearer token or cookie after signing in in the browser, and how to send it with
curl. Never store a real token in this file.

## Routes

- Where routes are registered, and the framework.
- Path prefix (`/api` or none) and API origin.
- Which routes need auth, which are rate-limited or call paid services.
- Where request/response schemas live.

## UI conventions (oracles)

UI language and direction, the main screen's landmark text, key button labels, soft vs hard
deletes, offline support.

## Scope hints

How a source directory maps to screens and routes in this repo.

## Test data

How to mark test data, and whether to clean it up.
