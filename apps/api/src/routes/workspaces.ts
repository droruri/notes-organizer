import { WorkspaceCreate } from '@notes/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { currentUser } from '../auth';
import type { Db } from '../db';
import * as service from '../domain/workspaces/service';

const STATUS: Record<service.Failure, number> = {
  invalid_name: 400,
  name_taken: 409,
};

function send<T>(reply: FastifyReply, result: service.Result<T>, okCode = 200): FastifyReply {
  if (!result.ok) return reply.code(STATUS[result.error]).send({ error: result.error });
  return reply.code(okCode).send(result.value);
}

export function workspacesRoutes(app: FastifyInstance, db: Db): void {
  app.get('/workspaces', async (req) => service.listWorkspaces(db, currentUser(req).id));

  app.post('/workspaces', async (req, reply) => {
    const body = WorkspaceCreate.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_body' });
    return send(reply, await service.createWorkspace(db, currentUser(req).id, body.data.name), 201);
  });
}
