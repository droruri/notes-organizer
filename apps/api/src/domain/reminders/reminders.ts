import { noteHeading } from '@notes/shared';
import type { Db } from '../../db';
import type { Push } from '../../push/provider';
import { log, timed } from '../../requestLog';

/** Most pushes one run may send; the next run (5 minutes later) picks up the rest. */
export const MAX_SENDS_PER_RUN = 200;
const MAX_TITLE = 80;

export type RemindersResult = { sent: number; gone: number };

type Candidate = {
  note_id: string;
  slot: string;
  title: string | null;
  body: string;
  user_id: string;
};

// Due today in the user's own timezone, at or after their reminder hour. Only open, live,
// unsnoozed notes of users with a device. Bad timezones never reach pg (filtered by name).
const DUE_SQL = `
  with s as materialized (
    select user_id, timezone, reminder_hour from user_settings
     where timezone in (select name from pg_timezone_names)
  )
  select n.id as note_id, n.due_date::text as slot, n.title, n.body, n.user_id
    from notes n
    join s on s.user_id = n.user_id
   where n.deleted_at is null
     and (n.status is null or n.status in ('todo', 'in_progress'))
     and (n.snoozed_until is null or n.snoozed_until <= ($1::timestamptz at time zone s.timezone)::date)
     and n.due_date = ($1::timestamptz at time zone s.timezone)::date
     and extract(hour from ($1::timestamptz at time zone s.timezone)) >= coalesce(s.reminder_hour, 8)
     and not exists (select 1 from reminder_sends r
                      where r.note_id = n.id and r.kind = 'due' and r.slot = n.due_date::text)
     and exists (select 1 from push_subscriptions p where p.user_id = n.user_id)
   order by n.due_date, n.id
   limit $2`;

/** Users who have a device but a timezone Postgres doesn't know: counted, never logged by name. */
const BAD_TZ_SQL = `
  select s.user_id
    from user_settings s
   where s.timezone is not null
     and s.timezone not in (select name from pg_timezone_names)
     and exists (select 1 from push_subscriptions p where p.user_id = s.user_id)`;

/**
 * Sends one push per due-today note, exactly once per due date: the `reminder_sends` row is
 * claimed before sending, so overlapping runs and retries cannot double-send.
 */
export function runReminders(db: Db, push: Push, now: Date): Promise<RemindersResult> {
  return timed('runReminders', {}, async () => {
    const started = performance.now();
    const bad = await db.query<{ user_id: string }>(BAD_TZ_SQL);
    for (const _row of bad.rows) log().warn({}, 'reminder candidate skipped');

    const due = await db.query<Candidate>(DUE_SQL, [now.toISOString(), MAX_SENDS_PER_RUN]);
    let sent = 0;
    let gone = 0;
    for (const c of due.rows) {
      if (sent >= MAX_SENDS_PER_RUN) break;
      const subs = await db.query<{ id: string; endpoint: string; p256dh: string; auth: string }>(
        'select id, endpoint, p256dh, auth from push_subscriptions where user_id = $1',
        [c.user_id],
      );
      // Check the cap before claiming: a claimed slot with no send would never be retried.
      if (sent + subs.rows.length > MAX_SENDS_PER_RUN) break;
      const claim = await db.query(
        `insert into reminder_sends (note_id, kind, slot) values ($1, 'due', $2)
         on conflict do nothing returning note_id`,
        [c.note_id, c.slot],
      );
      if (claim.rowCount === 0) continue;
      const title = Array.from(noteHeading({ title: c.title, body: c.body }).text)
        .slice(0, MAX_TITLE)
        .join('');
      const goneIds: string[] = [];
      for (const sub of subs.rows) {
        const result = await push.send(sub, { kind: 'due', noteId: c.note_id, title });
        if (result.ok) sent += 1;
        else if (result.gone) goneIds.push(sub.id);
      }
      if (goneIds.length > 0) {
        await db.query('delete from push_subscriptions where id = any($1::uuid[])', [goneIds]);
        gone += goneIds.length;
      }
    }
    log().info(
      { due: due.rows.length, sent, gone, ms: Math.round(performance.now() - started) },
      'reminders run',
    );
    return { sent, gone };
  });
}
