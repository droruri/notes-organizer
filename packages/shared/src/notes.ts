import { z } from 'zod';

export const NoteStatus = z.enum(['draft', 'todo', 'in_progress', 'done']);
export type NoteStatus = z.infer<typeof NoteStatus>;

export const Importance = z.enum(['important', 'not_important']);
export type Importance = z.infer<typeof Importance>;

export const Urgency = z.enum(['not_critical', 'medium', 'critical', 'urgent']);
export type Urgency = z.infer<typeof Urgency>;

export const Locale = z.enum(['he', 'en']);
export type Locale = z.infer<typeof Locale>;

/** `YYYY-MM-DD`. */
export const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Recording types the API accepts (parameters such as `;codecs=opus` are ignored). */
export const AUDIO_MIMES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg'] as const;
export const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

export const MAX_BODY_LENGTH = 10_000;
const Body = z.string().trim().min(1).max(MAX_BODY_LENGTH);

/** A tag to create under an existing category (`categoryId`) or a new one (`categoryName`). */
export const NewTag = z.union([
  z.object({ categoryId: z.uuid(), name: z.string() }),
  z.object({ categoryName: z.string(), name: z.string() }),
]);
export type NewTag = z.infer<typeof NewTag>;

/** Claude's new names for a draft, kept until submit. */
export const Proposed = z.object({
  newCategories: z.array(z.string()),
  newTags: z.array(NewTag),
});
export type Proposed = z.infer<typeof Proposed>;

/** What Claude suggests for a note: existing ids, new names, and the scalar fields. */
export const Suggestion = Proposed.extend({
  categoryIds: z.array(z.uuid()),
  tagIds: z.array(z.uuid()),
  dueDate: DateString.nullable(),
  importance: Importance.nullable(),
  urgency: Urgency.nullable(),
  /** Links in the body that Claude could not read (set by the service, not by Claude). */
  unreadLinks: z.array(z.string()),
});
export type Suggestion = z.infer<typeof Suggestion>;

export const Note = z.object({
  id: z.uuid(),
  clientId: z.uuid(),
  body: z.string(),
  status: NoteStatus,
  importance: Importance.nullable(),
  urgency: Urgency.nullable(),
  dueDate: DateString.nullable(),
  proposed: Proposed.nullable(),
  unreadLinks: z.array(z.string()),
  categoryIds: z.array(z.uuid()),
  tagIds: z.array(z.uuid()),
  hasAudio: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Note = z.infer<typeof Note>;

/** Body of `POST /notes` (JSON). `id`, `status` and the owner are decided by the server. */
export const NoteCreate = z.object({
  body: Body,
  clientId: z.uuid(),
  today: DateString,
  locale: Locale,
});
export type NoteCreate = z.infer<typeof NoteCreate>;

export const NoteCreated = z.object({ note: Note, suggestion: Suggestion });
export type NoteCreated = z.infer<typeof NoteCreated>;

/** Body of `PATCH /notes/:id`. `status: 'todo'` on a draft submits it. */
export const NoteEdit = z.object({
  body: Body.optional(),
  categoryIds: z.array(z.uuid()).optional(),
  tagIds: z.array(z.uuid()).optional(),
  newCategories: z.array(z.string()).optional(),
  newTags: z.array(NewTag).optional(),
  dueDate: DateString.nullable().optional(),
  importance: Importance.nullable().optional(),
  urgency: Urgency.nullable().optional(),
  status: NoteStatus.optional(),
  /** Replaces the stored list; the web sends the suggestion's list on submit / save. */
  unreadLinks: z.array(z.string().max(2000)).max(100).optional(),
});
export type NoteEdit = z.infer<typeof NoteEdit>;

export const NoteList = z.array(Note);

/** Body of `POST /notes/:id/analyze`. */
export const NoteAnalyze = z.object({ today: DateString, locale: Locale });
export type NoteAnalyze = z.infer<typeof NoteAnalyze>;

const FLOW: NoteStatus[] = ['todo', 'in_progress', 'done'];

/** The legal one-step moves from a status. A draft has none (submit is not a step). */
export function statusMoves(status: NoteStatus): {
  back: NoteStatus | null;
  forward: NoteStatus | null;
} {
  const i = FLOW.indexOf(status);
  if (i === -1) return { back: null, forward: null };
  return { back: FLOW[i - 1] ?? null, forward: FLOW[i + 1] ?? null };
}

/** Chat history sent with `POST /chat`; the server keeps only the last 20. */
export const ChatMessage = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(10_000),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

export const ChatRequest = z.object({
  messages: z.array(ChatMessage).min(1).max(100),
  today: DateString,
  locale: Locale,
});
export type ChatRequest = z.infer<typeof ChatRequest>;

/**
 * A taxonomy change the chat agent proposes. Nothing is written until the user approves it in the
 * web app, which then calls the normal taxonomy route. `name` is the current/target name shown on
 * the card; `newName` is the rename target.
 */
export const AgentAction = z.union([
  z.object({ action: z.literal('create'), kind: z.literal('category'), name: z.string() }),
  z.object({
    action: z.literal('create'),
    kind: z.literal('tag'),
    categoryId: z.uuid(),
    categoryName: z.string(),
    name: z.string(),
  }),
  z.object({
    action: z.literal('rename'),
    kind: z.enum(['category', 'tag']),
    id: z.uuid(),
    name: z.string(),
    newName: z.string(),
  }),
  z.object({
    action: z.enum(['delete', 'restore']),
    kind: z.enum(['category', 'tag']),
    id: z.uuid(),
    name: z.string(),
  }),
]);
export type AgentAction = z.infer<typeof AgentAction>;

/** The streamed parts the chat panel reads (a subset of the AI SDK's UI message parts). */
export const ChatPart = z.discriminatedUnion('type', [
  z.object({ type: z.literal('data-actions'), data: z.array(AgentAction) }),
  z.object({ type: z.literal('text-delta'), delta: z.string() }),
  z.object({ type: z.literal('tool-input-start'), toolName: z.string() }),
  z.object({ type: z.literal('error'), errorText: z.string() }),
]);
export type ChatPart = z.infer<typeof ChatPart>;

/** An answer cites a note as `[[note:<id>]]`. */
export const NOTE_CITATION = /\[\[note:([0-9a-f-]{36})\]\]/;
