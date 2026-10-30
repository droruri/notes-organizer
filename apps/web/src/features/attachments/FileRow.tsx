import type { Attachment } from '@notes/shared';
import { Icon } from '../../ui/Icon';

const formatSize = (bytes: number): string =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** One file as a tappable row: icon, name, size. */
export function FileRow({
  a,
  onOpen,
  label,
}: {
  a: Attachment;
  onOpen: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      className="btn btn-sm w-full justify-start"
    >
      <Icon name="file" size={16} className="shrink-0 text-muted" />
      <span dir="auto" className="min-w-0 flex-1 truncate text-start">
        {a.name}
      </span>
      <span dir="ltr" className="text-xs text-muted tabular-nums">
        {formatSize(a.size)}
      </span>
    </button>
  );
}
