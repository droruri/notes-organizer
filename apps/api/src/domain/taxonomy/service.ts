import type {
  Category,
  CategoryColor,
  Importance,
  Tag,
  Taxonomy,
  TaxonomyFailure,
} from '@notes/shared';
import type { Db } from '../../db';
import { log, timed } from '../../requestLog';
import { guarded, withTransaction, type Queryable } from '../../tx';
import * as repo from './repository';
import type { NewTaxonomyPlan } from '../notes/note';
import { isUsable, normalizeName } from './taxonomy';

export type Failure = TaxonomyFailure;
export type Result<T> = { ok: true; value: T } | { ok: false; error: Failure };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: Failure): Result<never> => ({ ok: false, error });

export async function getTaxonomy(db: Queryable, userId: string): Promise<Taxonomy> {
  const [categories, tags] = await Promise.all([
    repo.listCategories(db, userId),
    repo.listTags(db, userId),
  ]);
  return {
    categories: categories.map((c) => ({ ...c, tags: tags.filter((t) => t.categoryId === c.id) })),
  };
}

export async function createCategory(
  db: Db,
  userId: string,
  rawName: string,
): Promise<Result<Category>> {
  const name = normalizeName(rawName);
  if (name === null) return fail('invalid_name');
  return guarded(() => withTransaction(db, (tx) => repo.insertCategory(tx, userId, name)));
}

export async function renameCategory(
  db: Db,
  userId: string,
  id: string,
  rawName: string,
): Promise<Result<Category>> {
  const name = normalizeName(rawName);
  if (name === null) return fail('invalid_name');
  if (!(await repo.findCategory(db, userId, id))) return fail('not_found');
  return guarded(() => repo.updateCategory(db, id, { name }));
}

export async function setCategoryDeleted(
  db: Db,
  userId: string,
  id: string,
  deleted: boolean,
): Promise<Result<Category>> {
  if (!(await repo.findCategory(db, userId, id))) return fail('not_found');
  return guarded(() => repo.updateCategory(db, id, { deleted }));
}

/** Set or clear a category's default importance. Allowed on deleted categories too. */
export function setCategoryImportance(
  db: Db,
  userId: string,
  id: string,
  importance: Importance | null,
): Promise<Result<Category>> {
  return timed('setCategoryImportance', { categoryId: id }, async () => {
    if (!(await repo.findCategory(db, userId, id))) {
      log().warn({ categoryId: id, error: 'not_found' }, 'category importance failed');
      return fail('not_found');
    }
    const category = await repo.updateCategoryImportance(db, id, importance);
    log().info({ categoryId: id, importance }, 'category importance set');
    return ok(category);
  });
}

/** Set a category's color. Allowed on deleted categories too. */
export function setCategoryColor(
  db: Db,
  userId: string,
  id: string,
  color: CategoryColor,
): Promise<Result<Category>> {
  return timed('setCategoryColor', { categoryId: id }, async () => {
    if (!(await repo.findCategory(db, userId, id))) {
      log().warn({ categoryId: id, error: 'not_found' }, 'category color failed');
      return fail('not_found');
    }
    const category = await repo.updateCategoryColor(db, id, color);
    log().info({ categoryId: id, color }, 'category color set');
    return ok(category);
  });
}

export async function createTag(
  db: Db,
  userId: string,
  categoryId: string,
  rawName: string,
): Promise<Result<Tag>> {
  const name = normalizeName(rawName);
  if (name === null) return fail('invalid_name');
  const category = await repo.findCategory(db, userId, categoryId);
  if (!category) return fail('not_found');
  if (!isUsable({ deleted: false }, category)) return fail('category_deleted');
  return guarded(() => repo.insertTag(db, categoryId, name));
}

export async function renameTag(
  db: Db,
  userId: string,
  id: string,
  rawName: string,
): Promise<Result<Tag>> {
  const name = normalizeName(rawName);
  if (name === null) return fail('invalid_name');
  if (!(await repo.findTag(db, userId, id))) return fail('not_found');
  return guarded(() => repo.updateTag(db, id, { name }));
}

export async function setTagDeleted(
  db: Db,
  userId: string,
  id: string,
  deleted: boolean,
): Promise<Result<Tag>> {
  const tag = await repo.findTag(db, userId, id);
  if (!tag) return fail('not_found');
  if (!deleted && !isUsable({ deleted: false }, { deleted: tag.categoryDeleted })) {
    return fail('category_deleted');
  }
  return guarded(() => repo.updateTag(db, id, { deleted }));
}

/** Create the categories and tags a plan names. Returns the ids of everything it created. */
export async function createPlanned(
  tx: Queryable,
  userId: string,
  plan: NewTaxonomyPlan,
): Promise<{ categoryIds: string[]; tagIds: string[] }> {
  const created = new Map<string, string>();
  const made = { categoryIds: [] as string[], tagIds: [] as string[] };
  for (const name of plan.categories) {
    const category = await repo.insertCategory(tx, userId, name);
    created.set(name.toLowerCase(), category.id);
    made.categoryIds.push(category.id);
  }
  for (const tag of plan.tags) {
    if (tag.existingTagId) continue;
    const categoryId =
      'id' in tag.category ? tag.category.id : created.get(tag.category.name.toLowerCase());
    if (categoryId === undefined) throw new Error('planned tag lost its category');
    const row = await repo.insertTag(tx, categoryId, tag.name);
    made.tagIds.push(row.id);
    made.categoryIds.push(categoryId);
  }
  return made;
}
