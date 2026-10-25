import { useTranslation } from 'react-i18next';

/** A toggle chip; `isNew` adds the "new" badge for names Claude proposed. */
export function Chip({
  label,
  selected,
  isNew = false,
  onClick,
}: {
  label: string;
  selected: boolean;
  isNew?: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm ${
        selected ? 'border-fg bg-surface-hover font-medium' : 'border-line'
      }`}
    >
      {label}
      {isNew && <span className="rounded bg-fg px-1 text-xs text-bg">{t('notes.picker.new')}</span>}
    </button>
  );
}
