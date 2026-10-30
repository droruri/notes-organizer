# Plan: Add-note input — RTL default, recording first, auto-send on stop (#90)

## Context

Issue [droruri/notes-organizer#90](https://github.com/droruri/notes-organizer/issues/90) asks for four changes on the compose page (`/new`):

1. The text input should be RTL for Hebrew. Both fields already have `dir="auto"` (since #71). The problem Dror sees is the **empty** field: with no letters typed, the caret and placeholder sit LTR. Agreed fix: an empty field defaults to RTL, and once it has text, `dir="auto"` takes over.
2. The recording controls move above the main text input. Today they sit at the bottom of the card, under the textarea.
3. The recording controls get a slightly larger font.
4. Stopping a recording sends it right away. Today it takes **stop**, then a separate **"שלח הקלטה"** click.

This is web-only. No API, schema, migration or shared-schema change.

## Approaches considered

**Problem:** make stop-means-send, the RTL empty default and the recorder-first layout work with the least new code, and without sending a recording by accident.
**Constraints:** Hebrew RTL UI; no `!` and no lying `as`; tests sit next to their code (RTL + Vitest from `vite-plus/test`); StrictMode is on (effects run twice in dev); offline outbox path must keep working; no real LLM calls in tests or E2E.

| #   | Approach                                                                     | Fit | Footprint | Risk | Tests | Reversible | Cost | Verdict                                      |
| --- | ---------------------------------------------------------------------------- | --- | --------- | ---- | ----- | ---------- | ---- | -------------------------------------------- |
| 1   | `stop()` installs the sending `onstop` (fresh closure)                       | 5   | 5         | 5    | 5     | 5          | 5    | Chosen                                       |
| 2   | `start()`'s `onstop` sends through a latest-`onSend` ref                     | 4   | 4         | 4    | 5     | 5          | 5    | Top 3                                        |
| 3   | `onstop` sets state; a `useEffect` on `audio` calls `onSend`                  | 3   | 5         | 2    | 4     | 5          | 5    | Top 3                                        |
| 4   | `useEffectEvent` for `onSend`, called from `onstop`                          | 3   | 5         | 3    | 5     | 5          | 5    | Out: Effect Events may only be called from Effects |
| 5   | Parent owns the recorder (lift `MediaRecorder` into `NotesScreen`)           | 2   | 2         | 3    | 3     | 4          | 4    | Rejected                                     |
| 6   | New `useVoiceRecorder` hook + presentational component                       | 3   | 2         | 4    | 4     | 4          | 4    | Rejected                                     |
| 7   | Keep the send button, auto-click it via `useEffect`                          | 1   | 4         | 2    | 3     | 5          | 4    | Rejected                                     |
| 8   | RTL: `dir="rtl"` always                                                      | 3   | 5         | 3    | 5     | 5          | 5    | Rejected                                     |
| 9   | RTL: CSS `:placeholder-shown { direction: rtl }`                             | 3   | 4         | 3    | 2     | 5          | 5    | Rejected                                     |
| 10  | RTL: `dir={value.trim() ? 'auto' : 'rtl'}` helper in `NotesScreen.tsx`       | 5   | 5         | 5    | 5     | 5          | 5    | Chosen (RTL part)                            |

<details><summary>Approach descriptions</summary>

1. `start()` gives `onstop` only "release the mic". The Stop click handler replaces `onstop` with "build blob → set phase → `onSend(blob)`". It uses that render's `onSend`, so the current title and online state go with it. Unmount and discard never install the sending handler, so they never send.
2. Same, but `start()` installs the sending handler and reads `onSendRef.current`, kept fresh by an effect. A ref plus an effect only to beat a stale closure.
3. `onstop` stores the blob; `useEffect(() => { if (audio) onSend(audio) }, [audio])`. Under StrictMode the effect double-fires in dev → double upload; it also needs a "sent" flag.
4. `useEffectEvent(onSend)` called from the MediaRecorder callback. That breaks React's rule (and the lint rule) that Effect Events are called only from Effects.
5. Move recording state into `NotesScreen`. That grows an already large screen and breaks a self-contained module.
6. Split VoiceRecorder into a hook plus a view. That is a new file and a new layer, with one caller.
7. Hack. Hidden button, timing-dependent.
8. Hard-RTL breaks English notes (they would stay right-aligned while typing).
9. CSS alone. It can't be asserted in jsdom, and `direction` on a `dir="auto"` element fights the attribute.
10. Empty → `rtl`, otherwise `auto`. Two call sites in the same file.
</details>

### Chosen: 1 + 10

The Stop click is the user's "send" intent, so the sending code is attached at that moment. That one fact gives three things. The upload uses the current title and online state (no stale closure). There is no ref or effect. Leaving the page mid-recording or pressing discard can't send anything, because only Stop installs the sending handler. The stress test confirmed the seam exists: `FakeRecorder.stop()` in `VoiceRecorder.test.tsx` calls whatever `onstop` is set at that moment, and so does the real MediaRecorder (asynchronously). For RTL, a one-line helper next to its only two callers fixes the empty case and keeps `dir="auto"` behaviour once text exists.

### Why not the others

- **Latest-ref (2)** — adds a ref and an effect only to work around a closure that approach 1 never creates.
- **Effect on `audio` (3)** — StrictMode double-invokes it → two uploads in dev; it needs extra "already sent" state.
- **`useEffectEvent` (4)** — calling it from a non-Effect callback is outside React's contract and fails the hooks lint rule.
- **Lift to parent (5)** — moves ~60 lines of media logic into the 300+-line `NotesScreen` for no gain.
- **Hook split (6)** — a new file and layer with one caller (druri-plan rule 4).
- **Auto-click (7)** — timing-dependent and keeps dead UI.
- **Always RTL (8)** — English notes would type right-aligned.
- **CSS placeholder (9)** — can't be tested in jsdom; conflicts with `dir="auto"`.

### What would change the choice

- If Dror uses the **English** UI and wants empty fields LTR there, the empty default should become `i18n.dir()` instead of `'rtl'`. That is a one-word change in the helper.

## Design (frontend-design pass)

This is a tweak inside the existing design system (`apps/web/src/styles.css`). It adds no new tokens, colors or fonts.

- **Layout:** the recorder strip becomes the **first row of the compose card**, above the title and the body. It is separated by `border-b border-line pb-3`, which replaces today's `border-t pt-3`. Voice is now the first thing offered, and typing stays one tap below.
  ```
  ┌ card ─────────────────────────────┐
  │ [🎤 הקלטה]                         │  ← recorder (start-aligned, RTL)
  │───────────────────────────────────│
  │ כותרת                              │
  │ גוף הפתק…                          │
  └───────────────────────────────────┘
  [✨ הצע סיווג] [ביטול]
  ```
- **Size:** every recorder button drops `btn-sm` for the base `.btn`: 0.9375rem font (was 0.875), 2.5rem height (was 2rem). Icons go 14→16. The timer gets `text-[1.0625rem]`, matching the input text size. The bigger tap targets are the one bold change. Nothing else moves.
- **States after Stop:** the dot turns grey and the timer freezes. A `role="status"` line with a spinner shows "מעלה ומתמלל…" while `pending`. Discard stays, disabled while pending. If `failed`, the existing alert shows and a **"שלח הקלטה"** button appears **only then**, as a retry, so the recording isn't lost. There is no send button on the normal path.

## Ticket work

### T1 — Compose fields default to RTL when empty

- **Modify** `apps/web/src/features/notes/NotesScreen.tsx`:
  - Add a module-level `const inputDir = (value: string) => (value.trim() ? 'auto' : 'rtl');`.
  - Use `dir={inputDir(title)}` and `dir={inputDir(text)}` on the two compose fields.
  - Why here: there are only two callers, both in this file. `NoteEditor.tsx` is out of scope; the issue covers the add-note input only.
- **Modify** `apps/web/src/features/notes/NotesScreen.test.tsx`, next to the existing `shows compose on /new`:
  - Empty title and body have `dir="rtl"`.
  - After typing `hello`, the body has `dir="auto"`.
  - After clearing to spaces, it is `rtl` again.

### T2 — Recorder above the input, larger, auto-send on stop

- **Modify** `apps/web/src/features/notes/VoiceRecorder.tsx`:
  - `start()`: `onstop` only stops the stream's tracks.
  - `stop()`: set `r.onstop` to stop tracks, build the blob (same mime fallback as today), `setAudio`, `setPhase('recorded')`, then `onSend(blob)`. After that, call `r.stop()`.
  - Unmount cleanup and `discard`: unchanged. They never install the sending handler, so leaving the page or discarding never uploads.
  - JSX:
    - `btn-sm` → `btn` on all buttons; icons 16; timer `text-[1.0625rem]`.
    - Remove the always-on send button.
    - Add a `pending` status line (spinner + `voice.sending`).
    - Add a retry button (`voice.send`) shown only when `phase === 'recorded' && audio && failed && !pending`.
  - Update the doc comment: "stopping sends the recording".
- **Modify** `apps/web/src/features/notes/NotesScreen.tsx`: move the `<div>` wrapping `<VoiceRecorder>` to the top of the card and swap `border-t pt-3` → `border-b pb-3`.
- **Modify** `apps/web/src/features/notes/VoiceRecorder.test.tsx`:
  - Test 1: record → 0:03 → click "עצור" → `onSend` called once with a Blob, and **no** "שלח הקלטה" button.
  - Test 4: with `pending`, after stop, a status "מעלה ומתמלל…" shows and discard is disabled. Rerender `failed` → alert, plus a "שלח הקלטה" retry button that calls `onSend` with the same blob.
  - New: unmount mid-recording → `onSend` not called.
  - New: discard mid-recording → `onSend` not called.
- No locale change: `voice.send` is reused as the retry label and `voice.sending` as the status text.

### Files (all modified, none created)

| File | Why |
| --- | --- |
| `apps/web/src/features/notes/NotesScreen.tsx` | `dir` helper (T1); recorder position (T2) |
| `apps/web/src/features/notes/NotesScreen.test.tsx` | RTL default test (T1) |
| `apps/web/src/features/notes/VoiceRecorder.tsx` | auto-send, sizes, status/retry (T2) |
| `apps/web/src/features/notes/VoiceRecorder.test.tsx` | updated + new recorder tests (T2) |

## druri-plan checks

- **Reuse:** `.btn` / `.spinner` / `.notice` classes; existing `voice.*` strings; the existing `createVoice` mutation and `saveOffline` path (they are untouched, since `onSend`'s contract is the same); `FakeRecorder` test double.
- **No duplication:** one `inputDir` helper serves both fields. The blob-building code moves rather than being copied.
- **Abstraction budget:** one new 1-line function (`inputDir`). No new components, hooks, files or props.
- **Safety:** `chunks[0]?.type` stays guarded. The retry button renders only when `audio` is non-null (narrowed by the check, no `!`). `r.onstop` is set only inside `if (r && r.state !== 'inactive')`.
- **Placement:** recording behaviour stays in `VoiceRecorder.tsx`. Layout and field direction stay in the compose screen.
- **Logging:** there is no API route, domain function or port change, so `docs/logging.md` adds no log lines. The web path is unchanged; the API already logs voice-note creation.

## Architecture scan (improve-codebase-architecture, Explore step only)

Scope: `VoiceRecorder.tsx` and the compose branch of `NotesScreen.tsx`. `VoiceRecorder` is already a deep module: a small `onSend/pending/failed` interface that hides MediaRecorder, permissions and the timer. There are no `Strong` candidates. `NotesScreen.tsx` mixing the list, compose and outbox is a `Weak` candidate that is not needed for this change, so it is left alone. (The mattpocock `codebase-design` and `vercel-react-best-practices` skills aren't installed in this environment. The plan uses their principles informally: deep module, no effect-for-events, no stale closures.)

## Out of scope (noted, not done)

- Typed body text is still dropped when a voice note is sent (`saveOffline('', audio…)` / `createVoiceNote` without a body). That is existing behaviour; it's worth a follow-up issue if wanted.
- `NoteEditor.tsx` fields keep plain `dir="auto"`.

## Verification

- Run `pnpm lint && pnpm typecheck && pnpm test` (or `scripts/ralph-checks.sh` in ralph builds).
- **E2E/browser check** (`e2e` agent, after `scripts/e2e-setup.sh`) on `/new`:
  - pass: the empty body textarea has `dir="rtl"` and the placeholder is right-aligned.
  - pass: the recorder row is above the title/body, inside the card.
  - pass: the recorder button font-size is 15px (0.9375rem) and its height is 40px.
  - Screenshot of the compose page.
  - Recording itself is not driven in E2E: it would hit real transcription, and the rule is no real LLM calls. Unit tests cover the flow.
- The existing E2E `composeNote` helper (`e2e/helpers.ts`) keeps working: same labels, and the text path is unchanged.

## Tickets (published: #129, #131)

1. **#129 Compose fields default to RTL when empty** — Blocked by: none. Delivers T1: empty title/body are RTL; typing switches to `dir="auto"`; RTL test.
2. **#131 Voice recorder first, larger, sends on stop** — Blocked by: #129, since both edit the compose JSX in `NotesScreen.tsx`. Delivers T2: recorder at the top of the card, `.btn` sizing, stop uploads immediately, retry only on failure, no upload on unmount/discard; updated tests; browser check.
