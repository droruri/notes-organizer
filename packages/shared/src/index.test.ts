import { describe, expect, it } from 'vite-plus/test';
import { NoteForm, Settings } from './index';

describe('NoteForm', () => {
  it('parses a stored form without importance/urgency to dropdowns', () => {
    const parsed = NoteForm.parse({ hiddenFields: ['title'] });
    expect(parsed).toEqual({
      hiddenFields: ['title'],
      importance: { display: 'dropdown' },
      urgency: { display: 'dropdown' },
    });
  });

  it('keeps a stored buttons choice', () => {
    const parsed = Settings.parse({
      noteSort: 'urgency',
      noteForm: { urgency: { display: 'buttons' } },
    });
    expect(parsed.noteForm.urgency.display).toBe('buttons');
    expect(parsed.noteForm.importance.display).toBe('dropdown');
  });
});
