# Category importance plan (issue #87)

<!-- On approval this file is saved as docs/category-importance-plan.md, next to category-importance-plan.simple.md.
     Ralph reads the sections a ticket names. -->

## Context

Issue [#87](https://github.com/droruri/notes-organizer/issues/87): a category gets an optional
importance level (same scale as notes: `important` / `not_important` / none). A note that gets
that category takes its level; with several categories the highest wins.

Today `categories` has no importance column, the taxonomy screen only adds/renames/deletes, and
note importance comes only from Claude's suggestion (`classify.ts`) or the user's pick in
`NoteEditor`.

**Decided with the user (fills the issue's "behaviour defined for"):**

| Case | Behaviour |
|---|---|
| Category importance changes after notes exist | Existing notes keep their importance. Only future links use the new level. |
| User sets importance on the note | User wins. Category level is a default the editor fills in; whatever the user saves is stored. |
| Editing a note's categories | Adding a category raises importance when the category's level is higher. Removing a category never lowers it. |
| "Highest" | `important` > `not_important` > none. |

## Approaches considered

**Problem:** give categories a default importance that new links push onto notes, with the user
able to override. **Constraints:** additive migration with RLS untouched; logic in shared/domain,
not routes; every boundary Zod-parsed; user override must survive save; no LLM in tests;
Hebrew RTL UI; logging per `docs/logging.md`.

| #   | Approach | Fit | Footprint | Risk | Tests | Reversible | Cost | Verdict |
| --- | -------- | --- | --------- | ---- | ----- | ---------- | ---- | ------- |
| 1   | Shared `raiseImportance` used by `classify` + editor | 5 | 4 | 4 | 5 | 5 | 5 | Chosen |
| 2   | Server raises on every PATCH that adds a category | 4 | 4 | 2 | 4 | 5 | 5 | Top 3 |
| 3   | Editor-only (web raises, server untouched) | 3 | 5 | 3 | 4 | 5 | 5 | Top 3 |
| 4   | Derived at read time (note importance = max(own, categories)) | 2 | 3 | 2 | 3 | 4 | 4 | Out: breaks "user wins" and "existing notes unchanged" |
| 5   | Postgres trigger on `note_categories` insert | 1 | 4 | 2 | 2 | 3 | 4 | Out: domain rule in DB, invisible to the editor |
| 6   | Feed category level into Claude's prompt only | 3 | 5 | 1 | 2 | 5 | 5 | Out: relies on the model; untestable rule |
| 7   | Track importance source per note (`importance_source` column) | 3 | 2 | 3 | 3 | 3 | 3 | Rejected |
| 8   | Category importance stored in `user_settings` JSON map | 2 | 4 | 3 | 4 | 4 | 4 | Rejected |
| 9   | Recompute affected notes when category level changes | 3 | 3 | 2 | 3 | 2 | 3 | Out: user chose "existing notes unchanged" |
| 10  | Generic "category defaults" (importance + urgency + due) | 3 | 2 | 3 | 3 | 4 | 3 | Rejected |

<details><summary>Approach descriptions</summary>

1. Nullable `categories.importance` column. One pure shared function `raiseImportance(current,
   categoryIds, taxonomy)`. `classify.ts` applies it to every suggestion (draft create,
   re-analyze, import analyze); `NoteEditor` applies it to categories the user adds. PATCH and
   import confirm store what the client sends.
2. Same column; `updateNote` compares old and new links and raises importance for added
   categories before writing. Editor does nothing.
3. Same column; only `NoteEditor` raises. Drafts start with Claude's raw level.
4. No stored inheritance; `listNotes` SQL returns `greatest(note, categories)`.
5. Trigger on `note_categories` insert updates `notes.importance`.
6. Pass each category's level to Claude and let it choose.
7. Store whether the note's level came from a category, so removal can lower it.
8. Map `categoryId → importance` in `user_settings`.
9. Same as 1, plus a bulk `update notes` when a category's level changes.
10. A `category_defaults` JSON per category for several note fields.
</details>

### Chosen: shared `raiseImportance` applied where suggestions are made and where the user picks

`classify.ts` already turns model output into the suggestion that both drafts and imports start
from, so raising there covers create, re-analyze and import with one call. The editor is the
only place a user adds categories to a note (drafts, edits and import rows all use
`NoteEditor`), so raising there shows the new level before save and lets the user lower it.
Stress test: walked "category עבודה = important; note 'send report' classified with עבודה,
Claude says `not_important`" → `classify` returns `important` → draft stored `important` →
editor shows it, user may change → PATCH stores the choice. Walked "edit a done note, add tag
under עבודה" → picker adds the category → editor raises → saved.

### Why not the others

- **Server raises on PATCH** — the editor sends importance and categories in one PATCH, so the server cannot tell "user lowered it" from "not yet raised"; breaks "user wins".
- **Editor-only** — draft rows that the user never opens (import confirm with untouched rows) would skip inheritance; `classify` is the one place that covers them.
- **Derived at read time** — a category change would silently change old notes, and the user's lower pick could never stick.
- **Trigger** — puts a domain rule in SQL where the editor can't show it and tests need the DB.
- **Prompt only** — the rule depends on the model obeying; cannot be tested without a real LLM.
- **Track source** — only needed for "removal lowers", which the user declined.
- **`user_settings` map** — splits category data across two tables; deleted categories leak.
- **Recompute on change** — user chose "existing notes unchanged".
- **Generic defaults** — speculative; the issue asks for importance only.

### What would change the choice

- If the user later wants "removing a category lowers importance", approach 7 becomes needed.

### Architecture scan (improve-codebase-architecture, scoped to taxonomy + notes)

No `Strong` candidates. Noted, not folded in: `routes/taxonomy.ts` `parse(…, withName)` boolean
flag (`Worth exploring` — the new route parses its own body instead of adding a third mode).

## Design

### Data (migration `pnpm db:new category_importance`)

```sql
alter table public.categories add column importance public.importance;
```

Nullable, additive, reuses the existing `importance` enum. RLS already on; no policies.

### Shared (`packages/shared`)

- `index.ts`: `Category` gains `importance: Importance.nullable()` (import `Importance` from
  `./notes`). New `CategoryImportanceBody = z.object({ importance: Importance.nullable() })`.
- `notes.ts`: `raiseImportance(current, categoryIds, taxonomy): Importance | null` — the
  highest of `current` and the levels of the listed, non-deleted categories. Unknown ids
  ignored. Type-only import of `Taxonomy` from `./index` (same as `noteQuery.ts`).

### API

- `domain/taxonomy/repository.ts`: `CATEGORY_COLS` and the `returning` lists add `importance`;
  new `setCategoryImportance(db, id, importance)`.
- `domain/taxonomy/service.ts`: `setCategoryImportance(db, userId, id, importance)` →
  `Result<Category>`, `not_found` for another user's or missing id. Allowed on deleted
  categories (harmless; keeps restore lossless).
- `routes/taxonomy.ts`: `PUT /categories/:id/importance` body `CategoryImportanceBody` →
  `200 Category` · `400 invalid_body` · `404 not_found`.
- `domain/notes/classify.ts` `classify()`: after mapping, `importance = raiseImportance(
  suggestion.importance, [...categoryIds, ...categories of tagIds], usable)`.
- No change to `updateNote` or `confirmImport`: they store what the client sends (user wins).

**Logs (per `docs/logging.md`):** `setCategoryImportance` wrapped in
`timed('setCategoryImportance', { categoryId })`; `info { categoryId, importance }
'category importance set'`; `warn { categoryId, error } 'category importance failed'` on
`not_found`. `classify` change adds no log line (pure mapping inside an already-logged call).

### Web

- `lib/api.ts`: `setCategoryImportance(id, importance)` parsed against `Category`.
- `features/taxonomy/TaxonomyScreen.tsx`: under each active category's name row, a compact
  three-segment control, `role="radiogroup"` labelled "חשיבות ברירת מחדל":
  ללא · חשוב · לא חשוב. One tap sets, changes or clears. Visual: segments sit in a single
  pill track using the existing `chip` tokens; the selected one takes the accent fill;
  `150ms` `background-color` transition only, press `scale(0.96)` gated behind
  `prefers-reduced-motion: no-preference`, hover under `@media (hover: hover)`. Deleted
  categories show the level as a muted `pill` instead of the control. Uses the existing `write()`
  mutation, so errors and taxonomy refresh come for free.
- `features/notes/NoteEditor.tsx`: wrap `setPicked` — on change, find category ids in `next`
  not in `prev`; `setImportance(cur => raiseImportance(cur, added, taxonomy))`. When that raised
  the level, show a one-line muted hint under the importance select: "נקבע לפי הקטגוריה
  {name}". Any manual change of the select clears the hint. Re-analyze replaces importance with
  the (already raised) suggestion as today.
- `locales/he.json` + `en.json`: segment labels, group label, hint.

### Docs

`docs/plan.md`: schema (`categories.importance`), API table row, a Rules bullet with the four
behaviours above, TaxonomyScreen line. `docs/db-schema.md` is untracked user WIP — leave it.

## Files

| File | Change | Why |
|---|---|---|
| `supabase/migrations/<ts>_category_importance.sql` | new | the column |
| `packages/shared/src/index.ts` | edit | `Category.importance`, body schema |
| `packages/shared/src/notes.ts` (+ test) | edit | `raiseImportance`, one rule for API and web |
| `apps/api/src/domain/taxonomy/repository.ts` | edit | read/write column |
| `apps/api/src/domain/taxonomy/service.ts` | edit | set importance + logs |
| `apps/api/src/routes/taxonomy.ts` (+ test) | edit | PUT route |
| `apps/api/src/domain/notes/classify.ts` (+ test) | edit | suggestions inherit |
| `apps/web/src/lib/api.ts` | edit | client call |
| `apps/web/src/features/taxonomy/TaxonomyScreen.tsx` (+ test) | edit | control |
| `apps/web/src/features/notes/NoteEditor.tsx` (+ test) | edit | raise on add + hint |
| `apps/web/src/locales/he.json`, `en.json` | edit | strings |
| `docs/plan.md` | edit | contract |
| Test fixtures building `Category`/`Taxonomy` | edit | new required field `importance: null` |

## Tickets

1. **Set a category's importance** — blocked by: none. Migration, shared `Category.importance`
   + body schema, repo/service/route `PUT /categories/:id/importance`, api client, TaxonomyScreen
   segmented control, strings, `docs/plan.md`, fixtures. Logs: `category importance set` (info),
   `category importance failed` (warn) inside `timed('setCategoryImportance')`. Acceptance:
   route tests (set, change, clear, 404 other user, 400 bad body, `GET /taxonomy` shows it), a
   captured-log test (`captureLogs` from `src/test-logs.ts`) for both lines, RTL test for the
   control, browser check of the screen in he RTL at 390 px.
2. **New notes inherit category importance** — blocked by: 1. Shared `raiseImportance` + unit
   tests; `classify` applies it (classify test with the fake AI: important category lifts
   `not_important`/null; tag implies its category; deleted category ignored). Logs: none added
   (no new entry function). Acceptance: `POST /notes` with fake AI returns a draft with the
   inherited level; import analyze rows carry it.
3. **Editor raises importance when a category is added** — blocked by: 2. NoteEditor raise-on-add
   + hint, strings. Acceptance: RTL tests — adding an important category raises; adding via tag
   raises; removing never lowers; manual change after raise is what gets submitted; editing an
   existing note without adding categories leaves importance unchanged. Browser check of the
   editor.

## Verification

- `pnpm db:reset`, then with `DATABASE_URL` set: `pnpm lint && pnpm typecheck && pnpm test`.
- Manual (Playwright, he RTL, 390 px + desktop, light/dark): set עבודה to חשוב; add note
  "לשלוח דוח" with fake AI picking עבודה → draft shows חשוב; lower to לא חשוב, submit → stored
  לא חשוב; change עבודה to ללא → that note unchanged; edit another note, add עבודה → importance
  rises with hint.
