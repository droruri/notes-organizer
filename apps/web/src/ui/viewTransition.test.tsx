import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { pushWithTransition, useViewTransitionCommit } from './viewTransition';

const media = (matches: (q: string) => boolean) =>
  vi.fn((query: string) => ({ matches: matches(query) }));

function Route({ path }: { path: string }) {
  useViewTransitionCommit(path);
  return <p>{path}</p>;
}

describe('pushWithTransition', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(document, 'startViewTransition');
  });

  it('just navigates where the API is missing', () => {
    const go = vi.fn();
    pushWithTransition(go);
    expect(go).toHaveBeenCalledTimes(1);
  });

  it('just navigates under reduced motion', () => {
    const start = vi.fn();
    Object.assign(document, { startViewTransition: start });
    vi.stubGlobal(
      'matchMedia',
      media((q) => q.includes('reduce')),
    );
    const go = vi.fn();
    pushWithTransition(go);
    expect(go).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();
  });

  it('runs the navigation in a transition that ends when the new route commits', async () => {
    let update: Promise<void> | undefined;
    Object.assign(document, {
      startViewTransition: (cb: () => Promise<void>) => {
        update = cb();
      },
    });
    vi.stubGlobal(
      'matchMedia',
      media(() => false),
    );
    const view = render(<Route path="/" />);
    const go = vi.fn(() => view.rerender(<Route path="/new" />));
    pushWithTransition(go);
    expect(go).toHaveBeenCalledTimes(1);
    await expect(update).resolves.toBeUndefined();
  });
});
