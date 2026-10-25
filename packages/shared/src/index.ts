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
