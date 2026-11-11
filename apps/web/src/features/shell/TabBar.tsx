import { useTranslation } from 'react-i18next';
import { useLocation, useSearchParams } from 'react-router';
import { Icon } from '../../ui/Icon';
import { DueBadge } from './DueBadge';
import { NAV_ITEMS, ROUTES, isPushedPath, type NavId } from './routes';

const TAB_ITEMS = NAV_ITEMS.filter((i) => i.group === 'tab');

/** Mobile (< 1024px): the fixed bottom tab bar. Hidden on pushed screens. */
export function TabBar({ onPick, dueCount }: { onPick: (id: NavId) => void; dueCount: number }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const view = useSearchParams()[0].get('view');
  if (isPushedPath(pathname)) return null;
  const current: NavId =
    pathname === ROUTES.chat
      ? 'chat'
      : pathname === ROUTES.notes && view === 'today'
        ? 'today'
        : 'notes';
  return (
    <nav
      aria-label={t('app.name')}
      className="border-line bg-surface fixed inset-x-0 bottom-0 z-30 flex border-t pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {TAB_ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onPick(item.id)}
          {...(item.id === 'today' && dueCount > 0
            ? { 'aria-label': t('today.badge', { count: dueCount }) }
            : {})}
          {...(item.id === current ? { 'aria-current': 'page' as const } : {})}
          className={`flex h-[var(--tab-h)] min-w-11 flex-1 touch-manipulation flex-col items-center justify-center gap-0.5 text-[11px] font-semibold active:opacity-60 ${item.id === current ? 'text-accent' : 'text-muted'}`}
        >
          <span className="relative">
            <Icon name={item.icon} size={24} />
            {item.id === 'today' && (
              <DueBadge count={dueCount} className="absolute -top-1 -end-2" />
            )}
          </span>
          {t(item.label)}
        </button>
      ))}
    </nav>
  );
}
