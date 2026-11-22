import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '../../lib/i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

const sync = vi.hoisted(() => ({ state: { fetching: false, background: false } as unknown }));
const online = vi.hoisted(() => ({ value: true }));
const refresh = vi.hoisted(() => vi.fn());
vi.mock('./syncStatus', () => ({ useNotesSync: () => sync.state }));
vi.mock('./useOnline', () => ({ useOnline: () => online.value }));
vi.mock('../../api', () => ({
  useNotes: () => ({ dataUpdatedAt: new Date(2026, 10, 22, 9, 5).getTime() }),
  useRefreshNotes: () => refresh,
}));

import { SyncPill } from './SyncPill';

const view = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SyncPill />
    </QueryClientProvider>,
  );

let rerender: () => void;
const setState = (s: unknown) => {
  sync.state = s;
  act(() => rerender());
};
const mount = () => {
  const r = view();
  rerender = () =>
    r.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <SyncPill />
      </QueryClientProvider>,
    );
};
const done = (count: number) => ({
  fetching: false,
  background: true,
  result: { at: 1, changedIds: new Set<string>(), count },
});

beforeEach(() => {
  vi.useFakeTimers({ now: new Date(2026, 10, 22, 12, 0) });
  online.value = true;
  sync.state = { fetching: false, background: false };
  refresh.mockReset();
  mount();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const startSync = () => setState({ fetching: true, background: true });
const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe('SyncPill', () => {
  it('is hidden under 1 s, then says syncing, then slow with the saved time', () => {
    startSync();
    tick(900);
    expect(screen.queryByText('מתעדכן…')).toBeNull();
    tick(200);
    expect(screen.getByText('מתעדכן…')).toBeTruthy();
    tick(7000);
    expect(screen.getByText(/השרת איטי · מוצגת הגרסה השמורה מ-9:05/)).toBeTruthy();
  });

  it.each([
    [1, 'עודכן · שינוי אחד'],
    [2, 'עודכן · 2 שינויים'],
    [5, 'עודכן · 5 שינויים'],
  ])('shows the updated text for %i changes and hides it after 2.5 s', (count, text) => {
    setState(done(count));
    expect(screen.getByText(text)).toBeTruthy();
    tick(2600);
    expect(screen.queryByText(text)).toBeNull();
  });

  it('says up to date only after a visible pill', () => {
    setState(done(0));
    expect(screen.queryByText('הכל מעודכן')).toBeNull();
    startSync();
    tick(1100);
    setState(done(0));
    expect(screen.getByText('הכל מעודכן')).toBeTruthy();
  });

  it('shows failure after a visible pill with a retry that refreshes', () => {
    startSync();
    tick(1100);
    setState({
      fetching: false,
      background: true,
      result: { at: 1, failed: true, network: false },
    });
    fireEvent.click(screen.getByRole('button', { name: 'נסו שוב' }));
    expect(refresh).toHaveBeenCalled();
    tick(6100);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('is hidden while offline', () => {
    online.value = false;
    startSync();
    tick(2000);
    expect(screen.queryByText('מתעדכן…')).toBeNull();
  });

  it('keeps syncing out of the live region and announces the other states', () => {
    startSync();
    tick(1100);
    const region = screen.getByRole('status');
    expect(region.textContent).toContain('מתעדכן…');
    expect(region.querySelector('[aria-hidden="true"].rounded-full')).not.toBeNull();
    setState(done(2));
    expect(region.querySelector('.rounded-full')?.getAttribute('aria-hidden')).toBeNull();
  });
});
