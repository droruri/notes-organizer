# Customizable note form — plan for #93

Simple version: [note-form-settings-plan.simple.md](note-form-settings-plan.simple.md)

## Context

Issue #93: let each user shape the note form. Every optional field can be shown or hidden;
the two choice fields (importance, urgency) can show as a dropdown or as buttons, with a chosen
subset of values. One form (`NoteEditor`) backs draft review, edit, import review and the offline
outbox, so one setting changes all of them.

Decisions taken with Dror:

- **Entry point:** a settings button in the `NoteEditor` header (next to "Review"/"Edit note").
  The `/new` compose page has only title + body, and the fields being customized show up only on
  the shared form.
- **Hidden means not shown. The value stays.** A hidden field keeps the note's value on edit, and
  Claude's suggestion is still saved on a draft. A display setting never deletes data.
- **Fields you can hide:** title, categories & tags, due date, importance, urgency. Body (and status
  on edit) are required and cannot be hidden. The schema enforces this, since they are not in the
  enum.
- **Persistence:** server-side, per user, in the existing `user_settings` row. It works across
  devices and is already cached offline by `queryPersist`.

Skill note: `mattpocock-skills:codebase-design`, `improve-codebase-architecture` and `to-tickets`
are not installed in this container (no plugin cache). Their framing is applied by hand below:
deep modules, one Strong prefactor, and a tracer-bullet ticket list.

## Approaches considered

**Problem:** store per-user form settings and make the one shared editor follow them, without
losing data or breaking the saved sort. **Constraints:** additive migration with RLS already on;
every boundary is Zod-parsed (stored JSON, request body, persisted cache); Hebrew RTL; logging per
`docs/logging.md`; no change to required fields; old clients and old cached `{noteSort}` must
keep working.

| #   | Approach                                                          | Fit | Footprint | Risk | Tests | Reversible | Cost | Verdict |
| --- | ----------------------------------------------------------------- | --- | --------- | ---- | ----- | ---------- | ---- | ------- |
| 1   | `note_form` jsonb on `user_settings`; `PUT /settings` takes a patch | 5   | 5         | 4    | 5     | 5          | 5    | Chosen  |
| 2   | Same column, separate `PUT /settings/note-form` route              | 4   | 3         | 4    | 5     | 5          | 4    | Top 3   |
| 3   | Same column, client always sends the full `Settings` on PUT        | 4   | 5         | 2    | 4     | 5          | 5    | Top 3   |
| 4   | `localStorage` per device                                           | 3   | 5         | 3    | 4     | 5          | 5    | Out: "persist per user" (lost across devices) |
| 5   | Typed columns (`hidden_fields text[]`, `importance_display`, …)     | 3   | 2         | 4    | 4     | 3          | 2    | —       |
| 6   | New normalized table `note_form_fields(user_id, field, …)`          | 2   | 1         | 3    | 3     | 3          | 2    | —       |
| 7   | Callers pass a `form` prop into `NoteEditor` (3 call sites)         | 3   | 3         | 4    | 4     | 5          | 4    | —       |
| 8   | Settings as a separate route/page                                   | 3   | 4         | 2    | 4     | 5          | 4    | —       |
| 9   | In-place "customize mode" toggles on each editor field              | 3   | 3         | 3    | 3     | 5          | 3    | —       |
| 10  | Refactor `NoteEditor` into a field-descriptor registry first        | 3   | 1         | 3    | 4     | 3          | 2    | —       |

<details><summary>What each approach is</summary>

1. One nullable `note_form jsonb` column (null = defaults). `Settings` gains `noteForm` with a
   Zod default. The domain reads the current row, merges a partial body, upserts, and returns the
   full settings. `NoteEditor` reads the `['settings']` query itself. The settings sheet opens
   over the editor.
2. Like 1, but a dedicated route and domain function and client method for the form; `PUT
   /settings` stays as it is.
3. Like 1, but no API change: the web sends `{...settings, noteSort}` from the sort menu.
4. Store the form settings in the browser only.
5. One SQL column per setting with CHECK constraints.
6. One row per field per user.
7. Keep `NoteEditor` pure; NotesScreen, ImportReview and OutboxDialog each fetch and pass settings.
8. `/settings/form` page instead of a sheet.
9. A "customize" switch turns the editor itself into the settings UI.
10. Rewrite the editor as a map of field descriptors, then make visibility data-driven.
</details>

### Chosen: jsonb column + patch-style `PUT /settings` (1)

The settings belong to the same row and the same query (`['settings']`, already persisted
offline and parsed on restore) as the saved sort. Adding them there means no new route, no new
cache key and no new client method. A partial body merged on the server lets the sort menu
(`{noteSort}`) and the settings sheet (`{noteForm}`) each save their own part. Neither can
overwrite the other, even if the other's data never loaded. The stress test checked three things.
`saveSettings` today echoes its input. That is exactly the bug a partial body would cause, so the
merge returns the stored result instead. Old cached `{noteSort}` blobs still parse, thanks to the
Zod default. And all three `NoteEditor` callers already render inside a `QueryClientProvider`
(the tests wrap it too), so the editor can read the query directly.

### Why not the others

- **Separate route (2)**: adds a route, a domain entry and a client method, only to avoid a
  merge that is 3 lines.
- **Client sends full settings (3)**: if `settings` hasn't loaded (offline, error), changing the
  sort silently resets the form to defaults. That is data loss through a race.
- **localStorage (4)**: settings would not follow the user to a second device. The issue asks for
  them per user.
- **Typed columns (5)**: every new field or value becomes a migration and a CHECK change. The
  shape belongs to the app, and Zod already validates it.
- **Normalized table (6)**: a join and N rows for a small config blob that is always read whole.
- **Prop from callers (7)**: three call sites to change, and a fourth caller would silently ignore
  the settings. The editor should own its own form rules.
- **Separate page (8)**: navigating away unmounts `NoteEditor` and throws away unsaved edits to
  the draft.
- **Customize mode (9)**: hidden fields would have to render while being edited, and picking
  values doesn't fit inside a `<select>`. Two jobs on one screen.
- **Descriptor registry (10)**: a large rewrite of a form that has only six fields. Nothing in this
  issue needs it.

### What would change the choice

- If settings grew to many unrelated groups saved from many screens, per-group routes (2) would be
  cleaner.

## Design

### Shared — `packages/shared/src/index.ts` (next to `Settings`)

```ts
export const HideableField = z.enum(['title', 'taxonomy', 'dueDate', 'importance', 'urgency']);
export const ChoiceDisplay = z.enum(['dropdown', 'buttons']);
const choiceSettings = <T extends z.ZodEnum>(values: T) =>
  z.object({
    display: ChoiceDisplay.default('dropdown'),          // ticket 3
    hiddenValues: z.array(values).default([]),           // ticket 4
  });
export const NoteForm = z.object({
  hiddenFields: z.array(HideableField).default([]),
  importance: choiceSettings(Importance).default({ display: 'dropdown', hiddenValues: [] }),
  urgency: choiceSettings(Urgency).default({ display: 'dropdown', hiddenValues: [] }),
});
export const DEFAULT_NOTE_FORM: NoteForm = NoteForm.parse({}); // single source of defaults
export const Settings = z.object({ noteSort: NoteSort, noteForm: NoteForm.default(DEFAULT_NOTE_FORM) });
/** Body of PUT /settings: only the parts being changed. */
export const SettingsPatch = z.object({ noteSort: NoteSort.optional(), noteForm: NoteForm.optional() });
```

- `SettingsPatch` is written out on purpose, not `Settings.partial()`. In Zod 4, a default inside
  an optional field still fires, so `{noteSort}` would come back carrying a default `noteForm` and
  wipe the stored one.
- Every level has a default. Old API responses, old cached `{noteSort}` and rows stored by an
  earlier ticket all parse.

### DB — `supabase/migrations/<ts>_note_form_settings.sql` (via `pnpm db:new`)

`alter table public.user_settings add column note_form jsonb;` Nullable, where null means
defaults. Additive. RLS is already on and there are no policies.

### API

- `domain/settings/settings.ts`
  - `getSettings`: also selects `note_form`. Each of `note_sort` and `note_form` is `safeParse`d.
    Null means the default. A non-null value that fails to parse means the default plus
    `log().warn({ field }, 'stored settings invalid')`. The existing silent `noteSort` fallback
    gets the same warn line, since today it is a swallowed error with no log.
  - `saveSettings(db, userId, patch: SettingsPatch)`: wrapped in `timed('saveSettings', …)`. It
    reads the current settings, merges `{ ...current, ...defined(patch) }`, upserts both columns
    (`note_form = $3::jsonb`), and returns the merged result (no longer an echo).
    `log().info({ changed: Object.keys(patch) }, 'settings saved')`.
- `routes/settings.ts`: `PUT` parses `SettingsPatch` instead of `Settings`. Otherwise unchanged.
  Old clients that send `{noteSort}` still work.

### Web

- `lib/api.ts`: `saveSettings: (patch: SettingsPatch) => request('PUT', '/settings', Settings, patch)`.
  `NotesScreen`'s sort menu keeps sending `{ noteSort }` with no change. `queryPersist` keeps
  `settings: Settings`.
- `ui/Segmented.tsx` (prefactor, ticket 1): the radiogroup now inside `ImportanceControl`, made
  generic. Props: `label`, `options: readonly (T | null)[]`, `value`, `labelOf`, `disabled?`,
  `onChange`. `ImportanceControl` becomes a thin call to it. The editor's button mode and the
  sheet's dropdown/buttons switch use it too, so the radio markup exists once.
- `features/notes/NoteEditor.tsx`:
  - `const form = useQuery({ queryKey: ['settings'], queryFn: api.settings }).data?.noteForm ?? DEFAULT_NOTE_FORM;`
    This is the same query key as `NotesScreen`, so it is cache-shared and offline-persisted.
    Errors and loading fall back to the defaults.
  - `shown(field)` gates the title input, `TaxonomyPicker`, due date, importance and urgency. State
    and `submit()` are untouched, so hidden values are still submitted. That is the "keep" rule.
  - The due date / importance / urgency grid becomes `auto-fit` so 1–3 visible fields fill the
    row. The grid is skipped when all three are hidden.
  - A local `ChoiceField<T>` in the same file replaces the two near-identical `<select>` blocks.
    It renders a `<select>` or `<Segmented>` based on `display`, always with the "none" option.
    It offers `options.filter(o => !hiddenValues.includes(o) || o === value)`, so a note that
    already has a hidden value still shows it, selected. The importance hint passes through as
    children.
  - Header: an icon button (`aria-label` "Form settings") opens `NoteFormSettings`, held in local
    `useState`. The editor stays mounted, so unsaved edits survive.
- `features/notes/NoteFormSettings.tsx` (new): a bottom sheet in the `ReaderSheet` style
  (`backdrop`, `enter-sheet`, `useExit`, `useEscape`). It works on a local copy of `NoteForm`.
  **Save** sends `PUT {noteForm}`, then `onSuccess` calls
  `queryClient.setQueryData(['settings'], saved)` and closes the sheet, so the change shows at
  once. **Cancel** throws away the copy. A failed save shows `notice-danger` and the sheet stays
  open.
- `ui/Icon.tsx`: add a `sliders` glyph. `locales/he.json` + `en.json`: new strings.

### Sheet design (frontend-design pass)

The app already has a full token system (`--accent`, `--surface`, `--line`; `.btn`, `.chip`,
`.segment`, `.field`, `.label`, sheet animations). A settings sheet inside it should not bring a
new palette or a new typeface. The design choice goes into structure instead. **The sheet is the
form, folded.** Rows follow the editor's field order, under the same `.label` names the user sees
in the form. A shown field is a full row with its controls. A hidden field folds to one muted line
with a "Show" switch, so the sheet itself previews the form's shape.

```
┌───────────────────────────────── Form settings ── ✕ ┐
│ Title                                     [● shown] │
│ Body                              Always shown (🔒) │  ← required: no switch, muted
│ Categories & tags                         [● shown] │
│ Due date ······································ hidden [○]│  ← folded row, muted
│ Importance                                [● shown] │
│   Show as  ( Dropdown | Buttons )        ← Segmented│
│   Values   [Important] [~~Not important~~]  ← Chip  │
│ Urgency                                   [● shown] │
│   Show as  ( Dropdown | Buttons )                   │
│   Values   [Not critical][Medium][Critical][Urgent] │
├─────────────────────────────────────────────────────┤
│ [Save settings]  [Cancel]                 (sticky)  │
└─────────────────────────────────────────────────────┘
```

- Text runs RTL, and start-aligned labels follow the logical direction (`ms-auto` for switches).
- The visibility switch is a native `<input type="checkbox" role="switch">` with
  `accent-color: var(--accent)`, so no new CSS component.
- Values are `Chip`s with `aria-pressed` = "offered". The last offered value can't be turned off,
  because a choice field with only "none" is pointless (the hint says why).
- Copy: the button is "Save settings", and the result is the form changing in place. No toast,
  since the change shows itself. No uppercase labels and no eyebrows.
- The only motion is the existing sheet entrance plus the fold/unfold height change. It respects
  `prefers-reduced-motion` as the current animations do.

### Druri-plan checks

- **Files.** *Created (4):* the migration, which is required for storage. `ui/Segmented.tsx`,
  which is the one radiogroup now duplicated three ways. `NoteFormSettings.tsx` + its test, which
  is a distinct screen. *Modified:* shared `index.ts`, the domain `settings.ts`,
  `routes/settings.ts`, `server.test.ts`, `lib/api.ts`, `NoteEditor.tsx` (+ test),
  `ImportanceControl.tsx`, `Icon.tsx`, the two locale files, `NotesScreen.test.tsx` (the settings
  mocks need `noteForm`), and `docs/plan.md` (the `/settings` row and the ER box).
- **Reuse.** The settings row, route, query and persister; `ReaderSheet`'s sheet shell; `Chip`;
  the `.segment` styles; `captureLogs` for the log tests.
- **No duplication.** The defaults are defined once (`NoteForm.parse({})`). The radiogroup is
  defined once (`Segmented`). The two selects become one `ChoiceField`.
- **Abstraction budget.** `Segmented` has three callers. `ChoiceField` has two, kept local to
  `NoteEditor`. No hook layer, because the editor reads the query directly.
- **Safety.** Stored jsonb, request body, API response and persisted cache are all Zod-parsed with
  defaults. A hidden current value is still rendered (no unmatched `<select>` value). An unknown
  enum value in storage gives defaults plus a warn line.
- **Placement.** The merge and fallbacks live in `domain/settings`. The route only parses. Form
  rendering rules live in `NoteEditor`. The settings UI lives in its own file in
  `features/notes`.

## Tickets (to-tickets form, label `ready-for-agent`)

1. **Extract a shared segmented choice control.** Blocked by: none. Delivers `ui/Segmented.tsx`;
   `ImportanceControl` uses it with no behavior change. Acceptance: the existing taxonomy
   importance tests pass unchanged, plus one RTL test for `Segmented` (arrow-free click selects,
   `aria-checked`). No API change, so no logs.
2. **Show or hide optional fields on the note form.** Blocked by: none. Delivers the migration,
   `HideableField`/`NoteForm` (`hiddenFields` only)/`SettingsPatch`, the patch-merge
   `saveSettings`, the `getSettings` fallbacks, the editor gating, the header button, and the sheet
   with visibility switches (body shown as locked). **Logs:** `saveSettings` timed + info
   `settings saved {changed}`; warn `stored settings invalid {field}`. Acceptance:
   `app.inject` tests show GET defaults `noteForm`, `PUT {noteForm}` keeps `noteSort` and
   `PUT {noteSort}` keeps `noteForm`. A captured-log test asserts `settings saved`, and another
   asserts the warn for a corrupt stored `note_form`. RTL tests: a hidden field is not rendered
   and its value is still submitted; Save in the sheet updates the editor without a reload. E2E:
   hide due date, then check the review and edit forms both lack it.
3. **Importance and urgency as dropdown or buttons.** Blocked by: #1, #2. Delivers
   `ChoiceDisplay` + `display`, the local `ChoiceField` replacing both selects, and the "Show as"
   segmented control in the sheet. Logs: none new (the same save path). Acceptance: RTL test that
   the buttons mode renders a radiogroup with "none" + values and submits the picked value; the
   dropdown is unchanged by default. E2E: switch urgency to buttons in RTL and check it in a
   screenshot.
4. **Choose which importance/urgency values are offered.** Blocked by: #3. Delivers
   `hiddenValues`, the option filter with the current-value exception, and value chips in the
   sheet (the last one is locked). Logs: none new. Acceptance: RTL tests show a hidden value is
   not offered for a note without it; a note whose urgency is a hidden value shows it selected and
   submits it unchanged; works in both display modes. E2E: hide "Medium", then open a note set to
   Medium and check it still shows.

## Verification

- `pnpm lint && pnpm typecheck && pnpm test` with the stack up and
  `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres`, so the `/settings` DB
  tests and captured-log tests run. Run `pnpm db:reset` first to apply the migration.
- `e2e` agent (runs `scripts/e2e-setup.sh`) with each ticket's E2E criteria. It checks the RTL
  layout of the sheet at phone width, button mode, a folded hidden row, and that settings persist
  after a reload and on a second browser context (proving they are per user, not per device).
