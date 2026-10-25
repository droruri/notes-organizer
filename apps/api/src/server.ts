import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { MAX_AUDIO_BYTES } from '@notes/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { AiEnv, createAi, type Ai } from './ai/provider';
import { createTokenVerifier, parseAllowedEmails, requireUser, type VerifyToken } from './auth';
import { createPool, type Db } from './db';
import { createLinkReader, LinkEnv, type LinkReader } from './domain/links/preview';
import { chatRoutes } from './routes/chat';
import { healthRoutes } from './routes/health';
import { linksRoutes } from './routes/links';
import { notesRoutes } from './routes/notes';
import { settingsRoutes } from './routes/settings';
import { taxonomyRoutes } from './routes/taxonomy';

// Wiring only: build the app, register routes, read env. Domain logic lives in src/domain/<area>/.

const DEFAULT_WEB_ORIGIN = 'http://localhost:5173';

export function buildServer({
  db,
  ai,
  links = createLinkReader(),
  verifyToken,
  allowedEmails,
  webOrigin = DEFAULT_WEB_ORIGIN,
  logger = false,
}: {
  db: Db;
  ai: Ai;
  /** Fetches links safely; defaults to the real network. */
  links?: LinkReader;
  verifyToken: VerifyToken;
  allowedEmails: ReadonlySet<string>;
  webOrigin?: string;
  /** Request logging; off by default so tests stay silent. */
  logger?: boolean;
}): FastifyInstance {
  const app = Fastify({ logger });
  void app.register(cors, { origin: webOrigin });
  healthRoutes(app, db);
  // Every route registered in this scope requires a signed-in, allowed user.
  void app.register(async (authed) => {
    authed.addHook('onRequest', requireUser(verifyToken, allowedEmails));
    await authed.register(rateLimit, { global: false });
    void authed.register(multipart, { limits: { fileSize: MAX_AUDIO_BYTES, files: 1 } });
    settingsRoutes(authed, db);
    taxonomyRoutes(authed, db);
    notesRoutes(authed, db, ai, links);
    linksRoutes(authed, links);
    chatRoutes(authed, db, ai, webOrigin);
  });
  return app;
}

const Env = AiEnv.and(LinkEnv).and(
  z.object({
    DATABASE_URL: z.string().min(1),
    WEB_ORIGIN: z.url(),
    SUPABASE_URL: z.url(),
    ALLOWED_EMAILS: z.string().min(1),
    PORT: z.coerce.number().int().positive().default(3000),
  }),
);

async function main(): Promise<void> {
  const env = Env.safeParse(process.env);
  if (!env.success) {
    console.error(`Invalid environment:\n${z.prettifyError(env.error)}`);
    process.exit(1);
  }
  const app = buildServer({
    db: createPool(env.data.DATABASE_URL),
    ai: createAi(env.data),
    links: createLinkReader({ jinaApiKey: env.data.JINA_API_KEY }),
    verifyToken: createTokenVerifier(env.data.SUPABASE_URL),
    allowedEmails: parseAllowedEmails(env.data.ALLOWED_EMAILS),
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
