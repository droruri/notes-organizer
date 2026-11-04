import { useSyncExternalStore } from 'react';

const query = '(min-width: 1024px)';
const subscribe = (cb: () => void) => {
  if (typeof window.matchMedia !== 'function') return () => {};
  const mq = window.matchMedia(query);
  if (typeof mq.addEventListener !== 'function') return () => {};
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};
const isWide = () => typeof window.matchMedia !== 'function' || window.matchMedia(query).matches;

/** True at the `lg` breakpoint and above (the desktop layout). */
export const useIsWide = () => useSyncExternalStore(subscribe, isWide, () => true);
