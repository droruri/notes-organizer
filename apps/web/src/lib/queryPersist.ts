import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';
import { dehydrate, QueryClient, type Query } from '@tanstack/react-query';
import { Settings, Taxonomy, WorkspaceList } from '@notes/shared';
import { del, get, set } from 'idb-keyval';
import { z, type ZodType } from 'zod';
import { settingsKeys } from '../api/settings.queries';
import { taxonomyKeys } from '../api/taxonomy.queries';
import { workspacesKeys } from '../api/workspaces.queries';
import { clearNotes, loadNotes } from './noteStore';

const KEY = 'notes-query-cache-v1';

/** How long restored data is kept, and how long unused queries stay in memory. */
export const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

/** The only queries worth persisting, each with the schema its data must match on restore. */
const SCHEMAS: Record<string, ZodType> = {
  [taxonomyKeys.all[0]]: Taxonomy,
  [settingsKeys.all[0]]: Settings,
  [workspacesKeys.all[0]]: WorkspaceList,
};

function schemaFor(queryKey: readonly unknown[]): ZodType | undefined {
  const [name] = queryKey;
  return typeof name === 'string' && queryKey.length === 1 ? SCHEMAS[name] : undefined;
}

export const shouldDehydrateQuery = (query: Query) =>
  query.state.status === 'success' && schemaFor(query.queryKey) !== undefined;

type PersistedQuery = PersistedClient['clientState']['queries'][number];

const Envelope = z.object({
  timestamp: z.number(),
  buster: z.string(),
  clientState: z.object({ queries: z.array(z.unknown()) }),
});

/** The fields restore reads from each query; the rest is what our own dehydrate wrote. */
const QueryFields = z.object({
  queryHash: z.string(),
  queryKey: z.array(z.unknown()),
  state: z.object({ data: z.unknown() }),
});

function isPersistedQuery(value: unknown): value is PersistedQuery {
  return QueryFields.safeParse(value).success;
}

/** IndexedDB is a boundary: keep only queries whose data still matches its schema. */
export function parsePersisted(value: unknown): PersistedClient | undefined {
  const envelope = Envelope.safeParse(value);
  if (!envelope.success) return undefined;
  const kept: PersistedQuery[] = [];
  for (const q of envelope.data.clientState.queries) {
    if (!isPersistedQuery(q)) {
      console.warn('query cache: dropped an invalid persisted query');
      continue;
    }
    const schema = schemaFor(q.queryKey);
    if (schema?.safeParse(q.state.data).success) kept.push(q);
    else console.warn('query cache: dropped an invalid persisted query');
  }
  return {
    timestamp: envelope.data.timestamp,
    buster: envelope.data.buster,
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
      const saved = parsePersisted(await get(KEY));
      const notes = await loadNotes();
      if (!notes) return saved;
      const client: PersistedClient = saved ?? {
        timestamp: Date.now(),
        buster: '',
        clientState: { mutations: [], queries: [] },
      };
      // dataUpdatedAt 0 makes it stale, so it syncs right after first paint.
      const qc = new QueryClient();
      qc.setQueryData(['notes'], notes, { updatedAt: 0 });
      client.clientState.queries.push(...dehydrate(qc).queries);
      return client;
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
  await clearNotes().catch((err) => console.warn('note store: could not clear', err));
}
