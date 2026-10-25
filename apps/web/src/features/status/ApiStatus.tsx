import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export function ApiStatus() {
  const health = useQuery({ queryKey: ['health'], queryFn: api.health, retry: false });
  if (health.isPending) return <p>בודק את השרת…</p>;
  if (health.isError || !health.data.ok) return <p role="alert">השרת לא זמין</p>;
  return <p>השרת פועל</p>;
}
