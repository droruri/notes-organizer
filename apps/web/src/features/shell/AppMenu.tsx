import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../ui/Icon';
import { NAV_ITEMS, type NavId } from './routes';

type Props = {
  /** Runs the action of a "more" item (import, taxonomy, settings, users). */
  onPick: (id: NavId) => void;
  onSignOut: () => void;
  /** Called after any pick, so a hosting sheet can close. */
  onDone?: () => void;
  isAdmin?: boolean;
  /** Focus the first item on mount (inside a sheet). */
  autoFocus?: boolean;
};

// Each language is named in its own script, so it reads right whatever the current UI language is.
const LANGUAGES = [
  { code: 'he', name: 'עברית' },
  { code: 'en', name: 'English' },
] as const;

/** The menu content: the secondary screens, the language switch, and Sign out. */
export function AppMenu({ onPick, onSignOut, onDone, isAdmin = false, autoFocus = false }: Props) {
  const { t, i18n } = useTranslation();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (autoFocus) panel.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus();
  }, [autoFocus]);

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

  const items = NAV_ITEMS.filter((i) => i.group === 'more' && (isAdmin || !i.adminOnly));
  const pick = (run: () => void) => () => {
    onDone?.();
    run();
  };
  return (
    <div ref={panel} role="menu" aria-label={t('app.menu')} onKeyDown={onMenuKey}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          onClick={pick(() => onPick(item.id))}
          className="menu-item"
        >
          <Icon name={item.icon} size={18} className="text-muted" />
          {t(item.label)}
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
  );
}
