import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Workspace } from '@notes/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiRequestError } from '../../lib/api';
import { Icon } from '../../ui/Icon';
import { useEscape } from '../../ui/useEscape';
import { useExit } from '../../ui/useExit';

/** Bottom sheet: pick the current workspace (a radio list) or add one. */
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
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const { closing, exit, onTransitionEnd } = useExit();
  const close = () => exit(onClose);
  useEscape(close);
  useEffect(() => root.current?.focus(), []);
  const add = useMutation({
    mutationFn: (n: string) => api.createWorkspace(n),
    onSuccess: async () => {
      setName('');
      await queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim() && !add.isPending) add.mutate(name);
  };
  const taken = add.error instanceof ApiRequestError && add.error.code === 'name_taken';
  return (
    <div
      className={`backdrop enter-fade ${closing ? 'closing ' : ''}flex items-end justify-center`}
      onTransitionEnd={onTransitionEnd}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-label={t('workspaces.title')}
        tabIndex={-1}
        className={`enter-sheet ${closing ? 'closing ' : ''}flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-[20px] bg-surface text-fg shadow-2xl outline-none`}
      >
        <div className="flex items-center gap-2 border-b border-line px-5 py-3">
          <h2 className="text-base font-semibold">{t('workspaces.title')}</h2>
          <button
            type="button"
            onClick={close}
            aria-label={t('workspaces.close')}
            className="btn btn-ghost btn-icon btn-sm ms-auto"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        <div
          role="radiogroup"
          aria-label={t('workspaces.title')}
          className="flex flex-col gap-1 overflow-y-auto overscroll-contain p-2"
        >
          {workspaces.map((w) => (
            <button
              key={w.id}
              type="button"
              role="radio"
              aria-checked={w.id === currentId}
              onClick={() => {
                onPick(w.id);
                close();
              }}
              className={`menu-item ${w.id === currentId ? 'text-accent font-semibold' : ''}`}
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
          ))}
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
      </div>
    </div>
  );
}
