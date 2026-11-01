-- Which mobile quick-action buttons sit next to "New Note". Null means the default (record).
alter table public.user_settings add column quick_actions jsonb;
