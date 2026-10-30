import type { Attachment } from '@notes/shared';
import type { Queryable } from '../../tx';

// SQL for note attachments. The owner is the note's owner, so every query joins `notes`.

type AttachmentRow = Omit<Attachment, 'createdAt'> & { createdAt: Date };

export type Blob = { name: string; mime: string; data: Buffer };

export async function insertAttachment(
  db: Queryable,
  noteId: string,
  file: Blob,
): Promise<Attachment> {
  const { rows } = await db.query<AttachmentRow>(
    `insert into note_attachments (note_id, name, mime, size, data) values ($1, $2, $3, $4, $5)
     returning id, name, mime, size, created_at as "createdAt"`,
    [noteId, file.name, file.mime, file.data.length, file.data],
  );
  const row = rows[0];
  if (!row) throw new Error('expected an attachment row');
  return { ...row, createdAt: row.createdAt.toISOString() };
}

/** Serializes uploads per user, so two notes cannot both pass the quota check. Held until the transaction ends. */
export async function lockUserUploads(db: Queryable, userId: string): Promise<void> {
  await db.query("select pg_advisory_xact_lock(hashtext('attachments:' || $1))", [userId]);
}

/** Locks the user's live note row until the transaction ends; false when there is none. */
export async function lockNote(db: Queryable, userId: string, noteId: string): Promise<boolean> {
  const { rowCount } = await db.query(
    'select 1 from notes where id = $1 and user_id = $2 and deleted_at is null for update',
    [noteId, userId],
  );
  return (rowCount ?? 0) > 0;
}

/** Attachments on the note, and the bytes the user stores across all their notes. */
export async function countAndUsage(
  db: Queryable,
  userId: string,
  noteId: string,
): Promise<{ count: number; usedBytes: number }> {
  const { rows } = await db.query<{ count: number; usedBytes: number }>(
    `select count(*) filter (where a.note_id = $2)::int as count,
            coalesce(sum(a.size), 0)::float8 as "usedBytes"
     from note_attachments a join notes n on n.id = a.note_id where n.user_id = $1`,
    [userId, noteId],
  );
  return rows[0] ?? { count: 0, usedBytes: 0 };
}

export async function findAttachment(
  db: Queryable,
  userId: string,
  noteId: string,
  id: string,
): Promise<Blob | undefined> {
  const { rows } = await db.query<Blob>(
    `select a.name, a.mime, a.data from note_attachments a join notes n on n.id = a.note_id
     where a.id = $1 and a.note_id = $2 and n.user_id = $3 and n.deleted_at is null`,
    [id, noteId, userId],
  );
  return rows[0];
}

export async function deleteAttachment(
  db: Queryable,
  userId: string,
  noteId: string,
  id: string,
): Promise<boolean> {
  const { rowCount } = await db.query(
    `delete from note_attachments a using notes n
     where a.id = $1 and a.note_id = $2 and n.id = a.note_id and n.user_id = $3 and n.deleted_at is null`,
    [id, noteId, userId],
  );
  return (rowCount ?? 0) > 0;
}
