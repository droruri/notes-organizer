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
        <p role="status" className="rounded-md border border-danger p-3 text-danger">
          {t('import.banner', {
            count: unreadNotes.length,
            read: proposal.links.read,
            total: proposal.links.total,
          })}
        </p>
      )}
      {names.categories.length > 0 && (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm text-muted">{t('import.newCategories')}</legend>
          {names.categories.map((name) => (
            <label key={categoryKey(name)} className="flex items-center gap-2">
              <input
                type="checkbox"
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
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm text-muted">{t('import.newTags')}</legend>
          {names.tags.map((tag) => (
            <label key={tagKey(tag)} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!excludedTags.has(tagKey(tag))}
                onChange={() => setExcludedTags(toggled(excludedTags, tagKey(tag)))}
              />
              {label(tag)}
            </label>
          ))}
        </fieldset>
      )}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm text-muted">{t('import.notes')}</legend>
        {rows.length === 0 && <p className="text-muted">{t('import.none')}</p>}
        {rows.map((row, i) => (
          <div key={i} className="flex items-start gap-2 rounded-lg border border-line p-3">
            <input
              type="checkbox"
              checked={selected.has(i)}
              onChange={() => setSelected(toggled(selected, i))}
              aria-label={row.body.slice(0, 60)}
              className="mt-1"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="whitespace-pre-wrap break-words">{row.body}</span>
              {row.suggestion.unreadLinks.length > 0 && (
                <div className="flex flex-wrap gap-2 text-sm">
                  <UnreadLinkChips links={row.suggestion.unreadLinks} />
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setEditing(i)}
              className="rounded-md border border-line px-3 py-1 hover:bg-surface-hover"
            >
              {t('import.edit')}
            </button>
          </div>
        ))}
      </fieldset>
      {failed && (
        <p role="alert" className="text-danger">
          {t('import.confirmError')}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy || selected.size === 0}
          onClick={() =>
            onConfirm(
              buildConfirm(rows, selected, { categories: excludedCategories, tags: excludedTags }),
            )
          }
          className="rounded-md bg-fg px-4 py-2 text-bg disabled:opacity-50"
        >
          {busy ? t('import.confirming') : t('import.confirm', { count: selected.size })}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-line px-4 py-2 hover:bg-surface-hover"
        >
          {t('import.cancel')}
        </button>
      </div>
    </section>
  );
}
