import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '../../lib/i18n';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { OutboxDialog } from './OutboxDialog';
import type { OutboxEntry } from './outbox';

afterEach(cleanup);

const entry: OutboxEntry = {
  clientId: crypto.randomUUID(),
  body: 'call the plumber',
  createdAt: '2026-01-01T00:00:00.000Z',
  hasAudio: false,
};
const taxonomy = { categories: [], tags: [] };

describe('OutboxDialog', () => {
  it('lists items, opens one in the editor and sends it on confirm', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(
      <OutboxDialog entries={[entry]} taxonomy={taxonomy} onSend={onSend} onClose={vi.fn()} />,
    );
    fireEvent.click(screen.getByText('call the plumber'));
    const body = screen.getAllByRole('textbox')[0];
    if (!body) throw new Error('no body field');
    fireEvent.change(body, { target: { value: 'call the plumber at 5' } });
    const form = body.closest('form');
    if (!form) throw new Error('no form');
    fireEvent.submit(form);
    await waitFor(() => expect(onSend).toHaveBeenCalledWith(entry, 'call the plumber at 5'));
  });

  it('shows an error and stays open when sending fails', async () => {
    const onSend = vi.fn().mockRejectedValue(new Error('down'));
    render(
      <OutboxDialog entries={[entry]} taxonomy={taxonomy} onSend={onSend} onClose={vi.fn()} />,
    );
    fireEvent.click(screen.getByText('call the plumber'));
    const form = screen.getByRole('dialog').querySelector('form');
    if (!form) throw new Error('no form');
    fireEvent.submit(form);
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});
