import { useTranslation } from 'react-i18next';

export function NoAccess({ onSignOut }: { onSignOut: () => void }) {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col items-start gap-3">
      <h2 className="text-lg font-semibold">{t('auth.noAccess.title')}</h2>
      <p className="text-muted">{t('auth.noAccess.body')}</p>
      <button
        type="button"
        onClick={onSignOut}
        className="rounded-md border border-line px-3 py-1 text-sm hover:bg-surface-hover"
      >
        {t('auth.signOut')}
      </button>
    </section>
  );
}
