import { NOTE_CITATION, type Note } from '@notes/shared';
import type { ReactNode } from 'react';

const CITATION = new RegExp(NOTE_CITATION.source);
const EXCERPT = 40;

/** The model sometimes answers in markdown anyway; show it as plain text, not literal symbols. */
const plain = (s: string) =>
  s
    .replace(/^\s*(-{3,}|\*{3,})\s*$/gm, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^(\s*)[*+]\s+/gm, '$1- ')
    .replace(/\*\*(.+?)\*\*/gs, '$1')
    .replace(/\*\*/g, '');

/** Answer text with `[[note:id]]` turned into buttons; ids that are not in `notes` are dropped. */
export function ChatAnswer({
  text,
  notes,
  onOpenNote,
}: {
  text: string;
  notes: Note[];
  onOpenNote: (note: Note) => void;
}) {
  // Strip markdown before splitting, so a `**` pair around a citation is still removed.
  const parts = plain(text).split(new RegExp(`(${CITATION.source})`));
  // split with a capture group inside a capture group: [text, full, id, text, full, id, …]
  const out: ReactNode[] = [];
  for (let i = 0; i < parts.length; i += 3) {
    out.push(<span key={`t${i}`}>{parts[i] ?? ''}</span>);
    const id = parts[i + 2];
    const note = id === undefined ? undefined : notes.find((n) => n.id === id);
    if (note) {
      out.push(
        <button
          key={`n${i}`}
          type="button"
          onClick={() => onOpenNote(note)}
          className="mx-0.5 inline rounded-md bg-accent-soft px-1.5 py-0.5 text-sm font-medium text-accent underline-offset-2 hover:underline"
        >
          {note.body.slice(0, EXCERPT)}
        </button>,
      );
    }
  }
  return <p className="whitespace-pre-wrap">{out}</p>;
}
