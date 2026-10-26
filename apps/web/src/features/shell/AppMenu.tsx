import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '../../ui/Icon';

type Props = {
  onNotes: () => void;
  onImport: () => void;
  onTaxonomy: () => void;
  onSignOut: () => void;
  /** Set for an admin: shows the "Users" item. */
  onUsers?: () => void;
};

/** The app menu in the header: Notes, Import notes, Categories & tags, Users (admin only), Sign out. */
export function AppMenu({ onNotes, onImport, onTaxonomy, onUsers, onSignOut }: Props) {
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
  const items: { icon: IconName; label: string; onPick: () => void }[] = [
    { icon: 'note', label: t('notes.title'), onPick: onNotes },
    { icon: 'upload', label: t('import.open'), onPick: onImport },
    { icon: 'filter', label: t('taxonomy.menu'), onPick: onTaxonomy },
    ...(onUsers ? [{ icon: 'users' as const, label: t('users.menu'), onPick: onUsers }] : []),
    { icon: 'logout', label: t('auth.signOut'), onPick: onSignOut },
  ];
  return (
    <div ref={root} className="relative">
      <button
        ref={toggle}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        aria-label={t('app.menu')}
        className="btn btn-ghost btn-icon btn-sm"
      >
        <Icon name="menu" size={18} />
      </button>
      {open && (
        <div role="menu" className="menu enter-pop">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onPick();
              }}
              className="menu-item"
            >
              <Icon name={item.icon} size={16} className="text-muted" />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
