import type { ActionResult, AgentAction } from '@notes/shared';
import type { Db } from '../../db';
import { log, timed } from '../../requestLog';
import * as service from './service';

function run(db: Db, userId: string, a: AgentAction): Promise<service.Result<unknown>> {
  if (a.action === 'create') {
    return a.kind === 'category'
      ? service.createCategory(db, userId, a.name)
      : service.createTag(db, userId, a.categoryId, a.name);
  }
  if (a.action === 'rename') {
    return a.kind === 'category'
      ? service.renameCategory(db, userId, a.id, a.newName)
      : service.renameTag(db, userId, a.id, a.newName);
  }
  const deleted = a.action === 'delete';
  return a.kind === 'category'
    ? service.setCategoryDeleted(db, userId, a.id, deleted)
    : service.setTagDeleted(db, userId, a.id, deleted);
}

/** Apply chat action cards one after another; a failed action is a result and the rest still run. */
export function applyActions(
  db: Db,
  userId: string,
  actions: AgentAction[],
): Promise<ActionResult[]> {
  return timed('applyActions', { count: actions.length }, async () => {
    const results: ActionResult[] = [];
    for (const [index, action] of actions.entries()) {
      const r = await run(db, userId, action);
      if (r.ok) {
        results.push({ ok: true });
      } else {
        results.push({ ok: false, error: r.error });
        log().warn(
          { index, action: action.action, kind: action.kind, error: r.error },
          'action rejected',
        );
      }
    }
    const failed = results.filter((r) => !r.ok).length;
    log().info({ applied: results.length - failed, failed }, 'actions applied');
    return results;
  });
}
