import { act, cleanup, fireEvent, render } from '@testing-library/react';
import '../lib/i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { OverlayFallback } from './OverlayFallback';
import { Sheet } from './Sheet';

beforeEach(() => {
  window.history.replaceState(null, '');
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function depth(): number {
  const state: unknown = window.history.state;
  if (typeof state !== 'object' || state === null || !('overlay' in state)) return 0;
  const overlay: unknown = state.overlay;
  if (typeof overlay !== 'object' || overlay === null || !('depth' in overlay)) return 0;
  return typeof overlay.depth === 'number' ? overlay.depth : 0;
}

describe('OverlayFallback', () => {
  it('keeps a closing menu’s history entry for the overlay that is still loading', async () => {
    const back = vi.spyOn(window.history, 'back');
    const menu = (
      <Sheet title="Menu" onClose={vi.fn()}>
        {null}
      </Sheet>
    );
    const { rerender } = render(menu);
    expect(depth()).toBe(1);
    // A menu pick closes the menu and opens a lazy dialog whose chunk is not loaded yet.
    fireEvent.keyDown(document, { key: 'Escape' });
    const onBack = vi.fn();
    rerender(
      <>
        {menu}
        <OverlayFallback onBack={onBack} />
      </>,
    );
    act(() => void vi.advanceTimersByTime(400));
    rerender(<OverlayFallback onBack={onBack} />);
    // The chunk arrives: the dialog takes over the same entry.
    const onClose = vi.fn();
    rerender(
      <Sheet title="Settings" onClose={onClose}>
        {null}
      </Sheet>,
    );
    await act(async () => void vi.advanceTimersByTime(10));
    expect(back).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(depth()).toBe(1);
  });
});
