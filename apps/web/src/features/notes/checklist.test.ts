import { describe, expect, it } from 'vite-plus/test';
import { checklistProgress, linesToItems, parseBody, toChecklist, toggleItem } from './checklist';

describe('parseBody', () => {
  it('reads items and text', () => {
    expect(parseBody('intro\n- [ ] a\n* [X] b\n  - [x] ג')).toEqual([
      { kind: 'text', text: 'intro' },
      { kind: 'item', checked: false, text: 'a', index: 1 },
      { kind: 'item', checked: true, text: 'b', index: 2 },
      { kind: 'item', checked: true, text: 'ג', index: 3 },
    ]);
  });
  it('ignores non-items', () => {
    expect(parseBody('-[ ] a')[0]?.kind).toBe('text');
  });
});

describe('toggleItem', () => {
  it('flips both ways', () => {
    expect(toggleItem('- [ ] קנה חלב', 0)).toBe('- [x] קנה חלב');
    expect(toggleItem('* [X] a', 0)).toBe('* [ ] a');
    expect(toggleItem('x\n  - [ ] a\n- [ ] b', 1)).toBe('x\n  - [x] a\n- [ ] b');
  });
  it('is a no-op for unknown or text indexes', () => {
    const b = 'x\n- [ ] a';
    expect(toggleItem(b, 0)).toBe(b);
    expect(toggleItem(b, 9)).toBe(b);
    expect(toggleItem(b, -1)).toBe(b);
  });
});

describe('checklistProgress', () => {
  it('counts', () => {
    expect(checklistProgress('- [x] a\n- [ ] b\n- [ ] c')).toEqual({ done: 1, total: 3 });
    expect(checklistProgress('no items')).toBeNull();
  });
});

describe('linesToItems / toChecklist', () => {
  it('strips bullets and numbers, drops blanks', () => {
    expect(linesToItems('- milk\n\n2. דן\n* bill\n  plain')).toEqual([
      'milk',
      'דן',
      'bill',
      'plain',
    ]);
    expect(toChecklist(['a', 'b'])).toBe('- [ ] a\n- [ ] b');
  });
});
