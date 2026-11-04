---
name: bug-hunt
description: Exploratory bug hunt that plays a first-time user who has never seen the app. It drives a real browser (Playwright MCP) against the local stack or a deployed instance whose web URL you pass (staging, preview, production — remote mode only touches data it creates), inventories every button, link, menu item and input on every screen it can reach, records what each one opens, then probes every action relentlessly (empty, huge, emoji, double-click, back, reload, rapid repeat, narrow screen) and also attacks every API route it finds in the code (route registrations and "/api/..." paths). Reports bugs and unclear behavior with numbered, replayable repro steps. Use it whenever the user says "bug hunt", "find bugs", "monkey test", "exploratory test", "QA this", "try to break the app", "test it like a new user", "fuzz the UI/API", or passes files/directories and asks to check that area for bugs, even when they don't name the skill. Accepts an optional web app URL and optional file or directory paths to limit the hunt to that area.
---

# Bug hunt

You are a first-time user. You have never seen this app, nobody explained it, and you click
whatever looks clickable. Your job: find every place where the app breaks, loses data, lies about
its state, or leaves a newcomer unsure what happened. Then report each finding so a developer can
replay it step by step.

Two kinds of finding count:

- **Bug** — wrong behaviour you can prove: an error, a crash, a 5xx, lost or wrong data, UI that
  disagrees with the server, a stuck state.
- **Unclear** — nothing technically failed, but a new user would not know what happened or what
  to do: no feedback after an action, a label that does not say what the button does, an
  irreversible action without a warning, a dead end with no way back.

You report. You do not fix code, commit, or open issues.

## Inputs

`$ARGUMENTS` may hold a web app URL and file or directory paths, in any order.

- **Paths:** hunt only that area (see "Scoped hunt"). No paths: the whole app.
- **URL:** the web app to test. It picks the mode:

| What the message gives | Mode | Target |
| --- | --- | --- |
| No URL, or "local" | **local** | Start the app with the profile's start command |
| A `localhost` / `127.0.0.1` / `[::1]` URL | **local** | That URL; it is already running, do not start a second copy |
| Any other URL (staging, preview, production) | **remote** | That URL as it is; start nothing |

If the message names an environment without a URL ("test staging", "check prod"), take the URL
from the profile's "Remote targets" section. If the profile has none, ask the user for the URL.
State the mode and target in the first line you write, so the user can stop a wrong pick.

## Step 0 — Load the app profile

Read `references/app-profile.md`. It tells you how to start the app, how to sign in, which URLs
are safe, where the route code lives, and the app's conventions (language, direction). Everything
app-specific comes from there; the rest of this file is app-agnostic.

If the profile is missing or describes a different app (the skill was copied to a new repo),
stop and build one first from `references/profile-template.md`. See "Exporting to another app".

## Step 1 — Safety guard

Brutal testing deletes things, so the rules depend on the mode.

**Local mode.** Before the first click, check that the web URL and the API URL are local
(`localhost`, `127.0.0.1`, `[::1]`) and that the database URL in the environment is the local
stack from the profile. If any of them points at a hosted host, switch to remote rules. Sign in
only with the profile's test sign-in. Every probe in `probes.md` is allowed.

**Remote mode.** Real users and real data may live there, and there is no server log. The hunt
still clicks everything, but these rules hold:

- **Sign-in is the user's job.** Open the URL in the Playwright browser and ask the user to sign
  in there with a test account. Wait for them to say they are done. Never type a password, and
  never create an account.
- **Touch only what you create.** Prefix everything you create with `BH ` and delete only items
  with that prefix. Never edit, delete or bulk-change data that existed before the run. Delete
  probes run on your own `BH ` items.
- **No load.** Skip rate-limit probes, rapid-repeat bursts over 5 calls, and 100 000-character
  bodies. Call each route that costs money (LLM, email, payments; the profile lists them) at
  most twice in the whole run.
- **No foreign-id writes.** Ownership probes use random UUIDs and only `GET`. Never write to an
  id you did not create.
- At the end, delete the `BH ` items you created and list in the report any you could not
  delete.

## Step 2 — Open a run folder and reach the app

Load the Playwright tools you need in one ToolSearch call: navigate, snapshot, find, click, type,
fill_form, press_key, select_option, resize, console_messages, network_requests, evaluate,
run_code_unsafe, take_screenshot, handle_dialog, wait_for, close.

1. Create the run folder: `logs/bug-hunt/<YYYY-MM-DD-HHMM>-<mode>-<scope-slug>/` (`logs/` is
   gitignored). Everything this run produces goes there.
2. **Local:** start the app with the profile's start command, unless the message gave a running
   local URL. Keep the server logs in the run folder; you read them to explain 5xx errors.
   **Remote:** set `WEB_URL` to the given URL. Leave `API_URL` empty for now.
3. Open `WEB_URL` with `mcp__playwright__browser_navigate` and sign in (local: per the profile;
   remote: the user signs in).
4. **Remote:** find `API_URL` from the first requests in `browser_network_requests` (the origin
   that receives the app's data calls). If the profile names a remote API URL, check it matches.
5. Save the signed-in session for the scripts. `browser_run_code_unsafe`:
   `async (page) => { await page.context().storageState({ path: '<abs RUN_DIR>/state.json' }); return 'ok'; }`
   The file holds the session token; it stays in the run folder, and you delete it in Step 8.

## Token budget

A page dump costs thousands of tokens, and a hunt makes hundreds of actions. Scripts do the
repeated work; you read their short output and spend your own browser calls on judgement.

- **Scripts first.** `crawl.mjs` clicks every control and runs the input probes; `api-fuzz.mjs`
  runs the generic API probes. Both print only anomalies. Do not repeat by hand what they did.
- **Read less of the page.** Use `browser_find` to locate one element instead of
  `browser_snapshot`. When you need a snapshot, limit it with `target` (one region) or `depth`,
  or save it with `filename` and grep the file. Take a full snapshot only once per new screen.
- **Check the oracles once per screen or batch**, not after every probe: run a batch of probes,
  then read `browser_console_messages` (level `error`) and `browser_network_requests` once. Only
  when something shows up, replay the batch one probe at a time to find which one caused it.
- **Screenshots:** save with `filename`, do not view them, and take them only for confirmed
  findings.
- Do not read source files, except the scoped grep and the schemas for field-level API probes.

## Step 3 — Keep an action log from the first click

Append every action you take to `actions.log` in the run folder, numbered, one line each, in
the words a person would use to replay it:

```
017 click button "פתק חדש" (main screen header)
018 type "a" x 5000 into textbox "טקסט"
019 click button "הצע סיווג"
020 API POST /notes body={"body":""} -> 400 {"error":"..."}
```

Repro steps in the report are copied from this log, so log before you move on, not from memory
at the end. Note the step number in the log whenever you see something odd. Script actions are
not copied here: a finding from a script gets its repro from the script's `repro` field and log
number.

## Step 4 — Build the action inventory

**UI actions: run the crawler.**

```bash
node .claude/skills/bug-hunt/scripts/crawl.mjs --url "$WEB_URL" --out "$RUN_DIR" \
  --state "$RUN_DIR/state.json" --pw <dir with playwright, from the profile> \
  --script <UI script from the profile, e.g. Hebrew> [--targets "$RUN_DIR/targets.txt"] \
  [--block-writes "$API_URL"]   # remote mode: always
```

It explores breadth-first from `WEB_URL`. It clicks every visible button, link, menu item, tab,
checkbox and select, and fills each text input with the probe values (empty, spaces, 5000
characters, a 500-character word, emoji, mixed direction, HTML, SQL, templates; all prefixed
`BH `). After each action it records what opened: a new screen, a dialog, new controls, requests,
or nothing. It double-clicks every button that sent a write, and checks each new screen at 390px.
Writes: `crawl.jsonl` (every action) and `inventory.json` (controls per screen). Prints:
`A<n>` anomalies with a repro path, "no visible change" clicks, and controls it did not click.

- It does not click delete, clear or sign-out controls, file inputs or external links. Those are
  yours to probe by hand.
- "No visible change" clicks are Unclear candidates: open one or two and judge.
- Raise `--max-actions` (default 300) if it reports many "not reached".
- If it says the start URL redirected, the session is missing: redo Step 2.5.

Do not read the web source to find buttons. A first-time user only sees the screen; if an
action exists in code but nobody can find it on screen, that is an Unclear finding.

**API actions: find and fuzz the routes.**

```bash
export TOKEN=...   # from the profile's token snippet; never echo it
node .claude/skills/bug-hunt/scripts/discover-routes.mjs <route dirs from the profile, or the scope paths> \
  > "$RUN_DIR/routes.jsonl"
node .claude/skills/bug-hunt/scripts/api-fuzz.mjs --api "$API_URL" --out "$RUN_DIR" \
  --routes "$RUN_DIR/routes.jsonl" [--safe]   # remote mode: always --safe
```

The route finder finds framework route registrations (`app.get('/x')`, `router.post(...)`,
Next.js `app/api/**/route.ts`, …) and every `"/api/..."` string. The fuzzer sends each route: no
auth, a garbage token, bad ids, bad bodies, a bad query string and unregistered methods. It
prints `B<n>` anomalies (5xx, leaked internals, success without auth or with an invalid body) and
the write routes that still need field-level probes by hand. Routes the UI never calls get the
same probes, because a user with dev tools can call them too.

Write `inventory.md` from the two outputs: screens and their controls, routes, and what is left
for the hand pass.

## Step 5 — First-time-user missions

Before the hand pass, look at the first screen and write down three to six goals a newcomer
would guess this app is for (for a notes app: "write a note", "find it again", "organise it",
"delete it"). Try each goal using only what the screen tells you. Log where you hesitated, where
you guessed wrong, and where the app gave no feedback. These hesitations are the Unclear
findings; they are as important as crashes.

## Step 6 — Hand pass

The scripts covered the generic probes. Read `references/probes.md` now, and do by hand only
what needs judgement or state:

1. **Triage the anomalies.** For each `A<n>` / `B<n>`, replay it once (see "Before you call it a
   finding") and decide: bug, unclear, or noise (for example an error caused by a blocked write).
2. **Saves and reloads.** For each action that saved something: reload and compare. What the UI
   showed before the reload must match what the server returns after it.
3. **Delete, clear, undo.** The controls the crawler did not click, on `BH ` items you created.
   Is there a confirmation or an undo, and does undo restore everything?
4. **Field-level API probes** on the write routes the fuzzer listed: wrong type per field,
   server-owned fields (`id`, `user_id`, `created_by`, timestamps), foreign ids. Build the bodies
   from the schemas the profile points to.
5. **Multi-step flows:** a second tab, back during a save, leaving with unsaved text, deep links.

Mark each action done in `inventory.md` with the probes you ran. Do not stop at the first bug,
and do not stop because the app "seems fine". If a probe changes the app so much that you cannot
continue (data wiped, session lost), sign in again and continue — and record that as a finding
if a user could get there.

### Oracles — how you know something is wrong

The scripts check the machine-checkable ones. Check these once per batch of hand probes (see
"Token budget"):

- `browser_console_messages` level `error`: any new error or unhandled rejection.
- `browser_network_requests`: any 5xx, and any 4xx caused by a normal UI action (the UI sent
  something its own server rejects).
- After a save: the reload test (step 2 above).
- Spinner, disabled button or "saving…" that lasts more than about 5 seconds.
- Text typed by the user that is gone, cut, or changed without warning.
- The same item appearing twice after a double-click or rapid repeat.
- Text in the wrong language or direction for the app (the profile names the UI language),
  raw keys like `notes.title`, `undefined`, `NaN`, `[object Object]`, or an untranslated error.
- Layout: overflowing or clipped text, overlapping controls, a control off-screen at 390px width.
- API: a 5xx for bad input (should be 4xx), a stack trace or SQL in an error body, a request that
  succeeds with server-owned fields set by the client (`id`, `created_by`, `user_id`,
  timestamps), access to an id that does not belong to the signed-in user.
- Server log (local mode only, from the run folder): an error logged for a request the UI
  considered successful.

### Before you call it a finding

Replay it once from a fresh page (reload, or sign in again) using only the logged steps. If it
does not reproduce, keep it under "Flaky / not reproduced" with what you saw — do not drop it,
and do not present it as confirmed. Save a screenshot of the confirmed state into the run folder
(`browser_take_screenshot`, filename `F<n>.png`).

## Scoped hunt

When `$ARGUMENTS` names files or directories:

- **API side**: run `discover-routes.mjs` on those paths only. Fuzz and probe only those routes.
- **UI side**: grep the scoped files for the strings a user sees — button text, `aria-label`,
  headings, placeholders, menu labels. Write them one per line to `$RUN_DIR/targets.txt` and pass
  `--targets` to the crawler: it still navigates the whole app to reach them, clicks the targets
  first, and reports anomalies only for the targets and what they open.
- If a scoped file has no visible strings (a hook, a util), find which component imports it and
  use that component's strings.
- If a target cannot be reached from the UI, report that, then test the routes behind it
  through the API.

## Step 7 — Report

Write `report.md` in the run folder with this structure:

```markdown
# Bug hunt — <app> — <scope or "whole app"> — <date>

Target: <local|remote> <WEB_URL> (API <API_URL>)

## Verdict
Good to go | Not ready — <one line why>

## Summary
<n> bugs (<n> blocker, <n> major, <n> minor), <n> unclear, <n> flaky. Inventory coverage:
<x>/<y> UI actions, <x>/<y> API routes.

## Findings

### F1 — <short title> [bug|unclear] [blocker|major|minor]
**What a user sees:** <one or two sentences, plain language>
**Expected:** <what a reasonable user expected>
**Repro:** (from actions.log; start state stated first)
1. Start: signed in, main screen.
2. Click button "פתק חדש".
3. ...
**Evidence:** console error / status code + response snippet / server-log line / `F1.png`
**Where it probably lives:** <file:line if you found it, otherwise omit>

## Flaky / not reproduced
## First-time-user notes
<missions: which goals were easy, where you hesitated>
## Coverage
<table: action or route — probes run — result>
```

Severity: **blocker** — data loss, crash, or a main goal impossible; **major** — wrong result or a
5xx on a reachable path; **minor** — cosmetic, or only reachable with odd input.

Verdict is "Good to go" only when there are no blocker or major bugs and the missions all
succeeded. Unclear findings alone do not block, but list them.

Never write tokens, passwords or cookies into the report or the action log. Write `$TOKEN` in
curl examples and say in the report how to get one (the profile says).

## Step 8 — Clean up

Close the browser (`browser_close`) and delete `$RUN_DIR/state.json`. Local: stop the servers you started (`eval "$BH_STOP"`,
only if you started them), leave the database stack running (other tools share it), and delete
test data only if the profile says to. Remote: delete your `BH ` items (Step 1). Tell the user the
verdict, the counts, the top three findings, and the path to `report.md`.

## Exporting to another app

The only app-specific files are `references/app-profile.md` and `scripts/start-app.sh`;
`crawl.mjs`, `api-fuzz.mjs` and `discover-routes.mjs` work on any web app. To use
this skill in another repo:

1. Copy the `bug-hunt/` folder into that repo's `.claude/skills/`.
2. Fill a new `references/app-profile.md` from `references/profile-template.md`: find how the
   app starts locally, how a test user signs in, where routes are registered, which UI language
   it uses. Ask the user only for what the repo cannot tell you (usually the test sign-in).
3. Rewrite `scripts/start-app.sh` for that app, keeping its contract: it prints `export` lines
   for `WEB_URL`, `API_URL` and `BH_STOP` (a command that stops what it started), and exits non-zero with a one-line reason.
4. Run the skill once, scoped to a small directory, to check the profile works.
