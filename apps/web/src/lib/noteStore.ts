import { Note, type NoteChanges } from '@notes/shared';
import { clear, createStore, delMany, entries, get, setMany } from 'idb-keyval';
import { z } from 'zod';
import { api } from './api';

/** Bump when the stored record shape changes: an old store is wiped and fully re-synced. */
const VERSION = 1;
const META_KEY = '__meta__';

const Meta = z.object({ version: z.literal(VERSION), cursor: z.string() });

let store: ReturnType<typeof createStore> | undefined;
const db = () => (store ??= createStore('notes-device-store', 'notes'));

const byNewest = (a: Note, b: Note) =>
  a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? -1 : 1;

export async function clearNotes(): Promise<void> {
  await clear(db());
}

/** The device copy of the notes, or undefined (store wiped) when it can't be trusted. */
export async function loadNotes(): Promise<Note[] | undefined> {
  try {
    const all = await entries(db());
    if (all.length === 0) return undefined;
    let meta: unknown;
    const notes: Note[] = [];
    let dropped = 0;
    for (const [key, value] of all) {
      if (key === META_KEY) {
        meta = value;
        continue;
      }
      const parsed = Note.safeParse(value);
      if (parsed.success) notes.push(parsed.data);
      else dropped++;
    }
    if (dropped > 0 || !Meta.safeParse(meta).success) {
      console.warn(`note store: wiped, ${dropped} invalid record(s) or missing/old metadata`);
      await clearNotes();
      return undefined;
    }
    return notes.sort(byNewest);
  } catch (err) {
    console.warn('note store: could not read', err);
    return undefined;
  }
}

async function readCursor(): Promise<string | undefined> {
  const meta = Meta.safeParse(await get(META_KEY, db()));
  return meta.success ? meta.data.cursor : undefined;
}

/** Download what changed since the stored cursor, persist it and return the merged list. */
export async function syncNotes(current: Note[] | undefined): Promise<Note[]> {
  const cursor = current
    ? await readCursor().catch((err: unknown) => {
        console.warn('note store: could not read cursor', err);
        return undefined;
      })
    : undefined;
  const changes: NoteChanges = await api.noteChanges(cursor);
  const merged = new Map<string, Note>(cursor && current ? current.map((n) => [n.id, n]) : []);
  for (const n of changes.notes) merged.set(n.id, n);
  for (const id of changes.deletedIds) merged.delete(id);
  try {
    if (!cursor) await clearNotes();
    // Deletions first, and the cursor last: if anything fails, the cursor stays behind and the
    // next sync re-sends the same delta instead of skipping it.
    if (changes.deletedIds.length > 0) await delMany(changes.deletedIds, db());
    await setMany(
      [
        ...changes.notes.map((n): [string, unknown] => [n.id, n]),
        [META_KEY, { version: VERSION, cursor: changes.cursor }],
      ],
      db(),
    );
  } catch (err) {
    console.warn('note store: could not save', err);
  }
  return [...merged.values()].sort(byNewest);
}
