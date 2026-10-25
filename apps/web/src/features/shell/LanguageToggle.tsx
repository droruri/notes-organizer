import { useTranslation } from 'react-i18next';

export function LanguageToggle() {
  const { t, i18n } = useTranslation();
  const next = i18n.language === 'he' ? 'en' : 'he';
  return (
    <button
      type="button"
      lang={next}
      onClick={() => void i18n.changeLanguage(next)}
      className="rounded-md border border-line px-3 py-1 text-sm hover:bg-surface-hover"
    >
      {t('language.switchTo')}
    </button>
  );
}
