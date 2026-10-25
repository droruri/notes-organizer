import { useTranslation } from 'react-i18next';
import { useOnline } from './useOnline';

export function OfflineBanner() {
  const { t } = useTranslation();
  if (useOnline()) return null;
  return (
    <div role="status" className="border-b border-line bg-marker/40 px-4 py-2 text-sm">
      <p className="mx-auto flex max-w-3xl items-center gap-2">
        <span aria-hidden="true" className="size-2 rounded-full bg-warn" />
        {t('offline.banner')}
      </p>
    </div>
  );
}
