import {
  ApiError,
  ChatPart,
  type ChatRequest,
  AUDIO_MIMES,
  Category,
  HealthResponse,
  type ImportAnalyze,
  type ImportConfirm,
  ImportCreated,
  ImportProposal,
  LinkPreview,
  Note,
  NoteAnalyze,
  NoteCreate,
  NoteCreated,
  NoteEdit,
  NoteList,
  Settings,
  Suggestion,
  Tag,
  Taxonomy,
} from '@notes/shared';
import { z } from 'zod';
import { accessToken } from './supabase';

// The single typed API client: every call to the API goes through here, and every response is
// parsed against its shared schema before the UI sees it.

const BaseUrl = z.url().default('http://localhost:3000');
const parsedBaseUrl = BaseUrl.safeParse(import.meta.env.VITE_API_URL);
if (!parsedBaseUrl.success) throw new Error('VITE_API_URL is not a valid URL');
const baseUrl = parsedBaseUrl.data;

/** A non-2xx answer; `code` is the API's `error` string when it sent one. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function request<T>(
  method: Method,
  path: string,
  schema: z.ZodType<T>,
  body?: unknown,
): Promise<T> {
  const token = path === '/health' ? null : await accessToken();
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  // FormData sets its own multipart content-type (with the boundary).
  const isForm = body instanceof FormData;
  if (body !== undefined && !isForm) headers['content-type'] = 'application/json';
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: isForm ? body : JSON.stringify(body) } : {}),
  });
  const json: unknown = await res.json().catch(() => undefined);
  if (!res.ok) {
    const err = ApiError.safeParse(json);
    throw new ApiRequestError(
      res.status,
      err.success ? err.data.error : undefined,
      `${method} ${path} failed: ${res.status}`,
    );
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new Error(`${method} ${path}: unexpected response`);
  return parsed.data;
}

const NoContent = z.undefined();

/** `POST /notes` with a recording: the server transcribes it and drafts the note. */
function createVoiceNote(audio: Blob, meta: Omit<NoteCreate, 'body'>): Promise<NoteCreated> {
  const form = new FormData();
  form.set('clientId', meta.clientId);
  form.set('today', meta.today);
  form.set('locale', meta.locale);
  form.set('audio', audio, 'voice');
  return request('POST', '/notes', NoteCreated, form);
}

/** The recording bytes of a note (an `<audio>` tag cannot send the bearer token). */
async function noteAudio(id: string): Promise<Blob> {
  const token = await accessToken();
  const res = await fetch(`${baseUrl}/notes/${id}/audio`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new ApiRequestError(res.status, undefined, `GET audio failed: ${res.status}`);
  const blob = await res.blob();
  const mime = (blob.type.split(';')[0] ?? '').trim();
  if (!(AUDIO_MIMES as readonly string[]).includes(mime)) {
    throw new ApiRequestError(res.status, undefined, `GET audio: unexpected type ${blob.type}`);
  }
  return blob;
}

/**
 * `POST /chat`: reads the SSE stream and hands each recognised part to `onPart`.
 * Parts the panel does not use are skipped.
 */
async function chat(
  input: ChatRequest,
  onPart: (part: ChatPart) => void,
  signal?: AbortSignal,
): Promise<void> {
  const token = await accessToken();
  const res = await fetch(`${baseUrl}/chat`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(input),
    ...(signal ? { signal } : {}),
  });
  if (!res.ok || !res.body) {
    throw new ApiRequestError(res.status, undefined, `POST /chat failed: ${res.status}`);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const event of events) {
      const data = event.startsWith('data: ') ? event.slice(6) : undefined;
      if (data === undefined) continue;
      let json: unknown;
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }
      const part = ChatPart.safeParse(json);
      if (part.success) onPart(part.data);
    }
  }
}

export const api = {
  chat,
  health: () => request('GET', '/health', HealthResponse),
  settings: () => request('GET', '/settings', Settings),
  saveSettings: (settings: Settings) => request('PUT', '/settings', Settings, settings),
  taxonomy: () => request('GET', '/taxonomy', Taxonomy),
  createCategory: (name: string) => request('POST', '/categories', Category, { name }),
  renameCategory: (id: string, name: string) =>
    request('PATCH', `/categories/${id}`, Category, { name }),
  deleteCategory: (id: string) => request('DELETE', `/categories/${id}`, NoContent),
  restoreCategory: (id: string) => request('POST', `/categories/${id}/restore`, Category),
  createTag: (categoryId: string, name: string) =>
    request('POST', `/categories/${categoryId}/tags`, Tag, { name }),
  renameTag: (id: string, name: string) => request('PATCH', `/tags/${id}`, Tag, { name }),
  deleteTag: (id: string) => request('DELETE', `/tags/${id}`, NoContent),
  restoreTag: (id: string) => request('POST', `/tags/${id}/restore`, Tag),
  notes: () => request('GET', '/notes', NoteList),
  createNote: (input: NoteCreate) => request('POST', '/notes', NoteCreated, input),
  createVoiceNote,
  noteAudio,
  updateNote: (id: string, edit: NoteEdit) => request('PATCH', `/notes/${id}`, Note, edit),
  deleteNote: (id: string) => request('DELETE', `/notes/${id}`, NoContent),
  restoreNote: (id: string) => request('POST', `/notes/${id}/restore`, Note),
  linkPreview: (url: string, reader = false) =>
    request(
      'GET',
      `/links/preview?url=${encodeURIComponent(url)}${reader ? '&reader=1' : ''}`,
      LinkPreview,
    ),
  analyzeImport: (input: ImportAnalyze) =>
    request('POST', '/imports/analyze', ImportProposal, input),
  confirmImport: (input: ImportConfirm) =>
    request('POST', '/imports/confirm', ImportCreated, input),
  analyzeNote: (id: string, input: NoteAnalyze) =>
    request('POST', `/notes/${id}/analyze`, Suggestion, input),
};

/** Generic verbs for features that add their own endpoints. */
export const http = {
  get: <T>(path: string, schema: z.ZodType<T>) => request('GET', path, schema),
  post: <T>(path: string, schema: z.ZodType<T>, body?: unknown) =>
    request('POST', path, schema, body),
  put: <T>(path: string, schema: z.ZodType<T>, body?: unknown) =>
    request('PUT', path, schema, body),
  patch: <T>(path: string, schema: z.ZodType<T>, body?: unknown) =>
    request('PATCH', path, schema, body),
  delete: <T>(path: string, schema: z.ZodType<T>) => request('DELETE', path, schema),
};
