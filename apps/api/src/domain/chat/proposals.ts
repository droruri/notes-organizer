import {
  CategoryColor,
  DateString,
  Importance,
  NoteStatus,
  Urgency,
  isValidTransition,
  noteHeading,
} from '@notes/shared';
import type { AgentAction, NoteChange, Taxonomy } from '@notes/shared';
import { z } from 'zod';
import type { Db } from '../../db';
import { timed, log } from '../../requestLog';
// The repository, not the service: the service's listNotes seeds a default workspace (a write),
// and a proposal must only read.
import * as noteRepo from '../notes/repository';
import * as taxonomy from '../taxonomy/service';
import { isUsable, normalizeName } from '../taxonomy/taxonomy';

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

export const NoteProposeInput = z.object({
  noteId: z.string(),
  status: NoteStatus.nullable().optional(),
  dueDate: DateString.nullable().optional(),
  importance: Importance.nullable().optional(),
  urgency: Urgency.nullable().optional(),
  addCategoryIds: z.array(z.string()).optional(),
  removeCategoryIds: z.array(z.string()).optional(),
  addTagIds: z.array(z.string()).optional(),
  removeTagIds: z.array(z.string()).optional(),
});
export type NoteProposeInput = z.infer<typeof NoteProposeInput>;

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

/** The note's list with `remove` dropped and `add` appended (no duplicates). */
const patchList = (current: string[], add: string[] = [], remove: string[] = []) => [
  ...new Set([...current.filter((id) => !remove.includes(id)), ...add]),
];

function validateNote(
  tax: Taxonomy,
  notes: Map<string, Awaited<ReturnType<typeof noteRepo.listNotes>>[number]>,
  input: NoteProposeInput,
): Proposal {
  const note = notes.get(input.noteId);
  if (!note) return { error: 'not_found' };
  if (note.status === 'draft') return { error: 'draft' };
  if (input.status !== undefined && !isValidTransition(note.status, input.status)) {
    return { error: 'invalid_transition' };
  }
  const categories = new Map(tax.categories.map((c) => [c.id, c]));
  const tags = new Map(tax.categories.flatMap((c) => c.tags.map((t) => [t.id, { t, c }] as const)));
  const catUsable = (id: string) => {
    const c = categories.get(id);
    return c !== undefined && !c.deleted;
  };
  const tagUsable = (id: string) => {
    const e = tags.get(id);
    return e !== undefined && isUsable(e.t, e.c);
  };
  if (!(input.addCategoryIds ?? []).every(catUsable) || !(input.addTagIds ?? []).every(tagUsable)) {
    return { error: 'unknown_taxonomy' };
  }

  const categoryIds = patchList(note.categoryIds, input.addCategoryIds, input.removeCategoryIds);
  const tagIds = patchList(note.tagIds, input.addTagIds, input.removeTagIds);
  const edit: NoteChange = {
    ...(input.status !== undefined && input.status !== note.status ? { status: input.status } : {}),
    ...(input.dueDate !== undefined && input.dueDate !== note.dueDate
      ? { dueDate: input.dueDate }
      : {}),
    ...(input.importance !== undefined && input.importance !== note.importance
      ? { importance: input.importance }
      : {}),
    ...(input.urgency !== undefined && input.urgency !== note.urgency
      ? { urgency: input.urgency }
      : {}),
    ...(sameSet(categoryIds, note.categoryIds) ? {} : { categoryIds }),
    ...(sameSet(tagIds, note.tagIds) ? {} : { tagIds }),
  };
  if (Object.keys(edit).length === 0) return { error: 'unchanged' };
  return {
    action: 'update',
    kind: 'note',
    id: note.id,
    name: noteHeading(note).text,
    edit,
    labels: {
      categories: (edit.categoryIds ?? []).map((id) => categories.get(id)?.name ?? id),
      tags: (edit.tagIds ?? []).map((id) => tags.get(id)?.t.name ?? id),
    },
  };
}

/**
 * Validates every note change against one read of the notes and the taxonomy; one result per
 * input, in order. Reads only: the web app applies an approved card through `PATCH /notes/:id`.
 */
export function proposeNoteChanges(
  db: Db,
  userId: string,
  inputs: NoteProposeInput[],
): Promise<Proposal[]> {
  return timed('proposeNoteChanges', { count: inputs.length }, async () => {
    const [all, tax] = await Promise.all([
      noteRepo.listNotes(db, userId),
      taxonomy.getTaxonomy(db, userId),
    ]);
    const byId = new Map(all.map((n) => [n.id, n]));
    const results = inputs.map((input) => validateNote(tax, byId, input));
    results.forEach((r, index) => {
      if ('error' in r) {
        // The id comes from LLM output: log it only when it is a real uuid, never raw text.
        const parsed = z.uuid().safeParse(inputs[index]?.noteId);
        log().warn(
          { index, noteId: parsed.success ? parsed.data : undefined, error: r.error },
          'note proposal rejected',
        );
      }
    });
    const rejected = results.filter((r) => 'error' in r).length;
    log().info({ proposed: results.length - rejected, rejected }, 'note changes proposed');
    return results;
  });
}
