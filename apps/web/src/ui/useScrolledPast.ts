import { useEffect, useState } from 'react';

/**
 * True once the sentinel element has scrolled out of view (no scroll listeners).
 * Returns a callback ref, so the observer attaches whenever the sentinel mounts
 * (also after a first loading render). Without IntersectionObserver the page stays expanded.
 */
export function useScrolledPast<T extends Element>() {
  const [el, setEl] = useState<T | null>(null);
  const [past, setPast] = useState(false);
  useEffect(() => {
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) setPast(!entry.isIntersecting);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return [setEl, past] as const;
}
