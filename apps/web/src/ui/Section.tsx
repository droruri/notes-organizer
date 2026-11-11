import { useId, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * A labelled section with an h3 heading, or a smaller h4 when `sub`. With `collapsible` the heading
 * is a full-width toggle button; the section starts closed and renders its children only while open.
 */
export function Section({
  title,
  sub = false,
  count,
  collapsible = false,
  children,
}: {
  title: string;
  /** Shown after the heading text as `(n)`; not part of the aria-label. */
  count?: number;
  sub?: boolean;
  collapsible?: boolean;
  children: ReactNode;
}) {
  const Heading = sub ? 'h4' : 'h3';
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const headingClass = sub ? 'text-sm font-semibold text-muted' : 'text-lg font-bold';
  const label = `${title}${count !== undefined ? ` (${count})` : ''}`;
  if (!collapsible) {
    return (
      <section aria-label={title} className="flex flex-col gap-3">
        <Heading className={headingClass}>{label}</Heading>
        {children}
      </section>
    );
  }
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <Heading className={headingClass}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-md px-1 text-start"
        >
          <span>{label}</span>
          <span
            className={`shrink-0 motion-safe:transition-transform motion-safe:duration-150 ${
              open ? 'rotate-180' : ''
            }`}
          >
            <Icon name="chevron" size={20} />
          </span>
        </button>
      </Heading>
      <div id={panelId} hidden={!open} className="flex flex-col gap-3">
        {open && children}
      </div>
    </section>
  );
}
