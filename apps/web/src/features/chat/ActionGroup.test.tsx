import type { ActionsBody, ActionsResponse, AgentAction } from '@notes/shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '../../lib/i18n';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { ActionGroup } from './ActionGroup';

afterEach(cleanup);

const mk = (name: string): AgentAction => ({ action: 'create', kind: 'category', name });
const A = [mk('A'), mk('B'), mk('C')];
const approveBtn = /^(אישור|approve)$/i;
const allBtn = /לאשר הכול|approve all/i;

const setup = (
  actions: AgentAction[],
  apply: (b: ActionsBody) => Promise<ActionsResponse> = async (b) => ({
    results: b.actions.map(() => ({ ok: true as const })),
  }),
) => {
  const fn = vi.fn(apply);
  const onApplied = vi.fn();
  render(<ActionGroup actions={actions} apply={fn} onApplied={onApplied} />);
  return { fn, onApplied };
};

describe('ActionGroup', () => {
  it('approves all cards with one request and one refresh', async () => {
    const { fn, onApplied } = setup(A);
    fireEvent.click(screen.getByRole('button', { name: /\(3\)/ }));
    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith({ actions: A });
    expect(screen.getAllByText(/בוצע|done/i)).toHaveLength(3);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('maps per-card results back and lets a failed card retry alone', async () => {
    const { fn, onApplied } = setup(A, async () => ({
      results: [{ ok: true }, { ok: false, error: 'name_taken' }, { ok: true }],
    }));
    fireEvent.click(screen.getByRole('button', { name: allBtn }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getAllByText(/בוצע|done/i)).toHaveLength(2);
    expect(screen.queryByRole('button', { name: allBtn })).toBeNull();
    expect(onApplied).toHaveBeenCalledTimes(1);
    fn.mockResolvedValueOnce({ results: [{ ok: true }] });
    fireEvent.click(screen.getByRole('button', { name: approveBtn }));
    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(2));
    expect(fn).toHaveBeenLastCalledWith({ actions: [A[1]] });
  });

  it('puts every card back to idle with the generic error when the request throws', async () => {
    const { onApplied } = setup(A, async () => {
      throw new Error('down');
    });
    fireEvent.click(screen.getByRole('button', { name: allBtn }));
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(3));
    expect(screen.getAllByRole('button', { name: approveBtn })).toHaveLength(3);
    expect(onApplied).not.toHaveBeenCalled();
  });

  it('treats a missing result as a generic failure', async () => {
    setup(A.slice(0, 2), async () => ({ results: [{ ok: true }] }));
    fireEvent.click(screen.getByRole('button', { name: allBtn }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getAllByText(/בוצע|done/i)).toHaveLength(1);
  });

  it('does not send dismissed cards, hides approve-all under 2 pending, disables while in flight', async () => {
    let release: (r: ActionsResponse) => void = () => {};
    const { fn } = setup(
      A,
      () =>
        new Promise<ActionsResponse>((resolve) => {
          release = resolve;
        }),
    );
    const [dismiss] = screen.getAllByRole('button', { name: /דחייה|dismiss/i });
    if (!dismiss) throw new Error('no dismiss button rendered');
    fireEvent.click(dismiss);
    expect(screen.getByRole('button', { name: allBtn })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: allBtn }));
    expect(fn).toHaveBeenCalledWith({ actions: [A[1], A[2]] });
    for (const b of screen.getAllByRole('button')) expect(b.hasAttribute('disabled')).toBe(true);
    release({ results: [{ ok: true }, { ok: true }] });
    await waitFor(() => expect(screen.queryByRole('button')).toBeNull());
  });

  it('approves a single card alone and refreshes once', async () => {
    const { fn, onApplied } = setup(A.slice(0, 1));
    fireEvent.click(screen.getByRole('button', { name: approveBtn }));
    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
    expect(fn).toHaveBeenCalledWith({ actions: [A[0]] });
    expect(screen.getAllByText(/בוצע|done/i)).toHaveLength(1);
  });

  it('hides approve-all with a single pending card and dismiss applies nothing', () => {
    const { fn } = setup(A.slice(0, 1));
    expect(screen.queryByRole('button', { name: allBtn })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /דחייה|dismiss/i }));
    expect(fn).not.toHaveBeenCalled();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
