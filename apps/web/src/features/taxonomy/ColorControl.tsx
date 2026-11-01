import { CategoryColor } from '@notes/shared';
import { useTranslation } from 'react-i18next';

/** Radio group of the 8 palette swatches for a category; one tap saves the color. */
export function ColorControl({
  name,
  value,
  disabled,
  onChange,
}: {
  name: string;
  value: CategoryColor;
  disabled: boolean;
  onChange: (next: CategoryColor) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="radiogroup"
      aria-label={t('taxonomy.color.labelFor', { name })}
      className="flex flex-wrap self-start"
    >
      {CategoryColor.options.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={color === value}
          aria-label={t(`taxonomy.color.names.${color}`)}
          disabled={disabled}
          className="swatch"
          onClick={() => {
            if (color !== value) onChange(color);
          }}
        >
          <span
            aria-hidden="true"
            className="swatch-dot"
            style={{
              backgroundColor: `var(--cat-${color}-tint)`,
              borderColor: `var(--cat-${color}-ink)`,
            }}
          />
        </button>
      ))}
    </div>
  );
}
