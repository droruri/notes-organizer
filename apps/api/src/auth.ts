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
    const claims = Claims.safeParse(payload);
    if (!claims.success) throw new Error('token claims rejected');
    return { id: claims.data.sub, email: claims.data.email };
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

/** The caller, plus the role the allow list gives them. */
export type SignedInUser = AuthUser & { isAdmin: boolean };

/** The allow-list row for an email, or `null` when the email may not sign in. */
export type FindAllowed = (email: string) => Promise<{ isAdmin: boolean } | null>;

const users = new WeakMap<FastifyRequest, SignedInUser>();

/** The caller of an authenticated request; only valid behind `requireUser`. */
export function currentUser(req: FastifyRequest): SignedInUser {
  const user = users.get(req);
  if (!user) throw new Error('currentUser called on a route without requireUser');
  return user;
}

/** An `onRequest` hook: 401 without a valid token, 403 when the email is not allowed. */
export function requireUser(verifyToken: VerifyToken, findAllowed: FindAllowed) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | undefined> => {
    const match = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
    const token = match?.[1];
    if (!token) return reply.code(401).send({ error: 'unauthorized' });

    let user: AuthUser;
    try {
      user = await verifyToken(token);
    } catch (err) {
      req.log.warn({ err }, 'access token rejected');
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const allowed = await findAllowed(user.email);
    if (!allowed) return reply.code(403).send({ error: 'not_allowed' });
    users.set(req, { ...user, isAdmin: allowed.isAdmin });
  };
}
