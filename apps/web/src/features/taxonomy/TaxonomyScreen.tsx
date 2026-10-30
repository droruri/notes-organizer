import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiRequestError } from '../../lib/api';
import { Icon } from '../../ui/Icon';
import { Loading } from '../../ui/Loading';

type TaxonomyApi = Pick<
  typeof api,
  | 'taxonomy'
  | 'createCategory'
  | 'renameCategory'
  | 'deleteCategory'
  | 'restoreCategory'
  | 'createTag'
  | 'renameTag'
  | 'deleteTag'
  | 'restoreTag'
>;

type Kind = 'category' | 'tag';
/** What the inline form is open for: renaming an item, or adding a tag to a category. */
type Editing = { type: 'rename'; kind: Kind; id: string } | { type: 'addTag'; categoryId: string };

/** Categories & tags: every category with its tags; add, rename, delete and restore inline. */
export function TaxonomyScreen({
  onBack,
  onTag,
  taxonomyApi = api,
}: {
  onBack: () => void;
  /** Open the notes list filtered to this tag. */
  onTag: (tagId: string) => void;
  taxonomyApi?: TaxonomyApi;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [newCategory, setNewCategory] = useState('');
  const [editing, setEditing] = useState<Editing | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const taxonomy = useQuery({ queryKey: ['taxonomy'], queryFn: taxonomyApi.taxonomy });

  const run = useMutation({
    mutationFn: (write: () => Promise<unknown>) => write(),
    onSuccess: async () => {
      setEditing(null);
      setDraft('');
      await queryClient.invalidateQueries({ queryKey: ['taxonomy'] });
    },
    onError: (err) => {
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
    },
  });
  const write = (fn: () => Promise<unknown>) => {
    setError(null);
    run.mutate(fn);
  };
  const startEdit = (next: Editing, value: string) => {
    setError(null);
    setEditing(next);
    setDraft(value);
  };

  const inlineForm = (label: string, submit: () => Promise<unknown>) => (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        write(submit);
      }}
    >
      <input
        aria-label={label}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        required
        autoFocus
        className="field min-w-40 flex-1"
      />
      <button type="submit" disabled={run.isPending} className="btn btn-primary btn-sm">
        {t('taxonomy.save')}
      </button>
      <button type="button" onClick={() => setEditing(null)} className="btn btn-ghost btn-sm">
        {t('taxonomy.cancel')}
      </button>
    </form>
  );

  const isRename = (kind: Kind, id: string) =>
    editing?.type === 'rename' && editing.kind === kind && editing.id === id;

  return (
    <section className="enter-rise flex flex-col gap-5">
      <div className="flex flex-col items-start gap-2">
        <button type="button" onClick={onBack} className="btn btn-ghost btn-sm -ms-3 text-muted">
          <Icon name="back" size={16} />
          {t('taxonomy.back')}
        </button>
        <h2 className="text-[1.75rem] leading-tight font-bold tracking-tight">
          {t('taxonomy.title')}
        </h2>
      </div>

      <form
        className="card flex flex-wrap items-center gap-3 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          const name = newCategory;
          write(async () => {
            await taxonomyApi.createCategory(name);
            setNewCategory('');
          });
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
        <button type="submit" disabled={run.isPending} className="btn btn-primary">
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
        <ul className="flex flex-col gap-3">
          {taxonomy.data.categories.map((c) => (
            <li
              key={c.id}
              className={`card flex flex-col gap-3 p-4 ${c.deleted ? 'text-muted opacity-70' : ''}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                {isRename('category', c.id) ? (
                  inlineForm(t('taxonomy.renameLabel', { name: c.name }), () =>
                    taxonomyApi.renameCategory(c.id, draft),
                  )
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
                        disabled={run.isPending}
                        onClick={() => write(() => taxonomyApi.restoreCategory(c.id))}
                      >
                        {t('taxonomy.restore')}
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          aria-label={t('taxonomy.renameItem', { name: c.name })}
                          disabled={run.isPending}
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
                          disabled={run.isPending}
                          onClick={() => write(() => taxonomyApi.deleteCategory(c.id))}
                        >
                          {t('taxonomy.delete')}
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>

              <ul className="flex flex-col gap-2">
                {c.tags.map((tag) => (
                  <li
                    key={tag.id}
                    className={`flex flex-wrap items-center gap-2 ${tag.deleted ? 'text-muted opacity-70' : ''}`}
                  >
                    {isRename('tag', tag.id) ? (
                      inlineForm(t('taxonomy.renameLabel', { name: tag.name }), () =>
                        taxonomyApi.renameTag(tag.id, draft),
                      )
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
                            disabled={run.isPending}
                            onClick={() => write(() => taxonomyApi.restoreTag(tag.id))}
                          >
                            {t('taxonomy.restore')}
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              aria-label={t('taxonomy.renameItem', { name: tag.name })}
                              disabled={run.isPending}
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
                              disabled={run.isPending}
                              onClick={() => write(() => taxonomyApi.deleteTag(tag.id))}
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
                  inlineForm(t('taxonomy.newTagIn', { name: c.name }), () =>
                    taxonomyApi.createTag(c.id, draft),
                  )
                ) : (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm self-start"
                    aria-label={t('taxonomy.addTagTo', { name: c.name })}
                    disabled={run.isPending}
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
