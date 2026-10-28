import { useTranslation } from 'react-i18next';

export function NoAccess({ onSignOut }: { onSignOut: () => void }) {
  const { t } = useTranslation();
  return (
    <section className="enter-rise mx-auto mt-10 flex max-w-sm flex-col items-center gap-4 text-center">
      <h2 className="text-2xl font-bold tracking-tight">{t('auth.noAccess.title')}</h2>
      <p className="text-muted">{t('auth.noAccess.body')}</p>
      <button type="button" onClick={onSignOut} className="btn">
        {t('auth.signOut')}
      </button>
    </section>
  );
}
