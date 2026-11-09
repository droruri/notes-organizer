import { AuthClient } from '@supabase/auth-js';
import { z } from 'zod';

// Only the Supabase auth client is shipped (not supabase-js); all data goes through lib/api.ts.

const SupabaseEnv = z.object({
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
});

/** Same key supabase-js derives (`sb-<project ref>-auth-token`), so existing sessions survive. */
export function authStorageKey(supabaseUrl: string): string {
  return `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
}

type Auth = InstanceType<typeof AuthClient>;

let client: Auth | undefined;

/** Created on first use so importing this module never needs the env (tests). */
export function auth(): Auth {
  if (client) return client;
  const env = SupabaseEnv.safeParse(import.meta.env);
  if (!env.success) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set');
  const { VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: key } = env.data;
  // Mirrors supabase-js createClient: /auth/v1 under the base URL, apikey + Bearer headers,
  // and its default auth options.
  client = new AuthClient({
    url: new URL('auth/v1', url.endsWith('/') ? url : `${url}/`).href,
    headers: { Authorization: `Bearer ${key}`, apikey: key },
    storageKey: authStorageKey(url),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'implicit',
  });
  return client;
}

export async function accessToken(): Promise<string | null> {
  const { data } = await auth().getSession();
  return data.session?.access_token ?? null;
}
