import type { Note, NoteStatus, Taxonomy } from '@notes/shared';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../ui/Icon';
import { Section } from '../../ui/Section';
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
  const upcomingCount = groups.upcoming.reduce((sum, u) => sum + u.notes.length, 0);
  return (
    <div className="flex flex-col gap-6">
      {groups.overdue.length > 0 && (
        <Section title={t('today.overdue')} count={groups.overdue.length}>
          <NoteList notes={groups.overdue} filtered={false} {...list} />
        </Section>
      )}
      {groups.dueToday.length > 0 && (
        <Section title={t('today.dueToday')} count={groups.dueToday.length}>
          <NoteList notes={groups.dueToday} filtered={false} {...list} />
        </Section>
      )}
      {groups.inProgress.length > 0 && (
        <Section title={t('today.inProgress')} count={groups.inProgress.length}>
          <NoteList notes={groups.inProgress} filtered={false} {...list} />
        </Section>
      )}
      {upcomingCount > 0 && (
        <section aria-label={t('today.upcoming')} className="flex flex-col gap-4">
          <h3 className="text-lg font-bold">{t('today.upcoming')}</h3>
          {groups.upcoming.map(
            (u) =>
              u.notes.length > 0 && (
                <Section key={u.date} title={formatDate(u.date, lang)} count={u.notes.length} sub>
                  <NoteList notes={u.notes} filtered={false} {...list} />
                </Section>
              ),
          )}
        </section>
      )}
    </div>
  );
}
