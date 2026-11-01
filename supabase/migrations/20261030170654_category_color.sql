-- A category's palette color. Existing rows are spread over the palette per user, by creation order.
create type public.category_color as enum
  ('blue', 'green', 'purple', 'amber', 'teal', 'pink', 'red', 'slate');

alter table public.categories
  add column color public.category_color not null default 'slate';

update public.categories c
set color = (enum_range(null::public.category_color))[1 + (r.n - 1) % 8]
from (
  select id, row_number() over (partition by user_id order by created_at, id) as n
  from public.categories
) r
where r.id = c.id;
