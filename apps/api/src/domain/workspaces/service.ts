import type { Workspace, WorkspaceFailure } from '@notes/shared';
import type { Db } from '../../db';
import { log, timed } from '../../requestLog';
import { guarded } from '../../tx';
import { normalizeName } from '../taxonomy/taxonomy';
import * as repo from './repository';
import { DEFAULT_WORKSPACE_NAME } from './workspaces';

export type Failure = WorkspaceFailure;
export type Result<T> = { ok: true; value: T } | { ok: false; error: Failure };

/** The user's workspaces; seeds the default `כללי` first if there are none. */
export function listWorkspaces(db: Db, userId: string): Promise<Workspace[]> {
  return timed('listWorkspaces', {}, async () => {
    let list = await repo.listWorkspaces(db, userId);
    let seeded = false;
    if (list.length === 0) {
      // `on conflict do nothing` makes concurrent first calls create exactly one default.
      seeded = await repo.insertDefaultIfMissing(db, userId, DEFAULT_WORKSPACE_NAME);
      list = await repo.listWorkspaces(db, userId);
    }
    log().info({ count: list.length, seeded }, 'workspaces listed');
    return list;
  });
}

/** Creates the default workspace if missing, without logging: for callers that only need it to exist. */
export async function ensureDefaultWorkspace(db: Db, userId: string): Promise<void> {
  await repo.insertDefaultIfMissing(db, userId, DEFAULT_WORKSPACE_NAME);
}

export function createWorkspace(
  db: Db,
  userId: string,
  rawName: string,
): Promise<Result<Workspace>> {
  return timed('createWorkspace', {}, async () => {
    const name = normalizeName(rawName);
    if (name === null) {
      log().warn({ error: 'invalid_name' }, 'workspace create failed');
      return { ok: false, error: 'invalid_name' };
    }
    // A user who never listed has no default yet; make sure it exists before adding another.
    await repo.insertDefaultIfMissing(db, userId, DEFAULT_WORKSPACE_NAME);
    const result = await guarded(() => repo.insertWorkspace(db, userId, name));
    if (result.ok) log().info({ workspaceId: result.value.id }, 'workspace created');
    else log().warn({ error: result.error }, 'workspace create failed');
    return result;
  });
}
