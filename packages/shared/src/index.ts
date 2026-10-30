import { z } from 'zod';
import { Importance } from './notes';

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
  /** Optional default importance for notes in this category. */
  importance: Importance.nullable(),
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

/** Body of `PUT /categories/:id/importance`; `null` clears the level. */
export const ImportanceBody = z.object({ importance: Importance.nullable() });
export type ImportanceBody = z.infer<typeof ImportanceBody>;

export * from './attachments';
export * from './notes';
export * from './noteQuery';
export * from './links';
export * from './imports';

/** `GET /me`: who the caller is, so the web knows whether to show the admin screen. */
export const Me = z.object({ email: z.string(), isAdmin: z.boolean() });
export type Me = z.infer<typeof Me>;

/** A row of the allow list; `/users` returns emails and roles only, never note content. */
export const AllowedUser = z.object({
  email: z.string(),
  isAdmin: z.boolean(),
  createdAt: z.string(),
});
export type AllowedUser = z.infer<typeof AllowedUser>;

export const AllowedUserList = z.array(AllowedUser);

/** Body of `POST /users`. */
export const AddUserBody = z.object({ email: z.string(), isAdmin: z.boolean().optional() });
export type AddUserBody = z.infer<typeof AddUserBody>;

/** Body of `PATCH /users/:email`. */
export const UserRoleBody = z.object({ isAdmin: z.boolean() });
export type UserRoleBody = z.infer<typeof UserRoleBody>;
export * from './importance';
