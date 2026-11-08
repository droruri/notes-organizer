export type Line =
  | { kind: 'text'; text: string }
  | { kind: 'item'; checked: boolean; text: string; index: number };

import { CHECKLIST_LINE as ITEM, type ChecklistItem } from '@notes/shared';

export function parseBody(body: string): Line[] {
  return body.split('\n').map((line, index): Line => {
    const m = ITEM.exec(line);
    if (!m) return { kind: 'text', text: line };
    return { kind: 'item', checked: m[2] !== ' ', text: m[4] ?? '', index };
  });
}

export function checklistProgress(body: string): { done: number; total: number } | null {
  let done = 0;
  let total = 0;
  for (const line of parseBody(body)) {
    if (line.kind !== 'item') continue;
    total += 1;
    if (line.checked) done += 1;
  }
  return total === 0 ? null : { done, total };
}

/** Flip the item on line `index`; any other index returns `body` unchanged. */
export function toggleItem(body: string, index: number): string {
  const lines = body.split('\n');
  const line = lines[index];
  const m = line === undefined ? null : ITEM.exec(line);
  if (!m) return body;
  lines[index] = `${m[1]}${m[2] === ' ' ? 'x' : ' '}${m[3]}${m[4]}`;
  return lines.join('\n');
}

export function toChecklist(items: string[]): string {
  return items.map((i) => `- [ ] ${i}`).join('\n');
}

/** Non-empty lines with bullets / numbering stripped. */
export function linesToItems(body: string): string[] {
  return body
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
    .filter((l) => l !== '');
}

/** Items with text; the editor keeps blank rows while typing, the payload does not. */
export function nonEmptyItems(items: readonly ChecklistItem[]): ChecklistItem[] {
  return items.filter((i) => i.text.trim() !== '').map((i) => ({ ...i, text: i.text.trim() }));
}
