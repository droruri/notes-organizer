import type { ChecklistItem } from '@notes/shared';
import { useTranslation } from 'react-i18next';

/** Read-only tickable rows with "done/total" progress; renders nothing for an empty list. */
export function ChecklistView({
  items,
  onToggle,
  disabled = false,
}: {
  items: ChecklistItem[];
  onToggle: (id: string) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  if (items.length === 0) return null;
  const done = items.filter((i) => i.done).length;
  return (
    <section className="flex flex-col gap-1" aria-label={t('notes.checklist.title')}>
      <p className="label" aria-label={t('notes.checklist.progress')}>
        {done}/{items.length}
      </p>
      <ul className="card flex flex-col px-3 lg:px-0">
        {items.map((item) => (
          <li key={item.id}>
            <label
              dir="auto"
              className="flex items-center gap-3 break-words pointer-coarse:min-h-11 lg:min-h-9"
            >
              <input
                type="checkbox"
                className="check shrink-0 pointer-coarse:h-[22px] pointer-coarse:w-[22px]"
                checked={item.done}
                disabled={disabled}
                onChange={() => onToggle(item.id)}
              />
              <span className={item.done ? 'text-muted line-through' : 'text-fg'}>{item.text}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
