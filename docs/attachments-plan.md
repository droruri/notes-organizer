# Attachments plan (issue #86)

<!-- Ralph reads the sections a ticket names ("see docs/attachments-plan.md → API"). One topic per
     `##` heading. Plain-language companion: attachments-plan.simple.md. -->

**Goal:** a user can add files and images to any note, see them on the note (images as
thumbnails, other files as a named link), open or download them, and remove them. Only the note's
owner can reach them. Size and type limits are checked on the server.

Domain term: **Attachment** (see `GLOSSARY.md`). A note's voice recording stays its **audio**; it
is not an attachment.

## Approaches considered

**Problem:** store per-note files and images for fewer than 10 users on free tiers, owner-only,
with server-side limits. **Constraints:** the API is the only reader (RLS on, no policies);
migrations additive; routes thin, domain logic in `domain/<area>/`; every boundary parsed; no new
paid service; Hebrew RTL UI; ADR 0003 already put audio in Postgres for the same users and hosts;
Render free has 512 MB RAM; Supabase free DB has 500 MB.

| #   | Approach                                                        | Fit | Footprint | Risk | Tests | Reversible | Cost | Verdict |
| --- | --------------------------------------------------------------- | --- | --------- | ---- | ----- | ---------- | ---- | ------- |
| 1   | `bytea` table, one file per request, image shrink in browser    | 5   | 4         | 4    | 5     | 4          | 4    | Chosen  |
| 2   | Supabase Storage bucket, API streams the bytes                  | 3   | 3         | 4    | 3     | 4          | 3    | Top 3   |
| 3   | Generalize `note_audio` into one `note_files` table             | 3   | 3         | 2    | 4     | 2          | 4    | Top 3   |
| 4   | Supabase Storage with signed URLs, browser uploads directly     | 2   | 3         | 3    | 2     | 4          | 3    | Out: owner check leaves the API |
| 5   | Files inside `POST /notes` and `PATCH /notes/:id` (one request) | 2   | 3         | 2    | 3     | 4          | 4    | —       |
| 6   | Base64 files in a `jsonb` column on `notes`                     | 1   | 5         | 2    | 4     | 3          | 1    | —       |
| 7   | Cloudinary / Cloudflare R2                                      | 2   | 2         | 4    | 2     | 4          | 2    | Out: new account and service |
| 8   | Server-side image resize with `sharp`                           | 3   | 3         | 3    | 4     | 5          | 2    | —       |
| 9   | Device-only files in IndexedDB                                  | 2   | 4         | 2    | 4     | 5          | 5    | Out: not on other devices |
| 10  | Links only: the user pastes a Drive/Dropbox URL into the body   | 5   | 5         | 5    | 5     | 5          | 5    | Out: fails the issue |

<details>
<summary>What each approach is</summary>

1. New `note_attachments` table (`bytea`), like `note_audio`. `POST /notes/:id/attachments` takes
   one file per request; the browser uploads a multi-select one file at a time and shrinks large
   photos first. A per-user quota keeps the database far from 500 MB.
2. Same API and table for metadata, but bytes go to a private Storage bucket through the API with
   the service-role key.
3. Rename `note_audio` to `note_files` with a `kind` (`voice` | `attachment`) and move audio rows.
4. API returns a signed upload URL; the browser uploads to Storage; reads use signed URLs.
5. Make `POST /notes` and `PATCH /notes/:id` multipart and carry files with the note fields.
6. `notes.attachments jsonb` holding base64 strings.
7. A third-party media host with its own key and SDK.
8. Accept full-size photos and resize on the API with `sharp`.
9. Keep attachments only on the device that added them.
10. No feature; tell users to link to files hosted elsewhere.

</details>

### Chosen: `bytea` table, one file per request, image shrink in browser

It copies a pattern that already works here: `note_audio` stores bytes in Postgres, the route
reads multipart with `@fastify/multipart`, the owner check is a join on `notes.user_id`, and the
web fetches bytes with the bearer token into an object URL (`AudioPlayer`). The stress test
confirmed the seams exist: `req.parts({ limits })` overrides the global 5 MB audio limit per
route, `findNote(…, lock = true)` serializes the count and quota check, and `NOTE_SELECT` can
aggregate attachment metadata the same way it aggregates tag ids. One file per request keeps
memory at 10 MB per upload on Render's 512 MB. Shrinking photos in the browser (a 4 MB phone photo
becomes about 400 KB) is what makes a 30 MB quota per user enough.

### Why not the others

- **Storage bucket, API streams** — adds the service-role key, a Storage client and a running
  Storage service in CI for no gain at fewer than 10 users; ADR 0003 already turned it down.
- **One `note_files` table** — moves live audio rows, needs a two-merge migration, and mixes the
  one-per-note, transcribed audio with free-form attachments.
- **Signed URLs** — bytes and the owner check bypass the API, which breaks "the API is the only
  reader".
- **Files inside create/edit** — makes the AI draft request and the JSON `PATCH` multipart, and
  one failed file fails the whole save.
- **Base64 in `jsonb`** — every `GET /notes` would carry every file.
- **Third-party host** — new account, key and setup-wizard step.
- **`sharp`** — native dependency and CPU on the free API host, and full-size photos still cross
  the network.
- **Device-only** — a note opened on another device shows nothing.
- **Links only** — does not meet any acceptance criterion.

### What would change the choice

- Total attachment bytes near 300 MB, or a user who needs more than the quota: move bytes to a
  Storage bucket behind the same routes (the API contract does not change).

## Limits

Constants in `packages/shared/src/attachments.ts`, used by the API (enforcement) and the web
(early messages):

| Limit                     | Value  | Server response |
| ------------------------- | ------ | --------------- |
| `MAX_ATTACHMENT_BYTES`    | 10 MB  | `413 attachment_too_large` |
| `MAX_ATTACHMENTS_PER_NOTE`| 20     | `422 too_many_attachments` |
| `ATTACHMENT_QUOTA_BYTES`  | 30 MB per user | `422 quota_exceeded` |
| `ATTACHMENT_MIMES`        | `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `application/pdf`, `text/plain`, `text/csv`, `.docx`, `.xlsx`, `.pptx` mime types | `415 unsupported_type` |
| File name                 | trimmed, 1–200 chars, no `/`, `\` or control characters (replaced with `_`) | `400 invalid_body` when empty |

No SVG, HTML or other type a browser runs as a page. The mime is the declared one, checked against
the list; responses carry `X-Content-Type-Options: nosniff`.

Images over 1 MB or wider/taller than 2048 px are shrunk in the browser before upload (longest
side 2048 px, JPEG quality 0.85). GIFs are sent as they are (animation). The server does not
resize.

## Database schema

One migration (`pnpm db:new note_attachments`):

```sql
-- Files and images a user added to a note (ADR 0004). Limits are enforced in the API.
create table public.note_attachments (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes (id) on delete cascade,
  name text not null check (length(name) between 1 and 200),
  mime text not null,
  size integer not null check (size > 0),
  data bytea not null,
  created_at timestamptz not null default now(),
  check (size = octet_length(data))
);
create index note_attachments_note_idx on public.note_attachments (note_id, created_at);

alter table public.note_attachments enable row level security;
```

- No `user_id`: the owner is the note's owner (one source of truth). Every query joins `notes`.
- A soft-deleted note keeps its attachments, so Undo restores them. A hard delete cascades.
- `docs/db-schema.md` gets the table and its relation `notes ||--o{ note_attachments`.

## API

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/notes/:id/attachments` | multipart, exactly one `file` part | `201 Attachment` · `404 not_found` · `400 invalid_body` · `413 attachment_too_large` · `415 unsupported_type` · `422 too_many_attachments` · `422 quota_exceeded` |
| GET | `/notes/:id/attachments/:attachmentId` | — | the bytes, stored mime, `nosniff` · `404 not_found` |
| DELETE | `/notes/:id/attachments/:attachmentId` | — | `204` · `404 not_found` |

- Any note status, drafts included (a new note is a stored draft by the time the review screen
  opens, so "add while creating" is "add during review").
- Another user's note or attachment, a soft-deleted note, or a malformed id → `404`.
- `Note` (shared) gains `attachments: Attachment[]`, where
  `Attachment = { id, name, mime, size, createdAt }`, ordered by `createdAt`. `GET /notes` returns
  it, so a card shows names without a second request. Bytes are never in `Note`.
- Upload is one transaction: lock the note row (`findNote(…, true)`), check count and quota, insert.
  Two parallel uploads cannot both pass the count check.

### Module layout

- `routes/upload.ts` (prefactor) — `readUpload(req, { field, limits })`, moved out of
  `routes/notes.ts` and generalized: returns `{ fields, file: { name, mime, data } | null }` or
  `'too_large' | 'too_many'`. Voice notes and attachments both call it.
- `routes/attachments.ts` — the three routes: parse params, call `readUpload`, delegate, map
  `Failure` to status. Registered in `server.ts` next to `notesRoutes`.
- `domain/attachments/attachment.ts` — pure rules: `checkUpload({ mime, size, count, usedBytes })`
  returns `ok` or a `Failure`; `cleanName(name)`. The only place the limits are read.
- `domain/attachments/repository.ts` — SQL: `insertAttachment`, `findAttachment` (joins `notes`
  on owner and `deleted_at is null`), `deleteAttachment`, `countAndUsage(noteId, userId)`.
- `domain/attachments/service.ts` — `addAttachment`, `getAttachment`, `removeAttachment`:
  transaction, rules, logging.
- `domain/notes/repository.ts` — `NOTE_SELECT` adds the `attachments` aggregate (metadata only).

## Logging

Per `docs/logging.md`. Never log file names (they can hold personal text) or bytes.

| Function | `timed()` | Outcome (`info`) | Warnings |
| --- | --- | --- | --- |
| `addAttachment` | `addAttachment` | `attachment added` `{ noteId, attachmentId, mime, bytes }` | `attachment rejected` `{ noteId, error }` for every `Failure` |
| `getAttachment` | `getAttachment` | `attachment served` `{ noteId, attachmentId, bytes }` | — (`404` is logged by `request rejected`) |
| `removeAttachment` | `removeAttachment` | `attachment removed` `{ noteId, attachmentId }` | — |

## Web

- `lib/api.ts` (prefactor) — `noteAudio` becomes a call to one private
  `fetchBlob(path, mimes)` (token, status check, mime check). Adds `uploadAttachment(noteId,
  file)` (FormData, parsed with `Attachment`), `attachmentFile(noteId, id)` (via `fetchBlob`),
  `deleteAttachment(noteId, id)`.
- `features/attachments/Attachments.tsx` — the list for one note. Props:
  `{ noteId, attachments, editable }`.
  - Image: a thumbnail (`<img>` from an object URL, React Query key `['attachment', id]`,
    `staleTime: Infinity`, same lifetime rule as `AudioPlayer`). Tap opens it full size in a new
    tab from the object URL.
  - Other file: an icon, the name and size; tap downloads it (`<a download={name}>` on the object
    URL).
  - `editable`: "Add file" (`<input type="file" multiple accept={ATTACHMENT_MIMES}>` — on phones
    this offers camera, gallery and files) and "Take photo" (`accept="image/*"
    capture="environment"`). Files upload one at a time with a spinner per row; each failure shows
    its own Hebrew message from the error code; the rest continue. Remove asks "Remove?" inline
    (second tap confirms), then deletes.
  - After each change it invalidates the `['notes']` query.
- `features/attachments/shrinkImage.ts` — `shrinkImage(file): Promise<File>` with
  `createImageBitmap` + canvas; returns the original when it is small, a GIF, or decoding fails.
  The size rule (`targetSize(width, height)`) is a pure function with a unit test.
- `NoteEditor` — new optional prop `attachable` (like `onReanalyze`, omit to hide). `NotesScreen`
  sets it for review and edit; import rows and outbox items are not stored notes, so they omit it.
  Renders `<Attachments editable>` under the audio player.
- `NoteCardDetails` — renders `<Attachments editable={false}>` when the note has any. Thumbnails
  load only when a card is expanded.
- Offline: names show from the cached `Note`; a thumbnail that fails to load shows the file icon.
  The outbox does not carry attachments.
- Strings in `locales/he.json` and `en.json` under `attachments.*`.

## Out of scope

- Attachments in the outbox, in import, or through the Android share target (shared images need a
  `POST` share target and a service worker handler — a follow-up).
- Claude reading attachments, search inside files, a "has attachments" filter.
- Moving voice audio into attachments.

## File list

Created:

- `supabase/migrations/<ts>_note_attachments.sql` — the table.
- `packages/shared/src/attachments.ts` — `Attachment` schema and limits, shared by web and API.
- `apps/api/src/routes/upload.ts` — the multipart reader, now used by two route files.
- `apps/api/src/routes/attachments.ts` + `.test.ts` — the three routes.
- `apps/api/src/domain/attachments/{attachment,repository,service}.ts` + `attachment.test.ts` —
  rules, SQL, orchestration (same split as every other area).
- `apps/web/src/features/attachments/Attachments.tsx` + `.test.tsx` — the UI.
- `apps/web/src/features/attachments/shrinkImage.ts` + `.test.ts` — photo shrink.
- `docs/adr/0004-attachments-in-postgres.md` — the storage decision.

Modified: `packages/shared/src/{notes,index}.ts`, `apps/api/src/routes/notes.ts`,
`apps/api/src/server.ts`, `apps/api/src/domain/notes/repository.ts`, `apps/web/src/lib/api.ts`,
`NoteEditor.tsx`, `NoteCardDetails.tsx`, `NotesScreen.tsx`, `ImportReview.tsx` and
`OutboxDialog.tsx` (the `attachments: []` field on the notes they build), `ui/Icon.tsx` (paperclip,
file, camera), locales, `docs/plan.md` (API contract row and scope), `docs/db-schema.md`, test
fixtures that build a `Note`.

## Safety

- Boundaries: multipart parts (field name, size, count via `req.parts({ limits })`), params
  (`z.uuid()`, a bad id → `404`), the declared mime (allowlist), the file name (`cleanName`), the
  `pg` row (`size` cast `::int`, `createdAt` `Date` → ISO), the API response on the web
  (`Attachment` schema; blob mime checked in `fetchBlob`).
- Unmatched cases: an unknown mime → `415`; a failed decode in `shrinkImage` → upload the
  original; a failed thumbnail → file icon.
- Persisted cache: notes cached before this change lack `attachments`, fail the `NoteList` parse
  in `queryPersist.ts`, are dropped, and are fetched again once. No migration of the cache.
- Races: the note row lock serializes uploads to one note. The per-user quota can be passed by
  two parallel uploads to two different notes by at most one file (10 MB); accepted.

## Tickets

1. **Prefactor: one multipart reader and one blob fetch** — blocked by: none.
   `readUpload` moves to `routes/upload.ts` with `{ field, limits }`; `api.ts` gets private
   `fetchBlob` and `noteAudio` uses it. No behavior change; voice note tests pass unchanged.
   Logs: none added.
2. **Attach a file to a note and open it** — blocked by 1.
   Migration, ADR 0004, shared `Attachment` and limits, `Note.attachments`, `POST` and `GET`
   routes with all limit errors, domain area, `Attachments` list with "Add file", file rows that
   download, shown in the editor (review and edit) and in expanded cards. Docs: `plan.md` API rows,
   `db-schema.md`. Logs: `attachment added`, `attachment rejected` (warn), `attachment served`;
   captured-log test for each, plus a test that a file name never reaches a log line. Tests:
   every limit, another user's note → `404`, soft-deleted note → `404`, parallel uploads at the
   per-note limit.
3. **Image thumbnails, camera button and photo shrink** — blocked by 2.
   Image rows render thumbnails and open full size; "Take photo" button; `shrinkImage` before
   upload; E2E: attach a PNG to a note, see its thumbnail on the card. Logs: none added (no new
   API function).
4. **Remove an attachment** — blocked by 2.
   `DELETE` route, inline "Remove?" confirm in the editor. Logs: `attachment removed`;
   captured-log test. Tests: another user's attachment → `404`, removed bytes are gone.
