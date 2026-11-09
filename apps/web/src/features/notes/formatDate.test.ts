import { describe, expect, it } from 'vite-plus/test';
import {
  dateFormatter,
  dateTimeFormatter,
  formatDate,
  formatDateTime,
  updatedDate,
} from './formatDate';

const expectedDate = (lang: string, d: Date) =>
  new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
const expectedDateTime = (lang: string, d: Date) =>
  new Intl.DateTimeFormat(lang, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);

describe('formatDate', () => {
  it.each(['he', 'en'])('formats a date-only string in %s', (lang) => {
    expect(formatDate('2025-03-05', lang)).toBe(expectedDate(lang, new Date(2025, 2, 5)));
  });

  it.each(['he', 'en'])('formats a timestamp in %s', (lang) => {
    const iso = '2025-03-05T10:30:00Z';
    expect(formatDate(iso, lang)).toBe(expectedDate(lang, new Date(iso)));
  });

  it('reuses the formatter per language', () => {
    expect(dateFormatter('en')).toBe(dateFormatter('en'));
    expect(dateFormatter('en')).not.toBe(dateFormatter('he'));
  });
});

describe('formatDateTime', () => {
  it.each(['he', 'en'])('formats a timestamp in %s', (lang) => {
    const iso = '2025-03-05T10:30:00Z';
    expect(formatDateTime(iso, lang)).toBe(expectedDateTime(lang, new Date(iso)));
  });

  it('reuses the formatter per language', () => {
    expect(dateTimeFormatter('he')).toBe(dateTimeFormatter('he'));
    expect(dateTimeFormatter('en')).not.toBe(dateTimeFormatter('he'));
  });
});

describe('updatedDate', () => {
  it('is null on the same day', () => {
    expect(updatedDate('2025-03-05T08:00:00', '2025-03-05T09:00:00', 'en')).toBeNull();
  });
});
