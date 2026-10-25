import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguageToggle } from './LanguageToggle';

export function Shell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h1 className="text-lg font-semibold text-start">{t('app.name')}</h1>
        <LanguageToggle />
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-4 text-start">{children}</main>
    </div>
  );
}
