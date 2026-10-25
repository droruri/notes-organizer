import { useTranslation } from 'react-i18next';
import { useOnline } from './useOnline';

export function OfflineBanner() {
  const { t } = useTranslation();
  if (useOnline()) return null;
  return (
    <div role="status" className="border-b border-line bg-surface-hover px-4 py-2 text-sm">
      {t('offline.banner')}
    </div>
  );
}
