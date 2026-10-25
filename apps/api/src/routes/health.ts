import type { HealthResponse } from '@notes/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db';

const HealthQuery = z.object({ deep: z.string().optional() });

/** `/health` is cheap (no DB); `/health?deep=1` also runs one trivial query. */
export function healthRoutes(app: FastifyInstance, db: Db): void {
  app.get('/health', async (req, reply): Promise<HealthResponse> => {
    const query = HealthQuery.safeParse(req.query);
    if (!query.success || query.data.deep !== '1') return { ok: true };

    try {
      await db.query('select 1');
      return { ok: true, db: true };
    } catch (err) {
      req.log.error({ err }, 'deep health check: database query failed');
      return reply.code(503).send({ ok: false, db: false });
    }
  });
}
