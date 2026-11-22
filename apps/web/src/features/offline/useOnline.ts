import { useSyncExternalStore } from 'react';

/** How long a failed request keeps the app offline before it tries the network again. */
const RETRY_MS = 30_000;

let failed = false;
let retry: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Call when the server answered: ends an offline window early. */
export function reportServerReachable() {
  clearTimeout(retry);
  retry = undefined;
  if (!failed) return;
  failed = false;
  emit();
}

/** Call after a request failed at the network level. Offline until `online` fires or RETRY_MS passes. */
export function reportNetworkFailure() {
  if (!failed) {
    failed = true;
    emit();
  }
  clearTimeout(retry);
  retry = setTimeout(reportServerReachable, RETRY_MS);
}

function subscribe(listener: () => void) {
  const onOnline = () => {
    reportServerReachable();
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
