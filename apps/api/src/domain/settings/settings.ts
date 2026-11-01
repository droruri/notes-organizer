import {
  DEFAULT_NOTE_FORM,
  DEFAULT_QUICK_ACTIONS,
  DEFAULT_NOTE_SORT,
  NoteForm,
  NoteSort,
  QuickAction,
  type Settings,
  type SettingsPatch,
} from '@notes/shared';
import { z } from 'zod';
import type { Db } from '../../db';
import { log, timed } from '../../requestLog';

type SettingsRow = { note_sort: string | null; note_form: unknown; quick_actions: unknown };

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
  const quick = z.array(QuickAction).safeParse(row?.quick_actions);
  if (row && row.quick_actions != null && !quick.success) {
    log().warn({ field: 'quickActions' }, 'stored settings invalid');
  }
  return {
    quickActions: quick.success ? quick.data : [...DEFAULT_QUICK_ACTIONS],
    noteSort: sort.success ? sort.data : DEFAULT_NOTE_SORT,
    noteForm: form.success ? form.data : DEFAULT_NOTE_FORM,
  };
}

export async function getSettings(db: Db, userId: string): Promise<Settings> {
  const { rows } = await db.query<SettingsRow>(
    'select note_sort, note_form, quick_actions from user_settings where user_id = $1',
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
      `insert into user_settings (user_id, note_sort, note_form, quick_actions)
         values ($1, coalesce($2, 'urgency'), $3::jsonb, $4::jsonb)
       on conflict (user_id) do update
         set note_sort = coalesce($2, user_settings.note_sort),
             note_form = coalesce($3::jsonb, user_settings.note_form),
             quick_actions = coalesce($4::jsonb, user_settings.quick_actions)
       returning note_sort, note_form, quick_actions`,
      [
        userId,
        patch.noteSort ?? null,
        patch.noteForm === undefined ? null : JSON.stringify(patch.noteForm),
        patch.quickActions === undefined ? null : JSON.stringify(patch.quickActions),
      ],
    );
    const changed = Object.entries(patch)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key);
    log().info({ changed }, 'settings saved');
    return fromRow(rows[0]);
  });
}
