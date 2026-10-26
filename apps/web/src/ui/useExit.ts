import { type TransitionEvent, useCallback, useEffect, useRef, useState } from 'react';

/** Upper bound for the 150ms `.closing` transition, in case `transitionend` never fires. */
const FALLBACK_MS = 300;

/**
 * Keeps an overlay mounted while its `.closing` exit transition plays, then runs the
 * callback passed to `exit` (usually the parent's unmounting `onClose`). Put `closing`
 * on the root's class list and `onTransitionEnd` on the root.
 */
export function useExit() {
  const [closing, setClosing] = useState(false);
  const then = useRef<(() => void) | null>(null);

  const finish = useCallback(() => {
    const run = then.current;
    then.current = null;
    run?.();
  }, []);

  useEffect(() => {
    if (!closing) return;
    const id = setTimeout(finish, FALLBACK_MS);
    return () => clearTimeout(id);
  }, [closing, finish]);

  const exit = useCallback((after: () => void) => {
    // The first close wins; a second click or Escape mid-exit changes nothing.
    if (then.current) return;
    then.current = after;
    setClosing(true);
  }, []);

  const onTransitionEnd = (e: TransitionEvent) => {
    if (closing && e.target === e.currentTarget) finish();
  };

  return { closing, exit, onTransitionEnd };
}
