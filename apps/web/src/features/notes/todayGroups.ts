import { isOverdue, sortNotes, type Note, type NoteSort } from '@notes/shared';

export type TodayGroups = {
  overdue: Note[];
  dueToday: Note[];
  inProgress: Note[];
  /** Due after today and within 7 days, one entry per date, ascending. */
  upcoming: { date: string; notes: Note[] }[];
};

/** `YYYY-MM-DD` + `days`. UTC math on the string, so DST cannot shift it. */
const addDays = (day: string, days: number): string => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * Sorts the actionable notes into the Today view's sections. A note lands in the first section it
 * matches: overdue, due today, in progress, upcoming. Drafts and done notes never show.
 */
export function todayGroups(notes: Note[], today: string, sort: NoteSort): TodayGroups {
  const weekEnd = addDays(today, 7);
  const overdue: Note[] = [];
  const dueToday: Note[] = [];
  const inProgress: Note[] = [];
  const byDate = new Map<string, Note[]>();
  for (const n of notes) {
    if (n.status === 'draft' || n.status === 'done') continue;
    if (isOverdue(n, today)) overdue.push(n);
    else if (n.dueDate === today) dueToday.push(n);
    else if (n.status === 'in_progress') inProgress.push(n);
    else if (n.dueDate !== null && n.dueDate > today && n.dueDate <= weekEnd) {
      const list = byDate.get(n.dueDate);
      if (list) list.push(n);
      else byDate.set(n.dueDate, [n]);
    }
  }
  return {
    overdue: sortNotes(overdue, 'due_date', today),
    dueToday: sortNotes(dueToday, sort, today),
    inProgress: sortNotes(inProgress, sort, today),
    upcoming: [...byDate.keys()]
      .sort()
      .map((date) => ({ date, notes: sortNotes(byDate.get(date) ?? [], sort, today) })),
  };
}

export const todayCount = (g: TodayGroups): number =>
  g.overdue.length +
  g.dueToday.length +
  g.inProgress.length +
  g.upcoming.reduce((sum, u) => sum + u.notes.length, 0);
