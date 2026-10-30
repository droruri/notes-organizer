import { ActionsBody, ImportanceBody, NameBody } from '@notes/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { currentUser } from '../auth';
import type { Db } from '../db';
import { applyActions } from '../domain/taxonomy/actions';
import * as service from '../domain/taxonomy/service';

const STATUS: Record<service.Failure, number> = {
  invalid_name: 400,
  not_found: 404,
  name_taken: 409,
  category_deleted: 422,
};

const Params = z.object({ id: z.uuid() });

function send<T>(reply: FastifyReply, result: service.Result<T>, okCode = 200): FastifyReply {
  if (!result.ok) return reply.code(STATUS[result.error]).send({ error: result.error });
  if (okCode === 204) return reply.code(204).send();
  return reply.code(okCode).send(result.value);
}

export function taxonomyRoutes(app: FastifyInstance, db: Db): void {
  /** Parse `:id` and, when `withName`, the `{name}` body; answers 400/404 itself on failure. */
  function parse(
    req: { params: unknown; body: unknown },
    reply: FastifyReply,
    withName: boolean,
  ): { id: string; name: string } | undefined {
    const params = Params.safeParse(req.params);
    // A malformed id can never match a row.
    if (!params.success) {
      void reply.code(404).send({ error: 'not_found' });
      return undefined;
    }
    if (!withName) return { id: params.data.id, name: '' };
    const body = NameBody.safeParse(req.body);
    if (!body.success) {
      void reply.code(400).send({ error: 'invalid_body' });
      return undefined;
    }
    return { id: params.data.id, name: body.data.name };
  }

  app.get('/taxonomy', async (req) => service.getTaxonomy(db, currentUser(req).id));

  app.post('/taxonomy/actions', async (req, reply) => {
    const body = ActionsBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_body' });
    return { results: await applyActions(db, currentUser(req).id, body.data.actions) };
  });

  app.post('/categories', async (req, reply) => {
    const body = NameBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_body' });
    return send(reply, await service.createCategory(db, currentUser(req).id, body.data.name), 201);
  });

  app.patch('/categories/:id', async (req, reply) => {
    const p = parse(req, reply, true);
    if (!p) return reply;
    return send(reply, await service.renameCategory(db, currentUser(req).id, p.id, p.name));
  });

  app.delete('/categories/:id', async (req, reply) => {
    const p = parse(req, reply, false);
    if (!p) return reply;
    return send(reply, await service.setCategoryDeleted(db, currentUser(req).id, p.id, true), 204);
  });

  app.put('/categories/:id/importance', async (req, reply) => {
    const p = parse(req, reply, false);
    if (!p) return reply;
    const body = ImportanceBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_body' });
    return send(
      reply,
      await service.setCategoryImportance(db, currentUser(req).id, p.id, body.data.importance),
    );
  });

  app.post('/categories/:id/restore', async (req, reply) => {
    const p = parse(req, reply, false);
    if (!p) return reply;
    return send(reply, await service.setCategoryDeleted(db, currentUser(req).id, p.id, false));
  });

  app.post('/categories/:id/tags', async (req, reply) => {
    const p = parse(req, reply, true);
    if (!p) return reply;
    return send(reply, await service.createTag(db, currentUser(req).id, p.id, p.name), 201);
  });

  app.patch('/tags/:id', async (req, reply) => {
    const p = parse(req, reply, true);
    if (!p) return reply;
    return send(reply, await service.renameTag(db, currentUser(req).id, p.id, p.name));
  });

  app.delete('/tags/:id', async (req, reply) => {
    const p = parse(req, reply, false);
    if (!p) return reply;
    return send(reply, await service.setTagDeleted(db, currentUser(req).id, p.id, true), 204);
  });

  app.post('/tags/:id/restore', async (req, reply) => {
    const p = parse(req, reply, false);
    if (!p) return reply;
    return send(reply, await service.setTagDeleted(db, currentUser(req).id, p.id, false));
  });
}
