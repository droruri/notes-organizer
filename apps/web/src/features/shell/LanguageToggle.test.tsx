import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { i18n } from '../../lib/i18n';
import { LanguageToggle } from './LanguageToggle';

beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage('he');
});
afterEach(cleanup);

describe('LanguageToggle', () => {
  it('defaults to Hebrew RTL', () => {
    expect(document.documentElement.lang).toBe('he');
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('flips lang and dir and remembers the choice', () => {
    render(<LanguageToggle />);
    fireEvent.click(screen.getByRole('button'));
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
    expect(localStorage.getItem('language')).toBe('en');
    fireEvent.click(screen.getByRole('button'));
    expect(document.documentElement.dir).toBe('rtl');
  });
});
