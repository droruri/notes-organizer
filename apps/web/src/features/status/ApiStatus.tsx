import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';

export function ApiStatus() {
  const { t } = useTranslation();
  const health = useQuery({ queryKey: ['health'], queryFn: api.health, retry: false });
  if (health.isPending) return <p className="text-muted">{t('status.checking')}</p>;
  if (health.isError || !health.data.ok)
    return (
      <p role="alert" className="text-danger">
        {t('status.down')}
      </p>
    );
  return <p className="text-ok">{t('status.up')}</p>;
}
