import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { useScrolledPast } from './useScrolledPast';

let callback: ((entries: { isIntersecting: boolean }[]) => void) | undefined;
const observe = vi.fn();

class FakeObserver {
  constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
    callback = cb;
  }
  observe = observe;
  disconnect = vi.fn();
}

function Probe() {
  const [ready, setReady] = useState(false);
  const [ref, past] = useScrolledPast<HTMLDivElement>();
  return (
    <>
      <button type="button" onClick={() => setReady(true)}>
        load
      </button>
      {ready && <div ref={ref} />}
      <p>{past ? 'collapsed' : 'expanded'}</p>
    </>
  );
}

describe('useScrolledPast', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    callback = undefined;
  });

  it('observes a sentinel that mounts after the first render', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    render(<Probe />);
    expect(observe).not.toHaveBeenCalled();
    act(() => screen.getByRole('button').click());
    expect(observe).toHaveBeenCalledTimes(1);
    act(() => callback?.([{ isIntersecting: false }]));
    expect(screen.getByText('collapsed')).toBeTruthy();
    act(() => callback?.([{ isIntersecting: true }]));
    expect(screen.getByText('expanded')).toBeTruthy();
  });
});
