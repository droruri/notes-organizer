-- Web Push: one row per browser/device endpoint, plus the user's timezone and reminder hour.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;

alter table public.user_settings add column timezone text;
alter table public.user_settings add column reminder_hour smallint
  check (reminder_hour between 0 and 23);
