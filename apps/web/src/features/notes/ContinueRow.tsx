import { isOverdue, type Note, type Taxonomy } from '@notes/shared';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate } from './formatDate';
import { continueNotes, useRecentNoteIds } from './recent';

const MOBILE_ROWS = 3;

export function ContinueRow({
  notes,
  taxonomy,
  today,
  onOpen,
}: {
  /** Notes of the current workspace. */
  notes: Note[];
  taxonomy: Taxonomy;
  today: string;
  onOpen: (note: Note) => void;
}) {
  const { t, i18n } = useTranslation();
  const recentIds = useRecentNoteIds();
  const [expanded, setExpanded] = useState(false);
  const items = useMemo(() => continueNotes(notes, recentIds, today), [notes, recentIds, today]);
  const colors = useMemo(
    () => new Map(taxonomy.categories.map((c) => [c.id, c.color])),
    [taxonomy],
  );
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="continue-title" className="@container flex flex-col gap-2">
      <h3 id="continue-title" className="text-sm font-semibold text-muted">
        {t('notes.continue.title')}
      </h3>
      {/* Desktop columns follow the list pane width, not the viewport: the pane can be narrow. */}
      <ul className="grid grid-cols-1 gap-2 lg:@md:grid-cols-2 lg:@3xl:grid-cols-4">
        {items.map((note, i) => {
          const color = note.categoryIds.map((id) => colors.get(id)).find((c) => c !== undefined);
          const label = note.title?.trim() || note.body.trim().split('\n')[0] || '';
          return (
            <li key={note.id} className={!expanded && i >= MOBILE_ROWS ? 'max-lg:hidden' : ''}>
              <button
                type="button"
                onClick={() => onOpen(note)}
                className="card relative flex min-h-11 w-full flex-col items-start gap-1 overflow-hidden p-3 ps-4 text-start"
              >
                <span
                  aria-hidden="true"
                  data-testid="color-bar"
                  style={color ? { backgroundColor: `var(--cat-${color}-ink)` } : undefined}
                  className="absolute inset-y-0 start-0 w-1 bg-border"
                />
                <span dir="auto" className="line-clamp-1 w-full text-sm font-medium">
                  {label}
                </span>
                <span className="flex items-center gap-2 text-xs text-muted">
                  <span>{formatDate(note.updatedAt, i18n.language)}</span>
                  {isOverdue(note, today) && (
                    <span className="pill bg-danger-soft text-danger">{t('notes.overdue')}</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {items.length > MOBILE_ROWS && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((e) => !e)}
          className="btn min-h-11 self-start lg:hidden"
        >
          {t(expanded ? 'notes.continue.less' : 'notes.continue.more')}
        </button>
      )}
    </section>
  );
}
