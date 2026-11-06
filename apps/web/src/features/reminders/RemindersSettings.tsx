import type { SettingsPatch } from '@notes/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { currentSubscription, isPushSupported, subscribe, unsubscribe } from './pushSubscription';

const DEFAULT_HOUR = 8;
const HOURS = Array.from({ length: 24 }, (_, h) => h);

type Notice = 'denied' | 'unconfigured' | 'error' | 'sent' | 'noDevice' | null;

/** Settings sheet section: turn push on/off for this device, pick the reminder hour, send a test. */
export function RemindersSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const supported = isPushSupported();
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings });
  const [on, setOn] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    if (!supported) return;
    void currentSubscription().then(
      (sub) => setOn(sub !== null),
      () => setOn(false),
    );
  }, [supported]);

  const saveSettings = useMutation({
    mutationFn: (patch: SettingsPatch) => api.saveSettings(patch),
    onSuccess: (saved) => queryClient.setQueryData(['settings'], saved),
    onError: () => setNotice('error'),
  });

  const toggle = useMutation({
    mutationFn: async (next: boolean) => {
      if (!next) {
        await unsubscribe();
        return 'off' as const;
      }
      const outcome = await subscribe();
      if (outcome === 'subscribed') {
        await saveSettings.mutateAsync({
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
      }
      return outcome;
    },
    onSuccess: (outcome) => {
      setNotice(outcome === 'denied' || outcome === 'unconfigured' ? outcome : null);
      setOn(outcome === 'subscribed');
    },
    onError: () => setNotice('error'),
  });

  const test = useMutation({
    mutationFn: () => api.sendPushTest(),
    onSuccess: (r) => setNotice(r.sent > 0 ? 'sent' : 'noDevice'),
    onError: () => setNotice('error'),
  });

  return (
    <section aria-labelledby="reminders-title" className="m-4">
      <h3 id="reminders-title" className="px-1 pb-2 text-sm font-bold text-muted">
        {t('reminders.title')}
      </h3>
      {!supported ? (
        <p className="notice">{t('reminders.unsupported')}</p>
      ) : (
        <ul className="group-list">
          <li className="flex items-center px-4 py-3">
            <label className="flex w-full items-center gap-3">
              <span>{t('reminders.on')}</span>
              <input
                type="checkbox"
                role="switch"
                checked={on}
                disabled={toggle.isPending}
                aria-label={t('reminders.on')}
                onChange={(e) => toggle.mutate(e.target.checked)}
                className="ms-auto h-5 w-9 accent-[var(--accent)]"
              />
            </label>
          </li>
          {on && (
            <>
              <li className="flex items-center gap-3 px-4 py-3">
                <label htmlFor="reminder-hour">{t('reminders.hour')}</label>
                <select
                  id="reminder-hour"
                  className="ms-auto"
                  value={settings.data?.reminderHour ?? DEFAULT_HOUR}
                  disabled={!settings.data || saveSettings.isPending}
                  onChange={(e) => saveSettings.mutate({ reminderHour: Number(e.target.value) })}
                >
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {t('reminders.hourOption', { hour: String(h).padStart(2, '0') })}
                    </option>
                  ))}
                </select>
              </li>
              <li className="px-4 py-3">
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={test.isPending}
                  onClick={() => test.mutate()}
                >
                  {test.isPending ? t('reminders.sending') : t('reminders.send')}
                </button>
              </li>
            </>
          )}
        </ul>
      )}
      {notice && (
        <p
          role={notice === 'sent' ? 'status' : 'alert'}
          className={notice === 'sent' ? 'notice mt-2' : 'notice notice-danger mt-2'}
        >
          {t(`reminders.${notice === 'unconfigured' ? 'notConfigured' : notice}`)}
        </p>
      )}
    </section>
  );
}
