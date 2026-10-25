import type { Category, Tag, Taxonomy } from '@notes/shared';
import type { Db } from '../../db';
import * as repo from './repository';
import { isUsable, normalizeName } from './taxonomy';

export type Failure = 'invalid_name' | 'not_found' | 'name_taken' | 'category_deleted';
export type Result<T> = { ok: true; value: T } | { ok: false; error: Failure };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: Failure): Result<never> => ({ ok: false, error });

const UNIQUE_VIOLATION = '23505';

/** Run a write; a clash with an active name (partial unique index) becomes `name_taken`. */
async function guarded<T>(write: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await write());
  } catch (err) {
    if (typeof err === 'object' && err !== null && 'code' in err && err.code === UNIQUE_VIOLATION) {
      return fail('name_taken');
    }
    throw err;
  }
}

export async function getTaxonomy(db: Db, userId: string): Promise<Taxonomy> {
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
  return guarded(() => repo.insertCategory(db, userId, name));
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
