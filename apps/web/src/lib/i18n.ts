import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../locales/en.json';
import he from '../locales/he.json';

export const languages = ['he', 'en'] as const;
export type Language = (typeof languages)[number];

const storageKey = 'language';
const rtl: Record<Language, 'rtl' | 'ltr'> = { he: 'rtl', en: 'ltr' };

function isLanguage(value: unknown): value is Language {
  return languages.some((l) => l === value);
}

function readStoredLanguage(): Language {
  try {
    const stored = localStorage.getItem(storageKey);
    if (isLanguage(stored)) return stored;
  } catch {
    // storage blocked: fall back to the default
  }
  return 'he';
}

function applyLanguage(lng: string) {
  if (!isLanguage(lng)) return;
  document.documentElement.lang = lng;
  document.documentElement.dir = rtl[lng];
  document.title = i18n.t('app.name');
  try {
    localStorage.setItem(storageKey, lng);
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
