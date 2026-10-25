import type { AgentAction } from '@notes/shared';
import { api } from '../../lib/api';

/** Approval: the normal taxonomy route for the proposed change. Throws `ApiRequestError` on 409/422. */
export async function applyAction(a: AgentAction): Promise<void> {
  if (a.action === 'create') {
    await (a.kind === 'category'
      ? api.createCategory(a.name)
      : api.createTag(a.categoryId, a.name));
  } else if (a.action === 'rename') {
    await (a.kind === 'category'
      ? api.renameCategory(a.id, a.newName)
      : api.renameTag(a.id, a.newName));
  } else if (a.action === 'delete') {
    await (a.kind === 'category' ? api.deleteCategory(a.id) : api.deleteTag(a.id));
  } else {
    await (a.kind === 'category' ? api.restoreCategory(a.id) : api.restoreTag(a.id));
  }
}
