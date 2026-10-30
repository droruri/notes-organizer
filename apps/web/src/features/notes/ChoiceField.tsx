import type { ChoiceDisplay } from '@notes/shared';
import type { ReactNode } from 'react';
import { Segmented } from '../../ui/Segmented';

/** A nullable enum field, shown as a dropdown or a row of buttons; "none" is always offered. */
export function ChoiceField<T extends string>({
  label,
  options,
  parse,
  labelOf,
  display,
  hiddenValues,
  value,
  onChange,
  children,
}: {
  label: string;
  options: readonly T[];
  parse: (raw: string) => T | null;
  labelOf: (option: T | null) => string;
  display: ChoiceDisplay;
  hiddenValues: readonly T[];
  value: T | null;
  onChange: (next: T | null) => void;
  children?: ReactNode;
}) {
  // The note's current value stays offered even when hidden.
  const offered = options.filter((o) => !hiddenValues.includes(o) || o === value);
  if (display === 'buttons') {
    return (
      <div className="label col-span-full">
        {label}
        <Segmented
          label={label}
          options={[null, ...offered]}
          value={value}
          labelOf={labelOf}
          onChange={onChange}
        />
        {children}
      </div>
    );
  }
  return (
    <label className="label">
      {label}
      <select
        value={value ?? ''}
        onChange={(e) => onChange(parse(e.target.value))}
        className="field text-fg"
      >
        <option value="">{labelOf(null)}</option>
        {offered.map((o) => (
          <option key={o} value={o}>
            {labelOf(o)}
          </option>
        ))}
      </select>
      {children}
    </label>
  );
}
