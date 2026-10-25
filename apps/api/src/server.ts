import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { createPool, type Db } from './db';
import { healthRoutes } from './routes/health';

// Wiring only: build the app, register routes, read env. Domain logic lives in src/domain/<area>/.

const DEFAULT_WEB_ORIGIN = 'http://localhost:5173';

export function buildServer({
  db,
  webOrigin = DEFAULT_WEB_ORIGIN,
  logger = false,
}: {
  db: Db;
  webOrigin?: string;
  /** Request logging; off by default so tests stay silent. */
  logger?: boolean;
}): FastifyInstance {
  const app = Fastify({ logger });
  void app.register(cors, { origin: webOrigin });
  healthRoutes(app, db);
  return app;
}

const Env = z.object({
  DATABASE_URL: z.string().min(1),
  WEB_ORIGIN: z.url(),
  PORT: z.coerce.number().int().positive().default(3000),
});

async function main(): Promise<void> {
  const env = Env.safeParse(process.env);
  if (!env.success) {
    console.error(`Invalid environment:\n${z.prettifyError(env.error)}`);
    process.exit(1);
  }
  const app = buildServer({
    db: createPool(env.data.DATABASE_URL),
    webOrigin: env.data.WEB_ORIGIN,
    logger: true,
  });
  await app.listen({ port: env.data.PORT, host: '0.0.0.0' });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
