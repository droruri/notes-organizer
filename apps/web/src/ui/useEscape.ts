import { useEffect, useRef } from 'react';

/** Calls `onEscape` with the key event when Escape is pressed while the calling component is mounted. */
export function useEscape(onEscape: (e: KeyboardEvent) => void) {
  const latest = useRef(onEscape);
  useEffect(() => {
    latest.current = onEscape;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') latest.current(e);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}
