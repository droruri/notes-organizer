import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DEFAULT_NOTE_FORM } from '@notes/shared';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { api } from '../../lib/api';
import { i18n } from '../../lib/i18n';
import { NoteFormSettings } from './NoteFormSettings';

beforeEach(async () => {
  await i18n.changeLanguage('en');
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('NoteFormSettings (app settings sheet)', () => {
  it('saves field settings and quick actions in one call', async () => {
    vi.spyOn(api, 'settings').mockResolvedValue({
      noteSort: 'urgency',
      noteForm: DEFAULT_NOTE_FORM,
      quickActions: ['record'],
    });
    const saved = {
      noteSort: 'urgency' as const,
      noteForm: { ...DEFAULT_NOTE_FORM, hiddenFields: ['urgency' as const] },
      quickActions: ['workspaces' as const, 'record' as const],
    };
    const save = vi.spyOn(api, 'saveSettings').mockResolvedValue(saved);
    const onClose = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NoteFormSettings onClose={onClose} />
      </QueryClientProvider>,
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('switch', { name: /Text/ })).toBeNull();
    const record = await within(dialog).findByRole<HTMLInputElement>('switch', {
      name: 'Show Record',
    });
    await waitFor(() => expect(record.checked).toBe(true));
    fireEvent.click(within(dialog).getByRole('switch', { name: 'Show Urgency' }));
    fireEvent.click(within(dialog).getByRole('switch', { name: 'Show Workspaces' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(save).toHaveBeenCalledWith({
      noteForm: { ...DEFAULT_NOTE_FORM, hiddenFields: ['urgency'] },
      quickActions: ['workspaces', 'record'],
    });
  });

  it('disables the last offered value chip', async () => {
    vi.spyOn(api, 'settings').mockResolvedValue({
      noteSort: 'urgency',
      noteForm: {
        ...DEFAULT_NOTE_FORM,
        importance: { display: 'dropdown', hiddenValues: ['not_important'] },
      },
      quickActions: ['record'],
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NoteFormSettings onClose={() => undefined} />
      </QueryClientProvider>,
    );
    const dialog = await screen.findByRole('dialog');
    await waitFor(() =>
      expect(
        within(dialog).getByRole<HTMLButtonElement>('button', { name: 'Important' }).disabled,
      ).toBe(true),
    );
  });
});
