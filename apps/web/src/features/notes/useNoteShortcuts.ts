import { useEffect, useRef } from 'react';

export type NoteShortcut = 'new' | 'search' | 'close';

/** Whether the event came from somewhere the user types. */
const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/** Maps a key press to a notes shortcut; null when it is not one or the user is typing. */
export function shortcutFor(e: KeyboardEvent): NoteShortcut | null {
  if (e.ctrlKey || e.metaKey || e.altKey || isEditable(e.target)) return null;
  if (e.key === 'Escape') return 'close';
  if (e.shiftKey) return null;
  if (e.key === 'n' || e.key === 'N') return 'new';
  if (e.key === '/') return 'search';
  return null;
}

const isDesktop = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1024px)').matches;

/** Desktop keyboard shortcuts: N new note, / search, Esc close the open note. */
export function useNoteShortcuts({
  onNew,
  onClose,
}: {
  onNew: () => void;
  onClose?: (() => void) | undefined;
}) {
  const latest = useRef({ onNew, onClose });
  useEffect(() => {
    latest.current = { onNew, onClose };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || !isDesktop()) return;
      const action = shortcutFor(e);
      if (action === null) return;
      if (action === 'close') {
        latest.current.onClose?.();
        return;
      }
      e.preventDefault();
      if (action === 'new') latest.current.onNew();
      else document.querySelector<HTMLInputElement>('[data-notes-search]')?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}
