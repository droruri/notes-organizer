import { Locale } from '@notes/shared';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../locales/en.json';
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

void i18n.use(initReactI18next).init({
  resources: { he: { translation: he }, en: { translation: en } },
  lng,
  fallbackLng: 'he',
  initAsync: false,
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', applyLanguage);
applyLanguage(lng);

export { i18n };
