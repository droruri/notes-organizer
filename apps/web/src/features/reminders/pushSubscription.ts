import { PushSubscriptionBody } from '@notes/shared';
import { api } from '../../lib/api';

export type SubscribeOutcome = 'subscribed' | 'denied' | 'unsupported' | 'unconfigured';

/** Push needs a service worker, `PushManager` and `Notification` (iOS has them only once installed). */
export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(base64url.length / 4) * 4, '=');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** This device's current subscription, or null. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

/** Asks permission, subscribes this device with the VAPID key, and registers it with the API. */
export async function subscribe(): Promise<SubscribeOutcome> {
  if (!isPushSupported()) return 'unsupported';
  const vapidKey: unknown = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (typeof vapidKey !== 'string' || vapidKey === '') return 'unconfigured';
  if ((await Notification.requestPermission()) !== 'granted') return 'denied';
  const registration = await navigator.serviceWorker.ready;
  const sub =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(vapidKey),
    }));
  const body = PushSubscriptionBody.safeParse(sub.toJSON());
  if (!body.success) throw new Error('push subscription has an unexpected shape');
  await api.subscribePush(body.data);
  return 'subscribed';
}

/** Removes this device's subscription from the browser and the API. */
export async function unsubscribe(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await api.unsubscribePush(sub.endpoint);
  await sub.unsubscribe();
}
