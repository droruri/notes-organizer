import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, it } from 'vite-plus/test';
import { i18n } from '../../lib/i18n';
import { NoteList } from './NoteList';

beforeEach(async () => {
  await i18n.changeLanguage('en');
});
afterEach(cleanup);

const props = { notes: [], taxonomy: { categories: [] }, today: '2026-10-25', onOpen: () => {} };

describe('NoteList', () => {
  it('says there are no notes yet when there are none', () => {
    render(<NoteList {...props} filtered={false} />);
    screen.getByText('No notes yet');
  });

  it('says nothing matches when the filter hides every note', () => {
    render(<NoteList {...props} filtered />);
    screen.getByText('No notes match the filter');
  });
});
