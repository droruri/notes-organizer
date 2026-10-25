import { Proposed, type Importance, type Note, type NoteStatus, type Urgency } from '@notes/shared';
import type { Queryable } from '../../tx';
import type { Links } from './note';

// SQL for notes and their category/tag links.

type NoteRow = Omit<Note, 'proposed' | 'createdAt' | 'updatedAt'> & {
  proposed: unknown;
  createdAt: Date;
  updatedAt: Date;
};

const NOTE_SELECT = `
  select n.id, n.client_id as "clientId", n.body, n.status, n.importance, n.urgency,
    to_char(n.due_date, 'YYYY-MM-DD') as "dueDate", n.proposed, n.unread_links as "unreadLinks",
    n.created_at as "createdAt", n.updated_at as "updatedAt",
    coalesce((select array_agg(nc.category_id::text) from note_categories nc where nc.note_id = n.id), '{}') as "categoryIds",
    coalesce((select array_agg(nt.tag_id::text) from note_tags nt where nt.note_id = n.id), '{}') as "tagIds",
    exists(select 1 from note_audio a where a.note_id = n.id) as "hasAudio"
  from notes n`;

function toNote(row: NoteRow): Note {
  const proposed = Proposed.safeParse(row.proposed);
  return {
    ...row,
    proposed: proposed.success ? proposed.data : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listNotes(db: Queryable, userId: string): Promise<Note[]> {
  const { rows } = await db.query<NoteRow>(
    `${NOTE_SELECT} where n.user_id = $1 and n.deleted_at is null order by n.created_at desc, n.id`,
    [userId],
  );
  return rows.map(toNote);
}

/** `lock` takes a row lock for the rest of the transaction. */
export async function findNote(
  db: Queryable,
  userId: string,
  id: string,
  lock = false,
): Promise<Note | undefined> {
  if (lock) {
    await db.query('select 1 from notes where id = $1 and user_id = $2 for update', [id, userId]);
  }
  const { rows } = await db.query<NoteRow>(
    `${NOTE_SELECT} where n.id = $1 and n.user_id = $2 and n.deleted_at is null`,
    [id, userId],
  );
  const row = rows[0];
  return row ? toNote(row) : undefined;
}

export async function findNoteByClientId(
  db: Queryable,
  userId: string,
  clientId: string,
): Promise<Note | undefined> {
  const { rows } = await db.query<NoteRow>(
    `${NOTE_SELECT} where n.user_id = $1 and n.client_id = $2 and n.deleted_at is null`,
    [userId, clientId],
  );
  const row = rows[0];
  return row ? toNote(row) : undefined;
}

/** Inserts a draft; null when the (user, clientId) pair already exists. */
export async function insertDraft(
  db: Queryable,
  userId: string,
  draft: {
    clientId: string;
    body: string;
    proposed: Proposed;
    dueDate: string | null;
    importance: Importance | null;
    urgency: Urgency | null;
    unreadLinks: string[];
  },
): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(
    `insert into notes (user_id, client_id, body, proposed, due_date, importance, urgency, unread_links)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (user_id, client_id) do nothing returning id`,
    [
      userId,
      draft.clientId,
      draft.body,
      JSON.stringify(draft.proposed),
      draft.dueDate,
      draft.importance,
      draft.urgency,
      draft.unreadLinks,
    ],
  );
  return rows[0]?.id ?? null;
}

export type NoteChange = {
  body?: string;
  status?: NoteStatus;
  dueDate?: string | null;
  importance?: Importance | null;
  urgency?: Urgency | null;
  /** `null` clears it. */
  proposed?: null;
  unreadLinks?: string[];
};

const COLUMNS = {
  body: 'body',
  status: 'status',
  dueDate: 'due_date',
  importance: 'importance',
  urgency: 'urgency',
  proposed: 'proposed',
  unreadLinks: 'unread_links',
} satisfies Record<keyof NoteChange, string>;

export async function updateNote(db: Queryable, id: string, change: NoteChange): Promise<void> {
  const sets: string[] = ['updated_at = now()'];
  const values: unknown[] = [id];
  for (const key of Object.keys(COLUMNS) as (keyof NoteChange)[]) {
    const value = change[key];
    if (value === undefined) continue;
    values.push(value);
    sets.push(`${COLUMNS[key]} = $${values.length}`);
  }
  await db.query(`update notes set ${sets.join(', ')} where id = $1`, values);
}

/** Soft-delete (`deleted: true`) or restore a note. False when no note of that state is the user's. */
export async function setDeleted(
  db: Queryable,
  userId: string,
  id: string,
  deleted: boolean,
): Promise<boolean> {
  const { rowCount } = await db.query(
    `update notes set deleted_at = ${deleted ? 'now()' : 'null'}, updated_at = now()
     where id = $1 and user_id = $2 and (deleted_at is null) = $3`,
    [id, userId, deleted],
  );
  return (rowCount ?? 0) > 0;
}

/** Replace the note's links with exactly `links`. */
export async function replaceLinks(db: Queryable, noteId: string, links: Links): Promise<void> {
  await db.query('delete from note_categories where note_id = $1', [noteId]);
  await db.query('delete from note_tags where note_id = $1', [noteId]);
  await db.query(
    `insert into note_categories (note_id, category_id)
     select $1, unnest($2::uuid[]) on conflict do nothing`,
    [noteId, links.categoryIds],
  );
  await db.query(
    `insert into note_tags (note_id, tag_id) select $1, unnest($2::uuid[]) on conflict do nothing`,
    [noteId, links.tagIds],
  );
}

export type Audio = { mime: string; data: Buffer };

export async function insertAudio(db: Queryable, noteId: string, audio: Audio): Promise<void> {
  await db.query('insert into note_audio (note_id, mime, data) values ($1, $2, $3)', [
    noteId,
    audio.mime,
    audio.data,
  ]);
}

export async function findAudio(
  db: Queryable,
  userId: string,
  noteId: string,
): Promise<Audio | undefined> {
  const { rows } = await db.query<Audio>(
    `select a.mime, a.data from note_audio a join notes n on n.id = a.note_id
     where a.note_id = $1 and n.user_id = $2 and n.deleted_at is null`,
    [noteId, userId],
  );
  return rows[0];
}

/** Inserts a submitted note (status `todo`) with a server-made client id. Returns its id. */
export async function insertTodo(
  db: Queryable,
  userId: string,
  note: {
    body: string;
    dueDate: string | null;
    importance: Importance | null;
    urgency: Urgency | null;
    unreadLinks: string[];
  },
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into notes (user_id, client_id, body, status, due_date, importance, urgency, unread_links)
     values ($1, gen_random_uuid(), $2, 'todo', $3, $4, $5, $6) returning id`,
    [userId, note.body, note.dueDate, note.importance, note.urgency, note.unreadLinks],
  );
  const row = rows[0];
  if (!row) throw new Error('insert returned no row');
  return row.id;
}
