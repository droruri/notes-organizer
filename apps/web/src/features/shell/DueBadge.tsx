/** Small pill with the number of tasks due now. Hidden from assistive tech: the item's name carries the count. */
export function DueBadge({ count, className = '' }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      aria-hidden="true"
      className={`bg-danger-soft text-danger rounded-full px-1.5 text-[11px] leading-4 font-bold tabular-nums ${className}`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
