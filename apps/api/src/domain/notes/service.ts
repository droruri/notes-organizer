import type { Note, NoteAnalyze, NoteCreate, NoteEdit, Suggestion } from '@notes/shared';
import type { Ai } from '../../ai/provider';
import type { Db } from '../../db';
import { withTransaction } from '../../tx';
import * as taxonomyRepo from '../taxonomy/repository';
import { getTaxonomy } from '../taxonomy/service';
import { classify } from './classify';
import { isValidTransition, planLinks, planNewTaxonomy, suggestionOf } from './note';
import * as repo from './repository';

export type Failure = 'not_found' | 'invalid_transition' | 'unknown_taxonomy';
export type Result<T> = { ok: true; value: T } | { ok: false; error: Failure };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: Failure): Result<never> => ({ ok: false, error });

export type Draft = { created: boolean; note: Note; suggestion: Suggestion };

function rowOrThrow<T>(row: T | undefined): T {
  if (row === undefined) throw new Error('expected a note row');
  return row;
}

/** Classify the text and store it as a draft. A repeated `clientId` returns the stored draft. */
export async function createDraft(
  db: Db,
  ai: Ai,
  userId: string,
  input: NoteCreate,
): Promise<Draft> {
  const existing = await repo.findNoteByClientId(db, userId, input.clientId);
  if (existing) return { created: false, note: existing, suggestion: suggestionOf(existing) };

  const taxonomy = await getTaxonomy(db, userId);
  const suggestion = await classify(ai, {
    body: input.body,
    today: input.today,
    locale: input.locale,
    taxonomy,
  });
  const id = await withTransaction(db, async (tx) => {
    const noteId = await repo.insertDraft(tx, userId, {
      clientId: input.clientId,
      body: input.body,
      proposed: { newCategories: suggestion.newCategories, newTags: suggestion.newTags },
      dueDate: suggestion.dueDate,
      importance: suggestion.importance,
      urgency: suggestion.urgency,
    });
    if (noteId !== null) await repo.replaceLinks(tx, noteId, suggestion);
    return noteId;
  });
  // null = a concurrent request with the same clientId won the insert.
  const note = rowOrThrow(await repo.findNoteByClientId(db, userId, input.clientId));
  return { created: id !== null, note, suggestion: suggestionOf(note) };
}

export function listNotes(db: Db, userId: string): Promise<Note[]> {
  return repo.listNotes(db, userId);
}

/** Apply an edit. `status: 'todo'` on a draft submits it. All or nothing. */
export async function updateNote(
  db: Db,
  userId: string,
  id: string,
  edit: NoteEdit,
): Promise<Result<Note>> {
  return withTransaction(db, async (tx) => {
    const note = await repo.findNote(tx, userId, id, true);
    if (!note) return fail('not_found');
    const status = edit.status ?? note.status;
    if (!isValidTransition(note.status, status)) return fail('invalid_transition');
    // A draft cannot create taxonomy; submitting it (or editing a submitted note) can.
    const proposesNew = (edit.newCategories?.length ?? 0) > 0 || (edit.newTags?.length ?? 0) > 0;
    if (proposesNew && status === 'draft') return fail('invalid_transition');

    const taxonomy = await getTaxonomy(tx, userId);
    const plan = planNewTaxonomy(edit.newCategories ?? [], edit.newTags ?? [], taxonomy);
    if (!plan) return fail('unknown_taxonomy');
    const links = planLinks(
      {
        categoryIds: [...(edit.categoryIds ?? note.categoryIds), ...plan.existingCategoryIds],
        tagIds: [
          ...(edit.tagIds ?? note.tagIds),
          ...plan.tags.flatMap((t) => (t.existingTagId ? [t.existingTagId] : [])),
        ],
      },
      note,
      taxonomy,
    );
    if (!links) return fail('unknown_taxonomy');

    // Every check passed: from here on we only write.
    const created = new Map<string, string>();
    for (const name of plan.categories) {
      const category = await taxonomyRepo.insertCategory(tx, userId, name);
      created.set(name.toLowerCase(), category.id);
      links.categoryIds.push(category.id);
    }
    for (const tag of plan.tags) {
      if (tag.existingTagId) continue;
      const categoryId =
        'id' in tag.category ? tag.category.id : created.get(tag.category.name.toLowerCase());
      if (categoryId === undefined) throw new Error('planned tag lost its category');
      const row = await taxonomyRepo.insertTag(tx, categoryId, tag.name);
      links.tagIds.push(row.id);
      links.categoryIds.push(categoryId);
    }
    await repo.replaceLinks(tx, id, {
      categoryIds: [...new Set(links.categoryIds)],
      tagIds: [...new Set(links.tagIds)],
    });
    await repo.updateNote(tx, id, {
      ...(edit.body !== undefined ? { body: edit.body } : {}),
      ...(edit.dueDate !== undefined ? { dueDate: edit.dueDate } : {}),
      ...(edit.importance !== undefined ? { importance: edit.importance } : {}),
      ...(edit.urgency !== undefined ? { urgency: edit.urgency } : {}),
      ...(status !== note.status ? { status } : {}),
      ...(status !== 'draft' ? { proposed: null } : {}),
    });
    return ok(rowOrThrow(await repo.findNote(tx, userId, id)));
  });
}

export async function deleteNote(db: Db, userId: string, id: string): Promise<Result<null>> {
  return (await repo.setDeleted(db, userId, id, true)) ? ok(null) : fail('not_found');
}

export async function restoreNote(db: Db, userId: string, id: string): Promise<Result<Note>> {
  if (!(await repo.setDeleted(db, userId, id, false))) return fail('not_found');
  return ok(rowOrThrow(await repo.findNote(db, userId, id)));
}

/** Ask Claude again about the stored text. Writes nothing. */
export async function analyzeNote(
  db: Db,
  ai: Ai,
  userId: string,
  id: string,
  input: NoteAnalyze,
): Promise<Result<Suggestion>> {
  const note = await repo.findNote(db, userId, id);
  if (!note) return fail('not_found');
  const taxonomy = await getTaxonomy(db, userId);
  return ok(
    await classify(ai, { body: note.body, today: input.today, locale: input.locale, taxonomy }),
  );
}
