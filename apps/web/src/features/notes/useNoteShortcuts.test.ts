import { describe, expect, it } from 'vite-plus/test';
import { shortcutFor } from './useNoteShortcuts';

const press = (key: string, init: KeyboardEventInit = {}, target?: HTMLElement) => {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, ...init });
  if (target) {
    document.body.append(target);
    Object.defineProperty(e, 'target', { value: target });
  }
  return shortcutFor(e);
};

describe('shortcutFor', () => {
  it('maps N, / and Escape', () => {
    expect(press('n')).toBe('new');
    expect(press('N')).toBe('new');
    expect(press('/')).toBe('search');
    expect(press('Escape')).toBe('close');
    expect(press('x')).toBeNull();
  });
  it('ignores editable targets', () => {
    for (const tag of ['input', 'textarea', 'select']) {
      expect(press('n', {}, document.createElement(tag))).toBeNull();
    }
    const div = document.createElement('div');
    Object.defineProperty(div, 'isContentEditable', { value: true });
    expect(press('Escape', {}, div)).toBeNull();
  });
  it('ignores modifier keys', () => {
    expect(press('n', { ctrlKey: true })).toBeNull();
    expect(press('n', { metaKey: true })).toBeNull();
    expect(press('/', { altKey: true })).toBeNull();
  });
});
