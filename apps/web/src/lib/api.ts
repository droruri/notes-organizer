import { HealthResponse } from '@notes/shared';
import { z } from 'zod';

// The single typed API client: every call to the API goes through here, and every response is
// parsed against its shared schema before the UI sees it.

const BaseUrl = z.url().default('http://localhost:3000');
const parsedBaseUrl = BaseUrl.safeParse(import.meta.env.VITE_API_URL);
if (!parsedBaseUrl.success) throw new Error('VITE_API_URL is not a valid URL');
const baseUrl = parsedBaseUrl.data;

async function get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  const parsed = schema.safeParse(await res.json());
  if (!parsed.success) throw new Error(`GET ${path}: unexpected response`);
  return parsed.data;
}

export const api = {
  health: () => get('/health', HealthResponse),
};
