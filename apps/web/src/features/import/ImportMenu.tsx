import { useState } from 'react';
import { useTranslation } from 'react-i18next';

/** The header menu: "Import notes", plus "Users" for an admin (`onUsers` set). */
export function ImportMenu({ onImport, onUsers }: { onImport: () => void; onUsers?: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="rounded-md border border-line px-3 py-1 hover:bg-surface-hover"
      >
        {t('import.menu')}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute end-0 top-full z-10 mt-1 min-w-40 rounded-md border border-line bg-bg p-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onImport();
            }}
            className="block w-full rounded px-3 py-2 text-start hover:bg-surface-hover"
          >
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
              className="block w-full rounded px-3 py-2 text-start hover:bg-surface-hover"
            >
              {t('users.menu')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
