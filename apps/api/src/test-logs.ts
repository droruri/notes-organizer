import { Writable } from 'node:stream';
import { createFakeAi } from './ai/provider';
import type { VerifyToken } from './auth';
import { buildServer } from './server';
import { allowedEmails as defaultAllowed, fakeVerifyToken } from './test-auth';

export type Line = { level: number; msg?: string; [key: string]: unknown };

type Options = {
  db: Parameters<typeof buildServer>[0]['db'];
  turns?: Parameters<typeof createFakeAi>[0];
  verifyToken?: VerifyToken;
  allowedEmails?: ReadonlySet<string>;
};

/** A server whose JSON log lines land in `lines` (debug level, so `timed()` lines show too). */
export function captureLogs({
  db,
  turns,
  verifyToken = fakeVerifyToken,
  allowedEmails = defaultAllowed,
}: Options) {
  const lines: Line[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      for (const l of chunk.toString().split('\n').filter(Boolean)) lines.push(JSON.parse(l));
      cb();
    },
  });
  const app = buildServer({
    db,
    ai: createFakeAi(turns),
    verifyToken,
    allowedEmails,
    logger: { level: 'debug', stream },
  });
  return { app, lines };
}
