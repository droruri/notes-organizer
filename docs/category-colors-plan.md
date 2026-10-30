# Category colors plan (issue #89)

<!-- On approval this file is saved as docs/category-colors-plan.md, next to category-colors-plan.simple.md.
     Ralph reads the sections a ticket names. -->

## Context

Issue [#89](https://github.com/droruri/notes-organizer/issues/89): every category gets a color,
shown in the notes list, changeable by the user and by the chat ("make work and home blue"),
readable in light and dark mode.

Today `categories` has no color. Category pills (`.cat-pill`, neutral) appear **only when a note
card is expanded** (`NoteCardDetails.tsx`); the collapsed card shows status and due date only.
Chat proposes taxonomy changes as approval cards (`propose_change` → `AgentAction` →
`POST /taxonomy/actions`), one card per change, with an existing "approve all" button.

**Decided with the user:**

| Question | Decision |
|---|---|
| Where colors show in the list | Category pills move to the always-visible row of the collapsed card (next to status and due date), colored. Tags stay in the expanded details. |
| Default color | Saved, not derived. A new category gets the palette color fewest of the user's active categories use (ties → palette order). A migration gives existing categories colors by creation order. |

**Derived decisions:** colors come from a fixed palette of 8 named keys (not free hex), so
contrast is checked once per key per theme. The palette leaves out yellow: highlighter yellow
(`--marker`) stays reserved for Claude's suggestions.

## Approaches considered

**Problem:** store, show and edit a per-category color, by UI and by chat, with guaranteed
contrast. **Constraints:** additive migration, RLS on / no policies; logic in domain/shared, routes
thin; every boundary Zod-parsed; chat never writes by itself (cards); no LLM in tests; Hebrew RTL;
light + dark via `prefers-color-scheme`; logging per `docs/logging.md`.

| #   | Approach | Fit | Footprint | Risk | Tests | Reversible | Cost | Verdict |
| --- | -------- | --- | --------- | ---- | ----- | ---------- | ---- | ------- |
| 1   | Enum column, least-used on insert, CSS `data-color` tokens, one `recolor` card per category | 5 | 4 | 4 | 5 | 5 | 5 | Chosen |
| 2   | Same, but one chat card recolors many ids | 4 | 4 | 3 | 4 | 5 | 5 | Top 3 |
| 3   | Same, but palette as a TS map applied with inline CSS variables | 3 | 4 | 4 | 5 | 5 | 4 | Top 3 |
| 4   | Nullable column, default derived from id hash in the web | 4 | 5 | 3 | 4 | 5 | 5 | Rejected (user) |
| 5   | Neutral gray until the user picks | 4 | 5 | 5 | 5 | 5 | 5 | Rejected (user) |
| 6   | Free hex column + `<input type="color">`, text color computed | 2 | 3 | 2 | 3 | 4 | 4 | Out: contrast in both themes can't be guaranteed |
| 7   | Colors in a `user_settings` JSON map | 2 | 4 | 3 | 4 | 4 | 4 | Rejected |
| 8   | Postgres trigger picks the color on insert | 2 | 4 | 3 | 2 | 3 | 4 | Rejected |
| 9   | Chat tool writes the color directly, no card | 2 | 5 | 2 | 4 | 5 | 5 | Out: chat must not change anything without approval |
| 10  | Generic category "appearance" JSON (color, icon, …) | 2 | 3 | 3 | 3 | 4 | 3 | Rejected |

<details><summary>Approach descriptions</summary>

1. Postgres enum `category_color` (8 keys, same order as shared `CategoryColor`), column
   `not null default 'slate'`, backfilled by creation order. `repo.insertCategory` picks the
   least-used key in SQL, given the key list from shared. Web styles pills with
   `data-color="<key>"`; tokens live in `styles.css` next to the other theme tokens. Chat gets a
   `recolor` action; two categories → two cards → existing "approve all".
2. As 1, but `AgentAction` `recolor` carries `ids[]` and `names[]`; one card applies all.
3. As 1, but hex pairs live in a TS module and each pill sets `--cat-ink-light/-dark` inline.
4. `color` nullable; web hashes the id onto the palette when null.
5. `color` nullable; null renders neutral.
6. User picks any hex; the web computes black/white text.
7. `categoryId → color` in `user_settings`.
8. Trigger on `categories` insert sets the least-used color.
9. A `set_color` tool that writes immediately.
10. A JSON column for several display settings.
</details>

### Chosen: enum column, least-used on insert, CSS tokens, one `recolor` card per category

`repo.insertCategory` is the only place a category is inserted (create route, chat create, import
confirm all call it), so one SQL change covers every path. A fixed enum keeps contrast a property
of eight token pairs that one test checks, and keeps the chat's choices closed (`z.enum` in the
tool schema). Per-category cards reuse `ActionGroup` unchanged: "make work and home blue" walks
as `propose_change(recolor, work, blue)` + `propose_change(recolor, home, blue)` → two cards →
"לאשר הכול (2)" → `POST /taxonomy/actions` → two `setCategoryColor` calls → taxonomy refetch →
pills repaint. Stress test also checked: `applyActions`' `run()` narrows on `a.action`, so a new
union member is one more branch; `ActionCard` builds its title from `chat.action.<action>.<kind>`,
so one locale key + a `color` param covers it.

### Why not the others

- **One card, many ids** — new card shape, new result shape (one result for N writes), and a
  partial failure can't be shown per category; "approve all" already gives one tap.
- **TS palette + inline vars** — every consumer must spread a style object, and theme colors would
  live outside `styles.css`, where every other token is.
- **Hash-derived default** — user chose saved, distinct colors; hashing collides often with 8 keys.
- **Neutral default** — user chose colorful defaults.
- **Free hex** — no way to promise readable contrast on both themes.
- **`user_settings` map** — splits category data over two tables; deleted categories leak.
- **Trigger** — domain rule hidden in SQL; the shared key order would be duplicated in the trigger.
- **Direct write** — breaks the chat's "propose, user approves" contract.
- **Generic appearance JSON** — speculative; the issue asks for color only.

### What would change the choice

- If users ask for colors beyond the palette, approach 6 with a contrast-adjusting step comes back.

### Architecture scan (improve-codebase-architecture, scoped to taxonomy, chat actions, note card)

No `Strong` candidates. Noted, not folded in: `routes/taxonomy.ts` `parse(…, withName)` boolean
flag (`Worth exploring`; the new route parses its own body like the importance route does).

## Design

### Data (migration `pnpm db:new category_color`)

```sql
create type public.category_color as enum
  ('blue', 'green', 'purple', 'amber', 'teal', 'pink', 'red', 'slate');
-- Default keeps old API code (during deploy) able to insert.
alter table public.categories add column color public.category_color not null default 'slate';
-- Existing categories: distinct colors per user by creation order.
update public.categories c
   set color = (enum_range(null::public.category_color))[((r.n - 1) % 8) + 1]
  from (select id, row_number() over (partition by user_id order by created_at, id) as n
          from public.categories) r
 where r.id = c.id;
```

Additive; RLS already on, no policies.

### Shared (`packages/shared`)

- `notes.ts` (next to `Importance`, which `AgentAction` there also needs):
  `CategoryColor = z.enum(['blue','green','purple','amber','teal','pink','red','slate'])` — same
  order as the SQL enum; this order is the least-used tie-break.
- `AgentAction` gains `z.object({ action: z.literal('recolor'), kind: z.literal('category'),
  id: z.uuid(), name: z.string(), color: CategoryColor })`.
- `index.ts`: `Category` gains `color: CategoryColor`. New `ColorBody = z.object({ color:
  CategoryColor })`.

### API

- `domain/taxonomy/repository.ts`: `CATEGORY_COLS` / `CATEGORY_RETURNING` add `color`.
  `insertCategory` sets color in the same statement:
  ```sql
  insert into categories (user_id, name, color) values ($1, $2, (
    select p.color from unnest($3::public.category_color[]) with ordinality p(color, ord)
    left join categories c on c.user_id = $1 and c.deleted_at is null and c.color = p.color
    group by p.color, p.ord order by count(c.id), p.ord limit 1))
  ```
  with `$3 = CategoryColor.options`. New `updateCategoryColor(db, id, color)`.
- `domain/taxonomy/service.ts`: `setCategoryColor(db, userId, id, color)` → `Result<Category>`,
  copy of `setCategoryImportance` (allowed on deleted categories; `not_found` for missing / other
  user's).
- `routes/taxonomy.ts`: `PUT /categories/:id/color` body `ColorBody` → `200 Category` ·
  `400 invalid_body` · `404 not_found`.
- `domain/taxonomy/actions.ts` `run()`: `recolor` → `service.setCategoryColor`.
- `domain/chat/agent.ts`:
  - `ProposeInput.action` adds `'recolor'`; new `color: CategoryColor.optional()`.
  - `proposeChange` recolor branch: kind must be `category` (`{error:'invalid_kind'}`), category
    found (`not_found`), not deleted (`category_deleted`), `color` given (`invalid_color`), not
    already that color (`unchanged`) → `{action:'recolor', kind:'category', id, name, color}`.
  - `listTaxonomy` includes each category's `color` (so "make home the same color as work" works).
  - Tool description + system prompt: "To change a category's color call propose_change with
    action recolor and one of: blue, green, purple, amber, teal, pink, red, slate — one call per
    category."

**Logs (per `docs/logging.md`):** `setCategoryColor` wrapped in
`timed('setCategoryColor', { categoryId })`; `info { categoryId, color } 'category color set'`;
`warn { categoryId, error: 'not_found' } 'category color failed'`. Chat-applied recolors also go
through `applyActions`' existing `actions applied` / `action rejected` lines. `insertCategory`
adds no log (repo function inside already-logged callers).

### Web — visual design

Direction: the app is "paper slips on a cool desk". A category becomes a colored **index tab** on
the slip: tinted pill, ink-colored text, and a solid 3 px ink edge on the inline-start side with
squared start corners (`border-start-start-radius` / `border-end-start-radius: 3px`), so it reads
as a tab in RTL and LTR alike. That edge is the one bold element; tags stay neutral `#` boxes,
status keeps its dot. No motion added.

Palette (starting values; the contrast test is the gate, tune hexes until it passes):

| key | light tint / ink | dark tint / ink | he |
|---|---|---|---|
| blue | `#e4ecfb` / `#1f4fa3` | `#1b2c4a` / `#a3c3ff` | כחול |
| green | `#e3f1e1` / `#2b6a30` | `#173320` / `#98d49d` | ירוק |
| purple | `#ece6f8` / `#5a3a9f` | `#2a2142` / `#c6b0f5` | סגול |
| amber | `#f9e9d6` / `#874709` | `#3a2812` / `#f0b870` | כתום |
| teal | `#dcf0ed` / `#0f6a61` | `#12342f` / `#82d6ca` | טורקיז |
| pink | `#fae4ef` / `#9a2362` | `#3b1a2b` / `#f3a5ca` | ורוד |
| red | `#fbe4e1` / `#a1271d` | `#3d1c1a` / `#f5a69d` | אדום |
| slate | `#e7ebed` / `#43535a` | `#24323a` / `#b8c6cd` | אפור |

- `styles.css`: `--cat-<key>-tint` / `--cat-<key>-ink` in `:root` and in the dark `@media`
  block (existing token pattern). `.cat-pill[data-color='<key>'] { --cat-tint: …; --cat-ink: … }`
  and `.cat-pill` uses `background: var(--cat-tint, var(--surface)); color: var(--cat-ink,
  var(--fg)); border-inline-start: 3px solid var(--cat-ink, var(--line-strong))`. An unknown or
  missing key falls back to today's neutral pill — no crash, no invisible text.
- `.swatch` for the picker: 36 px button, 24 px circle filled with the tint, 2 px ink ring;
  `aria-checked='true'` adds a 2 px `--fg` outer ring (offset 2 px); visible `:focus-visible`;
  press `scale(0.96)` under `prefers-reduced-motion: no-preference` (same as `.segment`).

### Web — code

- `lib/api.ts`: `setCategoryColor(id, color)` parsed against `Category`.
- `features/notes/NoteCard.tsx`: the always-visible meta row renders the note's categories as
  `<span className="cat-pill" data-color={c.color}>` after the due date (deleted → line-through
  + opacity, as now). Same filter as today (`taxonomy.categories.filter(c =>
  note.categoryIds.includes(c.id))`), moved here.
- `features/notes/NoteCardDetails.tsx`: chips list keeps tags only (categories moved, not
  duplicated); drop the `category` flag from its local `Chip` type.
- `features/taxonomy/ColorControl.tsx` (new, sibling of `ImportanceControl`): `role="radiogroup"`
  labelled "צבע של {name}", 8 `role="radio"` swatch buttons, each `aria-label` = Hebrew color
  name; one tap sets. Rendered under each active category next to `ImportanceControl`, through
  the existing `write()` mutation (errors + taxonomy refresh for free). Deleted categories: no
  control.
- `features/chat/ActionCard.tsx`: title param `color: t('taxonomy.colors.<key>')` for recolor;
  a small `.cat-pill` preview of `name` in the new color under the title.
- `locales/he.json` + `en.json`: `taxonomy.colors.<key>` (8), `taxonomy.color.labelFor`,
  `chat.action.recolor.category` ("לצבוע את הקטגוריה \"{{name}}\" ב{{color}}"), `chat.action`
  error for `category_deleted` already exists.

### Docs

`docs/plan.md`: schema (`categories.color`), API table row, Rules row "Category color", the
TaxonomyScreen line, chat actions list. Also docs on chat proposals if listed there.

## Files

| File | Change | Why |
|---|---|---|
| `supabase/migrations/<ts>_category_color.sql` | new | enum, column, backfill |
| `packages/shared/src/notes.ts` | edit | `CategoryColor`, `recolor` action |
| `packages/shared/src/index.ts` | edit | `Category.color`, `ColorBody` |
| `apps/api/src/domain/taxonomy/repository.ts` | edit | read/write color, least-used insert |
| `apps/api/src/domain/taxonomy/service.ts` | edit | `setCategoryColor` + logs |
| `apps/api/src/routes/taxonomy.ts` (+ test) | edit | PUT route |
| `apps/api/src/domain/taxonomy/actions.ts` (+ test) | edit | apply `recolor` |
| `apps/api/src/domain/chat/agent.ts` (+ test) | edit | propose `recolor`, prompt, color in list |
| `apps/web/src/styles.css` | edit | palette tokens, colored `.cat-pill`, `.swatch` |
| `apps/web/src/categoryColors.test.ts` | new | WCAG contrast gate for every key, both themes |
| `apps/web/src/lib/api.ts` | edit | client call |
| `apps/web/src/features/notes/NoteCard.tsx` (+ test) | edit | colored pills on collapsed card |
| `apps/web/src/features/notes/NoteCardDetails.tsx` | edit | tags only |
| `apps/web/src/features/taxonomy/ColorControl.tsx` | new | swatch radio group |
| `apps/web/src/features/taxonomy/TaxonomyScreen.tsx` (+ test) | edit | mount control |
| `apps/web/src/features/chat/ActionCard.tsx` (+ ActionGroup test) | edit | recolor card |
| `apps/web/src/locales/he.json`, `en.json` | edit | strings |
| `docs/plan.md` | edit | contract |
| Test fixtures building `Category`/`Taxonomy` | edit | new required `color` |

## druri-plan checks

- **Reuse:** `setCategoryColor` mirrors `setCategoryImportance`; route mirrors the importance
  route; `ColorControl` mirrors `ImportanceControl`; chat reuses `propose_change` + `ActionGroup`
  "approve all"; pill reuses `.cat-pill`.
- **No duplication:** palette key list exists once (`CategoryColor`); SQL enum order matches it
  and the insert query receives the list as a parameter. Hexes exist only in `styles.css`; the
  contrast test reads them from there. Category pills move from details to card, not copied.
- **Abstraction budget:** one new component (`ColorControl`, used per category row), one new
  test file. No new hooks, layers or helpers.
- **Safety:** every boundary Zod-parsed — `ColorBody` on the route, `CategoryColor` in the chat
  tool input and `AgentAction`, `Category` on web responses. Unknown `data-color` → CSS fallback
  to neutral. Insert subquery always returns a row (8 palette rows, left join).
- **Placement:** least-used rule in the repository's insert (data), not in routes; proposal
  validation in `agent.ts` with the other proposals; colors in `styles.css` with other tokens.

## Tickets

1. **Categories have colors, shown on collapsed note cards** — blocked by: none. Migration;
   shared `CategoryColor` + `Category.color`; repo cols + least-used insert; `styles.css` tokens +
   colored `.cat-pill`; `categoryColors.test.ts`; NoteCard / NoteCardDetails move; fixtures;
   `docs/plan.md` schema + rule. Logs: none added (no new entry function). Acceptance: route test —
   three new categories get three different colors, a deleted one frees its color, `GET /taxonomy`
   returns `color`; contrast test passes (ink on tint ≥ 4.5:1, ink edge on `--surface` ≥ 3:1, both
   themes, all 8 keys found); RTL test — collapsed card shows category pill with `data-color`, tags
   only when expanded; browser check (he RTL, 390 px + desktop, light + dark).
2. **User changes a category's color** — blocked by: 1. `ColorBody`, `setCategoryColor`
   service + `PUT /categories/:id/color`, api client, `ColorControl` in TaxonomyScreen, strings,
   `.swatch`, `docs/plan.md` API row. Logs: `category color set` (info), `category color failed`
   (warn) inside `timed('setCategoryColor')`. Acceptance: route tests (set, 404 other user, 400
   bad color, deleted allowed); captured-log test (`captureLogs` from `src/test-logs.ts`) for
   both lines; RTL test — tapping a swatch calls the API and marks it checked; browser check.
3. **Chat recolors several categories in one request** — blocked by: 2. `recolor` in
   `AgentAction`, `proposeChange` branch, prompt + tool description, `listTaxonomy` color,
   `actions.ts` branch, ActionCard title + preview, strings, `docs/plan.md` chat section. Logs:
   none new (`applyActions` already logs per action). Acceptance: agent tests for every
   `proposeChange` recolor outcome; `applyActions` test applying two recolors (results +
   `actions applied` captured); ActionGroup RTL — two recolor cards, "approve all" sends both;
   E2E with the fake AI scripted to propose work + home → blue, approve all, both pills blue.

## Verification

- `pnpm db:reset`, then with `DATABASE_URL` set: `pnpm lint && pnpm typecheck && pnpm test`.
- Migration on existing data: before `db:reset`, seed 3 categories, apply, check distinct colors.
- `e2e` agent (he RTL, 390 px + desktop, light + dark): collapsed cards show colored category
  tabs; change עבודה to סגול on the categories screen → list repaints; chat "תצבע את עבודה ובית
  בכחול" (fake AI) → two cards → approve all → both blue; text readable in both themes.
