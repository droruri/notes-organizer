import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../ui/Icon';
import { useEscape } from '../../ui/useEscape';
import { useExit } from '../../ui/useExit';

/** Bottom sheet for picking categories on phones; changes apply only on confirm. */
export function CategoryDialog({
  categories,
  selected,
  suggested,
  onConfirm,
  onClose,
}: {
  /** Usable categories, already sorted. */
  categories: { id: string; name: string }[];
  selected: string[];
  suggested: string[];
  onConfirm: (ids: string[]) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(selected);
  const [filter, setFilter] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const { closing, exit, onTransitionEnd } = useExit();
  const close = () => exit(onClose);
  useEscape(close);
  useEffect(() => root.current?.focus(), []);
  const needle = filter.trim().toLocaleLowerCase();
  const rows = categories.filter((c) => c.name.toLocaleLowerCase().includes(needle));
  const toggle = (id: string) =>
    setDraft((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));
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
        aria-label={t('notes.picker.dialogTitle')}
        tabIndex={-1}
        className={`enter-sheet ${closing ? 'closing ' : ''}flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-[20px] bg-surface text-fg shadow-2xl outline-none`}
      >
        <div className="flex items-center gap-2 border-b border-line px-5 py-3">
          <h2 className="text-base font-semibold">{t('notes.picker.dialogTitle')}</h2>
          <button
            type="button"
            onClick={close}
            aria-label={t('notes.picker.close')}
            className="btn btn-ghost btn-icon btn-sm ms-auto"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="relative border-b border-line px-5 py-3">
          <span className="pointer-events-none absolute inset-y-0 start-8 flex items-center text-muted">
            <Icon name="search" size={16} />
          </span>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label={t('notes.picker.filter')}
            placeholder={t('notes.picker.filter')}
            className="field w-full ps-9"
          />
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5">
          {rows.length === 0 && (
            <p className="py-6 text-center text-sm text-muted">{t('notes.picker.noMatch')}</p>
          )}
          {rows.map((c) => (
            <label
              key={c.id}
              className="flex min-h-11 w-full items-center gap-3 border-b border-line last:border-b-0"
            >
              <input
                type="checkbox"
                className="check"
                checked={draft.includes(c.id)}
                onChange={() => toggle(c.id)}
              />
              <span>{c.name}</span>
              {suggested.includes(c.id) && (
                <span className="marker inline-flex items-center gap-1">
                  <Icon name="spark" size={12} />
                  {t('notes.picker.suggested')}
                </span>
              )}
            </label>
          ))}
        </div>
        <div className="flex gap-2 border-t border-line px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button type="button" className="btn btn-primary" onClick={() => onConfirm(draft)}>
            {t('notes.picker.confirm')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={close}>
            {t('notes.picker.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
