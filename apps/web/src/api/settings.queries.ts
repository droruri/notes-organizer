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

export const useSendPushTest = () => useMutation({ mutationFn: () => api.sendPushTest() });

/** Registers / removes this device's push subscription with the API. */
export function usePushRegistration() {
  const subscribe = useMutation({
    mutationFn: (body: PushSubscriptionBody) => api.subscribePush(body),
  });
  const unsubscribe = useMutation({
    mutationFn: (endpoint: string) => api.unsubscribePush(endpoint),
  });
  return { register: subscribe.mutateAsync, unregister: unsubscribe.mutateAsync };
}
