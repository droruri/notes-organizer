import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../ui/Icon';
import { OfflineBanner } from '../offline/OfflineBanner';
import { HeaderSlot } from './headerSlot';
import { LanguageToggle } from './LanguageToggle';

export function Shell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <h1 className="flex items-center gap-2.5 text-start text-lg font-bold tracking-tight">
            <span className="grid size-8 place-items-center rounded-[9px] bg-accent text-[var(--accent-fg)] shadow-sm">
              <Icon name="note" size={18} />
            </span>
            {t('app.name')}
          </h1>
          <div className="flex items-center gap-2">
            <span ref={setSlot} className="contents" />
            <LanguageToggle />
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
