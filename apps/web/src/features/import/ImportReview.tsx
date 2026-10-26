import type { ImportConfirm, ImportProposal, Note, Suggestion, Taxonomy } from '@notes/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NoteEditor } from '../notes/NoteEditor';
import { UnreadLinkChips } from '../notes/UnreadLinkChips';
import { buildConfirm, categoryKey, namesOf, tagKey, type Row } from './proposal';

const PLACEHOLDER_ID = '00000000-0000-4000-8000-000000000000';

const asNote = (row: Row): Note => ({
  id: PLACEHOLDER_ID,
  clientId: PLACEHOLDER_ID,
  title: row.suggestion.title,
  body: row.body,
  status: 'draft',
  importance: row.suggestion.importance,
  urgency: row.suggestion.urgency,
  dueDate: row.suggestion.dueDate,
  proposed: null,
  unreadLinks: row.suggestion.unreadLinks,
  categoryIds: row.suggestion.categoryIds,
  tagIds: row.suggestion.tagIds,
  hasAudio: false,
  createdAt: '',
  updatedAt: '',
});

const toggled = <T,>(set: ReadonlySet<T>, value: T): Set<T> => {
  const next = new Set(set);
  if (!next.delete(value)) next.add(value);
  return next;
};

/** One screen: new categories, new tags and notes with checkboxes; a note row opens the editor. */
export function ImportReview({
  proposal,
  taxonomy,
  busy,
  failed,
  onConfirm,
  onCancel,
}: {
  proposal: ImportProposal;
  taxonomy: Taxonomy;
  busy: boolean;
  failed: boolean;
  onConfirm: (body: ImportConfirm) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Row[]>(proposal.notes);
  const [selected, setSelected] = useState<ReadonlySet<number>>(
    () => new Set(proposal.notes.map((_, i) => i)),
  );
  const [excludedCategories, setExcludedCategories] = useState<ReadonlySet<string>>(new Set());
  const [excludedTags, setExcludedTags] = useState<ReadonlySet<string>>(new Set());
  const [editing, setEditing] = useState<number | null>(null);

  const editingRow = editing === null ? undefined : rows[editing];
  if (editing !== null && editingRow) {
    return (
      <NoteEditor
        key={editing}
        note={asNote(editingRow)}
        suggestion={editingRow.suggestion}
        taxonomy={taxonomy}
        busy={false}
        failed={false}
        onSubmit={(edit) => {
          const suggestion: Suggestion = {
            categoryIds: edit.categoryIds ?? [],
            tagIds: edit.tagIds ?? [],
            newCategories: edit.newCategories ?? [],
            newTags: edit.newTags ?? [],
            dueDate: edit.dueDate ?? null,
            importance: edit.importance ?? null,
            urgency: edit.urgency ?? null,
            title: edit.title ?? null,
            unreadLinks: edit.unreadLinks ?? [],
          };
          setRows(
            rows.map((r, i) => (i === editing ? { body: edit.body ?? r.body, suggestion } : r)),
          );
          setEditing(null);
        }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  const names = namesOf(rows);
  const unreadNotes = rows.filter((r, i) => selected.has(i) && r.suggestion.unreadLinks.length > 0);
  const label = (tag: (typeof names.tags)[number]) =>
    'categoryId' in tag
      ? `${tag.name} · ${taxonomy.categories.find((c) => c.id === tag.categoryId)?.name ?? ''}`
      : `${tag.name} · ${tag.categoryName}`;

  return (
    <section className="flex flex-col gap-4">
      {unreadNotes.length > 0 && (
        <p role="status" className="notice notice-danger">
          {t('import.banner', {
            count: unreadNotes.length,
            read: proposal.links.read,
            total: proposal.links.total,
          })}
        </p>
      )}
      {names.categories.length > 0 && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-2 text-sm font-medium text-muted">
            {t('import.newCategories')}
          </legend>
          {names.categories.map((name) => (
            <label key={categoryKey(name)} className="flex min-h-9 items-center gap-2.5">
              <input
                type="checkbox"
                className="check"
                checked={!excludedCategories.has(categoryKey(name))}
                onChange={() =>
                  setExcludedCategories(toggled(excludedCategories, categoryKey(name)))
                }
              />
              {name}
            </label>
          ))}
        </fieldset>
      )}
      {names.tags.length > 0 && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-2 text-sm font-medium text-muted">{t('import.newTags')}</legend>
          {names.tags.map((tag) => (
            <label key={tagKey(tag)} className="flex min-h-9 items-center gap-2.5">
              <input
                type="checkbox"
                className="check"
                checked={!excludedTags.has(tagKey(tag))}
                onChange={() => setExcludedTags(toggled(excludedTags, tagKey(tag)))}
              />
              {label(tag)}
            </label>
          ))}
        </fieldset>
      )}
      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-2 text-sm font-medium text-muted">{t('import.notes')}</legend>
        {rows.length === 0 && <p className="text-muted">{t('import.none')}</p>}
        {rows.map((row, i) => (
          <div
            key={i}
            className={`card flex items-start gap-3 p-3.5 transition-opacity duration-150 ${
              selected.has(i) ? '' : 'opacity-55'
            }`}
          >
            <input
              type="checkbox"
              checked={selected.has(i)}
              onChange={() => setSelected(toggled(selected, i))}
              aria-label={row.body.slice(0, 60)}
              className="check mt-1 shrink-0"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span dir="auto" className="break-words whitespace-pre-wrap">
                {row.body}
              </span>
              {row.suggestion.unreadLinks.length > 0 && (
                <div className="flex flex-wrap gap-2 text-sm">
                  <UnreadLinkChips links={row.suggestion.unreadLinks} />
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setEditing(i)}
              className="btn btn-ghost btn-sm shrink-0"
            >
              {t('import.edit')}
            </button>
          </div>
        ))}
      </fieldset>
      {failed && (
        <p role="alert" className="notice notice-danger">
          {t('import.confirmError')}
        </p>
      )}
      <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-line bg-bg/90 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md">
        <button
          type="button"
          disabled={busy || selected.size === 0}
          onClick={() =>
            onConfirm(
              buildConfirm(rows, selected, { categories: excludedCategories, tags: excludedTags }),
            )
          }
          className="btn btn-primary"
        >
          {busy && <span aria-hidden="true" className="spinner" />}
          {busy ? t('import.confirming') : t('import.confirm', { count: selected.size })}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-ghost">
          {t('import.cancel')}
        </button>
      </div>
    </section>
  );
}
