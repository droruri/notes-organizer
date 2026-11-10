import { describe, expect, it } from 'vite-plus/test';
import { i18n, i18nReady } from './i18n';

describe('i18n lazy English', () => {
  it('starts in Hebrew and loads English on demand', async () => {
    await i18nReady;
    await i18n.changeLanguage('he');
    expect(i18n.hasResourceBundle('en', 'translation')).toBe(false);
    await i18n.changeLanguage('en');
    expect(i18n.hasResourceBundle('en', 'translation')).toBe(true);
    expect(i18n.t('app.name')).not.toBe('app.name');
    await i18n.changeLanguage('he');
  });

  it('formats the Hebrew search status for exactly 2 notes', async () => {
    await i18nReady;
    await i18n.changeLanguage('he');
    expect(i18n.t('filters.found', { count: 2 })).toBe('נמצאו 2 פתקים');
  });
});
