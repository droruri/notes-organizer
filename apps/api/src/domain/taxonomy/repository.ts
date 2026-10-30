import type { Category, Importance, Tag } from '@notes/shared';
import type { Queryable } from '../../tx';

// SQL for categories and tags. Tags have no user_id: ownership is checked through the category.

const CATEGORY_COLS = 'c.id, c.name, c.deleted_at is not null as deleted, c.importance';
const CATEGORY_RETURNING = 'id, name, deleted_at is not null as deleted, importance';
const TAG_COLS = 't.id, t.category_id as "categoryId", t.name, t.deleted_at is not null as deleted';

export async function listCategories(db: Queryable, userId: string): Promise<Category[]> {
  const { rows } = await db.query<Category>(
    `select ${CATEGORY_COLS} from categories c where c.user_id = $1 order by lower(c.name), c.id`,
    [userId],
  );
  return rows;
}

export async function listTags(db: Queryable, userId: string): Promise<Tag[]> {
  const { rows } = await db.query<Tag>(
    `select ${TAG_COLS} from tags t join categories c on c.id = t.category_id
     where c.user_id = $1 order by lower(t.name), t.id`,
    [userId],
  );
  return rows;
}

export async function findCategory(
  db: Queryable,
  userId: string,
  id: string,
): Promise<Category | undefined> {
  const { rows } = await db.query<Category>(
    `select ${CATEGORY_COLS} from categories c where c.id = $1 and c.user_id = $2`,
    [id, userId],
  );
  return rows[0];
}

/** The tag plus whether its category is deleted. */
export async function findTag(
  db: Queryable,
  userId: string,
  id: string,
): Promise<(Tag & { categoryDeleted: boolean }) | undefined> {
  const { rows } = await db.query<Tag & { categoryDeleted: boolean }>(
    `select ${TAG_COLS}, c.deleted_at is not null as "categoryDeleted"
     from tags t join categories c on c.id = t.category_id
     where t.id = $1 and c.user_id = $2`,
    [id, userId],
  );
  return rows[0];
}

export async function insertCategory(
  db: Queryable,
  userId: string,
  name: string,
): Promise<Category> {
  const { rows } = await db.query<Category>(
    `insert into categories (user_id, name) values ($1, $2)
     returning ${CATEGORY_RETURNING}`,
    [userId, name],
  );
  return rowOrThrow(rows);
}

export async function insertTag(db: Queryable, categoryId: string, name: string): Promise<Tag> {
  const { rows } = await db.query<Tag>(
    `insert into tags (category_id, name) values ($1, $2)
     returning id, category_id as "categoryId", name, deleted_at is not null as deleted`,
    [categoryId, name],
  );
  return rowOrThrow(rows);
}

export async function updateCategory(
  db: Queryable,
  id: string,
  change: { name: string } | { deleted: boolean },
): Promise<Category> {
  const { rows } = await db.query<Category>(
    `update categories set
       name = coalesce($2, name),
       deleted_at = case when $3::boolean is null then deleted_at
                         when $3 then coalesce(deleted_at, now()) else null end
     where id = $1 returning ${CATEGORY_RETURNING}`,
    [id, 'name' in change ? change.name : null, 'deleted' in change ? change.deleted : null],
  );
  return rowOrThrow(rows);
}

export async function updateCategoryImportance(
  db: Queryable,
  id: string,
  importance: Importance | null,
): Promise<Category> {
  const { rows } = await db.query<Category>(
    `update categories set importance = $2 where id = $1 returning ${CATEGORY_RETURNING}`,
    [id, importance],
  );
  return rowOrThrow(rows);
}

export async function updateTag(
  db: Queryable,
  id: string,
  change: { name: string } | { deleted: boolean },
): Promise<Tag> {
  const { rows } = await db.query<Tag>(
    `update tags set
       name = coalesce($2, name),
       deleted_at = case when $3::boolean is null then deleted_at
                         when $3 then coalesce(deleted_at, now()) else null end
     where id = $1
     returning id, category_id as "categoryId", name, deleted_at is not null as deleted`,
    [id, 'name' in change ? change.name : null, 'deleted' in change ? change.deleted : null],
  );
  return rowOrThrow(rows);
}

function rowOrThrow<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error('expected a row from the taxonomy query');
  return row;
}
