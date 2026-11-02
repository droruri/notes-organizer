import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '../lib/i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { Sheet } from './Sheet';

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(400);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

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
      () => fireEvent.click(screen.getByRole('dialog').parentElement as HTMLElement),
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
    fireEvent.pointerMove(handle, ptr(1, 100, 40));
    wait(10);
    fireEvent.pointerUp(handle, ptr(1, 100, 40));
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
