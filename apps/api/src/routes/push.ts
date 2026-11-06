import { PushSubscriptionBody, PushUnsubscribeBody, type PushTestResult } from '@notes/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { currentUser } from '../auth';
import type { Db } from '../db';
import { deleteSubscription, saveSubscription, sendTest } from '../domain/reminders/subscriptions';
import type { Push } from '../push/provider';
import { pushTestRateLimit } from './rateLimit';

export function pushRoutes(app: FastifyInstance, db: Db, push: Push): void {
  app.post('/push/subscriptions', async (req, reply): Promise<FastifyReply> => {
    const body = PushSubscriptionBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_body' });
    await saveSubscription(db, currentUser(req).id, body.data);
    return reply.code(204).send();
  });

  app.delete('/push/subscriptions', async (req, reply): Promise<FastifyReply> => {
    const body = PushUnsubscribeBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_body' });
    await deleteSubscription(db, currentUser(req).id, body.data.endpoint);
    return reply.code(204).send();
  });

  app.post(
    '/push/test',
    { config: pushTestRateLimit },
    async (req, reply): Promise<PushTestResult | FastifyReply> => {
      if (!push.enabled) return reply.code(503).send({ error: 'push_disabled' });
      return sendTest(db, push, currentUser(req).id, 'Test reminder');
    },
  );
}
