import { useBackClose } from './useBackClose';

/**
 * Suspense fallback for a lazy overlay (a `Sheet` in its own chunk). It takes the overlay's
 * history entry at once, as the loaded overlay would, so a menu that closes while the chunk
 * downloads hands its entry over instead of popping it. Back while loading calls `onBack`.
 */
export function OverlayFallback({ onBack }: { onBack: () => void }) {
  useBackClose(() => {
    onBack();
    return true;
  });
  return null;
}
