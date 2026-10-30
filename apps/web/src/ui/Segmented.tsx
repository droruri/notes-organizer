/** Radio group of buttons; one tap picks an option, tapping the current one does nothing. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  labelOf,
  disabled,
  onChange,
}: {
  label: string;
  options: readonly (T | null)[];
  value: T | null;
  labelOf: (option: T | null) => string;
  disabled?: boolean;
  onChange: (next: T | null) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="segmented self-start">
      {options.map((option) => (
        <button
          key={option ?? 'none'}
          type="button"
          role="radio"
          aria-checked={option === value}
          disabled={disabled ?? false}
          className="segment"
          onClick={() => {
            if (option !== value) onChange(option);
          }}
        >
          {labelOf(option)}
        </button>
      ))}
    </div>
  );
}
