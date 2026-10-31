import { NoteStatus } from './notes';

// The note-status rules in one place: moves, legality, ordering and styling. A note may have no
// status (`null`): it is not something to do.

const FLOW: NoteStatus[] = ['todo', 'in_progress', 'done'];

/** The legal one-step moves from a status. A draft or a note without status has none. */
export function statusMoves(status: NoteStatus | null): {
  back: NoteStatus | null;
  forward: NoteStatus | null;
} {
  const i = status === null ? -1 : FLOW.indexOf(status);
  if (i === -1) return { back: null, forward: null };
  return { back: FLOW[i - 1] ?? null, forward: FLOW[i + 1] ?? null };
}

/**
 * Draft → `todo` or `null` (submit); `null` → `todo` (turn on); any flow status → `null`
 * (turn off); otherwise one flow step. Nothing goes back to draft.
 */
export function isValidTransition(from: NoteStatus | null, to: NoteStatus | null): boolean {
  if (from === to) return true;
  if (to === 'draft') return false;
  if (from === 'draft') return to === 'todo' || to === null;
  if (from === null) return to === 'todo';
  if (to === null) return true;
  const { back, forward } = statusMoves(from);
  return to === back || to === forward;
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
