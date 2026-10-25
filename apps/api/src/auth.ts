import type { FastifyReply, FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';

export type AuthUser = { id: string; email: string };
/** Resolves the user a bearer token belongs to; rejects when the token is invalid. */
export type VerifyToken = (token: string) => Promise<AuthUser>;

const Claims = z.object({ sub: z.uuid(), email: z.string().min(1) });

/** Verifies Supabase access tokens against the project's JWKS. */
export function createTokenVerifier(supabaseUrl: string): VerifyToken {
  const issuer = `${new URL(supabaseUrl).origin}/auth/v1`;
  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  return async (token) => {
    const { payload } = await jwtVerify(token, jwks, { issuer, audience: 'authenticated' });
    const claims = Claims.parse(payload);
    return { id: claims.sub, email: claims.email };
  };
}

export function parseAllowedEmails(list: string): Set<string> {
  return new Set(
    list
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

const users = new WeakMap<FastifyRequest, AuthUser>();

/** The caller of an authenticated request; only valid behind `requireUser`. */
export function currentUser(req: FastifyRequest): AuthUser {
  const user = users.get(req);
  if (!user) throw new Error('currentUser called on a route without requireUser');
  return user;
}

/** An `onRequest` hook: 401 without a valid token, 403 when the email is not allowed. */
export function requireUser(verifyToken: VerifyToken, allowedEmails: ReadonlySet<string>) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const match = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
    const token = match?.[1];
    if (!token) return reply.code(401).send({ error: 'unauthorized' });

    let user: AuthUser;
    try {
      user = await verifyToken(token);
    } catch {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    if (!allowedEmails.has(user.email.toLowerCase())) {
      return reply.code(403).send({ error: 'not_allowed' });
    }
    users.set(req, user);
  };
}
