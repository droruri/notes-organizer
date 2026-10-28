import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { ChatAnswer } from './ChatAnswer';

afterEach(cleanup);

describe('ChatAnswer', () => {
  it('shows markdown as plain text, with no literal symbols', () => {
    const { container } = render(
      <ChatAnswer
        text={'### כותרת\n* **משימות** פתוחות\n---\nשורה'}
        notes={[]}
        onOpenNote={() => {}}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/\*\*|###|---/);
    expect(text).toContain('משימות פתוחות');
  });

  it('shows English markdown as plain text too', () => {
    const { container } = render(
      <ChatAnswer
        text={'## Open tasks\n* **Pay** rent\n---\nDone'}
        notes={[]}
        onOpenNote={() => {}}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/\*|#|---/);
    expect(text).toContain('Pay rent');
  });
});
