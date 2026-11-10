import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { MAX_AUDIO_BYTES } from '@notes/shared';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { AiEnv, createAi, isFakeEnabled, withLogging, type Ai } from './ai/provider';
import { createTokenVerifier, parseAllowedEmails, requireUser, type VerifyToken } from './auth';
import { createPush, PushEnv, withPushLogging, createFakePush, type Push } from './push/provider';
import { createPool, type Db } from './db';
import { findAllowed, seedAdmins } from './domain/users/users';
import {
  createLinkReader,
  LinkEnv,
  withLinkLogging,
  type LinkReader,
} from './domain/links/preview';
import { LogEnv, registerRequestLogging, withoutQueryInRequestLog } from './requestLog';
import { attachmentsRoutes } from './routes/attachments';
import { chatRoutes } from './routes/chat';
import { cronRoutes } from './routes/cron';
import { healthRoutes } from './routes/health';
import { importsRoutes } from './routes/imports';
import { linksRoutes } from './routes/links';
import { notesRoutes } from './routes/notes';
import { pushRoutes } from './routes/push';
import { settingsRoutes } from './routes/settings';
import { taxonomyRoutes } from './routes/taxonomy';
import { usersRoutes } from './routes/users';
import { workspacesRoutes } from './routes/workspaces';

// Wiring only: build the app, register routes, read env. Domain logic lives in src/domain/<area>/.

const DEFAULT_WEB_ORIGIN = 'http://localhost:5173';

export function buildServer({
  db,
  ai: rawAi,
  links: rawLinks = createLinkReader(),
  push: rawPush = createFakePush(),
  cronSecret,
  now,
  verifyToken,
  allowedEmails,
  webOrigin = DEFAULT_WEB_ORIGIN,
  logger = false,
  rateLimited = true,
}: {
  db: Db;
  ai: Ai;
  /** Fetches links safely; defaults to the real network. */
  links?: LinkReader;
  /** Sends Web Push; defaults to a fake that records sends. */
  push?: Push;
  /** `x-cron-secret` for `/cron/*`; unset means those routes answer 503. */
  cronSecret?: string | undefined;
  /** Clock for the reminder cron; tests fix it. */
  now?: () => Date;
  verifyToken: VerifyToken;
  /** Bootstrap admins: inserted into `allowed_users` on startup, never removed. */
  allowedEmails: ReadonlySet<string>;
  webOrigin?: string;
  /** Fastify logger options (`{ level, stream }`); off by default so tests stay silent. */
  logger?: FastifyServerOptions['logger'];
  /** Per-user limits on the LLM and push routes; only the e2e run (`RATE_LIMIT=off`) turns them off. */
  rateLimited?: boolean;
}): FastifyInstance {
  const ai = withLogging(rawAi);
  const links = withLinkLogging(rawLinks);
  const push = withPushLogging(rawPush);
  const app = Fastify({ logger: withoutQueryInRequestLog(logger) });
  registerRequestLogging(app);
  // Seeds once; a failure is retried by the next request instead of locking the owner out.
  let seeding: Promise<void> | undefined;
  const seeded = () => {
    seeding ??= seedAdmins(db, [...allowedEmails]).catch((err: unknown) => {
      seeding = undefined;
      throw err;
    });
    return seeding;
  };
  app.addHook('onReady', async () => {
    await seeded().catch((err: unknown) => app.log.error({ err }, 'seeding admins failed'));
  });
  // @fastify/cors v11 allows only GET/HEAD/POST by default; routes also use PUT/PATCH/DELETE.
  void app.register(cors, {
    origin: webOrigin,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
  healthRoutes(app, db);
  cronRoutes(app, db, push, cronSecret, now);
  // Every route registered in this scope requires a signed-in, allowed user.
  void app.register(async (authed) => {
    authed.addHook(
      'onRequest',
      requireUser(verifyToken, async (email) => {
        await seeded();
        return findAllowed(db, email);
      }),
    );
    // The route limits merge this allowList in, so `false` lets every request through.
    await authed.register(rateLimit, {
      global: false,
      ...(rateLimited ? {} : { allowList: () => true }),
    });
    void authed.register(multipart, { limits: { fileSize: MAX_AUDIO_BYTES, files: 1 } });
    usersRoutes(authed, db);
    settingsRoutes(authed, db);
    pushRoutes(authed, db, push);
    taxonomyRoutes(authed, db);
    workspacesRoutes(authed, db);
    notesRoutes(authed, db, ai, links);
    attachmentsRoutes(authed, db);
    importsRoutes(authed, db, ai, links);
    linksRoutes(authed, links);
    chatRoutes(authed, db, ai, webOrigin);
  });
  return app;
}

const Env = AiEnv.and(LinkEnv)
  .and(PushEnv)
  .and(LogEnv)
  .and(
    z.object({
      DATABASE_URL: z.string().min(1),
      WEB_ORIGIN: z.url(),
      SUPABASE_URL: z.url(),
      ALLOWED_EMAILS: z.string().min(1),
      // An empty line (`CRON_SECRET=`) means unset, not a failed boot.
      CRON_SECRET: z.string().optional(),
      PORT: z.coerce.number().int().positive().default(3000),
      // `off` only for the e2e run, where every spec shares one dev user.
      RATE_LIMIT: z.enum(['on', 'off']).default('on'),
    }),
  )
  .refine((env) => env.RATE_LIMIT === 'on' || isFakeEnabled(env.AI_FAKE), {
    message: 'RATE_LIMIT=off is only allowed with AI_FAKE=1 (e2e)',
    path: ['RATE_LIMIT'],
  });

async function main(): Promise<void> {
  const env = Env.safeParse(process.env);
  if (!env.success) {
    console.error(`Invalid environment:\n${z.prettifyError(env.error)}`);
    process.exit(1);
  }
  const push = createPush(env.data);
  const app = buildServer({
    db: createPool(env.data.DATABASE_URL),
    push,
    cronSecret: env.data.CRON_SECRET || undefined,
    ai: createAi(env.data),
    links: createLinkReader({ jinaApiKey: env.data.JINA_API_KEY }),
    verifyToken: createTokenVerifier(env.data.SUPABASE_URL),
    allowedEmails: parseAllowedEmails(env.data.ALLOWED_EMAILS),
    webOrigin: env.data.WEB_ORIGIN,
    logger: { level: env.data.LOG_LEVEL },
    rateLimited: env.data.RATE_LIMIT === 'on',
  });
  if (!push.enabled) app.log.warn('push disabled: no VAPID keys');
  if (env.data.RATE_LIMIT === 'off') app.log.warn('rate limits disabled: RATE_LIMIT=off');
  await app.listen({ port: env.data.PORT, host: '0.0.0.0' });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
