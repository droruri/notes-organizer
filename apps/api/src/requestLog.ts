import type {
  FastifyBaseLogger,
  FastifyInstance,
  FastifyRequest,
  FastifyServerOptions,
} from 'fastify';
import { AsyncLocalStorage } from 'node:async_hooks';
import { z } from 'zod';

// Privacy: never log note bodies, prompts, transcripts, chat messages, tokens or emails — only
// ids, counts, lengths, durations, failure codes, hostnames.

/** `LOG_LEVEL`: a pino level, default `info`. */
export const LogEnv = z.object({
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

const requests = new AsyncLocalStorage<FastifyRequest>();

const silent: FastifyBaseLogger = {
  level: 'silent',
  fatal: () => {},
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
  trace: () => {},
  silent: () => {},
  child: () => silent,
};

/** The current request's logger; a silent one outside a request (unit tests). */
export function log(): FastifyBaseLogger {
  return requests.getStore()?.log ?? silent;
}

/** Adds fields to every later line of the request (e.g. `userId`). */
export function addLogFields(req: FastifyRequest, fields: Record<string, unknown>): void {
  req.log = req.log.child(fields);
}

/** Name and code only: a message or stack can echo note text or provider payloads. */
export function errorSummary(err: unknown): { name: string; code?: string } {
  if (!(err instanceof Error)) return { name: 'unknown' };
  const code = Reflect.get(err, 'code');
  return typeof code === 'string' ? { name: err.name, code } : { name: err.name };
}

/** Runs `fn` with `debug` start/end lines (`ms` on end); on throw logs `error` with `err` + `ms`, rethrows. */
export async function timed<T>(
  name: string,
  fields: Record<string, unknown>,
  fn: () => Promise<T>,
): Promise<T> {
  const logger = log();
  const started = performance.now();
  logger.debug({ ...fields }, `${name} start`);
  try {
    const result = await fn();
    logger.debug({ ...fields, ms: Math.round(performance.now() - started) }, `${name} end`);
    return result;
  } catch (err) {
    const ms = Math.round(performance.now() - started);
    logger.error({ ...fields, err: errorSummary(err), ms }, `${name} failed`);
    throw err;
  }
}

/** Fastify's request line without its query string: `/links/preview?url=…` carries a pasted link. */
export function withoutQueryInRequestLog(
  logger: NonNullable<FastifyServerOptions['logger']>,
): NonNullable<FastifyServerOptions['logger']> {
  if (typeof logger !== 'object' || logger === null || 'child' in logger) return logger;
  return {
    ...logger,
    serializers: {
      ...logger.serializers,
      req: (req: { method: string; url: string }) => ({
        method: req.method,
        url: req.url.replace(/\?.*$/, ''),
      }),
    },
  };
}

/** Registers the hooks that make `log()` work and log every 4xx/5xx JSON `error` body. */
export function registerRequestLogging(app: FastifyInstance): void {
  app.addHook('onRequest', (req, _reply, done) => {
    requests.run(req, done);
  });
  app.addHook('preSerialization', async (req, reply, payload) => {
    if (reply.statusCode >= 400 && typeof payload === 'object' && payload !== null) {
      const error: unknown = Reflect.get(payload, 'error');
      if (typeof error === 'string') {
        req.log.info({ status: reply.statusCode, error }, 'request rejected');
      }
    }
    return payload;
  });
}
