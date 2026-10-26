import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';
import type { Query } from '@tanstack/react-query';
import { NoteList, Settings, Taxonomy } from '@notes/shared';
import { del, get, set } from 'idb-keyval';
import type { ZodType } from 'zod';

const KEY = 'notes-query-cache-v1';

/** How long restored data is kept, and how long unused queries stay in memory. */
export const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

/** The only queries worth persisting, each with the schema its data must match on restore. */
const SCHEMAS: Record<string, ZodType> = {
  notes: NoteList,
  taxonomy: Taxonomy,
  settings: Settings,
};

function schemaFor(queryKey: readonly unknown[]): ZodType | undefined {
  const [name] = queryKey;
  return typeof name === 'string' && queryKey.length === 1 ? SCHEMAS[name] : undefined;
}

export const shouldDehydrateQuery = (query: Query) =>
  query.state.status === 'success' && schemaFor(query.queryKey) !== undefined;

/** IndexedDB is a boundary: keep only queries whose data still matches its schema. */
export function parsePersisted(value: unknown): PersistedClient | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const client = value as Partial<PersistedClient>;
  const queries = client.clientState?.queries;
  if (typeof client.timestamp !== 'number' || typeof client.buster !== 'string') return undefined;
  if (!Array.isArray(queries)) return undefined;
  const kept = queries.filter((q) => {
    const schema = Array.isArray(q?.queryKey) ? schemaFor(q.queryKey) : undefined;
    const ok = schema?.safeParse(q.state?.data).success === true;
    if (!ok) console.warn('query cache: dropped an invalid persisted query');
    return ok;
  });
  return {
    timestamp: client.timestamp,
    buster: client.buster,
    clientState: { mutations: [], queries: kept },
  };
}

export const persister: Persister = {
  persistClient: async (client) => {
    try {
      await set(KEY, client);
    } catch (err) {
      console.warn('query cache: could not save', err);
    }
  },
  restoreClient: async () => {
    try {
      return parsePersisted(await get(KEY));
    } catch (err) {
      console.warn('query cache: could not read', err);
      return undefined;
    }
  },
  removeClient: async () => {
    try {
      await del(KEY);
    } catch (err) {
      console.warn('query cache: could not remove', err);
    }
  },
};

/** Forget every cached note, here and on disk, so the next user never sees them. */
export async function clearCache(queryClient: { clear: () => void }) {
  queryClient.clear();
  await persister.removeClient();
}
