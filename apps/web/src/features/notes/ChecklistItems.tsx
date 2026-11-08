import { MAX_CHECKLIST_ITEMS, MAX_CHECKLIST_TEXT, type ChecklistItem } from '@notes/shared';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../ui/Icon';

/** Add, rename, tick and delete checklist items. Keys: Enter adds below, Backspace on empty removes. */
export function ChecklistEdit({
  items,
  onChange,
}: {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
}) {
  const { t } = useTranslation();
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const focusId = useRef<string | null>(null);
  const full = items.length >= MAX_CHECKLIST_ITEMS;

  useEffect(() => {
    if (focusId.current === null) return;
    inputs.current.get(focusId.current)?.focus();
    focusId.current = null;
  }, [items]);

  const addAfter = (index: number) => {
    if (full) return;
    const item: ChecklistItem = { id: crypto.randomUUID(), text: '', done: false };
    focusId.current = item.id;
    onChange([...items.slice(0, index + 1), item, ...items.slice(index + 1)]);
  };
  const patch = (id: string, change: Partial<ChecklistItem>) =>
    onChange(items.map((i) => (i.id === id ? { ...i, ...change } : i)));
  const remove = (index: number) => {
    const prev = items[index - 1] ?? items[index + 1];
    focusId.current = prev?.id ?? null;
    onChange(items.filter((_, i) => i !== index));
  };

  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="label mb-1">{t('notes.checklist.title')}</legend>
      {items.map((item, index) => (
        <div
          key={item.id}
          className="group flex items-center gap-2 pointer-coarse:min-h-11 lg:min-h-9"
        >
          <input
            type="checkbox"
            className="check pointer-coarse:h-[22px] pointer-coarse:w-[22px]"
            checked={item.done}
            onChange={(e) => patch(item.id, { done: e.target.checked })}
            aria-label={t('notes.checklist.toggle')}
          />
          <input
            ref={(el) => {
              if (el) inputs.current.set(item.id, el);
              else inputs.current.delete(item.id);
            }}
            value={item.text}
            maxLength={MAX_CHECKLIST_TEXT}
            dir="auto"
            aria-label={t('notes.checklist.itemText')}
            className={`field min-w-0 flex-1 ${item.done ? 'text-muted line-through' : 'text-fg'}`}
            onChange={(e) => patch(item.id, { text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addAfter(index);
              } else if (e.key === 'Backspace' && item.text === '') {
                e.preventDefault();
                remove(index);
              }
            }}
          />
          <button
            type="button"
            aria-label={t('notes.checklist.delete')}
            onClick={() => remove(index)}
            className="btn btn-ghost btn-sm lg:opacity-0 lg:focus-visible:opacity-100 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100 pointer-coarse:opacity-100"
          >
            <Icon name="trash" size={16} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-sm self-start"
        disabled={full}
        onClick={() => addAfter(items.length - 1)}
      >
        <Icon name="plus" size={16} />
        {t('notes.checklist.add')}
      </button>
    </fieldset>
  );
}
