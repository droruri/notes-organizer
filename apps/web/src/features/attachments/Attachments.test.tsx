import type { Attachment } from '@notes/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { i18n } from '../../lib/i18n';
import { api, ApiRequestError } from '../../lib/api';
import { Attachments } from './Attachments';

beforeEach(async () => {
  await i18n.changeLanguage('en');
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const NOTE = '00000000-0000-4000-8000-000000000001';
const att = (name: string): Attachment => ({
  id: crypto.randomUUID(),
  name,
  mime: 'application/pdf',
  size: 2048,
  createdAt: '2026-01-01T00:00:00.000Z',
});

function setup(attachments: Attachment[] = [], editable = true) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Attachments noteId={NOTE} attachments={attachments} editable={editable} />
    </QueryClientProvider>,
  );
}
const pick = (...files: File[]) =>
  fireEvent.change(screen.getByTestId('attachment-input'), { target: { files } });

describe('Attachments', () => {
  it('uploads a picked file and lists it', async () => {
    const stored = att('plan.pdf');
    const upload = vi.spyOn(api, 'uploadAttachment').mockResolvedValue(stored);
    setup();
    const file = new File(['%PDF'], 'plan.pdf', { type: 'application/pdf' });
    pick(file);
    expect(await screen.findByRole('button', { name: 'Download plan.pdf' })).toBeTruthy();
    expect(upload).toHaveBeenCalledWith(NOTE, file);
    expect(screen.getByText('2 KB')).toBeTruthy();
  });

  it('shows a 413 on its own row and keeps uploading the rest', async () => {
    const ok = att('small.pdf');
    vi.spyOn(api, 'uploadAttachment').mockImplementation(async (_id, file) => {
      if (file.name === 'huge.pdf') {
        throw new ApiRequestError(413, 'attachment_too_large', 'too big');
      }
      return ok;
    });
    setup();
    pick(new File(['x'], 'huge.pdf'), new File(['x'], 'small.pdf'));
    expect(await screen.findByText('The file is larger than 10 MB.')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Download small.pdf' })).toBeTruthy();
    expect(screen.getByText('huge.pdf')).toBeTruthy();
  });

  it('is read-only on a card: lists files without the add button', () => {
    setup([att('a.pdf')], false);
    expect(screen.getByRole('button', { name: 'Download a.pdf' })).toBeTruthy();
    expect(screen.queryByText('Add file')).toBeNull();
  });

  it('downloads the file when its row is tapped', async () => {
    const a = att('a.pdf');
    const fetchFile = vi.spyOn(api, 'attachmentFile').mockResolvedValue(new Blob(['x']));
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    setup([a], false);
    fireEvent.click(screen.getByRole('button', { name: 'Download a.pdf' }));
    await waitFor(() => expect(fetchFile).toHaveBeenCalledWith(NOTE, a.id));
  });
});
