-- One row per reminder sent; the primary key is the claim that makes a send happen exactly once.
create table public.reminder_sends (
  note_id uuid not null references public.notes (id) on delete cascade,
  kind text not null check (kind in ('due', 'time', 'snooze')),
  -- The due date, snooze date or remind_at instant this send was for.
  slot text not null,
  sent_at timestamptz not null default now(),
  primary key (note_id, kind, slot)
);
alter table public.reminder_sends enable row level security;
