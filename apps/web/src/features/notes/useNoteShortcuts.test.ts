import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { shortcutFor, shouldCloseOnEscape } from './useNoteShortcuts';

const press = (key: string, init: KeyboardEventInit = {}, target?: HTMLElement) => {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, ...init });
  if (target) {
    document.body.append(target);
    Object.defineProperty(e, 'target', { value: target });
  }
  return shortcutFor(e);
};

const setDesktop = (matches: boolean) =>
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({ matches })),
  });

afterEach(() => {
  document.body.replaceChildren();
  setDesktop(false);
});

describe('shortcutFor', () => {
  it('maps N and /', () => {
    expect(press('n')).toBe('new');
    expect(press('N')).toBe('new');
    expect(press('/')).toBe('search');
    expect(press('Escape')).toBeNull();
    expect(press('x')).toBeNull();
  });
  it('ignores editable targets', () => {
    for (const tag of ['input', 'textarea', 'select']) {
      expect(press('n', {}, document.createElement(tag))).toBeNull();
    }
    const div = document.createElement('div');
    Object.defineProperty(div, 'isContentEditable', { value: true });
    expect(press('/', {}, div)).toBeNull();
  });
  it('ignores modifier keys', () => {
    expect(press('n', { ctrlKey: true })).toBeNull();
    expect(press('n', { metaKey: true })).toBeNull();
    expect(press('/', { altKey: true })).toBeNull();
  });
});

describe('shouldCloseOnEscape', () => {
  it('closes the open note on desktop when nothing is focused and no dialog is open', () => {
    setDesktop(true);
    expect(shouldCloseOnEscape(new KeyboardEvent('keydown', { key: 'Escape' }))).toBe(true);
  });
  it('does nothing below desktop width', () => {
    setDesktop(false);
    expect(shouldCloseOnEscape(new KeyboardEvent('keydown', { key: 'Escape' }))).toBe(false);
  });
  it('ignores Escape from an editable target and with a modifier held', () => {
    setDesktop(true);
    const input = document.createElement('input');
    document.body.append(input);
    const fromInput = new KeyboardEvent('keydown', { key: 'Escape' });
    Object.defineProperty(fromInput, 'target', { value: input });
    expect(shouldCloseOnEscape(fromInput)).toBe(false);
    expect(
      shouldCloseOnEscape(new KeyboardEvent('keydown', { key: 'Escape', shiftKey: true })),
    ).toBe(false);
  });
  it('defers to an open dialog', () => {
    setDesktop(true);
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.append(dialog);
    expect(shouldCloseOnEscape(new KeyboardEvent('keydown', { key: 'Escape' }))).toBe(false);
  });
});
