import { describe, expect, it } from 'vite-plus/test';
import {
  dateFormatter,
  dateTimeFormatter,
  formatDate,
  formatDateTime,
  updatedDate,
} from './formatDate';

// Literal outputs captured from the pre-cache implementation (main), so a change in
// options or caching shows up here rather than being mirrored by the test.
const expected = {
  date: { he: '5 במרץ 2025', en: 'Mar 5, 2025' },
  dateTime: { he: '5 במרץ, 10:30', en: 'Mar 5, 10:30 AM' },
} as const;

describe('formatDate', () => {
  it.each(['he', 'en'] as const)('formats a date-only string in %s', (lang) => {
    expect(formatDate('2025-03-05', lang)).toBe(expected.date[lang]);
  });

  it.each(['he', 'en'] as const)('formats a timestamp in %s', (lang) => {
    // Local time, so the expected string does not depend on the machine's timezone.
    const iso = new Date(2025, 2, 5, 10, 30).toISOString();
    expect(formatDate(iso, lang)).toBe(expected.date[lang]);
  });

  it('reuses the formatter per language', () => {
    expect(dateFormatter('en')).toBe(dateFormatter('en'));
    expect(dateFormatter('en')).not.toBe(dateFormatter('he'));
  });
});

describe('formatDateTime', () => {
  it.each(['he', 'en'] as const)('formats a timestamp in %s', (lang) => {
    const iso = new Date(2025, 2, 5, 10, 30).toISOString();
    expect(formatDateTime(iso, lang)).toBe(expected.dateTime[lang]);
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
