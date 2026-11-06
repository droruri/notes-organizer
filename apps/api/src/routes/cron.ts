import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Db } from '../db';
import { runReminders } from '../domain/reminders/reminders';
import type { Push } from '../push/provider';
import { log } from '../requestLog';

function secretMatches(given: unknown, expected: string): boolean {
  if (typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Called by cron-job.org; sits outside the signed-in scope and checks `x-cron-secret` itself. */
export function cronRoutes(
  app: FastifyInstance,
  db: Db,
  push: Push,
  cronSecret: string | undefined,
  now: () => Date = () => new Date(),
): void {
  app.post('/cron/reminders', async (req, reply): Promise<FastifyReply | object> => {
    if (!cronSecret) {
      log().warn({ status: 503 }, 'cron rejected');
      return reply.code(503).send({ error: 'cron_disabled' });
    }
    if (!secretMatches(req.headers['x-cron-secret'], cronSecret)) {
      log().warn({ status: 401 }, 'cron rejected');
      return reply.code(401).send({ error: 'unauthorized' });
    }
    if (!push.enabled) return { sent: 0, gone: 0, disabled: true };
    const result = await runReminders(db, push, now());
    return { ...result, disabled: false };
  });
}
