import { useEffect, useRef } from 'react';

export type NoteShortcut = 'new' | 'search';

/** Whether the event came from somewhere the user types. */
export const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/** Maps a key press to a notes shortcut; null when it is not one or the user is typing. */
export function shortcutFor(e: KeyboardEvent): NoteShortcut | null {
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || isEditable(e.target)) return null;
  if (e.key === 'n' || e.key === 'N') return 'new';
  if (e.key === '/') return 'search';
  return null;
}

export const isDesktop = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1024px)').matches;

/** Esc closes the open note on desktop, unless a modifier is held, the user is typing, or a dialog is open. */
export function shouldCloseOnEscape(e: KeyboardEvent): boolean {
  return (
    !e.ctrlKey &&
    !e.metaKey &&
    !e.altKey &&
    !e.shiftKey &&
    isDesktop() &&
    !isEditable(e.target) &&
    document.querySelector('[role="dialog"]') === null
  );
}

/** Desktop keyboard shortcuts: N new note, / search. */
export function useNoteShortcuts({ onNew }: { onNew: () => void }) {
  const latest = useRef(onNew);
  useEffect(() => {
    latest.current = onNew;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || !isDesktop()) return;
      const action = shortcutFor(e);
      if (action === null) return;
      e.preventDefault();
      if (action === 'new') latest.current();
      else document.querySelector<HTMLInputElement>('[data-notes-search]')?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}
