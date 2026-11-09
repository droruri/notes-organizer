import { describe, expect, it } from 'vite-plus/test';
import { authStorageKey } from './supabase';

describe('authStorageKey', () => {
  it('keeps the key supabase-js used, so signed-in users stay signed in', () => {
    expect(authStorageKey('https://abcdref.supabase.co')).toBe('sb-abcdref-auth-token');
    expect(authStorageKey('http://127.0.0.1:54321')).toBe('sb-127-auth-token');
  });
});
