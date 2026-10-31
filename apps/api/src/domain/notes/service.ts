import {
  extractLinks,
  type LinkContext,
  MAX_BODY_LENGTH,
  type Note,
  type NoteAnalyze,
  NoteCreate,
  NoteEdit,
  Suggestion,
  suggestionOf,
} from '@notes/shared';
import type { Ai } from '../../ai/provider';
import type { Db } from '../../db';
import type { LinkReader } from '../links/preview';
import { log, timed } from '../../requestLog';
import { withTransaction } from '../../tx';
import { createPlanned, getTaxonomy } from '../taxonomy/service';
import { listWorkspaces } from '../workspaces/service';
import { resolveWorkspace } from '../workspaces/workspaces';
import { classify } from './classify';
import { isValidTransition, planLinks, planNewTaxonomy } from './note';
import * as repo from './repository';

export type Failure =
  | 'not_found'
  | 'invalid_transition'
  | 'unknown_taxonomy'
  | 'transcription_failed'
  | 'empty_transcript';
export type Result<T> = { ok: true; value: T } | { ok: false; error: Failure };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: Failure): Result<never> => ({ ok: false, error });

export type Draft = { created: boolean; note: Note; suggestion: Suggestion };

function rowOrThrow<T>(row: T | undefined): T {
  if (row === undefined) throw new Error('expected a note row');
  return row;
}

export const MAX_READ_LINKS = 3;

/** Read the first links of a body; the rest are passed on as unread URLs. */
export async function linkContexts(links: LinkReader, body: string): Promise<LinkContext[]> {
  const urls = extractLinks(body);
  const read = await links.readAll(urls.slice(0, MAX_READ_LINKS));
  return [...read, ...urls.slice(MAX_READ_LINKS).map((url): LinkContext => ({ url, ok: false }))];
}

/** Classify the text and store it as a draft. A repeated `clientId` returns the stored draft. */
export function createDraft(
  db: Db,
  ai: Ai,
  links: LinkReader,
  userId: string,
  input: NoteCreate,
  audio?: repo.Audio,
): Promise<Draft> {
  return timed('createDraft', {}, async () => {
    const draft = await createDraftUntimed(db, ai, links, userId, input, audio);
    if (draft.created) {
      log().info(
        {
          noteId: draft.note.id,
          links: extractLinks(input.body).length,
          categories: draft.suggestion.categoryIds.length,
          tags: draft.suggestion.tagIds.length,
          newCategories: draft.suggestion.newCategories.length,
          newTags: draft.suggestion.newTags.length,
        },
        'draft saved',
      );
    } else {
      log().info({ noteId: draft.note.id }, 'draft duplicate');
    }
    return draft;
  });
}

async function createDraftUntimed(
  db: Db,
  ai: Ai,
  links: LinkReader,
  userId: string,
  input: NoteCreate,
  audio?: repo.Audio,
): Promise<Draft> {
  const existing = await repo.findNoteByClientId(db, userId, input.clientId);
  if (existing) return { created: false, note: existing, suggestion: suggestionOf(existing) };

  const workspace = resolveWorkspace(await listWorkspaces(db, userId), input.workspaceId);
  if (!workspace) throw new Error('user has no default workspace');
  const taxonomy = await getTaxonomy(db, userId);
  const suggestion = await classify(ai, {
    body: input.body,
    today: input.today,
    locale: input.locale,
    taxonomy,
    links: await linkContexts(links, input.body),
  });
  const id = await withTransaction(db, async (tx) => {
    const noteId = await repo.insertDraft(tx, userId, {
      clientId: input.clientId,
      workspaceId: workspace.id,
      body: input.body,
      title: input.title || suggestion.title,
      proposed: { newCategories: suggestion.newCategories, newTags: suggestion.newTags },
      dueDate: suggestion.dueDate,
      importance: suggestion.importance,
      urgency: suggestion.urgency,
      unreadLinks: suggestion.unreadLinks,
    });
    if (noteId !== null) {
      await repo.replaceLinks(tx, noteId, suggestion);
      if (audio) await repo.insertAudio(tx, noteId, audio);
    }
    return noteId;
  });
  // null = a concurrent request with the same clientId won the insert.
  const note = rowOrThrow(await repo.findNoteByClientId(db, userId, input.clientId));
  return { created: id !== null, note, suggestion: suggestionOf(note) };
}

/** Transcribe a recording, then run the normal draft flow with the transcript as the body. */
export function createVoiceDraft(
  db: Db,
  ai: Ai,
  links: LinkReader,
  userId: string,
  input: Omit<NoteCreate, 'body'>,
  audio: repo.Audio,
): Promise<Result<Draft>> {
  return timed('createVoiceDraft', {}, () =>
    createVoiceDraftUntimed(db, ai, links, userId, input, audio),
  );
}

async function createVoiceDraftUntimed(
  db: Db,
  ai: Ai,
  links: LinkReader,
  userId: string,
  input: Omit<NoteCreate, 'body'>,
  audio: repo.Audio,
): Promise<Result<Draft>> {
  const existing = await repo.findNoteByClientId(db, userId, input.clientId);
  if (existing) return ok({ created: false, note: existing, suggestion: suggestionOf(existing) });
  let text: string;
  try {
    ({ text } = await ai.transcribe({ audio: audio.data, mime: audio.mime }));
  } catch {
    return fail('transcription_failed');
  }
  const body = text.trim().slice(0, MAX_BODY_LENGTH);
  if (body === '') {
    log().warn({}, 'empty transcript');
    return fail('empty_transcript');
  }
  return ok(await createDraft(db, ai, links, userId, { ...input, body }, audio));
}

export function getAudio(db: Db, userId: string, id: string): Promise<repo.Audio | undefined> {
  return repo.findAudio(db, userId, id);
}

export async function listNotes(db: Db, userId: string): Promise<Note[]> {
  // Seeds the default workspace, which notes without one resolve to.
  await listWorkspaces(db, userId);
  return repo.listNotes(db, userId);
}

/** Apply an edit. `status: 'todo'` on a draft submits it. All or nothing. */
export function updateNote(
  db: Db,
  userId: string,
  id: string,
  edit: NoteEdit,
): Promise<Result<Note>> {
  return timed('updateNote', { noteId: id }, async () => {
    const result = await updateNoteUntimed(db, userId, id, edit);
    if (result.ok) {
      log().info(
        { noteId: id, from: result.value.from, to: result.value.note.status },
        'note updated',
      );
      return ok(result.value.note);
    }
    log().warn({ noteId: id, error: result.error }, 'note update failed');
    return result;
  });
}

async function updateNoteUntimed(
  db: Db,
  userId: string,
  id: string,
  edit: NoteEdit,
): Promise<Result<{ note: Note; from: Note['status'] }>> {
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
    const made = await createPlanned(tx, userId, plan);
    links.categoryIds.push(...made.categoryIds);
    links.tagIds.push(...made.tagIds);
    await repo.replaceLinks(tx, id, {
      categoryIds: [...new Set(links.categoryIds)],
      tagIds: [...new Set(links.tagIds)],
    });
    await repo.updateNote(tx, id, {
      ...(edit.body !== undefined ? { body: edit.body } : {}),
      ...(edit.title !== undefined ? { title: edit.title || null } : {}),
      ...(edit.dueDate !== undefined ? { dueDate: edit.dueDate } : {}),
      ...(edit.importance !== undefined ? { importance: edit.importance } : {}),
      ...(edit.urgency !== undefined ? { urgency: edit.urgency } : {}),
      ...(edit.unreadLinks !== undefined ? { unreadLinks: edit.unreadLinks } : {}),
      ...(status !== note.status ? { status } : {}),
      ...(status !== 'draft' ? { proposed: null } : {}),
    });
    return ok({ note: rowOrThrow(await repo.findNote(tx, userId, id)), from: note.status });
  });
}

export function deleteNote(db: Db, userId: string, id: string): Promise<Result<null>> {
  return timed('deleteNote', { noteId: id }, async () => {
    if (!(await repo.setDeleted(db, userId, id, true))) return fail('not_found');
    log().info({ noteId: id }, 'note deleted');
    return ok(null);
  });
}

export function restoreNote(db: Db, userId: string, id: string): Promise<Result<Note>> {
  return timed('restoreNote', { noteId: id }, async () => {
    if (!(await repo.setDeleted(db, userId, id, false))) return fail('not_found');
    log().info({ noteId: id }, 'note restored');
    return ok(rowOrThrow(await repo.findNote(db, userId, id)));
  });
}

/** Ask Claude again about the stored text. Writes nothing. */
export function analyzeNote(
  db: Db,
  ai: Ai,
  links: LinkReader,
  userId: string,
  id: string,
  input: NoteAnalyze,
): Promise<Result<Suggestion>> {
  return timed('analyzeNote', { noteId: id }, () =>
    analyzeNoteUntimed(db, ai, links, userId, id, input),
  );
}

async function analyzeNoteUntimed(
  db: Db,
  ai: Ai,
  links: LinkReader,
  userId: string,
  id: string,
  input: NoteAnalyze,
): Promise<Result<Suggestion>> {
  const note = await repo.findNote(db, userId, id);
  if (!note) return fail('not_found');
  const taxonomy = await getTaxonomy(db, userId);
  return ok(
    await classify(ai, {
      body: note.body,
      today: input.today,
      locale: input.locale,
      taxonomy,
      links: await linkContexts(links, note.body),
    }),
  );
}
