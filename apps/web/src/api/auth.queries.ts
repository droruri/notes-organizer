import { queryOptions } from '@tanstack/react-query';
import { api } from '../lib/api';

export const meKeys = {
  all: ['me'] as const,
};

/** Who am I and am I allowed: never persisted, always re-fetched, and failures surface as-is. */
export const meQueryOptions = queryOptions({
  queryKey: meKeys.all,
  queryFn: () => api.me(),
  retry: false,
  staleTime: 0,
});
