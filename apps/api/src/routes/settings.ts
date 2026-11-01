import { SettingsPatch, type Settings } from '@notes/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { currentUser } from '../auth';
import type { Db } from '../db';
import { getSettings, saveSettings } from '../domain/settings/settings';

export function settingsRoutes(app: FastifyInstance, db: Db): void {
  app.get('/settings', async (req): Promise<Settings> => getSettings(db, currentUser(req).id));

  app.put('/settings', async (req, reply): Promise<Settings | FastifyReply> => {
    const body = SettingsPatch.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_body' });
    return saveSettings(db, currentUser(req).id, body.data);
  });
}
