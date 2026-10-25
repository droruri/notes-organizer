import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../ui/Icon';

/** The header menu: "Import notes", plus "Users" for an admin (`onUsers` set). */
export function ImportMenu({ onImport, onUsers }: { onImport: () => void; onUsers?: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      toggle.current?.focus();
    };
    // A press anywhere outside the menu closes it.
    const onPointer = (e: PointerEvent) => {
      if (e.target instanceof Node && !root.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);
  return (
    <div ref={root} className="relative">
      <button
        ref={toggle}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        aria-label={t('import.menu')}
        className="btn btn-ghost btn-icon btn-sm"
      >
        <Icon name="menu" size={18} />
      </button>
      {open && (
        <div role="menu" className="menu enter-pop">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onImport();
            }}
            className="menu-item"
          >
            <Icon name="upload" size={16} className="text-muted" />
            {t('import.open')}
          </button>
          {onUsers && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onUsers();
              }}
              className="menu-item"
            >
              <Icon name="users" size={16} className="text-muted" />
              {t('users.menu')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
