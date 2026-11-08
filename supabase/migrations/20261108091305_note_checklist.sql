alter table public.notes add column checklist jsonb not null default '[]';
