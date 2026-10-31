import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Icon } from '../../ui/Icon';
import { useAuth } from '../auth/authContext';
import { OfflineBanner } from '../offline/OfflineBanner';
import { HeaderSlot } from './headerSlot';
import { LanguageToggle } from './LanguageToggle';
import { ROUTES } from './routes';

export function Shell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  // Signed in, the language switch lives in the app menu; before that it sits in the header.
  const { state } = useAuth();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  return (
    <div className="min-h-dvh bg-bg text-fg">
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
            <span ref={setSlot} className="contents" />
            {state !== 'allowed' && <LanguageToggle />}
          </div>
        </div>
      </header>
      <OfflineBanner />
      <main className="mx-auto w-full max-w-3xl px-4 pt-6 pb-28 text-start sm:pb-12">
        <HeaderSlot value={slot}>{children}</HeaderSlot>
      </main>
    </div>
  );
}
