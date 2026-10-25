import { describe, expect, it } from 'vite-plus/test';
import { isUsable, MAX_NAME_LENGTH, normalizeName } from './taxonomy';

describe('normalizeName', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeName('  Home   repairs ')).toBe('Home repairs');
  });
  it('rejects empty and too-long names', () => {
    expect(normalizeName('   ')).toBeNull();
    expect(normalizeName('a'.repeat(MAX_NAME_LENGTH + 1))).toBeNull();
    expect(normalizeName('a'.repeat(MAX_NAME_LENGTH))).not.toBeNull();
  });
});

describe('isUsable', () => {
  it('needs both tag and category active', () => {
    expect(isUsable({ deleted: false }, { deleted: false })).toBe(true);
    expect(isUsable({ deleted: true }, { deleted: false })).toBe(false);
    expect(isUsable({ deleted: false }, { deleted: true })).toBe(false);
  });
});
