import { describe, expect, it } from 'vite-plus/test';
import { isoToLocalInput, localInputToIso } from './remindAt';

describe('remindAt', () => {
  it('round-trips local input through ISO', () => {
    const iso = localInputToIso('2026-11-07T09:30');
    expect(iso).toMatch(/Z$/);
    expect(isoToLocalInput(iso)).toBe('2026-11-07T09:30');
  });
  it('handles empty and invalid', () => {
    expect(localInputToIso('')).toBeNull();
    expect(localInputToIso('nope')).toBeNull();
    expect(isoToLocalInput(null)).toBe('');
    expect(isoToLocalInput('nope')).toBe('');
  });
});
