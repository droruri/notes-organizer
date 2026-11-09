# apps/web — frontend

Vite + React 19 + TS PWA. Tailwind 4, i18next, React Query, React Router. Shared repo rules are in
the root `CLAUDE.md`; the design is in `docs/plan.md` (`apps/web/src/`, `Web behaviour`,
`Offline`, `Android` sections).

## Commands

```sh
pnpm --filter @notes/web dev        # web only (pnpm dev at the root starts supabase + api + web)
pnpm --filter @notes/web test       # Vitest + React Testing Library
pnpm --filter @notes/web typecheck  # tsc for src and e2e
pnpm --filter @notes/web e2e        # Playwright (prefer the e2e agent, see below)
```

## Layout

- `src/lib/api.ts` — the **single** typed API client (JWT, get/post/patch/delete/upload). Every
  request to the API goes through it, and every response is parsed against its `@notes/shared`
  schema there. Errors surface as `ApiRequestError` with a `code`.
- `src/lib/supabase.ts` — auth only. Never used for data.
- `src/lib/i18n.ts` — i18next, `he` (default) + `en`; sets `<html lang dir>`. Strings in
  `src/locales/he.json` and `en.json`.
- `src/lib/queryPersist.ts` — React Query cache persisted to IndexedDB (7 days), parsed against the
  shared schemas on restore, cleared on sign-out.
- `src/api/<subject>.queries.ts` — React Query hooks, re-exported from `src/api/index.ts`.
- `src/features/<feature>/` — feature components and their pure helpers (e.g.
  `features/notes/checklist.ts`).
- `src/ui/` — shared primitives (`Sheet`, `Toast`, `Segmented`, `NavBar`, `Icon`) and hooks
  (`useBackClose`, `useEscape`, `useIsWide`, `viewTransition`, …). Reuse these before writing a
  new one.
- `public/push-sw.js` — push and `notificationclick` handlers, imported by the Workbox service
  worker.
- `e2e/*.e2e.ts` — Playwright specs; shared helpers in `e2e/helpers.ts`.

## API calls and hooks

- Every new endpoint is declared as a React Query hook in `src/api/<subject>.queries.ts` (query
  or mutation, with the subject's key factory, e.g. `workspacesKeys.all`). No API call lives
  outside `src/api/`.
- Components import hooks from `src/api`. They never call `api.*` or `useQuery`/`useMutation`
  directly.
- New endpoint = fetcher in `lib/api.ts` + hook in its subject file. New subject = new file + a
  line in `src/api/index.ts`.
- Mutations own their cache effects (`invalidateQueries` / `setQueryData`), including other
  subjects they affect (e.g. deleting a workspace also invalidates `notesKeys.all`).

## UI

- UI text is Hebrew, RTL. Every string comes from `locales/he.json` / `en.json` via `t()`; add
  both keys.
- All styling is Tailwind 4 utility classes in `className`. No new CSS files, no new hand-written
  rules in `src/styles.css`, no `style={{…}}` except for values computed at runtime. Colors and
  sizes come from the `@theme` tokens in `src/styles.css`.
- Logical utilities (`ms-*`, `ps-*`, `text-start`) so RTL and LTR both work. No `ml-*` / `pl-*` /
  `text-left`.
- Every container pads its content (`p-*` / `px-*` `py-*`): content never touches a container's
  edge.
- Every design plans two layouts, mobile (from 360 px) and desktop (`lg:` and up), and says how
  each one looks — e.g. bottom sheet on mobile, side panel on desktop. Not one layout that only
  stretches.
- Light and dark mode.
- Never define a component inside another component. A nested component is a new type on every
  render, so React unmounts and remounts it (losing state and focus). Define it at module level
  and pass props.
- Before writing UI components, load the UI skills: `ui-ux-pro-max:ui-ux-pro-max` (modern
  design), `vercel-react-best-practices` (React best practices), `frontend-design`, `ui-skills`,
  `improve-animations`, `improve-react` and `better-ui`.
- Offline: writes go to the outbox (`features/offline/`), parsed with Zod on read. Editing stays
  disabled while offline.

## Tests

- Vitest, imported from `vite-plus/test`. Components through React Testing Library.
- Tests sit next to the code: `Foo.tsx` → `Foo.test.tsx`.
- Tests spy on `api` (`vi.spyOn(api, 'editWorkspace').mockResolvedValue(…)`), never on fetch.
  Hook tests wrap in a fresh `QueryClientProvider` (see `src/api/workspaces.queries.test.tsx`).
- UI changes aren't done until checked in a browser by the `e2e` agent
  (`.claude/agents/e2e.md`; it runs `scripts/e2e-setup.sh` first). Hand it the criteria; it
  returns `pass|fail` lines, screenshot paths and `E2E_RESULT`. E2E runs with `AI_FAKE=1` and a
  seeded user.
