import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '../lib/i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { Sheet } from './Sheet';

beforeEach(() => {
  // Start every test on a plain entry, not one left by an earlier test's sheet.
  window.history.replaceState(null, '');
  vi.useFakeTimers();
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(400);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const sheetDepth = () =>
  (window.history.state as { overlay?: { depth: number } } | null)?.overlay?.depth ?? 0;
/** Presses Back and lets jsdom fire `popstate`. */
const pressBack = async () => {
  const popped = new Promise((resolve) =>
    window.addEventListener('popstate', resolve, { once: true }),
  );
  window.history.back();
  await act(async () => {
    vi.advanceTimersByTime(10);
    await popped;
  });
};

const setup = (dirty = false) => {
  const onClose = vi.fn();
  render(
    <Sheet title="Demo" onClose={onClose} dirty={dirty}>
      <p>body</p>
    </Sheet>,
  );
  const handle = screen.getByTestId('sheet-handle');
  const panel = screen.getByRole('dialog');
  return { onClose, handle, panel };
};
const settle = () => act(() => void vi.advanceTimersByTime(400));
const ptr = (id: number, x: number, y: number) => ({ pointerId: id, clientX: x, clientY: y });
const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe('Sheet', () => {
  it('closes on Esc, backdrop click and the close button', () => {
    for (const close of [
      () => fireEvent.keyDown(document, { key: 'Escape' }),
      () => {
        const backdrop = screen.getByRole('dialog').parentElement;
        if (!backdrop) throw new Error('dialog has no backdrop');
        fireEvent.click(backdrop);
      },
      () => fireEvent.click(screen.getByRole('button', { name: /close|סגירה/i })),
    ]) {
      const { onClose } = setup();
      close();
      settle();
      expect(onClose).toHaveBeenCalledTimes(1);
      cleanup();
    }
  });

  it('dismisses past 25% of its height', () => {
    const { onClose, handle, panel } = setup();
    fireEvent.pointerDown(handle, ptr(1, 100, 0));
    wait(1000);
    fireEvent.pointerMove(handle, ptr(1, 100, 120));
    expect(panel.style.translate).toBe('0 120px');
    wait(1000);
    fireEvent.pointerUp(handle, ptr(1, 100, 120));
    settle();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('dismisses on a fast flick', () => {
    const { onClose, handle } = setup();
    fireEvent.pointerDown(handle, ptr(1, 100, 0));
    wait(40);
    fireEvent.pointerMove(handle, ptr(1, 100, 60));
    wait(10);
    fireEvent.pointerUp(handle, ptr(1, 100, 60));
    settle();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('snaps back on a short slow swipe', () => {
    const { onClose, handle, panel } = setup();
    fireEvent.pointerDown(handle, ptr(1, 100, 0));
    wait(1000);
    fireEvent.pointerMove(handle, ptr(1, 100, 50));
    wait(1000);
    fireEvent.pointerUp(handle, ptr(1, 100, 50));
    settle();
    expect(onClose).not.toHaveBeenCalled();
    expect(panel.style.translate).toBe('');
  });

  it('ignores horizontal drags and two-finger touches', () => {
    const { onClose, handle, panel } = setup();
    fireEvent.pointerDown(handle, ptr(1, 100, 0));
    fireEvent.pointerMove(handle, ptr(1, 250, 30));
    fireEvent.pointerMove(handle, ptr(1, 250, 300));
    fireEvent.pointerUp(handle, ptr(1, 250, 300));
    expect(panel.style.translate).toBe('');
    fireEvent.pointerDown(handle, ptr(2, 100, 0));
    fireEvent.pointerDown(handle, ptr(3, 140, 0));
    fireEvent.pointerMove(handle, ptr(2, 100, 300));
    fireEvent.pointerUp(handle, ptr(2, 100, 300));
    fireEvent.pointerUp(handle, ptr(3, 140, 0));
    settle();
    expect(panel.style.translate).toBe('');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a second finger on the body cancels a handle drag', () => {
    const { onClose, handle, panel } = setup();
    fireEvent.pointerDown(handle, ptr(1, 100, 0));
    fireEvent.pointerDown(panel.querySelector('p') ?? panel, ptr(2, 100, 0));
    fireEvent.pointerMove(handle, ptr(1, 100, 300));
    wait(1000);
    fireEvent.pointerUp(handle, ptr(1, 100, 300));
    fireEvent.pointerUp(panel, ptr(2, 100, 0));
    settle();
    expect(onClose).not.toHaveBeenCalled();
    expect(panel.style.translate).toBe('');
  });

  it('a later drag works once both fingers have lifted', () => {
    const { onClose, handle, panel } = setup();
    fireEvent.pointerDown(handle, ptr(1, 100, 0));
    fireEvent.pointerDown(panel.querySelector('p') ?? panel, ptr(2, 100, 0));
    fireEvent.pointerUp(panel, ptr(2, 100, 0));
    fireEvent.pointerUp(handle, ptr(1, 100, 0));
    fireEvent.pointerDown(handle, ptr(3, 100, 0));
    fireEvent.pointerMove(handle, ptr(3, 100, 300));
    wait(1000);
    fireEvent.pointerUp(handle, ptr(3, 100, 300));
    settle();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('hides the close button on phones, where the sheet closes by swipe', () => {
    setup();
    expect(screen.getByRole('button', { name: /close|סגירה/i }).className).toContain(
      'max-sm:hidden',
    );
  });

  it('closes on Back instead of leaving the page', async () => {
    const before = window.history.length;
    const { onClose } = setup();
    expect(window.history.length).toBe(before + 1);
    expect(sheetDepth()).toBe(1);
    await pressBack();
    settle();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(sheetDepth()).toBe(0);
  });

  it('pops its history entry when closed another way', async () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Sheet title="Demo" onClose={onClose}>
        <p>body</p>
      </Sheet>,
    );
    expect(sheetDepth()).toBe(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    settle();
    expect(onClose).toHaveBeenCalledTimes(1);
    const popped = new Promise((resolve) =>
      window.addEventListener('popstate', resolve, { once: true }),
    );
    rerender(<></>);
    await act(async () => {
      vi.advanceTimersByTime(10);
      await popped;
    });
    expect(sheetDepth()).toBe(0);
  });

  it('Back closes only the top sheet of a stack', async () => {
    const outer = vi.fn();
    const inner = vi.fn();
    const { rerender } = render(
      <Sheet title="Outer" onClose={outer}>
        {null}
      </Sheet>,
    );
    rerender(
      <Sheet title="Outer" onClose={outer}>
        <Sheet title="Inner" onClose={inner}>
          {null}
        </Sheet>
      </Sheet>,
    );
    expect(sheetDepth()).toBe(2);
    await pressBack();
    settle();
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });

  it('stays open on Back when the user keeps unsaved changes', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { onClose } = setup(true);
    await pressBack();
    settle();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
    // The entry is back, so the next Back can close the sheet again.
    expect(sheetDepth()).toBe(1);
  });

  it('asks before closing when dirty', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValue(true);
    const { onClose } = setup(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    settle();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    settle();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
