import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { useSlow } from './useSlow';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useSlow', () => {
  it('turns true only after the wait has run for the full time', () => {
    vi.useFakeTimers();
    const { result } = renderHook(({ active }) => useSlow(active, 1000), {
      initialProps: { active: true },
    });
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(true);
  });

  it('resets when the wait ends before the time is up', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ active }) => useSlow(active, 1000), {
      initialProps: { active: true },
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    rerender({ active: false });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(false);
  });
});
