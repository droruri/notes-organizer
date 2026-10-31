create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index workspaces_name_key on public.workspaces (user_id, lower(name));
create unique index workspaces_one_default on public.workspaces (user_id) where is_default;
alter table public.workspaces enable row level security;

-- Nullable for the rollout window; a later migration makes it NOT NULL.
alter table public.notes add column workspace_id uuid references public.workspaces (id);
create index notes_workspace_idx on public.notes (workspace_id);

insert into public.workspaces (user_id, name, is_default)
  select distinct user_id, 'כללי', true from public.notes
  on conflict do nothing;
update public.notes n set workspace_id = w.id
  from public.workspaces w
  where w.user_id = n.user_id and w.is_default and n.workspace_id is null;
