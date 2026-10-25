import { AddUserBody, UserRoleBody } from '@notes/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { currentUser } from '../auth';
import type { Db } from '../db';
import { addUser, listUsers, removeUser, setAdmin } from '../domain/users/users';

async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  if (!currentUser(req).isAdmin) return reply.code(403).send({ error: 'not_admin' });
  return undefined;
}

export function usersRoutes(app: FastifyInstance, db: Db): void {
  app.get('/me', async (req) => {
    const { email, isAdmin } = currentUser(req);
    return { email: email.toLowerCase(), isAdmin };
  });

  // Admin-only; these never touch notes or taxonomy.
  void app.register(async (admin) => {
    admin.addHook('onRequest', requireAdmin);

    admin.get('/users', async () => listUsers(db));

    admin.post('/users', async (req, reply) => {
      const body = AddUserBody.safeParse(req.body);
      if (!body.success) return reply.code(422).send({ error: 'invalid_email' });
      const result = await addUser(db, currentUser(req).id, {
        email: body.data.email,
        isAdmin: body.data.isAdmin ?? false,
      });
      if (result.ok) return reply.code(201).send(result.user);
      return reply.code(result.error === 'exists' ? 409 : 422).send({ error: result.error });
    });

    admin.patch<{ Params: { email: string } }>('/users/:email', async (req, reply) => {
      const body = UserRoleBody.safeParse(req.body);
      if (!body.success) return reply.code(422).send({ error: 'invalid_body' });
      const result = await setAdmin(
        db,
        currentUser(req).email,
        req.params.email,
        body.data.isAdmin,
      );
      if (result.ok) return result.value;
      return reply.code(result.error === 'not_found' ? 404 : 422).send({ error: result.error });
    });

    admin.delete<{ Params: { email: string } }>('/users/:email', async (req, reply) => {
      const result = await removeUser(db, currentUser(req).email, req.params.email);
      if (result.ok) return reply.code(204).send();
      return reply.code(result.error === 'not_found' ? 404 : 422).send({ error: result.error });
    });
  });
}
