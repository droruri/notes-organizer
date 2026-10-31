import type { Workspace } from '@notes/shared';
import type { Queryable } from '../../tx';

// SQL for workspaces.

const COLS = 'id, name, is_default as "isDefault"';

export async function listWorkspaces(db: Queryable, userId: string): Promise<Workspace[]> {
  const { rows } = await db.query<Workspace>(
    `select ${COLS} from workspaces where user_id = $1 order by is_default desc, lower(name), id`,
    [userId],
  );
  return rows;
}

/** Creates the user's default; true when this call created it (false: it already existed). */
export async function insertDefaultIfMissing(
  db: Queryable,
  userId: string,
  name: string,
): Promise<boolean> {
  const { rowCount } = await db.query(
    `insert into workspaces (user_id, name, is_default) values ($1, $2, true)
     on conflict do nothing`,
    [userId, name],
  );
  return (rowCount ?? 0) > 0;
}

export async function insertWorkspace(
  db: Queryable,
  userId: string,
  name: string,
): Promise<Workspace> {
  const { rows } = await db.query<Workspace>(
    `insert into workspaces (user_id, name) values ($1, $2) returning ${COLS}`,
    [userId, name],
  );
  const row = rows[0];
  if (!row) throw new Error('workspace insert returned no row');
  return row;
}

/**
 * All of the user's workspaces, row-locked for the rest of the transaction. Locking the whole set
 * (in one fixed order) makes concurrent set-default and delete serialize, so the default read
 * after this call is current.
 */
export async function lockUserWorkspaces(db: Queryable, userId: string): Promise<Workspace[]> {
  const { rows } = await db.query<Workspace>(
    `select ${COLS} from workspaces where user_id = $1 order by id for update`,
    [userId],
  );
  return rows;
}

export async function renameWorkspace(db: Queryable, id: string, name: string): Promise<void> {
  await db.query('update workspaces set name = $2 where id = $1', [id, name]);
}

/** Moves the default flag to `id`: clears the old one first so the one-default index holds. */
export async function makeDefault(db: Queryable, userId: string, id: string): Promise<void> {
  await db.query('update workspaces set is_default = false where user_id = $1 and is_default', [
    userId,
  ]);
  await db.query('update workspaces set is_default = true where id = $1', [id]);
}

/** Moves every note of `fromId` (soft-deleted too) to `toId`; returns how many. */
export async function moveNotes(db: Queryable, fromId: string, toId: string): Promise<number> {
  const { rowCount } = await db.query(
    'update notes set workspace_id = $2 where workspace_id = $1',
    [fromId, toId],
  );
  return rowCount ?? 0;
}

export async function deleteWorkspaceRow(db: Queryable, id: string): Promise<void> {
  await db.query('delete from workspaces where id = $1', [id]);
}
