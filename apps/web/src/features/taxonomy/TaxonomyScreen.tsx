import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useCreateCategory,
  useCreateTag,
  useDeleteCategory,
  useDeleteTag,
  useRenameCategory,
  useRenameTag,
  useRestoreCategory,
  useRestoreTag,
  useSetCategoryColor,
  useSetCategoryImportance,
  useSetCategoryPinned,
  useTaxonomy,
} from '../../api';
import { ApiRequestError } from '../../lib/api';
import { NavBar } from '../../ui/NavBar';
import { Icon } from '../../ui/Icon';
import { InlineEditForm } from '../../ui/InlineEditForm';
import { Loading } from '../../ui/Loading';
import { ColorControl } from './ColorControl';
import { ImportanceControl } from './ImportanceControl';

type Kind = 'category' | 'tag';
/** What the inline form is open for: renaming an item, or adding a tag to a category. */
type Editing = { type: 'rename'; kind: Kind; id: string } | { type: 'addTag'; categoryId: string };

/** Categories & tags: every category with its tags; add, rename, delete and restore inline. */
export function TaxonomyScreen({
  onBack,
  onTag,
}: {
  onBack: () => void;
  /** Open the notes list filtered to this tag. */
  onTag: (tagId: string) => void;
}) {
  const { t } = useTranslation();
  const [newCategory, setNewCategory] = useState('');
  const [editing, setEditing] = useState<Editing | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const taxonomy = useTaxonomy();
  const createCategory = useCreateCategory();
  const renameCategory = useRenameCategory();
  const setColor = useSetCategoryColor();
  const setPinned = useSetCategoryPinned();
  const setImportance = useSetCategoryImportance();
  const deleteCategory = useDeleteCategory();
  const restoreCategory = useRestoreCategory();
  const createTag = useCreateTag();
  const renameTag = useRenameTag();
  const deleteTag = useDeleteTag();
  const restoreTag = useRestoreTag();
  const busy = [
    createCategory,
    renameCategory,
    setColor,
    setPinned,
    setImportance,
    deleteCategory,
    restoreCategory,
    createTag,
    renameTag,
    deleteTag,
    restoreTag,
  ].some((m) => m.isPending);

  const showError = (err: unknown) => {
    const code = err instanceof ApiRequestError ? err.code : undefined;
    setError(
      code === 'name_taken'
        ? t('chat.action.nameTaken')
        : code === 'category_deleted'
          ? t('taxonomy.errors.categoryDeleted')
          : code === 'invalid_name'
            ? t('taxonomy.errors.invalidName')
            : t('taxonomy.errors.generic'),
    );
  };
  const write = <V,>(
    m: {
      mutate: (vars: V, options: { onSuccess: () => void; onError: (err: Error) => void }) => void;
    },
    vars: V,
    onDone?: () => void,
  ) => {
    setError(null);
    m.mutate(vars, {
      onSuccess: () => {
        setEditing(null);
        setDraft('');
        onDone?.();
      },
      onError: showError,
    });
  };
  const startEdit = (next: Editing, value: string) => {
    setError(null);
    setEditing(next);
    setDraft(value);
  };

  const isRename = (kind: Kind, id: string) =>
    editing?.type === 'rename' && editing.kind === kind && editing.id === id;

  return (
    <section className="enter-rise detail-screen flex flex-col gap-5">
      <NavBar title={t('taxonomy.title')} onBack={onBack} />

      <form
        className="card flex flex-wrap items-center gap-3 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          write(createCategory, newCategory, () => setNewCategory(''));
        }}
      >
        <input
          aria-label={t('taxonomy.newCategory')}
          placeholder={t('taxonomy.newCategory')}
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
          required
          className="field min-w-40 flex-1"
        />
        <button type="submit" disabled={busy} className="btn btn-primary">
          <Icon name="plus" size={16} />
          {t('taxonomy.addCategory')}
        </button>
      </form>

      {error && (
        <p role="alert" className="notice notice-danger">
          {error}
        </p>
      )}
      {taxonomy.isPending && <Loading label={t('taxonomy.loading')} />}
      {taxonomy.isError && (
        <p role="alert" className="notice notice-danger">
          {t('taxonomy.errors.generic')}
        </p>
      )}

      {taxonomy.data && (
        <ul className="group-list">
          {taxonomy.data.categories.map((c) => (
            <li
              key={c.id}
              className={`flex flex-col gap-3 p-4 ${c.deleted ? 'text-muted opacity-70' : ''}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                {isRename('category', c.id) ? (
                  <InlineEditForm
                    label={t('taxonomy.renameLabel', { name: c.name })}
                    value={draft}
                    onChange={setDraft}
                    onSubmit={() => write(renameCategory, { id: c.id, name: draft })}
                    onCancel={() => setEditing(null)}
                    disabled={busy}
                    saveLabel={t('taxonomy.save')}
                    cancelLabel={t('taxonomy.cancel')}
                  />
                ) : (
                  <>
                    <h3 className="me-auto font-semibold">
                      {c.name}
                      {c.deleted && <span className="pill ms-2">{t('taxonomy.deleted')}</span>}
                    </h3>
                    {c.deleted ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        aria-label={t('taxonomy.restoreItem', { name: c.name })}
                        disabled={busy}
                        onClick={() => write(restoreCategory, c.id)}
                      >
                        {t('taxonomy.restore')}
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          aria-label={t('taxonomy.renameItem', { name: c.name })}
                          disabled={busy}
                          onClick={() =>
                            startEdit({ type: 'rename', kind: 'category', id: c.id }, c.name)
                          }
                        >
                          {t('taxonomy.rename')}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm btn-danger"
                          aria-label={t('taxonomy.deleteItem', { name: c.name })}
                          disabled={busy}
                          onClick={() => write(deleteCategory, c.id)}
                        >
                          {t('taxonomy.delete')}
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>

              {c.deleted ? (
                c.importance && (
                  <span className="pill self-start">
                    {t('taxonomy.importance.pill', {
                      level: t(`taxonomy.importance.${c.importance}`),
                    })}
                  </span>
                )
              ) : (
                <ImportanceControl
                  name={c.name}
                  value={c.importance}
                  disabled={busy}
                  onChange={(next) => write(setImportance, { id: c.id, importance: next })}
                />
              )}

              <button
                type="button"
                aria-pressed={c.pinned}
                disabled={busy}
                className="btn btn-ghost min-h-11 min-w-11 self-start"
                onClick={() => write(setPinned, { id: c.id, pinned: !c.pinned })}
              >
                <Icon name="pin" aria-hidden="true" />
                {c.pinned
                  ? t('taxonomy.pin.unpin', { name: c.name })
                  : t('taxonomy.pin.pin', { name: c.name })}
              </button>

              {!c.deleted && (
                <ColorControl
                  name={c.name}
                  value={c.color}
                  disabled={busy}
                  onChange={(next) => write(setColor, { id: c.id, color: next })}
                />
              )}

              <ul className="flex flex-col gap-2">
                {c.tags.map((tag) => (
                  <li
                    key={tag.id}
                    className={`flex flex-wrap items-center gap-2 ${tag.deleted ? 'text-muted opacity-70' : ''}`}
                  >
                    {isRename('tag', tag.id) ? (
                      <InlineEditForm
                        label={t('taxonomy.renameLabel', { name: tag.name })}
                        value={draft}
                        onChange={setDraft}
                        onSubmit={() => write(renameTag, { id: tag.id, name: draft })}
                        onCancel={() => setEditing(null)}
                        disabled={busy}
                        saveLabel={t('taxonomy.save')}
                        cancelLabel={t('taxonomy.cancel')}
                      />
                    ) : (
                      <>
                        {tag.deleted ? (
                          <span className="me-auto">
                            {tag.name}
                            <span className="pill ms-2">{t('taxonomy.deleted')}</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="chip chip-tag me-auto"
                            onClick={() => onTag(tag.id)}
                          >
                            {tag.name}
                          </button>
                        )}
                        {tag.deleted ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            aria-label={t('taxonomy.restoreItem', { name: tag.name })}
                            disabled={busy}
                            onClick={() => write(restoreTag, tag.id)}
                          >
                            {t('taxonomy.restore')}
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              aria-label={t('taxonomy.renameItem', { name: tag.name })}
                              disabled={busy}
                              onClick={() =>
                                startEdit({ type: 'rename', kind: 'tag', id: tag.id }, tag.name)
                              }
                            >
                              {t('taxonomy.rename')}
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm btn-danger"
                              aria-label={t('taxonomy.deleteItem', { name: tag.name })}
                              disabled={busy}
                              onClick={() => write(deleteTag, tag.id)}
                            >
                              {t('taxonomy.delete')}
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </li>
                ))}
              </ul>

              {!c.deleted &&
                (editing?.type === 'addTag' && editing.categoryId === c.id ? (
                  <InlineEditForm
                    label={t('taxonomy.newTagIn', { name: c.name })}
                    value={draft}
                    onChange={setDraft}
                    onSubmit={() => write(createTag, { categoryId: c.id, name: draft })}
                    onCancel={() => setEditing(null)}
                    disabled={busy}
                    saveLabel={t('taxonomy.save')}
                    cancelLabel={t('taxonomy.cancel')}
                  />
                ) : (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm self-start"
                    aria-label={t('taxonomy.addTagTo', { name: c.name })}
                    disabled={busy}
                    onClick={() => startEdit({ type: 'addTag', categoryId: c.id }, '')}
                  >
                    <Icon name="plus" size={14} />
                    {t('taxonomy.addTag')}
                  </button>
                ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
