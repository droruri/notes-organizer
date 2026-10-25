import { useTranslation } from 'react-i18next';
import { Icon } from '../../ui/Icon';

export function LanguageToggle() {
  const { t, i18n } = useTranslation();
  const next = i18n.language === 'he' ? 'en' : 'he';
  return (
    <button
      type="button"
      lang={next}
      onClick={() => void i18n.changeLanguage(next)}
      className="btn btn-ghost btn-sm text-muted"
    >
      <Icon name="globe" size={16} />
      {t('language.switchTo')}
    </button>
  );
}
