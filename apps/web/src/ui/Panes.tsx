import type { ReactNode } from 'react';

/** A list and a detail as sibling slots; CSS (`data-panes`) decides what shows. The placeholder fills an empty detail on wide screens only. */
export function Panes({
  list,
  detail,
  placeholder,
}: {
  list: ReactNode;
  detail?: ReactNode;
  placeholder?: ReactNode;
}) {
  return (
    <div data-panes="" data-detail-open={detail ? '' : undefined}>
      <div data-slot="list">{list}</div>
      {detail ? (
        <div data-slot="detail">{detail}</div>
      ) : placeholder ? (
        <div data-slot="detail" className="max-lg:hidden">
          {placeholder}
        </div>
      ) : null}
    </div>
  );
}
