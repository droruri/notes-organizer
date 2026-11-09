import type { ReactNode } from 'react';

/** A fieldset with a muted legend; children flow in a wrapping row. */
export function FieldGroup({
  legend,
  children,
  className = '',
}: {
  legend: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={`flex flex-wrap items-center gap-2 ${className}`.trim()}>
      <legend className="mb-2 text-sm font-medium text-muted">{legend}</legend>
      {children}
    </fieldset>
  );
}
