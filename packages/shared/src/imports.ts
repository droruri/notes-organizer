import { z } from 'zod';
import { DateString, Locale, NewTag, NoteBody, NoteEdit, Suggestion } from './notes';

export const MAX_IMPORT_CHARS = 50_000;
export const MAX_IMPORT_NOTES = 200;

/** Body of `POST /imports/analyze`. */
export const ImportAnalyze = z.object({
  text: z.string().trim().min(1).max(MAX_IMPORT_CHARS),
  today: DateString,
  locale: Locale,
});
export type ImportAnalyze = z.infer<typeof ImportAnalyze>;

/** What analyze returns: nothing is saved. Top-level names are the union over all notes. */
export const ImportProposal = z.object({
  newCategories: z.array(z.string()),
  newTags: z.array(NewTag),
  notes: z.array(z.object({ body: z.string(), suggestion: Suggestion })).max(MAX_IMPORT_NOTES),
  /** Distinct links in the text, and how many of them Claude read. */
  links: z.object({ total: z.number().int(), read: z.number().int() }),
});
export type ImportProposal = z.infer<typeof ImportProposal>;

/** One chosen note. `newCategories` / `newTags` may only name items listed in `categories` / `tags`. */
export const ImportNote = NoteEdit.omit({ status: true, body: true }).extend({ body: NoteBody });
export type ImportNote = z.infer<typeof ImportNote>;

/** Body of `POST /imports/confirm`: the chosen taxonomy and notes, saved together. */
export const ImportConfirm = z.object({
  categories: z.array(z.string()).max(MAX_IMPORT_NOTES * 5),
  tags: z.array(NewTag).max(MAX_IMPORT_NOTES * 5),
  notes: z.array(ImportNote).max(MAX_IMPORT_NOTES),
});
export type ImportConfirm = z.infer<typeof ImportConfirm>;

export const ImportCreated = z.object({
  created: z.object({ categories: z.number(), tags: z.number(), notes: z.number() }),
});
export type ImportCreated = z.infer<typeof ImportCreated>;
