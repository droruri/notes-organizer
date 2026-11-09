import { Locale } from '@notes/shared';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import he from '../locales/he.json';

export const languages = Locale.options;
export type Language = Locale;

const languageSchema = Locale;
const storageKey = 'language';
const rtl: Record<Language, 'rtl' | 'ltr'> = { he: 'rtl', en: 'ltr' };

function readStoredLanguage(): Language {
  try {
    const stored = languageSchema.safeParse(localStorage.getItem(storageKey));
    if (stored.success) return stored.data;
  } catch {
    // storage blocked: fall back to the default
  }
  return 'he';
}

function applyLanguage(lng: string) {
  const parsed = languageSchema.safeParse(lng);
  if (!parsed.success) return;
  document.documentElement.lang = parsed.data;
  document.documentElement.dir = rtl[parsed.data];
  document.title = i18n.t('app.name');
  try {
    localStorage.setItem(storageKey, parsed.data);
  } catch {
    // storage blocked: the choice just won't survive a reload
  }
}

const lng = readStoredLanguage();

// Hebrew is the default and ships in the main bundle; English loads on demand, both for a stored
// `en` at startup and before `changeLanguage('en')` switches.
const lazyLocales = {
  type: 'backend' as const,
  init() {},
  read(
    language: string,
    _namespace: string,
    callback: (error: Error | null, data?: Record<string, unknown>) => void,
  ) {
    if (language !== 'en') return callback(new Error(`no bundle for ${language}`));
    import('../locales/en.json').then(
      (m) => callback(null, m.default),
      (error: unknown) => callback(error instanceof Error ? error : new Error('locale failed')),
    );
  },
};

/** Resolves once the starting language is loaded; render after it so no key flashes. */
export const i18nReady = i18n
  .use(lazyLocales)
  .use(initReactI18next)
  .init({
    resources: { he: { translation: he } },
    partialBundledLanguages: true,
    lng,
    fallbackLng: 'he',
    interpolation: { escapeValue: false },
  })
  .then(() => undefined);

i18n.on('languageChanged', applyLanguage);
applyLanguage(lng);

export { i18n };
