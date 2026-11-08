import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export const healthKeys = {
  all: ['health'] as const,
};

export const useHealth = () =>
  useQuery({ queryKey: healthKeys.all, queryFn: () => api.health(), retry: false });
