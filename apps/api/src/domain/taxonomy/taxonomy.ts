// Pure taxonomy rules. Uniqueness among active names is enforced by the partial unique indexes.

export const MAX_NAME_LENGTH = 100;

/** Trim and collapse inner whitespace; null when the result is empty or too long. */
export function normalizeName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, ' ');
  return name.length > 0 && name.length <= MAX_NAME_LENGTH ? name : null;
}

/** A tag can be picked only when neither it nor its category is deleted. */
export function isUsable(tag: { deleted: boolean }, category: { deleted: boolean }): boolean {
  return !tag.deleted && !category.deleted;
}
