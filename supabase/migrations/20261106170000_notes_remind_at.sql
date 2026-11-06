-- Optional exact reminder instant; the cron pushes once when it passes.
alter table public.notes add column remind_at timestamptz;
