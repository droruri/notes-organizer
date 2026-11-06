import * as webpush from 'web-push';
import { z } from 'zod';
import { hostOf } from '../domain/links/preview';
import { errorSummary, log } from '../requestLog';

// THE ONLY place a push message is sent. Everything else depends on the `Push` port.

export type PushSub = { endpoint: string; p256dh: string; auth: string };
/** What the service worker receives; shown as "Due today: …" etc. */
export type PushPayload = {
  kind: 'test' | 'due' | 'time' | 'snooze';
  noteId?: string;
  title: string;
};
export type PushResult = { ok: true } | { ok: false; gone: boolean };

export type Push = {
  /** False when no VAPID keys are configured: sends are refused, never a crash. */
  enabled: boolean;
  /** Never throws. `gone` means the subscription is dead and should be deleted. */
  send(sub: PushSub, payload: PushPayload): Promise<PushResult>;
};

export const PushEnv = z.object({
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:admin@example.com'),
  PUSH_FAKE: z.enum(['0', '1']).optional(),
});
export type PushEnv = z.infer<typeof PushEnv>;

/** Logs failed sends (host and error summary only: endpoints, keys and titles are never logged). */
export function withPushLogging(push: Push): Push {
  return {
    enabled: push.enabled,
    async send(sub, payload) {
      const result = await push.send(sub, payload);
      if (!result.ok) {
        log().warn({ host: hostOf(sub.endpoint), gone: result.gone }, 'push send failed');
      }
      return result;
    },
  };
}

export function createPush(env: PushEnv): Push {
  if (env.PUSH_FAKE === '1') return createFakePush();
  const { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey } = env;
  if (!publicKey || !privateKey) {
    return { enabled: false, send: async () => ({ ok: false, gone: false }) };
  }
  return {
    enabled: true,
    async send(sub, payload) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          { vapidDetails: { subject: env.VAPID_SUBJECT, publicKey, privateKey }, TTL: 3600 },
        );
        return { ok: true };
      } catch (err) {
        const status = err instanceof webpush.WebPushError ? err.statusCode : undefined;
        if (status === undefined) log().warn({ err: errorSummary(err) }, 'push transport failed');
        return { ok: false, gone: status === 404 || status === 410 };
      }
    },
  };
}

/** Records sends instead of making them (tests, `PUSH_FAKE=1`). `goneEndpoints` answer `gone`. */
export function createFakePush(
  options: { goneEndpoints?: readonly string[]; enabled?: boolean } = {},
) {
  const sent: Array<{ sub: PushSub; payload: PushPayload }> = [];
  const push: Push & { sent: typeof sent } = {
    enabled: options.enabled ?? true,
    sent,
    async send(sub, payload) {
      if (options.goneEndpoints?.includes(sub.endpoint)) return { ok: false, gone: true };
      sent.push({ sub, payload });
      return { ok: true };
    },
  };
  return push;
}
