import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';

export const ROUTES = {
  notes: '/',
  compose: '/new',
  review: '/review',
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
