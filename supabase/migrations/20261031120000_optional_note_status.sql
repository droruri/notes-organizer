-- A note may have no status (not something to do). The default stays 'draft'.
alter table public.notes alter column status drop not null;
