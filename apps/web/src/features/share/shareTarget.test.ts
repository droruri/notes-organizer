import { describe, expect, it, vi } from 'vite-plus/test';
import { parseSharedNote } from './shareTarget';

describe('parseSharedNote', () => {
  it('joins text and url', () => {
    expect(parseSharedNote('?text=hello&url=https%3A%2F%2Fexample.com')).toBe(
      'hello\nhttps://example.com',
    );
  });

  it('puts the title first and skips fields already contained in an earlier one', () => {
    expect(
      parseSharedNote(
        '?title=Page&text=see%20https%3A%2F%2Fexample.com&url=https%3A%2F%2Fexample.com',
      ),
    ).toBe('Page\nsee https://example.com');
  });

  it('keeps text that only appears inside the title', () => {
    expect(parseSharedNote('?title=Recipe%3A+pasta&text=pasta')).toBe('Recipe: pasta\npasta');
  });

  it('returns undefined when nothing was shared', () => {
    expect(parseSharedNote('')).toBeUndefined();
    expect(parseSharedNote('?text=%20&other=1')).toBeUndefined();
  });
});

describe('shared note at launch', () => {
  it('is readable until cleared and scrubs the share params from the URL', async () => {
    window.history.replaceState(null, '', '/?text=hello&keep=1');
    vi.resetModules();
    const { peekSharedNote, clearSharedNote } = await import('./shareTarget');
    expect(window.location.pathname).toBe('/new');
    expect(window.location.search).toBe('?keep=1');
    expect(peekSharedNote()).toBe('hello');
    expect(peekSharedNote()).toBe('hello');
    clearSharedNote();
    expect(peekSharedNote()).toBeUndefined();
  });
});
