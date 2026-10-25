import { describe, expect, it } from 'vite-plus/test';
import { blockedChange, normalizeEmail } from './users';

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Dana@Example.COM ')).toBe('dana@example.com');
  });
  it('rejects things that are not emails', () => {
    expect(normalizeEmail('nope')).toBeNull();
    expect(normalizeEmail('')).toBeNull();
    expect(normalizeEmail('a b@example.com')).toBeNull();
  });
});

describe('blockedChange', () => {
  const base = {
    actorEmail: 'a@x.com',
    targetEmail: 'b@x.com',
    targetIsAdmin: false,
    adminCount: 2,
  };
  it('lets an admin remove another user', () => {
    expect(blockedChange({ ...base, change: 'remove' })).toBeNull();
  });
  it('blocks removing or demoting yourself', () => {
    const self = { ...base, targetEmail: 'a@x.com', targetIsAdmin: true };
    expect(blockedChange({ ...self, change: 'remove' })).toBe('cannot_change_self');
    expect(blockedChange({ ...self, change: 'demote' })).toBe('cannot_change_self');
  });
  it('blocks removing or demoting the last admin, even yourself', () => {
    const last = { ...base, targetEmail: 'a@x.com', targetIsAdmin: true, adminCount: 1 };
    expect(blockedChange({ ...last, change: 'remove' })).toBe('last_admin');
    expect(blockedChange({ ...last, change: 'demote' })).toBe('last_admin');
  });
  it('allows demoting one of several admins', () => {
    expect(blockedChange({ ...base, targetIsAdmin: true, change: 'demote' })).toBeNull();
  });
  it('treats demoting a non-admin as a no-op', () => {
    expect(blockedChange({ ...base, adminCount: 1, change: 'demote' })).toBeNull();
  });
});
