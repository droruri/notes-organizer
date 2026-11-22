import type { Note } from '@notes/shared';
import type { QueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { notesKeys } from '../../api/notes.queries';
import { ApiNetworkError } from '../../lib/api';

export type SyncResult =
  | { at: number; failed?: undefined; changedIds: Set<string>; count: number }
  | { at: number; failed: true; network: boolean };

export type SyncState = { fetching: boolean; background: boolean; result?: SyncResult };

/** What a sync changed: ids that are new or have another `updatedAt`, and how many ids are gone. */
export function diffNotes(
  before: Note[] | undefined,
  after: Note[],
): { changedIds: string[]; removed: number } {
  const old = new Map((before ?? []).map((n) => [n.id, n.updatedAt]));
  const changedIds = after.filter((n) => old.get(n.id) !== n.updatedAt).map((n) => n.id);
  const kept = new Set(after.map((n) => n.id));
  let removed = 0;
  for (const id of old.keys()) if (!kept.has(id)) removed++;
  return { changedIds, removed };
}

let state: SyncState = { fetching: false, background: false };
const listeners = new Set<() => void>();
const set = (next: SyncState) => {
  state = next;
  listeners.forEach((l) => l());
};

/**
 * Follows the notes query: a fetch with cached data and no save in flight is a background sync.
 * (Mutations invalidate while still pending, so refreshes from the user's own saves are excluded.)
 */
export function watchNotesSync(queryClient: QueryClient): () => void {
  let before: Note[] | undefined;
  let wasFetching = false;
  const cache = queryClient.getQueryCache();
  const unsubscribe = cache.subscribe(() => {
    const query = cache.find<Note[]>({ queryKey: notesKeys.all, exact: true });
    if (!query) return;
    const fetching = query.state.fetchStatus === 'fetching';
    if (fetching && !wasFetching) {
      before = query.state.data;
      set({
        fetching: true,
        background: before !== undefined && queryClient.isMutating() === 0,
      });
    } else if (!fetching && wasFetching) {
      const { status, data } = query.state;
      const background = state.background;
      if (status === 'success' && data && background) {
        const { changedIds, removed } = diffNotes(before, data);
        set({
          fetching: false,
          background,
          result: {
            at: Date.now(),
            changedIds: new Set(changedIds),
            count: changedIds.length + removed,
          },
        });
      } else if (status === 'error') {
        const err = query.state.error;
        set({
          fetching: false,
          background,
          result: { at: Date.now(), failed: true, network: err instanceof ApiNetworkError },
        });
      } else set({ fetching: false, background });
    }
    wasFetching = fetching;
  });
  return () => {
    unsubscribe();
    set({ fetching: false, background: false });
  };
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export function useNotesSync(): SyncState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}
