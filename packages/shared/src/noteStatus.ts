import { NoteStatus } from './notes';

// The note-status rules in one place: legality, ordering and styling. A note may have no
// status (`null`): it is not something to do.

/** The statuses a note can move among freely. */
export const TRACKED_STATUSES: NoteStatus[] = ['todo', 'in_progress', 'done'];

/**
 * Draft → `todo` or `null` (submit); any move among `todo`, `in_progress`, `done` and `null` is
 * valid. Nothing goes back to draft.
 */
export function isValidTransition(from: NoteStatus | null, to: NoteStatus | null): boolean {
  if (from === to) return true;
  if (to === 'draft') return false;
  if (from === 'draft') return to === 'todo' || to === null;
  return true;
}

/** Not done; a note without status counts as open. */
export function isOpen(status: NoteStatus | null): boolean {
  return status !== 'done';
}

/** List band: drafts first, `done` last. */
export function sortBand(status: NoteStatus | null): number {
  return status === 'draft' ? 0 : status === 'done' ? 2 : 1;
}

/** CSS class for the card slip and the status pill. */
export function statusClass(status: NoteStatus | null): string {
  return `status-${status ?? 'none'}`;
}
