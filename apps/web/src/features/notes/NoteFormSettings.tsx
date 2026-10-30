import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { HideableField } from '@notes/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { Icon } from '../../ui/Icon';
import { useEscape } from '../../ui/useEscape';
import { useExit } from '../../ui/useExit';

/** Rows in the order the form shows them; body is required, so it has no switch. */
const ROWS: ReadonlyArray<HideableField | 'body'> = [
  'title',
  'body',
  'categories',
  'dueDate',
  'importance',
  'urgency',
];

/** Bottom sheet where the user shows or hides the optional fields of the note form. */
export function NoteFormSettings({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings });
  // Null until the user changes a switch; until the stored choice loads, nothing is hidden and Save stays off.
  const [edited, setEdited] = useState<ReadonlyArray<HideableField> | null>(null);
  const hidden = edited ?? settings.data?.noteForm.hiddenFields ?? [];
  const save = useMutation({
    mutationFn: () => api.saveSettings({ noteForm: { hiddenFields: [...hidden] } }),
    onSuccess: (saved) => {
      queryClient.setQueryData(['settings'], saved);
      close();
    },
  });
  const { closing, exit, onTransitionEnd } = useExit();
  const close = () => exit(onClose);
  useEscape(close);

  const toggle = (f: HideableField, shown: boolean) =>
    setEdited(shown ? hidden.filter((x) => x !== f) : [...hidden, f]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('notes.formSettings.title')}
      onTransitionEnd={onTransitionEnd}
      className={`backdrop enter-fade ${closing ? 'closing ' : ''}flex items-end justify-center sm:items-center sm:p-6`}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className={`enter-sheet ${closing ? 'closing ' : ''}flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[20px] bg-surface text-fg shadow-2xl sm:rounded-[20px]`}
      >
        <div className="flex items-center gap-2 border-b border-line px-5 py-3">
          <h3 className="text-lg font-bold">{t('notes.formSettings.title')}</h3>
          <button
            type="button"
            onClick={close}
            aria-label={t('notes.formSettings.cancel')}
            className="btn btn-ghost btn-icon btn-sm ms-auto"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        <ul className="flex flex-col overflow-y-auto px-5 py-2">
          {ROWS.map((row) => {
            const name = t(`notes.formSettings.fields.${row}`);
            if (row === 'body') {
              return (
                <li key={row} className="flex items-center gap-3 py-3 text-muted">
                  <span>{name}</span>
                  <span className="ms-auto text-sm">{t('notes.formSettings.always')}</span>
                </li>
              );
            }
            const shown = !hidden.includes(row);
            return (
              <li key={row} className={`flex items-center gap-3 py-3 ${shown ? '' : 'text-muted'}`}>
                <label className="flex w-full items-center gap-3">
                  <span>{name}</span>
                  {!shown && (
                    <span className="ms-auto text-sm">{t('notes.formSettings.hidden')}</span>
                  )}
                  <input
                    type="checkbox"
                    role="switch"
                    checked={shown}
                    aria-label={t('notes.formSettings.show', { field: name })}
                    onChange={(e) => toggle(row, e.target.checked)}
                    className={`h-5 w-9 accent-[var(--accent)] ${shown ? 'ms-auto' : ''}`}
                  />
                </label>
              </li>
            );
          })}
        </ul>
        {save.isError && (
          <p role="alert" className="notice notice-danger mx-5">
            {t('notes.formSettings.error')}
          </p>
        )}
        <div className="flex gap-2 border-t border-line px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={!settings.data || save.isPending}
            className="btn btn-primary"
          >
            {save.isPending ? t('notes.formSettings.saving') : t('notes.formSettings.save')}
          </button>
          <button type="button" onClick={close} className="btn btn-ghost">
            {t('notes.formSettings.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
