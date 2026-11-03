import { useLayoutEffect } from 'react';

/** Longest a push may hold the old snapshot if the new route never commits. */
const COMMIT_TIMEOUT_MS = 500;

let settle: (() => void) | null = null;

const motionAllowed = () =>
  typeof document.startViewTransition === 'function' &&
  typeof window.matchMedia === 'function' &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
  !window.matchMedia('(min-width: 1024px)').matches;

/**
 * Runs a push navigation inside a View Transition (mobile only, motion allowed, API present);
 * otherwise just runs it. `BrowserRouter` ignores `navigate`'s `viewTransition` option, so the
 * transition ends when `useViewTransitionCommit` sees the new route commit.
 */
export function pushWithTransition(go: () => void) {
  if (!motionAllowed()) {
    go();
    return;
  }
  settle?.();
  document.startViewTransition(
    () =>
      new Promise<void>((resolve) => {
        const timer = window.setTimeout(done, COMMIT_TIMEOUT_MS);
        function done() {
          window.clearTimeout(timer);
          if (settle === done) settle = null;
          resolve();
        }
        settle = done;
        go();
      }),
  );
}

/** Ends a pending push transition once the route keyed by `key` has committed to the DOM. */
export function useViewTransitionCommit(key: string) {
  useLayoutEffect(() => {
    settle?.();
  }, [key]);
}
