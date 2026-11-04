import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';

/** Key of the overlay marker inside `history.state`, next to the router's own fields. */
const KEY = 'overlay';
const EntrySchema = z.object({ [KEY]: z.object({ id: z.number(), depth: z.number() }) });
type Entry = { id: number; depth: number };

let seq = 0;
/** Overlays that are open and not yet closing. */
const live = new Set<number>();

// History state is untrusted: anything without a well-formed marker is "no overlay".
const entryOf = (state: unknown): Entry | null => {
  const parsed = EntrySchema.safeParse(state);
  return parsed.success ? parsed.data[KEY] : null;
};

const write = (mode: 'push' | 'replace', entry: Entry) => {
  const current: unknown = window.history.state;
  // Keep the router's fields (key, idx, usr) so it still sees the same location.
  const next = {
    ...(typeof current === 'object' && current !== null ? current : {}),
    [KEY]: entry,
  };
  if (mode === 'push') window.history.pushState(next, '');
  else window.history.replaceState(next, '');
};

/**
 * Gives an open overlay its own history entry (same URL), so the browser or Android Back
 * button closes the overlay instead of leaving the page. `onBack` runs when Back pops the
 * entry; it returns false to stay open (the entry is pushed again). Nested overlays stack:
 * Back closes the top one only.
 *
 * Returns `release`: call it when the overlay starts closing any other way. Back then no
 * longer reaches it, an overlay opened meanwhile reuses its entry, and on unmount the entry
 * is popped if it is still on top. A navigation made while the overlay is open should
 * `replace`, so it takes over the overlay's entry instead of stacking above it.
 */
export function useBackClose(onBack: () => boolean) {
  const [id] = useState(() => ++seq);
  const depth = useRef(0);
  const released = useRef(false);
  const latest = useRef(onBack);
  useEffect(() => {
    latest.current = onBack;
  });

  useEffect(() => {
    const top = entryOf(window.history.state);
    // A StrictMode remount finds its own entry still on top and keeps it.
    if (top?.id !== id) {
      if (top && !live.has(top.id)) {
        // The top entry belongs to an overlay that is closing: take it over.
        depth.current = top.depth;
        write('replace', { id, depth: top.depth });
      } else {
        depth.current = (top?.depth ?? 0) + 1;
        write('push', { id, depth: depth.current });
      }
    }
    live.add(id);
    const onPop = () => {
      if (released.current) return;
      if ((entryOf(window.history.state)?.depth ?? 0) >= depth.current) return;
      if (!latest.current()) write('push', { id, depth: depth.current });
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      live.delete(id);
      if (released.current && entryOf(window.history.state)?.id === id) window.history.back();
    };
  }, [id]);

  return useCallback(() => {
    released.current = true;
    live.delete(id);
  }, [id]);
}
