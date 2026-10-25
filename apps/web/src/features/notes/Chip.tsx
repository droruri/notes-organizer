import { useTranslation } from 'react-i18next';

/** A toggle chip; `isNew` adds the "new" badge for names Claude proposed. */
export function Chip({
  label,
  selected,
  isNew = false,
  deleted = false,
  onClick,
}: {
  label: string;
  selected: boolean;
  isNew?: boolean;
  /** Soft-deleted taxonomy: greyed, but still selectable as a filter. */
  deleted?: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`chip ${deleted ? 'text-muted line-through opacity-60' : ''}`}
    >
      {label}
      {isNew && <span className="marker">{t('notes.picker.new')}</span>}
    </button>
  );
}
