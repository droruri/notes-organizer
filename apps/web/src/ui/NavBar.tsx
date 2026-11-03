import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

/** Nav bar of a pushed full-screen page: back chevron at the start, title, primary action at the end. */
export function NavBar({
  title,
  onBack,
  action,
}: {
  title: string;
  onBack: () => void;
  action?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="sticky top-0 z-10 -mx-4 -mt-4 grid min-h-14 grid-cols-[auto_1fr_auto] items-center gap-2 border-b border-line bg-bg/90 px-2 backdrop-blur-md max-lg:pt-[env(safe-area-inset-top)] lg:static lg:mx-0 lg:mt-0 lg:min-h-0 lg:border-0 lg:bg-transparent lg:px-0 lg:backdrop-blur-none">
      <button
        type="button"
        onClick={onBack}
        aria-label={t('sheet.back')}
        className="btn btn-ghost size-11 p-0 lg:hidden"
      >
        <Icon name="back" size={22} />
      </button>
      <h2 className="truncate text-lg font-bold tracking-tight max-lg:text-center lg:col-span-2 lg:text-2xl">
        {title}
      </h2>
      <div className="flex items-center justify-end">{action}</div>
    </div>
  );
}
