import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '../../lib/i18n';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { StatusStepper } from './StatusStepper';

afterEach(cleanup);

const moves = () => screen.queryAllByRole('button').map((b) => b.textContent);

describe('StatusStepper', () => {
  it('offers only the forward move from todo', () => {
    render(<StatusStepper status="todo" onChange={() => undefined} />);
    expect(moves()).toEqual(['העברה אל: בתהליך']);
  });

  it('offers both neighbours from in_progress and reports the chosen one', () => {
    const onChange = vi.fn();
    render(<StatusStepper status="in_progress" onChange={onChange} />);
    expect(moves()).toEqual(['העברה אל: לביצוע', 'העברה אל: הושלם']);
    fireEvent.click(screen.getByText('העברה אל: הושלם'));
    expect(onChange).toHaveBeenCalledWith('done');
  });

  it('offers only the back move from done, and none for a draft', () => {
    const { unmount } = render(<StatusStepper status="done" onChange={() => undefined} />);
    expect(moves()).toEqual(['העברה אל: בתהליך']);
    unmount();
    render(<StatusStepper status="draft" onChange={() => undefined} />);
    expect(moves()).toEqual([]);
  });
});
