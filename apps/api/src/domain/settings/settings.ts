import {
  DEFAULT_NOTE_FORM,
  DEFAULT_NOTE_SORT,
  NoteForm,
  NoteSort,
  type Settings,
  type SettingsPatch,
} from '@notes/shared';
import type { Db } from '../../db';
import { log, timed } from '../../requestLog';

export async function getSettings(db: Db, userId: string): Promise<Settings> {
  const { rows } = await db.query<{ note_sort: string | null; note_form: unknown }>(
    'select note_sort, note_form from user_settings where user_id = $1',
    [userId],
  );
  const row = rows[0];
  const sort = NoteSort.safeParse(row?.note_sort);
  const form = NoteForm.safeParse(row?.note_form);
  // No row, or a null column, means defaults; only a present but unparsable value is a warning.
  if (row && row.note_sort != null && !sort.success) {
    log().warn({ field: 'noteSort' }, 'stored settings invalid');
  }
  if (row && row.note_form != null && !form.success) {
    log().warn({ field: 'noteForm' }, 'stored settings invalid');
  }
  return {
    noteSort: sort.success ? sort.data : DEFAULT_NOTE_SORT,
    noteForm: form.success ? form.data : DEFAULT_NOTE_FORM,
  };
}

/** Merge the defined keys of `patch` into the stored settings and return the result. */
export function saveSettings(db: Db, userId: string, patch: SettingsPatch): Promise<Settings> {
  return timed('saveSettings', {}, async () => {
    const current = await getSettings(db, userId);
    const merged: Settings = {
      noteSort: patch.noteSort ?? current.noteSort,
      noteForm: patch.noteForm ?? current.noteForm,
    };
    await db.query(
      `insert into user_settings (user_id, note_sort, note_form) values ($1, $2, $3)
       on conflict (user_id) do update
         set note_sort = excluded.note_sort, note_form = excluded.note_form`,
      [userId, merged.noteSort, JSON.stringify(merged.noteForm)],
    );
    log().info(
      { changed: Object.keys(patch).filter((k) => patch[k as keyof SettingsPatch] !== undefined) },
      'settings saved',
    );
    return merged;
  });
}
