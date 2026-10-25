import { NoteAnalyze, NoteCreate, NoteEdit } from '@notes/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Ai } from '../ai/provider';
import { currentUser } from '../auth';
import type { Db } from '../db';
import { isTodayPlausible } from '../domain/notes/note';
import * as service from '../domain/notes/service';

const STATUS: Record<service.Failure, number> = {
  not_found: 404,
  invalid_transition: 422,
  unknown_taxonomy: 422,
};

const Params = z.object({ id: z.uuid() });

export function notesRoutes(app: FastifyInstance, db: Db, ai: Ai): void {
  app.get('/notes', async (req) => service.listNotes(db, currentUser(req).id));

  app.post('/notes', async (req, reply) => {
    const body = NoteCreate.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_body' });
    if (!isTodayPlausible(body.data.today)) return reply.code(400).send({ error: 'invalid_today' });
    const { created, note, suggestion } = await service.createDraft(
      db,
      ai,
      currentUser(req).id,
      body.data,
    );
    return reply.code(created ? 201 : 200).send({ note, suggestion });
  });

  app.patch('/notes/:id', async (req, reply) => {
    const params = Params.safeParse(req.params);
    // A malformed id can never match a row.
    if (!params.success) return reply.code(404).send({ error: 'not_found' });
    const body = NoteEdit.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_body' });
    const result = await service.updateNote(db, currentUser(req).id, params.data.id, body.data);
    if (!result.ok) return reply.code(STATUS[result.error]).send({ error: result.error });
    return result.value;
  });
  app.delete('/notes/:id', async (req, reply) => {
    const params = Params.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: 'not_found' });
    const result = await service.deleteNote(db, currentUser(req).id, params.data.id);
    if (!result.ok) return reply.code(STATUS[result.error]).send({ error: result.error });
    return reply.code(204).send();
  });

  app.post('/notes/:id/restore', async (req, reply) => {
    const params = Params.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: 'not_found' });
    const result = await service.restoreNote(db, currentUser(req).id, params.data.id);
    if (!result.ok) return reply.code(STATUS[result.error]).send({ error: result.error });
    return result.value;
  });

  app.post('/notes/:id/analyze', async (req, reply) => {
    const params = Params.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: 'not_found' });
    const body = NoteAnalyze.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_body' });
    if (!isTodayPlausible(body.data.today)) return reply.code(400).send({ error: 'invalid_today' });
    const result = await service.analyzeNote(
      db,
      ai,
      currentUser(req).id,
      params.data.id,
      body.data,
    );
    if (!result.ok) return reply.code(STATUS[result.error]).send({ error: result.error });
    return result.value;
  });
}
