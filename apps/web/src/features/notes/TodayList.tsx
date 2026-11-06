import type { Note, NoteStatus, Taxonomy } from '@notes/shared';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../ui/Icon';
import { formatDate } from './formatDate';
import { NoteList } from './NoteList';
import { todayCount, type TodayGroups } from './todayGroups';

type ListProps = {
  taxonomy: Taxonomy;
  today: string;
  onOpen: (note: Note) => void;
  onStatus: (note: Note, status: NoteStatus | null) => void;
  onToggleItem?: ((note: Note, index: number) => void) | undefined;
  /** Snooze the note until a day; `null` wakes it. */
  onSnooze?: ((note: Note, day: string | null) => void) | undefined;
  hiddenStatuses: readonly NoteStatus[];
  statusPendingId?: string | undefined;
  workspaceNames?: Map<string, string> | undefined;
  selectedId?: string | undefined;
};

/** The Today view: one headed `NoteList` per non-empty section, or an empty state. */
export function TodayList({
  groups,
  lang,
  onAllNotes,
  ...list
}: ListProps & { groups: TodayGroups; lang: string; onAllNotes: () => void }) {
  const { t } = useTranslation();
  if (todayCount(groups) === 0) {
    return (
      <div className="enter-fade flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong/60 px-6 py-14 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-accent-soft text-accent">
          <Icon name="calendar" size={22} />
        </span>
        <p className="font-medium">{t('today.empty')}</p>
        <button type="button" onClick={onAllNotes} className="btn btn-primary mt-2">
          {t('today.allNotes')}
        </button>
      </div>
    );
  }
  const section = (key: string, title: string, notes: Note[], sub = false) => {
    if (notes.length === 0) return null;
    const Heading = sub ? 'h4' : 'h3';
    return (
      <section key={key} aria-label={title} className="flex flex-col gap-3">
        <Heading className={sub ? 'text-sm font-semibold text-muted' : 'text-lg font-bold'}>
          {title} ({notes.length})
        </Heading>
        <NoteList notes={notes} filtered={false} {...list} />
      </section>
    );
  };
  const upcomingCount = groups.upcoming.reduce((sum, u) => sum + u.notes.length, 0);
  return (
    <div className="flex flex-col gap-6">
      {section('overdue', t('today.overdue'), groups.overdue)}
      {section('dueToday', t('today.dueToday'), groups.dueToday)}
      {section('inProgress', t('today.inProgress'), groups.inProgress)}
      {upcomingCount > 0 && (
        <section aria-label={t('today.upcoming')} className="flex flex-col gap-4">
          <h3 className="text-lg font-bold">{t('today.upcoming')}</h3>
          {groups.upcoming.map((u) => section(u.date, formatDate(u.date, lang), u.notes, true))}
        </section>
      )}
    </div>
  );
}
