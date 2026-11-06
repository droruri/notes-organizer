import type { PushSubscriptionBody, PushTestResult } from '@notes/shared';
import type { Db } from '../../db';
import type { Push } from '../../push/provider';
import { log, timed } from '../../requestLog';

/** Upsert by endpoint: a re-subscribe on a shared device moves ownership to the caller. */
export function saveSubscription(
  db: Db,
  userId: string,
  body: PushSubscriptionBody,
): Promise<void> {
  return timed('saveSubscription', {}, async () => {
    await db.query(
      `insert into push_subscriptions (user_id, endpoint, p256dh, auth)
         values ($1, $2, $3, $4)
       on conflict (endpoint) do update
         set user_id = $1, p256dh = $3, auth = $4`,
      [userId, body.endpoint, body.keys.p256dh, body.keys.auth],
    );
    const { rows } = await db.query<{ count: number }>(
      'select count(*)::int as count from push_subscriptions where user_id = $1',
      [userId],
    );
    log().info({ count: rows[0]?.count ?? 0 }, 'push subscribed');
  });
}

/** Deletes only the caller's row; another user's endpoint is untouched. */
export function deleteSubscription(db: Db, userId: string, endpoint: string): Promise<void> {
  return timed('deleteSubscription', {}, async () => {
    const { rowCount } = await db.query(
      'delete from push_subscriptions where user_id = $1 and endpoint = $2',
      [userId, endpoint],
    );
    log().info({ count: rowCount ?? 0 }, 'push unsubscribed');
  });
}

type SubRow = { id: string; endpoint: string; p256dh: string; auth: string };

/** Sends "Test reminder" to every device of the caller; dead ones are deleted. */
export function sendTest(
  db: Db,
  push: Push,
  userId: string,
  title: string,
): Promise<PushTestResult> {
  return timed('sendTest', {}, async () => {
    const { rows } = await db.query<SubRow>(
      'select id, endpoint, p256dh, auth from push_subscriptions where user_id = $1',
      [userId],
    );
    let sent = 0;
    const goneIds: string[] = [];
    for (const row of rows) {
      const result = await push.send(row, { kind: 'test', title });
      if (result.ok) sent += 1;
      else if (result.gone) goneIds.push(row.id);
    }
    if (goneIds.length > 0) {
      await db.query('delete from push_subscriptions where id = any($1::uuid[])', [goneIds]);
    }
    log().info({ sent, gone: goneIds.length }, 'push test sent');
    return { sent, gone: goneIds.length };
  });
}
