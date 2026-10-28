import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { Toast } from './Toast';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Toast', () => {
  it('closes itself after a few seconds', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(
      <Toast actions={null} onClose={onClose}>
        hi
      </Toast>,
    );
    expect(onClose).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(7000);
    });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
