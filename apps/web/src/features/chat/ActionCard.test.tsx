import type { AgentAction } from '@notes/shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '../../lib/i18n';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { ApiRequestError } from '../../lib/api';
import { ActionCard } from './ActionCard';

afterEach(cleanup);

const action: AgentAction = {
  action: 'delete',
  kind: 'category',
  id: 'c1111111-1111-4111-8111-111111111111',
  name: 'Home',
};

describe('ActionCard', () => {
  it('applies nothing until Approve, then refreshes', async () => {
    const apply = vi.fn().mockResolvedValue(undefined);
    const onApplied = vi.fn();
    render(<ActionCard action={action} apply={apply} onApplied={onApplied} />);
    expect(apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /אישור|approve/i }));
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
    expect(apply).toHaveBeenCalledWith(action);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('Dismiss applies nothing and removes the buttons', () => {
    const apply = vi.fn();
    const onApplied = vi.fn();
    render(<ActionCard action={action} apply={apply} onApplied={onApplied} />);
    fireEvent.click(screen.getByRole('button', { name: /דחייה|dismiss/i }));
    expect(apply).not.toHaveBeenCalled();
    expect(onApplied).not.toHaveBeenCalled();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows a 409 on the card and keeps the buttons', async () => {
    const apply = vi.fn().mockRejectedValue(new ApiRequestError(409, 'name_taken', 'x'));
    const onApplied = vi.fn();
    render(<ActionCard action={action} apply={apply} onApplied={onApplied} />);
    fireEvent.click(screen.getByRole('button', { name: /אישור|approve/i }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(onApplied).not.toHaveBeenCalled();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });
});
