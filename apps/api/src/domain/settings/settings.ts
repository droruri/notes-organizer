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

type SettingsRow = { note_sort: string | null; note_form: unknown };

/** Parse a stored row into settings. Null columns mean defaults; a present but invalid value is warned. */
function fromRow(row: SettingsRow | undefined): Settings {
  const sort = NoteSort.safeParse(row?.note_sort);
  const form = NoteForm.safeParse(row?.note_form);
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

export async function getSettings(db: Db, userId: string): Promise<Settings> {
  const { rows } = await db.query<SettingsRow>(
    'select note_sort, note_form from user_settings where user_id = $1',
    [userId],
  );
  return fromRow(rows[0]);
}

/**
 * Write only the defined keys of `patch` in one statement, so a concurrent save of the other key
 * is not overwritten, and return what is stored.
 */
export function saveSettings(db: Db, userId: string, patch: SettingsPatch): Promise<Settings> {
  return timed('saveSettings', {}, async () => {
    const { rows } = await db.query<SettingsRow>(
      `insert into user_settings (user_id, note_sort, note_form)
         values ($1, coalesce($2, 'urgency'), $3::jsonb)
       on conflict (user_id) do update
         set note_sort = coalesce($2, user_settings.note_sort),
             note_form = coalesce($3::jsonb, user_settings.note_form)
       returning note_sort, note_form`,
      [
        userId,
        patch.noteSort ?? null,
        patch.noteForm === undefined ? null : JSON.stringify(patch.noteForm),
      ],
    );
    const changed = Object.entries(patch)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key);
    log().info({ changed }, 'settings saved');
    return fromRow(rows[0]);
  });
}
