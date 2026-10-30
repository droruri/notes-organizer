-- A category's optional default importance. Nullable, so existing rows need no backfill.
alter table public.categories add column importance public.importance;
