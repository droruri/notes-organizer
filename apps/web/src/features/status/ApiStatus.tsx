import { useTranslation } from 'react-i18next';
import { useHealth } from '../../api';

export function ApiStatus() {
  const { t } = useTranslation();
  const health = useHealth();
  if (health.isPending) return <p className="text-muted">{t('status.checking')}</p>;
  if (health.isError || !health.data.ok)
    return (
      <p role="alert" className="text-danger">
        {t('status.down')}
      </p>
    );
  return <p className="text-ok">{t('status.up')}</p>;
}
