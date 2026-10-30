import type { Importance } from '@notes/shared';
import { useTranslation } from 'react-i18next';

const LEVELS: readonly (Importance | null)[] = [null, 'important', 'not_important'];

/** Three-segment radio group for a category's default importance; one tap changes or clears it. */
export function ImportanceControl({
  name,
  value,
  disabled,
  onChange,
}: {
  name: string;
  value: Importance | null;
  disabled: boolean;
  onChange: (next: Importance | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="radiogroup"
      aria-label={t('taxonomy.importance.labelFor', { name })}
      className="segmented self-start"
    >
      {LEVELS.map((level) => (
        <button
          key={level ?? 'none'}
          type="button"
          role="radio"
          aria-checked={level === value}
          disabled={disabled}
          className="segment"
          onClick={() => {
            if (level !== value) onChange(level);
          }}
        >
          {t(`taxonomy.importance.${level ?? 'none'}`)}
        </button>
      ))}
    </div>
  );
}
