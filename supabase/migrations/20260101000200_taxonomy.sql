-- The user's taxonomy: categories with tags, soft-deleted via deleted_at (ADR 0002).
-- Names are unique among active rows only, case-insensitively. RLS on, no policies.
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index categories_active_name_key
  on public.categories (user_id, lower(name)) where deleted_at is null;

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index tags_active_name_key
  on public.tags (category_id, lower(name)) where deleted_at is null;

alter table public.categories enable row level security;
alter table public.tags enable row level security;
