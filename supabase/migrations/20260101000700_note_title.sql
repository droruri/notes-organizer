alter table public.notes
  add column title text check (title is null or length(title) between 1 and 200);
