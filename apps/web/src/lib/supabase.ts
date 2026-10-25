import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

// Supabase is used for auth only; all data goes through lib/api.ts.

const SupabaseEnv = z.object({
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
});

let client: SupabaseClient | undefined;

/** Created on first use so importing this module never needs the env (tests). */
export function supabase(): SupabaseClient {
  if (client) return client;
  const env = SupabaseEnv.safeParse(import.meta.env);
  if (!env.success) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set');
  client = createClient(env.data.VITE_SUPABASE_URL, env.data.VITE_SUPABASE_ANON_KEY);
  return client;
}

export async function accessToken(): Promise<string | null> {
  const { data } = await supabase().auth.getSession();
  return data.session?.access_token ?? null;
}
