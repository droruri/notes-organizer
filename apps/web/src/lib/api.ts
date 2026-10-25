import { ApiError, HealthResponse, Settings } from '@notes/shared';
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
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
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

export const api = {
  health: () => request('GET', '/health', HealthResponse),
  settings: () => request('GET', '/settings', Settings),
  saveSettings: (settings: Settings) => request('PUT', '/settings', Settings, settings),
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
