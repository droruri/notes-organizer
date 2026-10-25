import { NOTE_CITATION, type Note } from '@notes/shared';
import type { ReactNode } from 'react';

const CITATION = new RegExp(NOTE_CITATION.source);
const EXCERPT = 40;

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
  const parts = text.split(new RegExp(`(${CITATION.source})`));
  // split with a capture group inside a capture group: [text, full, id, text, full, id, …]
  const out: ReactNode[] = [];
  for (let i = 0; i < parts.length; i += 3) {
    out.push(<span key={`t${i}`}>{parts[i]}</span>);
    const id = parts[i + 2];
    const note = id === undefined ? undefined : notes.find((n) => n.id === id);
    if (note) {
      out.push(
        <button
          key={`n${i}`}
          type="button"
          onClick={() => onOpenNote(note)}
          className="mx-1 rounded-md border border-line px-2 text-sm hover:bg-surface-hover"
        >
          {note.body.slice(0, EXCERPT)}
        </button>,
      );
    }
  }
  return <p className="whitespace-pre-wrap">{out}</p>;
}
