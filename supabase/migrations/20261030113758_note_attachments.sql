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
