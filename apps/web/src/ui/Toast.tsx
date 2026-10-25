import type { ReactNode } from 'react';

/** A bottom toast: a message plus its action buttons. Announced politely. */
export function Toast({ children, actions }: { children: ReactNode; actions: ReactNode }) {
  return (
    <div role="status" className="toast enter-rise">
      <span className="min-w-0">{children}</span>
      <span className="flex shrink-0 gap-2">{actions}</span>
    </div>
  );
}
