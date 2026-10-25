import { DEFAULT_NOTE_SORT, NoteSort, type Settings } from '@notes/shared';
import type { Db } from '../../db';

export async function getSettings(db: Db, userId: string): Promise<Settings> {
  const { rows } = await db.query<{ note_sort: string }>(
    'select note_sort from user_settings where user_id = $1',
    [userId],
  );
  const parsed = NoteSort.safeParse(rows[0]?.note_sort);
  return { noteSort: parsed.success ? parsed.data : DEFAULT_NOTE_SORT };
}

export async function saveSettings(db: Db, userId: string, settings: Settings): Promise<Settings> {
  await db.query(
    `insert into user_settings (user_id, note_sort) values ($1, $2)
     on conflict (user_id) do update set note_sort = excluded.note_sort`,
    [userId, settings.noteSort],
  );
  return settings;
}
