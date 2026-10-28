-- Who may sign in, managed in the app. ALLOWED_EMAILS only seeds the first admins at startup.
create table public.allowed_users (
  email text primary key check (email = lower(email)),
  is_admin boolean not null default false,
  added_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.allowed_users enable row level security;
