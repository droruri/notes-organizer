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
