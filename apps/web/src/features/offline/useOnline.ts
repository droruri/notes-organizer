import { useSyncExternalStore } from 'react';

let failed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Call after a request failed at the network level; the next `online` event clears it. */
export function reportNetworkFailure() {
  if (failed) return;
  failed = true;
  emit();
}

function subscribe(listener: () => void) {
  const onOnline = () => {
    failed = false;
    listener();
  };
  listeners.add(listener);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', listener);
  };
}

const snapshot = () => navigator.onLine && !failed;

/** Whether the device can reach the network (browser events, plus a failed request). */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => true);
}
