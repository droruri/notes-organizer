import type { ReactElement } from 'react';
import type { ActionsBody, ActionsResponse, AgentAction } from '@notes/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '../../lib/i18n';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { ApiRequestError, api } from '../../lib/api';
import { ActionGroup } from './ActionGroup';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const mk = (name: string): AgentAction => ({ action: 'create', kind: 'category', name });
const A = [mk('A'), mk('B'), mk('C')];
const approveBtn = /^(אישור|approve)$/i;
const allBtn = /לאשר הכול|approve all/i;

const renderGroup = (ui: ReactElement) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

const setup = (
  actions: AgentAction[],
  apply: (b: ActionsBody) => Promise<ActionsResponse> = async (b) => ({
    results: b.actions.map(() => ({ ok: true as const })),
  }),
) => {
  const fn = vi.spyOn(api, 'applyActions').mockImplementation(apply);
  const onApplied = vi.fn();
  renderGroup(<ActionGroup actions={actions} onApplied={onApplied} />);
  return { fn, onApplied };
};

describe('ActionGroup', () => {
  it('approves two recolor cards in one request', async () => {
    const id = (n: number) => `${n}`.repeat(8) + '-1111-4111-8111-111111111111';
    const R: AgentAction[] = [
      { action: 'recolor', kind: 'category', id: id(1), name: 'Work', color: 'blue' },
      { action: 'recolor', kind: 'category', id: id(2), name: 'Home', color: 'blue' },
    ];
    const { fn } = setup(R);
    expect(screen.getAllByText(/work|home/i).length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.cat-pill[data-color="blue"]')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: allBtn }));
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(1));
    expect(fn).toHaveBeenCalledWith({ actions: R });
  });

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
    await waitFor(() => expect(fn).toHaveBeenCalledWith({ actions: [A[1], A[2]] }));
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

describe('ActionGroup note cards', () => {
  const id = (n: number) => `${n}`.repeat(8) + '-1111-4111-8111-111111111111';
  const note = (n: number, name: string): AgentAction => ({
    action: 'update',
    kind: 'note',
    id: id(n),
    name,
    edit: { status: 'done', categoryIds: [id(9)] },
    labels: { categories: ['Work'], tags: [] },
  });

  it('shows the changed fields on a note card', () => {
    renderGroup(<ActionGroup actions={[note(1, 'Dentist')]} onApplied={vi.fn()} />);
    expect(screen.getByText(/Dentist/)).toBeTruthy();
    expect(screen.getByText(/Work/)).toBeTruthy();
  });

  it('approve-all sends one applyActions and one updateNote per note card', async () => {
    const apply = vi.spyOn(api, 'applyActions').mockImplementation(async (b: ActionsBody) => ({
      results: b.actions.map(() => ({ ok: true as const })),
    }));
    const applyNote = vi.fn(async () => ({}));
    const onApplied = vi.fn();
    const actions = [mk('A'), note(1, 'Dentist'), note(2, 'Groceries')];
    renderGroup(<ActionGroup actions={actions} applyNote={applyNote} onApplied={onApplied} />);
    fireEvent.click(screen.getByRole('button', { name: allBtn }));
    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith({ actions: [mk('A')] });
    expect(applyNote).toHaveBeenCalledTimes(2);
    expect(applyNote).toHaveBeenCalledWith(
      id(1),
      actions[1] && 'edit' in actions[1] ? actions[1].edit : null,
    );
    expect(screen.getAllByText(/בוצע|done/i)).toHaveLength(3);
  });

  it('a 404 on one note card errors that card only', async () => {
    const applyNote = vi.fn(async (noteId: string) => {
      if (noteId === id(1)) throw new ApiRequestError(404, 'not_found', 'nf');
      return {};
    });
    const onApplied = vi.fn();
    renderGroup(
      <ActionGroup
        actions={[note(1, 'Dentist'), note(2, 'Groceries')]}
        applyNote={applyNote}
        onApplied={onApplied}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: allBtn }));
    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getAllByText(/בוצע|done/i)).toHaveLength(1);
  });
});
