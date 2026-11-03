import type { Workspace } from '@notes/shared';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import { Icon } from '../../ui/Icon';
import { AppMenu } from './AppMenu';
import { NAV_ITEMS, ROUTES, type NavId } from './routes';

type Actions = {
  onPick: (id: NavId) => void;
  onSignOut: () => void;
  isAdmin: boolean;
};

/** Desktop (>= 1024px): the 16rem sidebar. */
export function Sidebar({
  workspaces,
  currentId,
  onSwitch,
  onManage,
  ...menu
}: Actions & {
  workspaces: Workspace[];
  currentId: string | undefined;
  onSwitch: (id: string) => void;
  onManage: () => void;
}) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const newNote = () => void navigate(ROUTES.compose);
  const link = (id: 'notes' | 'chat', to: string) => {
    const item = NAV_ITEMS.find((i) => i.id === id);
    if (!item) return null;
    const active = pathname === to;
    return (
      <button
        key={id}
        type="button"
        onClick={() => void navigate(to)}
        {...(active ? { 'aria-current': 'page' as const } : {})}
        className={`menu-item ${active ? 'bg-accent-soft text-accent font-semibold' : ''}`}
      >
        <Icon name={item.icon} size={18} />
        {t(item.label)}
      </button>
    );
  };
  return (
    <aside className="border-line bg-surface fixed inset-y-0 start-0 z-20 hidden w-64 flex-col gap-3 overflow-y-auto border-e p-3 lg:flex">
      <div className="flex items-center gap-2.5 px-2 pt-1 text-lg font-bold tracking-tight">
        <span className="bg-accent grid size-8 place-items-center rounded-[9px] text-[var(--accent-fg)] shadow-sm">
          <Icon name="note" size={18} />
        </span>
        {t('app.name')}
      </div>
      <button type="button" onClick={newNote} className="btn btn-primary min-h-11">
        <Icon name="plus" size={18} />
        {t('notes.add')}
      </button>
      <nav aria-label={t('app.name')} className="flex flex-col gap-0.5">
        {link('notes', ROUTES.notes)}
        {link('chat', ROUTES.chat)}
      </nav>
      <section aria-label={t('workspaces.menu')} className="flex flex-col gap-0.5">
        <button
          type="button"
          onClick={onManage}
          className="menu-item text-muted text-xs font-semibold"
        >
          <Icon name="layers" size={16} />
          {t('workspaces.menu')}
        </button>
        {workspaces.map((w) => (
          <button
            key={w.id}
            type="button"
            onClick={() => onSwitch(w.id)}
            {...(w.id === currentId ? { 'aria-current': 'true' as const } : {})}
            className={`menu-item ${w.id === currentId ? 'bg-accent-soft text-accent font-semibold' : ''}`}
          >
            <span className="truncate">{w.name}</span>
          </button>
        ))}
      </section>
      <div className="border-line mt-auto border-t pt-2">
        <AppMenu {...menu} />
      </div>
    </aside>
  );
}
