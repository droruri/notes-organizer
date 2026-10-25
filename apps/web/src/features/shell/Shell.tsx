import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { HeaderSlot } from './headerSlot';
import { LanguageToggle } from './LanguageToggle';

export function Shell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h1 className="text-lg font-semibold text-start">{t('app.name')}</h1>
        <div className="flex items-center gap-2">
          <span ref={setSlot} />
          <LanguageToggle />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-4 text-start">
        <HeaderSlot value={slot}>{children}</HeaderSlot>
      </main>
    </div>
  );
}
