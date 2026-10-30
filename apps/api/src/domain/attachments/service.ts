import type { Attachment, AttachmentError } from '@notes/shared';
import type { Db } from '../../db';
import { log, timed } from '../../requestLog';
import { withTransaction } from '../../tx';
import { checkUpload, cleanName } from './attachment';
import * as repo from './repository';

export type Result<T> = { ok: true; value: T } | { ok: false; error: AttachmentError };

const fail = (error: AttachmentError): Result<never> => ({ ok: false, error });

/** Stores a file on the user's note. The note row stays locked until the checks and insert are done. */
export function addAttachment(
  db: Db,
  userId: string,
  noteId: string,
  file: repo.Blob,
): Promise<Result<Attachment>> {
  return timed('addAttachment', { noteId }, async () => {
    const result = await addUntimed(db, userId, noteId, file);
    if (result.ok) {
      log().info(
        {
          noteId,
          attachmentId: result.value.id,
          mime: result.value.mime,
          bytes: result.value.size,
        },
        'attachment added',
      );
    } else {
      log().warn({ noteId, error: result.error }, 'attachment rejected');
    }
    return result;
  });
}

async function addUntimed(
  db: Db,
  userId: string,
  noteId: string,
  file: repo.Blob,
): Promise<Result<Attachment>> {
  const name = cleanName(file.name);
  if (name === null || file.data.length === 0) return fail('invalid_body');
  return withTransaction(db, async (tx) => {
    await repo.lockUserUploads(tx, userId);
    if (!(await repo.lockNote(tx, userId, noteId))) return fail('not_found');
    const usage = await repo.countAndUsage(tx, userId, noteId);
    const error = checkUpload({ mime: file.mime, size: file.data.length, ...usage });
    if (error) return fail(error);
    return { ok: true, value: await repo.insertAttachment(tx, noteId, { ...file, name }) };
  });
}

export function getAttachment(
  db: Db,
  userId: string,
  noteId: string,
  id: string,
): Promise<repo.Blob | undefined> {
  return timed('getAttachment', { noteId, attachmentId: id }, async () => {
    const found = await repo.findAttachment(db, userId, noteId, id);
    if (found) {
      log().info({ noteId, attachmentId: id, bytes: found.data.length }, 'attachment served');
    }
    return found;
  });
}

export function removeAttachment(
  db: Db,
  userId: string,
  noteId: string,
  id: string,
): Promise<boolean> {
  return timed('removeAttachment', { noteId, attachmentId: id }, async () => {
    const removed = await repo.deleteAttachment(db, userId, noteId, id);
    if (removed) log().info({ noteId, attachmentId: id }, 'attachment removed');
    return removed;
  });
}
