import type { VerifyToken } from './auth';
import type { Db } from './db';

export const ALLOWED_USER = { id: '22222222-2222-2222-2222-222222222222', email: 'me@example.com' };
export const OTHER_USER = { id: '33333333-3333-3333-3333-333333333333', email: 'x@example.com' };

/** A fake verifier: token `allowed` / `other` map to users, anything else is invalid. */
export const fakeVerifyToken: VerifyToken = async (token) => {
  if (token === 'allowed') return ALLOWED_USER;
  if (token === 'other') return OTHER_USER;
  throw new Error('invalid token');
};
export const allowedEmails = new Set([ALLOWED_USER.email]);

/** A database stand-in for tests that never touch it beyond the allow-list lookup. */
export const allowListDb = {
  query: async (sql: string) => ({
    rows: sql.includes('from allowed_users') ? [{ is_admin: false }] : [],
  }),
} as unknown as Db;
