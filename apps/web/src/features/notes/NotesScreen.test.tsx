import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { i18n } from '../../lib/i18n';
import { readOutbox } from '../offline/outbox';
import { NotesScreen } from './NotesScreen';

beforeEach(async () => {
  await i18n.changeLanguage('en');
  localStorage.clear();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('NotesScreen offline with no loaded data', () => {
  it('shows the Add button and queues a submitted note in the outbox', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <NotesScreen importing={false} onImportClose={() => {}} />
      </QueryClientProvider>,
    );
    screen.getByText(/you can still add a note/i);
    fireEvent.click(screen.getByRole('button', { name: 'New note' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'buy milk' } });
    const form = screen.getByRole('textbox').closest('form');
    if (!form) throw new Error('compose form not found');
    fireEvent.submit(form);
    await waitFor(() => expect(readOutbox().map((e) => e.body)).toEqual(['buy milk']));
  });
});
