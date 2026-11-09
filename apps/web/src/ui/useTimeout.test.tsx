import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { useTimeout } from './useTimeout';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useTimeout', () => {
  it('fires after the delay while a value is set', () => {
    const fn = vi.fn();
    renderHook(() => useTimeout('x', fn, 1000));
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(fn).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does nothing while the value is null', () => {
    const fn = vi.fn();
    renderHook(() => useTimeout(null, fn, 1000));
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(fn).not.toHaveBeenCalled();
  });

  it('restarts on a new value and cancels when cleared', () => {
    const fn = vi.fn();
    const { rerender } = renderHook(({ v }: { v: string | null }) => useTimeout(v, fn, 1000), {
      initialProps: { v: 'a' as string | null },
    });
    act(() => {
      vi.advanceTimersByTime(800);
    });
    rerender({ v: 'b' });
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(fn).not.toHaveBeenCalled();
    rerender({ v: null });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(fn).not.toHaveBeenCalled();
  });
});
