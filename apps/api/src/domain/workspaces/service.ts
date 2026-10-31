import type { Workspace, WorkspaceEdit, WorkspaceFailure } from '@notes/shared';
import type { Db } from '../../db';
import { log, timed } from '../../requestLog';
import { guarded, withTransaction } from '../../tx';
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

export function updateWorkspace(
  db: Db,
  userId: string,
  id: string,
  edit: WorkspaceEdit,
): Promise<Result<Workspace>> {
  return timed('updateWorkspace', {}, async () => {
    const fail = (error: Failure): Result<Workspace> => {
      log().warn({ workspaceId: id, error }, 'workspace update failed');
      return { ok: false, error };
    };
    const name = edit.name === undefined ? undefined : normalizeName(edit.name);
    if (name === null) return fail('invalid_name');
    const result = await guarded(() =>
      withTransaction(db, async (tx): Promise<Workspace | undefined> => {
        const current = (await repo.lockUserWorkspaces(tx, userId)).find((w) => w.id === id);
        if (!current) return undefined;
        if (name !== undefined) await repo.renameWorkspace(tx, id, name);
        if (edit.isDefault) await repo.makeDefault(tx, userId, id);
        return {
          id,
          name: name ?? current.name,
          isDefault: current.isDefault || edit.isDefault === true,
        };
      }),
    );
    if (!result.ok) return fail(result.error);
    if (!result.value) return fail('not_found');
    log().info(
      { workspaceId: id, renamed: name !== undefined, madeDefault: edit.isDefault === true },
      'workspace updated',
    );
    return { ok: true, value: result.value };
  });
}

/** Deletes a non-default workspace, moving all its notes (soft-deleted too) to the default. */
export function deleteWorkspace(
  db: Db,
  userId: string,
  id: string,
): Promise<Result<{ movedNotes: number }>> {
  return timed('deleteWorkspace', {}, async () => {
    const outcome = await withTransaction(
      db,
      async (tx): Promise<Result<{ movedNotes: number }>> => {
        const rows = await repo.lockUserWorkspaces(tx, userId);
        const current = rows.find((w) => w.id === id);
        if (!current) return { ok: false, error: 'not_found' };
        if (current.isDefault) return { ok: false, error: 'is_default' };
        const target = rows.find((w) => w.isDefault);
        if (!target) return { ok: false, error: 'not_found' };
        const movedNotes = await repo.moveNotes(tx, id, target.id);
        await repo.deleteWorkspaceRow(tx, id);
        return { ok: true, value: { movedNotes } };
      },
    );
    if (outcome.ok)
      log().info({ workspaceId: id, movedNotes: outcome.value.movedNotes }, 'workspace deleted');
    else log().warn({ workspaceId: id, error: outcome.error }, 'workspace delete failed');
    return outcome;
  });
}
