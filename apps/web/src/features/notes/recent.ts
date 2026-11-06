import { useMemo, useSyncExternalStore } from 'react';
import { isOpen, isSnoozed, type Note } from '@notes/shared';
import { z } from 'zod';

const KEY = 'recentNotes';
const CAP = 20;
const RECENT = 5;
const MAX = 8;
const Stored = z.object({
  v: z.literal(1),
  items: z.array(z.object({ id: z.string(), at: z.number() })),
});
type Item = z.infer<typeof Stored>['items'][number];

const listeners = new Set<() => void>();

function readRaw(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Untrusted storage: anything invalid or unreadable is an empty list. */
export function parseRecent(raw: string | null): Item[] {
  if (raw === null) return [];
  try {
    const parsed = Stored.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.items : [];
  } catch {
    return [];
  }
}

/** Remember that a note was opened on this device (newest first, deduped, capped). */
export function recordOpen(noteId: string, now: number = Date.now()): void {
  const items = [{ id: noteId, at: now }, ...parseRecent(readRaw()).filter((i) => i.id !== noteId)];
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, items: items.slice(0, CAP) }));
  } catch {
    // Private mode or full storage: recents are a convenience, so drop silently.
  }
  listeners.forEach((l) => l());
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};

/** Recently opened note ids, newest first. */
export function useRecentNoteIds(): string[] {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  return useMemo(() => parseRecent(raw).map((i) => i.id), [raw]);
}

/** Up to 8 notes: the last 5 opened here, then due-today or overdue open ones. */
export function continueNotes(notes: Note[], recentIds: string[], today: string): Note[] {
  const byId = new Map(notes.map((n) => [n.id, n]));
  const picked: Note[] = [];
  const seen = new Set<string>();
  for (const id of recentIds) {
    const n = byId.get(id);
    if (!n || seen.has(id) || isSnoozed(n, today)) continue;
    seen.add(id);
    picked.push(n);
    if (picked.length === RECENT) break;
  }
  const due = notes
    .filter(
      (n) =>
        !seen.has(n.id) &&
        n.dueDate !== null &&
        n.dueDate <= today &&
        isOpen(n.status) &&
        !isSnoozed(n, today),
    )
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
  return [...picked, ...due].slice(0, MAX);
}
