import { useEffect, useEffectEvent } from 'react';

/** Calls `onTimeout` once `ms` after `value` last became non-null; a new value restarts the timer. */
export function useTimeout(value: unknown, onTimeout: () => void, ms: number) {
  const fire = useEffectEvent(onTimeout);
  useEffect(() => {
    if (value === null) return;
    const timer = setTimeout(fire, ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
}
