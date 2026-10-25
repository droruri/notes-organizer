import { del, get, set } from 'idb-keyval';
import { z } from 'zod';

const KEY = 'notes-outbox-v1';

export const OutboxEntry = z.object({
  clientId: z.uuid(),
  body: z.string(),
  createdAt: z.string(),
  hasAudio: z.boolean(),
});
export type OutboxEntry = z.infer<typeof OutboxEntry>;

/** The queued notes, oldest first. Bad entries are dropped with a warning; never throws. */
export function readOutbox(): OutboxEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return [];
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) {
      console.warn('outbox: stored value is not a list; ignoring it');
      return [];
    }
    const entries: OutboxEntry[] = [];
    for (const item of list) {
      const parsed = OutboxEntry.safeParse(item);
      if (parsed.success) entries.push(parsed.data);
      else console.warn('outbox: dropped an invalid entry');
    }
    return entries;
  } catch (err) {
    console.warn('outbox: could not read storage', err);
    return [];
  }
}

function write(entries: OutboxEntry[]) {
  localStorage.setItem(KEY, JSON.stringify(entries));
}

/** Queue a note (and its recording, if any). Resolves false when the device refused to store it. */
export async function addToOutbox(
  entry: Omit<OutboxEntry, 'hasAudio' | 'createdAt'>,
  audio?: Blob,
): Promise<boolean> {
  try {
    if (audio) await set(entry.clientId, audio);
    const rest = readOutbox().filter((e) => e.clientId !== entry.clientId);
    write([
      ...rest,
      { ...entry, hasAudio: audio !== undefined, createdAt: new Date().toISOString() },
    ]);
    return true;
  } catch (err) {
    console.warn('outbox: could not save', err);
    return false;
  }
}

/** Drop a sent note and its recording. */
export async function removeFromOutbox(clientId: string): Promise<void> {
  try {
    write(readOutbox().filter((e) => e.clientId !== clientId));
    await del(clientId);
  } catch (err) {
    console.warn('outbox: could not remove', err);
  }
}

/** The recording queued for `clientId`, if any. */
export async function readOutboxAudio(clientId: string): Promise<Blob | undefined> {
  try {
    const blob: unknown = await get(clientId);
    return blob instanceof Blob ? blob : undefined;
  } catch (err) {
    console.warn('outbox: could not read audio', err);
    return undefined;
  }
}
