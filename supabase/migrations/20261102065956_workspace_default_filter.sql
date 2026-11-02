-- A workspace's saved default note filter (no search text). Null = no default.
alter table public.workspaces add column default_filter jsonb;
