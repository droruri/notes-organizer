import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '../../ui/Icon';

type Props = {
  onNotes: () => void;
  onImport: () => void;
  onTaxonomy: () => void;
  onWorkspaces: () => void;
  onSignOut: () => void;
  /** Set for an admin: shows the "Users" item. */
  onUsers?: () => void;
};

// Each language is named in its own script, so it reads right whatever the current UI language is.
const LANGUAGES = [
  { code: 'he', name: 'עברית' },
  { code: 'en', name: 'English' },
] as const;

/** The app menu in the header: the screens, the language switch, and Sign out. */
export function AppMenu({
  onNotes,
  onImport,
  onTaxonomy,
  onWorkspaces,
  onUsers,
  onSignOut,
}: Props) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus();
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

  // Up/Down (and Home/End) move between items, wrapping at the ends.
  const onMenuKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]')];
    const at = items.findIndex((el) => el === document.activeElement);
    const next =
      e.key === 'ArrowDown'
        ? (at + 1) % items.length
        : e.key === 'ArrowUp'
          ? (at - 1 + items.length) % items.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? items.length - 1
              : null;
    if (next === null) return;
    e.preventDefault();
    items[next]?.focus();
  };

  const items: { icon: IconName; label: string; onPick: () => void }[] = [
    { icon: 'note', label: t('notes.title'), onPick: onNotes },
    { icon: 'upload', label: t('import.open'), onPick: onImport },
    { icon: 'filter', label: t('taxonomy.menu'), onPick: onTaxonomy },
    { icon: 'layers', label: t('workspaces.menu'), onPick: onWorkspaces },
    ...(onUsers ? [{ icon: 'users' as const, label: t('users.menu'), onPick: onUsers }] : []),
  ];
  const pick = (onPick: () => void) => () => {
    setOpen(false);
    onPick();
  };
  return (
    <div ref={root} className="relative">
      <button
        ref={toggle}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        aria-label={t('app.menu')}
        className="btn btn-ghost btn-icon menu-trigger"
      >
        <Icon name="hamburger" size={22} />
      </button>
      {open && (
        <div
          ref={panel}
          role="menu"
          aria-label={t('app.menu')}
          onKeyDown={onMenuKey}
          className="menu menu-app enter-pop"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={pick(item.onPick)}
              className="menu-item"
            >
              <Icon name={item.icon} size={18} className="text-muted" />
              {item.label}
            </button>
          ))}
          <div role="separator" className="menu-sep" />
          <div role="group" aria-label={t('language.label')} className="menu-lang">
            <span aria-hidden="true" className="menu-lang-label">
              <Icon name="globe" size={18} className="text-muted" />
              {t('language.label')}
            </span>
            <span className="segmented">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  role="menuitemradio"
                  lang={lang.code}
                  aria-checked={i18n.language === lang.code}
                  onClick={() => void i18n.changeLanguage(lang.code)}
                  className="segment"
                >
                  {lang.name}
                </button>
              ))}
            </span>
          </div>
          <div role="separator" className="menu-sep" />
          <button
            type="button"
            role="menuitem"
            onClick={pick(onSignOut)}
            className="menu-item menu-item-danger"
          >
            <Icon name="logout" size={18} />
            {t('auth.signOut')}
          </button>
        </div>
      )}
    </div>
  );
}
