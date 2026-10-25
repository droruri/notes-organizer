import type { Note, Taxonomy } from '@notes/shared';
import { useTranslation } from 'react-i18next';

export function NoteList({ notes, taxonomy }: { notes: Note[]; taxonomy: Taxonomy }) {
  const { t } = useTranslation();
  if (notes.length === 0) return <p className="text-muted">{t('notes.empty')}</p>;
  const categories = new Map(taxonomy.categories.map((c) => [c.id, c.name]));
  const tags = new Map(taxonomy.categories.flatMap((c) => c.tags.map((tag) => [tag.id, tag.name])));
  return (
    <ul className="flex flex-col gap-3">
      {notes.map((n) => (
        <li key={n.id} className="rounded-lg border border-line p-3">
          <p className="whitespace-pre-wrap">{n.body}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            <span className="rounded bg-surface-hover px-2">{t(`notes.status.${n.status}`)}</span>
            {n.dueDate && <span className="text-muted">{n.dueDate}</span>}
            {n.importance && <span>{t(`notes.importanceValues.${n.importance}`)}</span>}
            {n.urgency && <span>{t(`notes.urgencyValues.${n.urgency}`)}</span>}
            {[
              ...n.categoryIds.map((id) => categories.get(id)),
              ...n.tagIds.map((id) => tags.get(id)),
            ].map((label, i) =>
              label ? (
                <span key={i} className="rounded-full border border-line px-2">
                  {label}
                </span>
              ) : null,
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
