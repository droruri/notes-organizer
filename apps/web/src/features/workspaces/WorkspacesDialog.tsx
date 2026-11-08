import type { Workspace } from '@notes/shared';
import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreateWorkspace, useDeleteWorkspace, useEditWorkspace } from '../../api';
import { ApiRequestError } from '../../lib/api';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';

/** Bottom sheet: pick the current workspace (a radio list), add one, or rename / make default / delete. */
export function WorkspacesDialog({
  workspaces,
  currentId,
  loadFailed = false,
  onPick,
  onClose,
}: {
  workspaces: Workspace[];
  currentId: string | undefined;
  loadFailed?: boolean;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const add = useCreateWorkspace({ onSuccess: () => setName('') });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim() && !add.isPending) add.mutate(name);
  };
  const [active, setActive] = useState<{ id: string; mode: 'menu' | 'rename' | 'confirm' } | null>(
    null,
  );
  const [renameValue, setRenameValue] = useState('');
  const defaultName = workspaces.find((w) => w.isDefault)?.name ?? '';
  const edit = useEditWorkspace({ onSuccess: () => setActive(null) });
  const remove = useDeleteWorkspace({
    onSuccess: (id) => {
      setActive(null);
      const fallback = workspaces.find((w) => w.isDefault);
      if (id === currentId && fallback) onPick(fallback.id);
    },
  });
  const rowError = (err: unknown) => {
    if (!(err instanceof ApiRequestError)) return t('workspaces.error');
    if (err.code === 'name_taken') return t('workspaces.nameTaken');
    if (err.code === 'invalid_name') return t('workspaces.invalidName');
    if (err.code === 'is_default') return t('workspaces.isDefault');
    if (err.code === 'not_found') return t('workspaces.notFound');
    return t('workspaces.error');
  };
  const saveRename = (w: Workspace) => {
    const next = renameValue.trim();
    if (next === '' || next === w.name) return setActive(null);
    if (!edit.isPending) edit.mutate({ id: w.id, patch: { name: next } });
  };
  const onRenameKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      setActive(null);
    }
  };
  const taken = add.error instanceof ApiRequestError && add.error.code === 'name_taken';
  return (
    <Sheet
      title={t('workspaces.title')}
      onClose={onClose}
      dirty={name !== '' || (active?.mode === 'rename' && renameValue !== '')}
    >
      {(close) => (
        <>
          <div
            role="radiogroup"
            aria-label={t('workspaces.title')}
            className="flex flex-col gap-1 p-2"
          >
            {workspaces.map((w) => {
              const mode = active?.id === w.id ? active.mode : null;
              const rowErr = mode && (edit.isError || remove.isError);
              return (
                <div key={w.id} className="flex flex-col">
                  {mode === 'rename' ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        saveRename(w);
                      }}
                      className="flex items-center gap-1"
                    >
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={onRenameKey}
                        enterKeyHint="done"
                        dir="auto"
                        aria-label={t('workspaces.renameLabel')}
                        className="field min-w-0 flex-1"
                      />
                      <button
                        type="submit"
                        disabled={edit.isPending}
                        aria-label={t('workspaces.save')}
                        className="btn btn-ghost btn-icon min-h-11 min-w-11"
                      >
                        <Icon name="check" size={18} />
                      </button>
                    </form>
                  ) : (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={w.id === currentId}
                        onClick={() => {
                          onPick(w.id);
                          close();
                        }}
                        className={`menu-item min-w-0 flex-1 ${w.id === currentId ? 'text-accent font-semibold' : ''}`}
                      >
                        <span
                          aria-hidden="true"
                          className={`size-4 shrink-0 rounded-full border-2 ${w.id === currentId ? 'border-accent bg-accent' : 'border-line'}`}
                        />
                        <span dir="auto" className="min-w-0 flex-1 truncate text-start">
                          {w.name}
                        </span>
                        {w.isDefault && <span className="pill">{t('workspaces.default')}</span>}
                      </button>
                      <button
                        type="button"
                        aria-label={t('workspaces.actions', { name: w.name })}
                        aria-expanded={mode === 'menu'}
                        onClick={() => {
                          edit.reset();
                          remove.reset();
                          setActive(mode === 'menu' ? null : { id: w.id, mode: 'menu' });
                        }}
                        className="btn btn-ghost btn-icon min-h-11 min-w-11"
                      >
                        <Icon name="menu" size={16} />
                      </button>
                    </div>
                  )}
                  {mode === 'menu' && (
                    <div className="flex flex-wrap gap-2 px-3 py-1">
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => {
                          setRenameValue(w.name);
                          setActive({ id: w.id, mode: 'rename' });
                        }}
                      >
                        {t('workspaces.rename')}
                      </button>
                      {!w.isDefault && (
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => edit.mutate({ id: w.id, patch: { isDefault: true } })}
                        >
                          {t('workspaces.makeDefault')}
                        </button>
                      )}
                      {!w.isDefault && (
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => setActive({ id: w.id, mode: 'confirm' })}
                        >
                          {t('workspaces.delete')}
                        </button>
                      )}
                    </div>
                  )}
                  {mode === 'confirm' && (
                    <div className="flex flex-col gap-2 px-3 py-1">
                      <p>{t('workspaces.confirmDelete', { name: w.name, target: defaultName })}</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="btn btn-sm"
                          disabled={remove.isPending}
                          onClick={() => remove.mutate(w.id)}
                        >
                          {t('workspaces.confirm')}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => setActive(null)}
                        >
                          {t('workspaces.cancel')}
                        </button>
                      </div>
                    </div>
                  )}
                  {rowErr && (
                    <p role="alert" className="notice notice-danger">
                      {rowError(edit.error ?? remove.error)}
                    </p>
                  )}
                </div>
              );
            })}
            {loadFailed && (
              <p role="alert" className="notice notice-danger">
                {t('workspaces.loadError')}
              </p>
            )}
          </div>
          <form onSubmit={submit} className="flex flex-col gap-2 border-t border-line p-4">
            <div className="flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                dir="auto"
                aria-label={t('workspaces.nameLabel')}
                placeholder={t('workspaces.nameLabel')}
                className="field min-w-0 flex-1"
              />
              <button
                type="submit"
                disabled={add.isPending || name.trim() === ''}
                className="btn btn-primary"
              >
                {t('workspaces.add')}
              </button>
            </div>
            {add.isError && (
              <p role="alert" className="notice notice-danger">
                {taken ? t('workspaces.nameTaken') : t('workspaces.error')}
              </p>
            )}
          </form>
        </>
      )}
    </Sheet>
  );
}
