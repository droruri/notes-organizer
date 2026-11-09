import type { ReactNode } from 'react';

/** A labelled section with an h3 heading, or a smaller h4 when `sub`. */
export function Section({
  title,
  sub = false,
  count,
  children,
}: {
  title: string;
  /** Shown after the heading text as `(n)`; not part of the aria-label. */
  count?: number;
  sub?: boolean;
  children: ReactNode;
}) {
  const Heading = sub ? 'h4' : 'h3';
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <Heading className={sub ? 'text-sm font-semibold text-muted' : 'text-lg font-bold'}>
        {title}
        {count !== undefined && ` (${count})`}
      </Heading>
      {children}
    </section>
  );
}
