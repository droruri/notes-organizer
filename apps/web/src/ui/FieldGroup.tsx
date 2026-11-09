import type { ReactNode } from 'react';

/** A fieldset with a muted legend; children flow in a wrapping row. */
export function FieldGroup({ legend, children }: { legend: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="flex flex-wrap items-center gap-2">
      <legend className="mb-2 text-sm font-medium text-muted">{legend}</legend>
      {children}
    </fieldset>
  );
}
