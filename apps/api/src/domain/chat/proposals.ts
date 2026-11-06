import { CategoryColor } from '@notes/shared';
import type { AgentAction, Taxonomy } from '@notes/shared';
import { z } from 'zod';
import type { Db } from '../../db';
import { timed, log } from '../../requestLog';
import * as taxonomy from '../taxonomy/service';
import { normalizeName } from '../taxonomy/taxonomy';

/** Matches the cap of `ActionsBody`. */
export const MAX_PROPOSALS = 20;

export const ProposeInput = z.object({
  action: z.enum(['create', 'rename', 'delete', 'restore', 'recolor']),
  kind: z.enum(['category', 'tag']),
  /** The category or tag to rename, delete or restore. */
  id: z.string().optional(),
  /** For creating a tag: the category it goes in. */
  categoryId: z.string().optional(),
  /** The name to create, or the new name for a rename. */
  name: z.string().optional(),
  /** For a recolor: one of the 8 palette keys. */
  color: CategoryColor.optional(),
});
export type ProposeInput = z.infer<typeof ProposeInput>;
export type Proposal = AgentAction | { error: string };

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Validates one change against a taxonomy snapshot. Pure: the web app applies it on approval. */
function validate(tax: Taxonomy, input: ProposeInput): Proposal {
  const name = input.name === undefined ? null : normalizeName(input.name);
  const needName = input.action === 'create' || input.action === 'rename';
  if (needName && name === null) return { error: 'invalid_name' };

  if (input.action === 'create' && input.kind === 'category') {
    if (name === null) return { error: 'invalid_name' };
    if (tax.categories.some((c) => !c.deleted && same(c.name, name))) {
      return { error: 'name_taken' };
    }
    return { action: 'create', kind: 'category', name };
  }
  if (input.action === 'create') {
    const category = tax.categories.find((c) => c.id === input.categoryId);
    if (!category) return { error: 'not_found' };
    if (category.deleted) return { error: 'category_deleted' };
    if (name === null) return { error: 'invalid_name' };
    if (category.tags.some((t) => !t.deleted && same(t.name, name))) {
      return { error: 'name_taken' };
    }
    return {
      action: 'create',
      kind: 'tag',
      categoryId: category.id,
      categoryName: category.name,
      name,
    };
  }

  if (input.action === 'recolor') {
    if (input.kind !== 'category') return { error: 'invalid_kind' };
    const category = tax.categories.find((c) => c.id === input.id);
    if (!category) return { error: 'not_found' };
    if (category.deleted) return { error: 'category_deleted' };
    if (input.color === undefined) return { error: 'invalid_color' };
    if (category.color === input.color) return { error: 'unchanged' };
    return {
      action: 'recolor',
      kind: 'category',
      id: category.id,
      name: category.name,
      color: input.color,
    };
  }

  const { kind } = input;
  const owner =
    kind === 'tag' ? tax.categories.find((c) => c.tags.some((t) => t.id === input.id)) : undefined;
  const target =
    kind === 'category'
      ? tax.categories.find((c) => c.id === input.id)
      : owner?.tags.find((t) => t.id === input.id);
  if (!target) return { error: 'not_found' };
  // Names are unique among active siblings: categories globally, tags within their category.
  const siblings = kind === 'category' ? tax.categories : (owner?.tags ?? []);
  const clash = (candidate: string) =>
    siblings.some((s) => s.id !== target.id && !s.deleted && same(s.name, candidate));

  if (input.action === 'rename') {
    if (name === null) return { error: 'invalid_name' };
    if (clash(name)) return { error: 'name_taken' };
    return { action: 'rename', kind, id: target.id, name: target.name, newName: name };
  }
  if (input.action === 'delete') {
    if (target.deleted) return { error: 'already_deleted' };
    return { action: 'delete', kind, id: target.id, name: target.name };
  }
  if (!target.deleted) return { error: 'not_deleted' };
  if (owner?.deleted) return { error: 'category_deleted' };
  if (clash(target.name)) return { error: 'name_taken' };
  return { action: 'restore', kind, id: target.id, name: target.name };
}

/**
 * Validates every input against one read of the taxonomy; one result per input, in order.
 * Reads only: the web app applies an approved card.
 */
export function proposeTaxonomyChanges(
  db: Db,
  userId: string,
  inputs: ProposeInput[],
): Promise<Proposal[]> {
  return timed('proposeTaxonomyChanges', { count: inputs.length }, async () => {
    const tax = await taxonomy.getTaxonomy(db, userId);
    const results = inputs.map((input) => validate(tax, input));
    results.forEach((r, index) => {
      if ('error' in r) log().warn({ index, error: r.error }, 'proposal rejected');
    });
    const rejected = results.filter((r) => 'error' in r).length;
    log().info({ proposed: results.length - rejected, rejected }, 'taxonomy changes proposed');
    return results;
  });
}
