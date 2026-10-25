-- Voice-note recording, one per note (ADR 0003). The 5 MB cap is enforced in the API.
create table public.note_audio (
  note_id uuid primary key references public.notes (id) on delete cascade,
  mime text not null,
  data bytea not null
);

alter table public.note_audio enable row level security;
