import type { PushSubscriptionBody, SettingsPatch } from '@notes/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export const settingsKeys = {
  all: ['settings'] as const,
};

export const useSettings = () =>
  useQuery({ queryKey: settingsKeys.all, queryFn: () => api.settings() });

/** Saves a settings patch and puts the server's answer straight into the cache. */
export function useSaveSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: SettingsPatch) => api.saveSettings(patch),
    onSuccess: (saved) => queryClient.setQueryData(settingsKeys.all, saved),
  });
}

/** Sends a test push to this user's devices; the caller decides what to show from the handlers. */
export function useSendPushTest(handlers: {
  onSuccess: (result: { sent: number }) => void;
  onError: () => void;
}) {
  return useMutation({
    mutationFn: () => api.sendPushTest(),
    onSuccess: handlers.onSuccess,
    onError: handlers.onError,
  });
}

type PushRegister = (body: PushSubscriptionBody) => Promise<unknown>;
type PushUnregister = (endpoint: string) => Promise<unknown>;

/** This device's browser steps, passed in so this file stays free of browser code. */
export type PushDevice = {
  subscribe: (
    register: PushRegister,
  ) => Promise<'subscribed' | 'denied' | 'unsupported' | 'unconfigured'>;
  unsubscribe: (unregister: PushUnregister) => Promise<void>;
};

export type PushToggleOutcome = 'off' | 'subscribed' | 'denied' | 'unsupported' | 'unconfigured';

/** Turns push on or off for this device: browser subscription, then the API, then the timezone. */
export function useSetPushEnabled(
  device: PushDevice,
  handlers: { onSuccess: (outcome: PushToggleOutcome) => void; onError: () => void },
) {
  const { register, unregister } = usePushRegistration();
  const saveSettings = useSaveSettings();
  return useMutation({
    mutationFn: async (next: boolean): Promise<PushToggleOutcome> => {
      if (!next) {
        await device.unsubscribe(unregister);
        return 'off';
      }
      const outcome = await device.subscribe(register);
      if (outcome === 'subscribed') {
        await saveSettings.mutateAsync({
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
      }
      return outcome;
    },
    onSuccess: handlers.onSuccess,
    onError: handlers.onError,
  });
}

/** Registers / removes this device's push subscription with the API. */
function usePushRegistration() {
  const subscribe = useMutation({
    mutationFn: (body: PushSubscriptionBody) => api.subscribePush(body),
  });
  const unsubscribe = useMutation({
    mutationFn: (endpoint: string) => api.unsubscribePush(endpoint),
  });
  return { register: subscribe.mutateAsync, unregister: unsubscribe.mutateAsync };
}
