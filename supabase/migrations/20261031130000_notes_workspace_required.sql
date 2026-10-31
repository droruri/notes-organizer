-- Contract step: every note belongs to a workspace.
insert into public.workspaces (user_id, name, is_default)
  select distinct user_id, 'כללי', true from public.notes where workspace_id is null
  on conflict do nothing;
update public.notes n set workspace_id = w.id
  from public.workspaces w
  where w.user_id = n.user_id and w.is_default and n.workspace_id is null;
alter table public.notes alter column workspace_id set not null;
