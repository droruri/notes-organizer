import { Proposed, type Importance, type Note, type NoteStatus, type Urgency } from '@notes/shared';
import type { Queryable } from '../../db';
import type { Links } from './note';

// SQL for notes and their category/tag links.

type NoteRow = Omit<Note, 'proposed' | 'createdAt' | 'updatedAt'> & {
  proposed: unknown;
  createdAt: Date;
  updatedAt: Date;
};

const NOTE_SELECT = `
  select n.id, n.client_id as "clientId", n.body, n.status, n.importance, n.urgency,
    to_char(n.due_date, 'YYYY-MM-DD') as "dueDate", n.proposed,
    n.created_at as "createdAt", n.updated_at as "updatedAt",
    coalesce((select array_agg(nc.category_id::text) from note_categories nc where nc.note_id = n.id), '{}') as "categoryIds",
    coalesce((select array_agg(nt.tag_id::text) from note_tags nt where nt.note_id = n.id), '{}') as "tagIds"
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
  },
): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(
    `insert into notes (user_id, client_id, body, proposed, due_date, importance, urgency)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (user_id, client_id) do nothing returning id`,
    [
      userId,
      draft.clientId,
      draft.body,
      JSON.stringify(draft.proposed),
      draft.dueDate,
      draft.importance,
      draft.urgency,
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
};

const COLUMNS = {
  body: 'body',
  status: 'status',
  dueDate: 'due_date',
  importance: 'importance',
  urgency: 'urgency',
  proposed: 'proposed',
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
