import { useTranslation } from 'react-i18next';

/** A toggle chip; `isNew` adds the "new" badge for names Claude proposed. */
export function Chip({
  label,
  selected,
  isNew = false,
  deleted = false,
  tag = false,
  onClick,
}: {
  label: string;
  selected: boolean;
  isNew?: boolean;
  /** Soft-deleted taxonomy: greyed, but still selectable as a filter. */
  deleted?: boolean;
  /** Tag look: square corners and a CSS-drawn `#`; categories stay round pills. */
  tag?: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`chip ${tag ? 'chip-tag ' : ''}${deleted ? 'text-muted line-through opacity-60' : ''}`}
    >
      {label}
      {isNew && (
        <span className="marker" aria-hidden={tag || undefined}>
          {t('notes.picker.new')}
        </span>
      )}
    </button>
  );
}
