import { describe, expect, it } from 'vite-plus/test';
import { NoteForm, Settings } from './index';

describe('NoteForm', () => {
  it('parses a stored form without importance/urgency to dropdowns', () => {
    const parsed = NoteForm.parse({ hiddenFields: ['title'] });
    expect(parsed).toEqual({
      hiddenFields: ['title'],
      importance: { display: 'dropdown', hiddenValues: [] },
      urgency: { display: 'dropdown', hiddenValues: [] },
      status: { hiddenValues: [] },
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

describe('NoteForm status', () => {
  it('defaults to nothing hidden', () => {
    expect(NoteForm.parse({}).status.hiddenValues).toEqual([]);
  });
  it('only lets in_progress be hidden', () => {
    expect(
      NoteForm.parse({ status: { hiddenValues: ['in_progress'] } }).status.hiddenValues,
    ).toEqual(['in_progress']);
    expect(NoteForm.safeParse({ status: { hiddenValues: ['todo'] } }).success).toBe(false);
    expect(NoteForm.safeParse({ status: { hiddenValues: ['done'] } }).success).toBe(false);
  });
});

describe('NoteForm hiddenValues', () => {
  it('defaults to none hidden and keeps known values', () => {
    expect(NoteForm.parse({}).urgency.hiddenValues).toEqual([]);
    expect(NoteForm.parse({ urgency: { hiddenValues: ['medium'] } }).urgency.hiddenValues).toEqual([
      'medium',
    ]);
  });

  it('rejects an unknown value', () => {
    expect(NoteForm.safeParse({ urgency: { hiddenValues: ['nope'] } }).success).toBe(false);
    expect(NoteForm.safeParse({ importance: { hiddenValues: ['medium'] } }).success).toBe(false);
  });
});
