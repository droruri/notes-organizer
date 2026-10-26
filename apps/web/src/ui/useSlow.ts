import { useEffect, useState } from 'react';

/** True once `active` has stayed true for `ms`, so a long wait can say it is still working. */
export function useSlow(active: boolean, ms = 10_000): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setSlow(true), ms);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [active, ms]);
  return slow;
}
