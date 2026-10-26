import type { ImportConfirm, ImportCreated } from '@notes/shared';
import type { Db } from '../../db';
import { log, timed } from '../../requestLog';
import { withTransaction } from '../../tx';
import { planLinks, planNewTaxonomy } from '../notes/note';
import * as notesRepo from '../notes/repository';
import { createPlanned, getTaxonomy } from '../taxonomy/service';

// Import confirm: create the chosen taxonomy and notes in one transaction, all or nothing.

export type ConfirmResult =
  | { ok: true; value: ImportCreated }
  | { ok: false; error: 'unknown_taxonomy' };

class Invalid extends Error {}

export function confirmImport(
  db: Db,
  userId: string,
  input: ImportConfirm,
): Promise<ConfirmResult> {
  return timed('confirmImport', {}, async () => {
    const result = await confirmImportUntimed(db, userId, input);
    if (result.ok) log().info(result.value.created, 'import confirmed');
    else log().warn({ error: result.error }, 'import rejected');
    return result;
  });
}

async function confirmImportUntimed(
  db: Db,
  userId: string,
  input: ImportConfirm,
): Promise<ConfirmResult> {
  try {
    return await withTransaction(db, async (tx): Promise<ConfirmResult> => {
      const plan = planNewTaxonomy(input.categories, input.tags, await getTaxonomy(tx, userId));
      if (!plan) throw new Invalid();
      const made = await createPlanned(tx, userId, plan);

      // Every note now resolves its names against the stored taxonomy, new items included.
      const taxonomy = await getTaxonomy(tx, userId);
      for (const note of input.notes) {
        const named = planNewTaxonomy(note.newCategories ?? [], note.newTags ?? [], taxonomy);
        // A name that is not already stored was not chosen: reject rather than invent it.
        if (!named || named.categories.length > 0 || named.tags.some((t) => !t.existingTagId)) {
          throw new Invalid();
        }
        const links = planLinks(
          {
            categoryIds: [...(note.categoryIds ?? []), ...named.existingCategoryIds],
            tagIds: [
              ...(note.tagIds ?? []),
              ...named.tags.flatMap((t) => (t.existingTagId ? [t.existingTagId] : [])),
            ],
          },
          { categoryIds: [], tagIds: [] },
          taxonomy,
        );
        if (!links) throw new Invalid();
        const id = await notesRepo.insertTodo(tx, userId, {
          body: note.body,
          title: note.title ?? null,
          dueDate: note.dueDate ?? null,
          importance: note.importance ?? null,
          urgency: note.urgency ?? null,
          unreadLinks: note.unreadLinks ?? [],
        });
        await notesRepo.replaceLinks(tx, id, links);
      }
      return {
        ok: true,
        value: {
          created: {
            categories: plan.categories.length,
            tags: made.tagIds.length,
            notes: input.notes.length,
          },
        },
      };
    });
  } catch (err) {
    if (err instanceof Invalid) return { ok: false, error: 'unknown_taxonomy' };
    throw err;
  }
}
