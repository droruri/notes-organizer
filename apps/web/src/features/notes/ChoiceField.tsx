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
  value,
  onChange,
  children,
}: {
  label: string;
  options: readonly T[];
  parse: (raw: string) => T | null;
  labelOf: (option: T | null) => string;
  display: ChoiceDisplay;
  value: T | null;
  onChange: (next: T | null) => void;
  children?: ReactNode;
}) {
  if (display === 'buttons') {
    return (
      <div className="label">
        {label}
        <Segmented
          label={label}
          options={[null, ...options]}
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
        {options.map((o) => (
          <option key={o} value={o}>
            {labelOf(o)}
          </option>
        ))}
      </select>
      {children}
    </label>
  );
}
