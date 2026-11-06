import { z } from 'zod';

// Web Push contracts shared by web and api.

const httpsUrl = z.url({ protocol: /^https$/ }).max(2048);
const base64url = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .regex(/^[A-Za-z0-9_-]+={0,2}$/);

/** `PushSubscription.toJSON()` as the browser produces it (extra fields are dropped). */
export const PushSubscriptionBody = z.object({
  endpoint: httpsUrl,
  keys: z.object({ p256dh: base64url(256), auth: base64url(64) }),
});
export type PushSubscriptionBody = z.infer<typeof PushSubscriptionBody>;

export const PushUnsubscribeBody = z.object({ endpoint: httpsUrl });
export type PushUnsubscribeBody = z.infer<typeof PushUnsubscribeBody>;

/** Result of `POST /push/test`. */
export const PushTestResult = z.object({
  sent: z.number().int(),
  gone: z.number().int(),
});
export type PushTestResult = z.infer<typeof PushTestResult>;

/** An IANA timezone name the runtime knows. */
export const Timezone = z
  .string()
  .max(64)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, 'unknown timezone');
export type Timezone = z.infer<typeof Timezone>;

/** Local hour (0-23) a reminder is sent. */
export const ReminderHour = z.number().int().min(0).max(23);
export type ReminderHour = z.infer<typeof ReminderHour>;
