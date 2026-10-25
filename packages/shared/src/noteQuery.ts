import type { Importance, Note, NoteSort, NoteStatus, Urgency } from './index';

// One implementation of "which notes, in what order" for the web list and the agent's tools.

export type NoteFilter = {
  text: string;
  categoryIds: string[];
  tagIds: string[];
  statuses: NoteStatus[];
  importances: Importance[];
  urgencies: Urgency[];
  /** Inclusive `YYYY-MM-DD` ranges; empty string = open end. */
  createdFrom: string;
  createdTo: string;
  dueFrom: string;
  dueTo: string;
  /** Only notes that have at least one unread link. */
  unreadLinksOnly: boolean;
};

export const EMPTY_FILTER: NoteFilter = {
  text: '',
  categoryIds: [],
  tagIds: [],
  statuses: [],
  importances: [],
  urgencies: [],
  createdFrom: '',
  createdTo: '',
  dueFrom: '',
  dueTo: '',
  unreadLinksOnly: false,
};

/** Case-insensitive, Hebrew niqqud and cantillation marks removed. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[֑-ׇ]/g, '')
    .normalize('NFC')
    .toLowerCase();
}

/** Past its due date and not done. Due today is not overdue. */
export function isOverdue(note: Pick<Note, 'dueDate' | 'status'>, today: string): boolean {
  return note.dueDate !== null && note.status !== 'done' && note.dueDate < today;
}

/** The viewer's local `YYYY-MM-DD` for a timestamp, matching the date the card displays. */
const localDay = (iso: string): string => new Date(iso).toLocaleDateString('en-CA');

const inRange = (value: string | null, from: string, to: string): boolean => {
  if (from === '' && to === '') return true;
  if (value === null) return false;
  return (from === '' || value >= from) && (to === '' || value <= to);
};

const anyOf = <T>(selected: T[], has: (x: T) => boolean) =>
  selected.length === 0 || selected.some(has);

export function filterNotes(notes: Note[], filter: NoteFilter, _today: string): Note[] {
  const text = normalizeText(filter.text.trim());
  return notes.filter(
    (n) =>
      (text === '' || normalizeText(n.body).includes(text)) &&
      anyOf(filter.categoryIds, (id) => n.categoryIds.includes(id)) &&
      anyOf(filter.tagIds, (id) => n.tagIds.includes(id)) &&
      anyOf(filter.statuses, (s) => n.status === s) &&
      anyOf(filter.importances, (i) => n.importance === i) &&
      anyOf(filter.urgencies, (u) => n.urgency === u) &&
      inRange(localDay(n.createdAt), filter.createdFrom, filter.createdTo) &&
      inRange(n.dueDate, filter.dueFrom, filter.dueTo) &&
      (!filter.unreadLinksOnly || n.unreadLinks.length > 0),
  );
}

const URGENCY_RANK: Record<Urgency, number> = {
  urgent: 0,
  critical: 1,
  medium: 2,
  not_critical: 3,
};
const urgencyRank = (n: Note) => (n.urgency === null ? 4 : URGENCY_RANK[n.urgency]);
const importanceRank = (n: Note) => (n.importance === 'important' ? 0 : 1);
/** Earlier due dates first, so overdue lead; no date last. */
const dueKey = (n: Note) => n.dueDate ?? '9999-99-99';
const cmp = (a: string | number, b: string | number) => (a < b ? -1 : a > b ? 1 : 0);
const newestFirst = (a: Note, b: Note) => cmp(b.createdAt, a.createdAt);

const bySort: Record<NoteSort, (a: Note, b: Note) => number> = {
  urgency: (a, b) =>
    cmp(urgencyRank(a), urgencyRank(b)) ||
    cmp(importanceRank(a), importanceRank(b)) ||
    cmp(dueKey(a), dueKey(b)) ||
    newestFirst(a, b),
  due_date: (a, b) =>
    cmp(dueKey(a), dueKey(b)) || cmp(urgencyRank(a), urgencyRank(b)) || newestFirst(a, b),
  newest: newestFirst,
  oldest: (a, b) => cmp(a.createdAt, b.createdAt),
};

/** Drafts first, `done` last, the chosen order in between. Returns a new array. */
export function sortNotes(notes: Note[], sort: NoteSort, _today: string): Note[] {
  const band = (n: Note) => (n.status === 'draft' ? 0 : n.status === 'done' ? 2 : 1);
  return [...notes].sort((a, b) => cmp(band(a), band(b)) || bySort[sort](a, b));
}
