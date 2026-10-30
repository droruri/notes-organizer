# Note attachments stored as `bytea` in Postgres

Files added to a note live in a `note_attachments` table (`bytea`, 10 MB per file, 20 per note,
30 MB per user), served by `GET /notes/:id/attachments/:attachmentId`, not in Supabase Storage.
Same reasoning as ADR 0003: no storage service in CI, no service key or signed URLs, and the bytes
share transactions and tests with the note. The table has no `user_id`; the owner is the note's
owner, so every query joins `notes`. A soft-deleted note keeps its attachments so Undo restores
them; a hard delete cascades. Move to Storage if attachments approach the free database's 500 MB.
