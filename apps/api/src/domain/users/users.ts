import type { AllowedUser } from '@notes/shared';
import { z } from 'zod';
import type { Db } from '../../db';
import { withTransaction } from '../../tx';

const Email = z.email();

/** Trim + lowercase + validate; `null` when it is not an email address. */
export function normalizeEmail(raw: string): string | null {
  const parsed = Email.safeParse(raw.trim().toLowerCase());
  return parsed.success ? parsed.data : null;
}

export type Blocked = 'cannot_change_self' | 'last_admin';

/** Why removing or demoting `target` must be refused, or `null` when it may go ahead. */
export function blockedChange(input: {
  change: 'remove' | 'demote';
  actorEmail: string;
  targetEmail: string;
  targetIsAdmin: boolean;
  adminCount: number;
}): Blocked | null {
  if (input.change === 'demote' && !input.targetIsAdmin) return null;
  if (input.targetIsAdmin && input.adminCount <= 1) return 'last_admin';
  if (input.actorEmail === input.targetEmail) return 'cannot_change_self';
  return null;
}

type Row = { email: string; is_admin: boolean; created_at: Date };
const toAllowedUser = (r: Row): AllowedUser => ({
  email: r.email,
  isAdmin: r.is_admin,
  createdAt: r.created_at.toISOString(),
});

/** Inserts the bootstrap admins that are missing; never deletes or demotes anything. */
export async function seedAdmins(db: Db, emails: readonly string[]): Promise<void> {
  if (emails.length === 0) return;
  await db.query(
    `insert into allowed_users (email, is_admin) select unnest($1::text[]), true
     on conflict (email) do nothing`,
    [emails],
  );
}

/** The allow-list row for an email, or `null` when the email may not sign in. */
export async function findAllowed(db: Db, email: string): Promise<{ isAdmin: boolean } | null> {
  const { rows } = await db.query<{ is_admin: boolean }>(
    'select is_admin from allowed_users where email = $1',
    [email.toLowerCase()],
  );
  const row = rows[0];
  return row ? { isAdmin: row.is_admin } : null;
}

export async function listUsers(db: Db): Promise<AllowedUser[]> {
  const { rows } = await db.query<Row>(
    'select email, is_admin, created_at from allowed_users order by created_at, email',
  );
  return rows.map(toAllowedUser);
}

export type AddResult =
  | { ok: true; user: AllowedUser }
  | { ok: false; error: 'invalid_email' | 'exists' };

export async function addUser(
  db: Db,
  actorId: string,
  input: { email: string; isAdmin: boolean },
): Promise<AddResult> {
  const email = normalizeEmail(input.email);
  if (!email) return { ok: false, error: 'invalid_email' };
  const { rows } = await db.query<Row>(
    `insert into allowed_users (email, is_admin, added_by) values ($1, $2, $3)
     on conflict (email) do nothing returning email, is_admin, created_at`,
    [email, input.isAdmin, actorId],
  );
  const row = rows[0];
  return row ? { ok: true, user: toAllowedUser(row) } : { ok: false, error: 'exists' };
}

export type ChangeResult<T> = { ok: true; value: T } | { ok: false; error: 'not_found' | Blocked };

/** Locks the whole (small) table so two concurrent changes cannot both pass the last-admin rule. */
async function lockedChange<T>(
  db: Db,
  actorEmail: string,
  rawTarget: string,
  change: 'remove' | 'demote' | 'promote',
  apply: (tx: Pick<Db, 'query'>, email: string) => Promise<T>,
): Promise<ChangeResult<T>> {
  const targetEmail = normalizeEmail(rawTarget);
  if (!targetEmail) return { ok: false, error: 'not_found' };
  return withTransaction(db, async (tx) => {
    const { rows } = await tx.query<{ email: string; is_admin: boolean }>(
      'select email, is_admin from allowed_users for update',
    );
    const target = rows.find((r) => r.email === targetEmail);
    if (!target) return { ok: false, error: 'not_found' } as const;
    if (change !== 'promote') {
      const blocked = blockedChange({
        change,
        actorEmail: actorEmail.toLowerCase(),
        targetEmail,
        targetIsAdmin: target.is_admin,
        adminCount: rows.filter((r) => r.is_admin).length,
      });
      if (blocked) return { ok: false, error: blocked } as const;
    }
    return { ok: true, value: await apply(tx, targetEmail) } as const;
  });
}

export function setAdmin(
  db: Db,
  actorEmail: string,
  email: string,
  isAdmin: boolean,
): Promise<ChangeResult<AllowedUser>> {
  return lockedChange(db, actorEmail, email, isAdmin ? 'promote' : 'demote', async (tx, e) => {
    const { rows } = await tx.query<Row>(
      'update allowed_users set is_admin = $2 where email = $1 returning email, is_admin, created_at',
      [e, isAdmin],
    );
    const row = rows[0];
    if (!row) throw new Error('allowed_users row vanished inside the transaction');
    return toAllowedUser(row);
  });
}

export function removeUser(db: Db, actorEmail: string, email: string): Promise<ChangeResult<null>> {
  return lockedChange(db, actorEmail, email, 'remove', async (tx, e) => {
    await tx.query('delete from allowed_users where email = $1', [e]);
    return null;
  });
}
