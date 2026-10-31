import type { ImportProposal, Workspace } from '@notes/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { i18n } from '../../lib/i18n';
import { ImportDialog } from './ImportDialog';

afterEach(cleanup);

const ws = (id: string, name: string, isDefault: boolean): Workspace => ({
  id,
  name,
  isDefault,
});
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

const proposal: ImportProposal = {
  newCategories: [],
  newTags: [],
  notes: [
    {
      body: 'wash up',
      suggestion: {
        categoryIds: [],
        tagIds: [],
        newCategories: [],
        newTags: [],
        dueDate: null,
        importance: null,
        urgency: null,
        title: null,
        workspaceId: null,
        tracksStatus: true,
        unreadLinks: [],
      },
    },
  ],
  links: { total: 0, read: 0 },
};

describe('ImportDialog workspace picker', () => {
  it('starts on the current workspace and sends the picked one', async () => {
    void i18n.changeLanguage('en');
    const confirm = vi.fn().mockResolvedValue({ created: { categories: 0, tags: 0, notes: 1 } });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ImportDialog
          taxonomy={{ categories: [] }}
          workspaces={[ws(A, 'Home', true), ws(B, 'Work', false)]}
          currentWorkspaceId={B}
          today="2026-01-01"
          locale="en"
          onClose={vi.fn()}
          onImported={vi.fn()}
          analyze={vi.fn().mockResolvedValue(proposal)}
          confirm={confirm}
        />
      </QueryClientProvider>,
    );
    const picker = screen.getByRole<HTMLSelectElement>('combobox', {
      name: 'Import into workspace',
    });
    expect(picker.value).toBe(B);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'wash up' } });
    fireEvent.click(screen.getByRole('button', { name: /analy/i }));
    fireEvent.click(await screen.findByRole('button', { name: /import|confirm|save/i }));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(confirm.mock.calls[0]?.[0]).toMatchObject({ workspaceId: B });
  });
});
