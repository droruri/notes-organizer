# Category picker plan (issue #88)

<!-- Ralph reads the sections a ticket names. -->

## Context

Issue [#88](https://github.com/droruri/notes-organizer/issues/88): in the note editor, categories
are sorted alphabetically (Hebrew-aware), and on mobile the inline chips show only Claude's
suggestions, with a button that opens a dialog to filter and pick more.

Today `TaxonomyPicker` (inside `NoteEditor`) renders a chip for **every** category, in the order
`GET /taxonomy` returns (`order by lower(c.name)` — whatever the database collation gives, which
is not Hebrew-aware under the default `C`/`en_US` collations). Claude's new names follow as
"new" chips. Below them, a tag row for every category that has tags. On a phone with 30
categories this is several screens of chips before the due date field.

`NoteEditor` is the one editor for drafts, edits, import rows and offline notes. Since #113 it
wraps the picker's `onChange` in `changePicked`, which raises importance for every category
added in that change — so a dialog that adds several at once is already covered.

**Decided with the user:**

| Question | Answer |
|---|---|
| Unchecking a selected category in the dialog | Removes it on confirm (dialog mirrors the note; its tags go too, as with a chip tap). |
| Tag rows on mobile | Only for categories visible inline. |
| Where | Everywhere the editor is used. "Suggested" = the suggestion's `categoryIds`: Claude's picks on a draft or import row, the note's own categories on edit, none offline. |
| Mobile | Below Tailwind's `sm` breakpoint (640 px), the breakpoint the app already uses. |

## Approaches considered

**Problem:** sort categories Hebrew-aware and, on small screens only, show just the suggested
ones inline with a filter-and-check dialog for the rest. **Constraints:** web-only (no API or
schema change); `@notes/shared` holds anything both sides need; Hebrew RTL; RTL tests, no new
harness; desktop unchanged except order; must keep #113's raise-on-add working; minimal files.

| #   | Approach | Fit | Footprint | Risk | Tests | Reversible | Cost | Verdict |
| --- | -------- | --- | --------- | ---- | ----- | ---------- | ---- | ------- |
| 1   | Client collator + CSS breakpoint classes + sheet dialog | 5 | 5 | 4 | 4 | 5 | 5 | Chosen |
| 2   | Client collator + `useMediaQuery` hook renders two layouts | 4 | 3 | 3 | 4 | 5 | 4 | Top 3 |
| 3   | Native `<dialog>` + `showModal()` for the picker | 3 | 4 | 3 | 2 | 5 | 5 | Top 3 |
| 4   | Sort in SQL with `collate "he-IL-x-icu"` | 3 | 4 | 3 | 3 | 4 | 4 | Rejected |
| 5   | Shared `sortByName` in `@notes/shared`, used by API + web | 3 | 3 | 4 | 5 | 5 | 4 | Rejected |
| 6   | Inline search field instead of a dialog | 3 | 4 | 4 | 4 | 5 | 5 | Out: issue asks for a dialog |
| 7   | `<select multiple>` / native picker on mobile | 2 | 5 | 3 | 4 | 5 | 5 | Rejected |
| 8   | "Show all" toggle that expands the inline list | 3 | 5 | 4 | 5 | 5 | 5 | Out: no filter, issue asks for one |
| 9   | Separate full-screen route for picking categories | 2 | 2 | 2 | 3 | 4 | 3 | Rejected |
| 10  | Headless UI / Radix dialog dependency | 2 | 3 | 4 | 4 | 4 | 2 | Rejected |

<details><summary>Approach descriptions</summary>

1. `TaxonomyPicker` sorts with a module-level `Intl.Collator('he', { numeric: true })`. Every
   chip still renders; chips that are neither suggested nor selected (and their tag rows) get
   `max-sm:hidden`, and a dashed "more categories" chip gets `sm:hidden`. The button opens a new
   `CategoryDialog` built like `ReaderSheet` (backdrop, bottom sheet, `useExit`, `useEscape`).
2. Same sort; a new `ui/useMediaQuery.ts` reads `matchMedia('(max-width: 639px)')` and the picker
   renders either the full list or the mobile list + button.
3. Same as 1, but the dialog is a `<dialog>` element opened with `showModal()` for built-in
   focus trap and Escape.
4. Change `listCategories`/`listTags` to `order by c.name collate "he-IL-x-icu"`.
5. Hoist a `compareNames` to shared; the API sorts after the query, the web sorts again.
6. A filter input above the chips narrows the inline list; no dialog.
7. On mobile, a native multi-select shows the OS picker.
8. Mobile shows suggestions plus a "show all" link that reveals the full chip list.
9. A `/notes/:id/categories` screen with the list, navigated to and back.
10. Add a dialog library for focus management and the sheet.
</details>

### Chosen: client collator + CSS breakpoint classes + sheet dialog

Sorting where the list is drawn means one comparator covers chips, tag rows and the "add to"
select, and it applies to Claude's new names too, which never come from SQL. Hiding with
`max-sm:hidden` keeps one render path: no resize listener, no flash on first paint, desktop markup
identical to today plus one hidden button. The dialog reuses the overlay kit the existing sheets
use (`.backdrop`, `.enter-sheet`, `useExit`, `useEscape`), so it looks and closes like the link
reader. Its confirm calls the picker's `onChange` once, which flows through `changePicked`, so
#113's importance raise fires for categories added in the dialog. Stress test: walked "draft, Claude
suggests עבודה; user opens dialog, types 'בי', checks בית, unchecks עבודה, confirms" → one
`onChange` with `categoryIds: [בית]`, עבודה's tags dropped → בית chip now visible inline (selected),
עבודה chip still visible inline (suggested, unselected) → importance raised if בית is important.

### Why not the others

- **`useMediaQuery` hook** — a new file plus a jsdom `matchMedia` stub, and a first render at the wrong width; CSS already knows the width.
- **Native `<dialog>`** — jsdom has no `showModal`, so every test needs a polyfill; and no other overlay in the app uses it, so it would look and animate differently.
- **SQL collation** — depends on ICU being present in the production Postgres, and does not sort Claude's new names, which the picker mixes in.
- **Shared comparator** — the API has no consumer that needs the order; one caller does not earn a shared export (it moves there when a second screen needs it).
- **Inline search** — the issue asks for a dialog; a search box above the chips also pushes the form down instead of keeping it short.
- **Native multi-select** — no filter on Android, no way to show which ones Claude suggested, and it ignores RTL styling.
- **"Show all" toggle** — brings back the long list with no filter.
- **Full-screen route** — routing for a transient pick; loses unsaved form state unless lifted.
- **Dialog library** — a dependency for one sheet that the existing hooks already handle.

### What would change the choice

- A second screen (filters, taxonomy) needing the same order → move the collator to `@notes/shared`.
- The user wanting the dialog on desktop too → drop the breakpoint classes, keep the dialog.

### Architecture scan (scoped to `features/notes` picker + editor)

`improve-codebase-architecture` is not installed in this environment; the scan below follows its
Explore step by hand. No `Strong` candidates. Noted, not folded in: `TaxonomyPicker.tsx` is 208
lines mixing selection rules and the "create new" row (`Worth exploring` — the dialog lives in its
own file instead of growing it further).

## Design

### Visual direction (frontend-design)

Stay inside the app's existing system: notes are paper slips on a cool desk, Claude's suggestions
wear highlighter yellow (`--marker`). No new colours or fonts — IBM Plex Sans Hebrew, the
existing tokens.

- **The one memorable thing:** the "more" control is a chip-shaped empty slot at the end of the
  chip row — dashed `--line-strong` border, `plus` icon, label "קטגוריות נוספות". It reads as
  "there's room for another category here", not as a generic button. Tap → the sheet.
- **Sheet** (`ReaderSheet` shape): bottom sheet, `rounded-t-[20px]`, `max-h-[85dvh]`. Header row:
  title "בחירת קטגוריות", close icon button. A search field (`field`, `search` icon at
  inline-start, placeholder "חיפוש קטגוריה"), sticky under the header. The list scrolls
  (`overscroll-contain`). Footer sticks to the bottom with safe-area padding: primary "אישור",
  ghost "ביטול".
- **Rows:** full-width `<label>` rows, min height 44 px, `.check` checkbox at inline-start, name,
  hairline `--line` between rows. Categories Claude suggested carry the existing `marker` pill
  with the `spark` icon ("הוצע"), so the user still sees what was suggested after scrolling.
  Checked rows keep their alphabetical place (no jumping).
- **Empty filter:** "אין קטגוריה בשם הזה. אפשר ליצור אותה בטופס." — points at the existing create
  row instead of apologising.
- **Motion:** only the sheet's existing enter/exit. Nothing on rows. Reduced motion already
  handled by `.enter-sheet`.
- **Focus:** no autofocus on the search field (the keyboard would cover half the list); the
  dialog root gets `tabIndex={-1}` and focus on open, Escape and backdrop tap cancel, focus
  returns to the "more" chip on close.

### Web

- `features/notes/TaxonomyPicker.tsx`
  - `const byName = new Intl.Collator('he', { numeric: true }).compare` at module level.
    `usable` sorted by name; each category's tags sorted the same way; `offered` (Claude's new
    names) sorted and kept after the existing ones.
  - `Picked` gains `suggestedCategoryIds?: string[]` — same shape and reason as
    `offeredCategories` (UI-only, set by `pickedFrom`, ignored by the API's `NoteEdit` parse).
  - Local `pinned` state: ids confirmed in the dialog, so a dialog pick stays visible inline even
    after the user un-taps its chip.
  - `inline(id) = suggested ∪ selected ∪ pinned`. A category chip or tag row not `inline` gets
    `max-sm:hidden`. Offered new chips are suggestions, always inline. The "add to" select keeps
    every category (it is a form control, not the long list).
  - The dashed "more" chip (`sm:hidden`) opens `CategoryDialog`; `onConfirm(ids)` → one
    `onChange` with `categoryIds: ids` and the tags of removed categories dropped (same rule as
    `toggleCategory`, reused through a small local helper so both paths share it); `pinned`
    gains the newly added ids.
- `features/notes/picked.ts`: `pickedFrom` sets `suggestedCategoryIds: s.categoryIds`.
- `features/notes/CategoryDialog.tsx` (new): props `categories` (already sorted, usable only),
  `selected`, `suggested`, `onConfirm(ids)`, `onClose`. Local state: draft selection (starts as
  `selected`), filter text. Filter = trimmed, `toLocaleLowerCase` substring match on name.
  Confirm → `onConfirm(draft)` then exit; cancel/Escape/backdrop → exit without change.
- `locales/he.json` + `en.json` (`notes.picker`): `more`, `dialogTitle`, `filter`, `confirm`,
  `cancel` (reuse `notes.cancel` if identical), `noMatch`, `suggested`.

No change to `NoteEditor.tsx`: `changePicked` already handles a multi-category change.

**Safety:** no new boundary (taxonomy is already parsed in `lib/api.ts`). `suggestedCategoryIds`
may hold an id that is now deleted — `inline()` only tests membership, so it is harmless.
Dialog confirms with ids drawn from `categories`, never free text.

**Logs:** none. Web-only; no API route, domain function or port changes.

### Docs

`docs/plan.md` § web editor line (`TaxonomyPicker` …): categories alphabetical; on small screens
suggested + selected inline, the rest through the category dialog.

## Files

| File | Change | Why |
|---|---|---|
| `apps/web/src/features/notes/TaxonomyPicker.tsx` (+ test) | edit | sort, mobile visibility, open dialog |
| `apps/web/src/features/notes/picked.ts` | edit | carry Claude's suggested ids |
| `apps/web/src/features/notes/CategoryDialog.tsx` (+ test) | new | filter + checkbox sheet; own state and overlay, too much for the picker |
| `apps/web/src/locales/he.json`, `en.json` | edit | strings |
| `docs/plan.md` | edit | editor description |

## Tickets

1. **Alphabetical categories in the note editor** — blocked by: none. `byName` collator in
   `TaxonomyPicker`; sort categories, their tags, and Claude's new names (after existing ones);
   the "add to" select follows. `docs/plan.md` line. Logs: none. Acceptance: RTL test — taxonomy
   given as `['תל אביב', 'Zoo', 'אוכל', 'בית']` renders chips in order אוכל, בית, תל אביב, Zoo;
   tags inside a category sorted; new names sorted after existing. Browser check: editor in he RTL
   at 390 px and desktop shows the sorted list.
2. **Mobile: suggested categories inline, the rest in a dialog** — blocked by: 1.
   `suggestedCategoryIds` in `Picked`/`pickedFrom`; `max-sm:hidden` on non-inline chips and tag
   rows; dashed "more" chip; new `CategoryDialog`; strings; `docs/plan.md`. Logs: none.
   Acceptance: RTL tests — non-suggested, unselected chips carry `max-sm:hidden`, suggested and
   selected do not; tag rows follow the same rule; the "more" chip opens the dialog; filter
   narrows rows (and shows the empty message); checking two and unchecking one then confirming
   calls `onChange` once with the right `categoryIds` and the removed one's tags dropped; cancel
   and Escape leave `value` unchanged; a dialog pick stays inline after its chip is un-tapped;
   NoteEditor test — adding an important category through the dialog raises importance (#113
   path). Browser check (he RTL, 390 px, light and dark): only suggestions + "more" inline; sheet
   filters, multi-selects, confirms; desktop at 1280 px shows the full sorted list and no "more"
   chip.

## Verification

- `pnpm lint && pnpm typecheck && pnpm test`.
- e2e agent, he RTL: at 390 px create a note with the fake AI suggesting one category → only that
  chip and "קטגוריות נוספות" inline; open sheet, type part of a name, check two, confirm → both
  inline and selected; save → card shows them. At 1280 px the same draft shows every category,
  alphabetical, no "more" chip.
