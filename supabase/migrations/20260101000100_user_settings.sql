-- Per-user settings (the saved note sort). The API is the only reader; RLS on, no policies.
create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  note_sort text not null default 'urgency'
    check (note_sort in ('urgency', 'due_date', 'newest', 'oldest'))
);

alter table public.user_settings enable row level security;
