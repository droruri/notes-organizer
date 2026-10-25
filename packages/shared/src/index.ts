import { z } from 'zod';

// Schemas and types used by both web and api, defined once.

export const HealthResponse = z.object({
  ok: z.boolean(),
  db: z.boolean().optional(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

export const NoteSort = z.enum(['urgency', 'due_date', 'newest', 'oldest']);
export type NoteSort = z.infer<typeof NoteSort>;
export const DEFAULT_NOTE_SORT: NoteSort = 'urgency';

export const Settings = z.object({ noteSort: NoteSort });
export type Settings = z.infer<typeof Settings>;

/** Error body the API returns for auth failures: `401 unauthorized`, `403 not_allowed`. */
export const ApiError = z.object({ error: z.string() });
export type ApiError = z.infer<typeof ApiError>;

export const Tag = z.object({
  id: z.uuid(),
  categoryId: z.uuid(),
  name: z.string(),
  /** Soft-deleted: still listed so notes that use it can show it disabled. */
  deleted: z.boolean(),
});
export type Tag = z.infer<typeof Tag>;

export const Category = z.object({
  id: z.uuid(),
  name: z.string(),
  deleted: z.boolean(),
});
export type Category = z.infer<typeof Category>;

/** Every category with its tags, deleted ones included and flagged. */
export const Taxonomy = z.object({
  categories: z.array(Category.extend({ tags: z.array(Tag) })),
});
export type Taxonomy = z.infer<typeof Taxonomy>;

/** Body of the create and rename taxonomy requests. */
export const NameBody = z.object({ name: z.string() });
export type NameBody = z.infer<typeof NameBody>;
