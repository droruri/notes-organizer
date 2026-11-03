import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { IconName } from '../../ui/Icon';

export const ROUTES = {
  notes: '/',
  compose: '/new',
  review: '/review',
  chat: '/chat',
  import: '/import',
  taxonomy: '/taxonomy',
  users: '/users',
} as const;

/** The edit page of one note. */
export const notePath = (id: string) => `/notes/${encodeURIComponent(id)}`;

/** The notes list filtered to one tag. */
export const tagPath = (id: string) => `${ROUTES.notes}?tag=${encodeURIComponent(id)}`;

/** Goes back one entry when the app has an earlier one; else (reload, deep link) replaces with the notes list. */
export function useGoBack() {
  const navigate = useNavigate();
  const { key } = useLocation();
  // The first entry of a session has the key "default".
  const hasEarlier = key !== 'default';
  return useCallback(() => {
    if (hasEarlier) void navigate(-1);
    else void navigate(ROUTES.notes, { replace: true });
  }, [navigate, hasEarlier]);
}

/** Screens pushed over the shell: the tab bar hides on them. */
export const isPushedPath = (pathname: string) =>
  ['/new', '/review', '/chat', '/import', '/taxonomy', '/users'].includes(pathname) ||
  pathname.startsWith('/notes/');

export type NavId =
  | 'notes'
  | 'chat'
  | 'workspaces'
  | 'more'
  | 'import'
  | 'taxonomy'
  | 'settings'
  | 'users';

/**
 * The one navigation list. `tab` items fill the mobile tab bar (and the sidebar's top part);
 * `more` items are the menu behind the More tab (and the sidebar's bottom part).
 */
export const NAV_ITEMS: readonly {
  id: NavId;
  icon: IconName;
  /** i18n key of the label. */
  label: string;
  group: 'tab' | 'more';
  adminOnly?: boolean;
}[] = [
  { id: 'notes', icon: 'note', label: 'notes.title', group: 'tab' },
  { id: 'chat', icon: 'spark', label: 'chat.open', group: 'tab' },
  { id: 'workspaces', icon: 'layers', label: 'workspaces.menu', group: 'tab' },
  { id: 'more', icon: 'menu', label: 'app.menu', group: 'tab' },
  { id: 'import', icon: 'upload', label: 'import.open', group: 'more' },
  { id: 'taxonomy', icon: 'filter', label: 'taxonomy.menu', group: 'more' },
  { id: 'settings', icon: 'sliders', label: 'notes.formSettings.title', group: 'more' },
  { id: 'users', icon: 'users', label: 'users.menu', group: 'more', adminOnly: true },
];
