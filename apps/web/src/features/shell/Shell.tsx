import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Icon } from '../../ui/Icon';
import { useAuth } from '../auth/authContext';
import { OfflineBanner } from '../offline/OfflineBanner';
import { LanguageToggle } from './LanguageToggle';
import { ROUTES } from './routes';

export function Shell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  // Signed in, the language switch lives in the app menu; before that it sits in the header.
  const { state } = useAuth();
  const signedIn = state === 'allowed';
  return (
    <div className="min-h-dvh bg-bg text-fg">
      {!signedIn && (
        <header className="sticky top-0 z-10 border-b border-line bg-bg/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
            <h1 className="text-lg font-bold tracking-tight">
              <Link
                to={ROUTES.notes}
                className="-mx-1.5 flex items-center gap-2.5 rounded-[11px] px-1.5 py-0.5 text-start"
              >
                <span className="grid size-8 place-items-center rounded-[9px] bg-accent text-[var(--accent-fg)] shadow-sm">
                  <Icon name="note" size={18} />
                </span>
                {t('app.name')}
              </Link>
            </h1>
            <div className="flex items-center gap-2">
              <LanguageToggle />
            </div>
          </div>
        </header>
      )}
      <OfflineBanner />
      <main
        className={`mx-auto w-full max-w-3xl px-4 pt-6 text-start ${signedIn ? 'pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(9rem+env(safe-area-inset-bottom))] lg:ps-[17rem] lg:pb-12' : 'pb-28 sm:pb-12'}`}
      >
        {children}
      </main>
    </div>
  );
}
