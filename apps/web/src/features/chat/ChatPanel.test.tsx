import type { ChatPart, Note } from '@notes/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '../../lib/i18n';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { ChatPanel } from './ChatPanel';

afterEach(cleanup);

const NOTE_ID = 'b1111111-1111-4111-8111-111111111111';
const GHOST_ID = 'b9999999-9999-4999-8999-999999999999';
const note: Note = {
  id: NOTE_ID,
  clientId: NOTE_ID,
  body: 'Pay the electricity bill',
  status: 'todo',
  importance: null,
  urgency: null,
  dueDate: null,
  proposed: null,
  unreadLinks: [],
  categoryIds: [],
  tagIds: [],
  hasAudio: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const scripted =
  (parts: ChatPart[]) =>
  async (_: unknown, onPart: (p: ChatPart) => void): Promise<void> => {
    for (const p of parts) onPart(p);
  };

function ask(stream: NonNullable<Parameters<typeof ChatPanel>[0]['stream']>, onOpenNote = vi.fn()) {
  render(<ChatPanel notes={[note]} onOpenNote={onOpenNote} onClose={vi.fn()} stream={stream} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'what is overdue?' } });
  fireEvent.submit(screen.getByRole('textbox').closest('form') as HTMLFormElement);
  return onOpenNote;
}

describe('ChatPanel', () => {
  it('streams the answer and renders only citations of existing notes', async () => {
    const onOpen = ask(
      scripted([
        { type: 'tool-input-start', toolName: 'find_notes' },
        { type: 'text-delta', delta: 'Overdue: ' },
        { type: 'text-delta', delta: `[[note:${NOTE_ID}]] and [[note:${GHOST_ID}]].` },
      ]),
    );
    const cite = await screen.findByRole('button', { name: /Pay the electricity/ });
    expect(screen.getByText(/Overdue:/)).toBeTruthy();
    expect(screen.queryByText(new RegExp(GHOST_ID))).toBeNull();
    expect(screen.getAllByRole('button', { name: /Pay the/ })).toHaveLength(1);
    fireEvent.click(cite);
    expect(onOpen).toHaveBeenCalledWith(note);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows the tool-progress line while no text has arrived', async () => {
    let release: () => void = () => {};
    const stream = (_: unknown, onPart: (p: ChatPart) => void) =>
      new Promise<void>((resolve) => {
        onPart({ type: 'tool-input-start', toolName: 'find_notes' });
        release = resolve;
      });
    ask(stream);
    expect(await screen.findByRole('status')).toBeTruthy();
    release();
    await screen.findByText(/what is overdue/);
  });

  it('shows an error when the stream fails', async () => {
    ask(async () => {
      throw new Error('down');
    });
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});
