import { ImportAnalyze, ImportConfirm } from '@notes/shared';
import type { FastifyInstance } from 'fastify';
import type { Ai } from '../ai/provider';
import { currentUser } from '../auth';
import type { Db } from '../db';
import { analyzeImport } from '../domain/imports/analyze';
import { confirmImport } from '../domain/imports/confirm';
import type { LinkReader } from '../domain/links/preview';
import { isTodayPlausible } from '../domain/notes/note';
import { getTaxonomy } from '../domain/taxonomy/service';
import { llmRateLimit } from './rateLimit';

export function importsRoutes(app: FastifyInstance, db: Db, ai: Ai, links: LinkReader): void {
  // The default 1 MB body limit is plenty for 50 000 characters.
  app.post('/imports/analyze', { config: llmRateLimit }, async (req, reply) => {
    const body = ImportAnalyze.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_body' });
    if (!isTodayPlausible(body.data.today)) return reply.code(400).send({ error: 'invalid_today' });
    const taxonomy = await getTaxonomy(db, currentUser(req).id);
    const result = await analyzeImport(ai, links, taxonomy, body.data);
    if (!result.ok) return reply.code(502).send({ error: result.error });
    return result.value;
  });

  app.post('/imports/confirm', async (req, reply) => {
    const body = ImportConfirm.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_body' });
    const result = await confirmImport(db, currentUser(req).id, body.data);
    if (!result.ok) return reply.code(422).send({ error: result.error });
    return reply.code(201).send(result.value);
  });
}
