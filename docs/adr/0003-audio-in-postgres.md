# Voice-note audio stored as `bytea` in Postgres

Recordings live in a `note_audio` table (`bytea`, 5 MB cap) served by `GET /notes/:id/audio`,
not in Supabase Storage. At fewer than 10 users this avoids the storage service in CI, a service
key in the API and signed URLs, and keeps audio inside the same transactions and tests as notes.
Move to Storage if audio approaches the free database's 500 MB.
