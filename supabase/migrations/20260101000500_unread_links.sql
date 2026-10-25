-- Links in a note's body that Claude could not read (link-previews ticket).
alter table public.notes add column unread_links text[] not null default '{}';
