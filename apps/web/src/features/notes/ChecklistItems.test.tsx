import { MAX_CHECKLIST_ITEMS, type ChecklistItem } from '@notes/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { i18n } from '../../lib/i18n';
import { nonEmptyItems } from './checklist';
import { ChecklistEdit } from './ChecklistItems';

const item = (n: number, text = `item ${n}`, done = false): ChecklistItem => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  text,
  done,
});

let latest: ChecklistItem[] = [];
const at = <T,>(list: T[], i: number): T => {
  const v = list[i];
  if (v === undefined) throw new Error(`no element ${i}`);
  return v;
};
function Harness({ initial }: { initial: ChecklistItem[] }) {
  const [items, setItems] = useState(initial);
  return (
    <ChecklistEdit
      items={items}
      onChange={(next) => {
        latest = next;
        setItems(next);
      }}
    />
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
  latest = [];
});
afterEach(cleanup);

const texts = () => screen.getAllByLabelText<HTMLInputElement>('Item text');

describe('ChecklistEdit', () => {
  it('adds an item', () => {
    render(<Harness initial={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
    expect(latest).toHaveLength(1);
    expect(document.activeElement).toBe(texts()[0]);
  });

  it('renames, ticks and deletes', () => {
    render(<Harness initial={[item(1), item(2)]} />);
    fireEvent.change(at(texts(), 0), { target: { value: 'renamed' } });
    fireEvent.click(at(screen.getAllByRole('checkbox'), 1));
    expect(latest.map((i) => [i.text, i.done])).toEqual([
      ['renamed', false],
      ['item 2', true],
    ]);
    fireEvent.click(at(screen.getAllByRole('button', { name: 'Delete item' }), 0));
    expect(latest.map((i) => i.text)).toEqual(['item 2']);
  });

  it('Enter adds a row below the focused one', () => {
    render(<Harness initial={[item(1), item(2)]} />);
    fireEvent.keyDown(at(texts(), 0), { key: 'Enter' });
    expect(latest.map((i) => i.text)).toEqual(['item 1', '', 'item 2']);
    expect(document.activeElement).toBe(texts()[1]);
  });

  it('Backspace removes an empty row only', () => {
    render(<Harness initial={[item(1), item(2, '')]} />);
    fireEvent.keyDown(at(texts(), 0), { key: 'Backspace' });
    expect(texts()).toHaveLength(2);
    fireEvent.keyDown(at(texts(), 1), { key: 'Backspace' });
    expect(latest.map((i) => i.text)).toEqual(['item 1']);
  });

  it('Backspace also removes a whitespace-only row', () => {
    render(<Harness initial={[item(1), item(2, '   ')]} />);
    fireEvent.keyDown(at(texts(), 1), { key: 'Backspace' });
    expect(latest.map((i) => i.text)).toEqual(['item 1']);
  });

  it('enforces the max item count', () => {
    const many = Array.from({ length: MAX_CHECKLIST_ITEMS }, (_, n) => ({
      id: crypto.randomUUID(),
      text: `i${n}`,
      done: false,
    }));
    render(<Harness initial={many} />);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Add item' }).disabled).toBe(true);
    fireEvent.keyDown(at(texts(), 0), { key: 'Enter' });
    expect(texts()).toHaveLength(MAX_CHECKLIST_ITEMS);
  });

  it('nonEmptyItems drops blank rows', () => {
    expect(nonEmptyItems([item(1), item(2, '  ')]).map((i) => i.text)).toEqual(['item 1']);
  });
});
