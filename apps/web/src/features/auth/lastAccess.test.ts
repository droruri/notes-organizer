import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { clearLastAccess, readLastAccess, saveLastAccess } from './lastAccess';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('lastAccess', () => {
  it('round-trips and clears', () => {
    saveLastAccess('u1', true);
    expect(readLastAccess('u1')).toEqual({ isAdmin: true });
    clearLastAccess();
    expect(readLastAccess('u1')).toBeUndefined();
  });

  it('returns undefined for a different user', () => {
    saveLastAccess('u1', false);
    expect(readLastAccess('u2')).toBeUndefined();
  });

  it('returns undefined and warns on invalid JSON or wrong shape', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem('notes-last-access-v1', '{nope');
    expect(readLastAccess('u1')).toBeUndefined();
    localStorage.setItem('notes-last-access-v1', JSON.stringify({ userId: 'u1' }));
    expect(readLastAccess('u1')).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('never throws when storage throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('x');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('x');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('x');
    });
    expect(readLastAccess('u1')).toBeUndefined();
    expect(() => saveLastAccess('u1', true)).not.toThrow();
    expect(() => clearLastAccess()).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(3);
  });
});
