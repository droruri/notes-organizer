import { z } from 'zod';

const KEY = 'notes-last-access-v1';

const LastAccess = z.object({ userId: z.string(), isAdmin: z.boolean() });

/** The last `allowed` result for this user, or undefined. Never throws. */
export function readLastAccess(userId: string): { isAdmin: boolean } | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return undefined;
    const parsed = LastAccess.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      console.warn('last access: stored value is invalid; ignoring it');
      return undefined;
    }
    if (parsed.data.userId !== userId) return undefined;
    return { isAdmin: parsed.data.isAdmin };
  } catch (err) {
    console.warn('last access: could not read storage', err);
    return undefined;
  }
}

export function saveLastAccess(userId: string, isAdmin: boolean): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ userId, isAdmin }));
  } catch (err) {
    console.warn('last access: could not save', err);
  }
}

export function clearLastAccess(): void {
  try {
    localStorage.removeItem(KEY);
  } catch (err) {
    console.warn('last access: could not clear', err);
  }
}
