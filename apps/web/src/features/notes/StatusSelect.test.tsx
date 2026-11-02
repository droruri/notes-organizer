import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '../../lib/i18n';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { StatusSelect } from './StatusSelect';

afterEach(cleanup);

const options = () => screen.getAllByRole('option').map((o) => o.textContent);

describe('StatusSelect', () => {
  it('offers the three tracked statuses and reports any pick', () => {
    const onChange = vi.fn();
    render(<StatusSelect status="todo" hiddenValues={[]} onChange={onChange} />);
    expect(options()).toEqual(['לביצוע', 'בתהליך', 'הושלם']);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'done' } });
    expect(onChange).toHaveBeenCalledWith('done');
  });

  it('omits hidden statuses unless the note is currently in that status', () => {
    const { rerender } = render(
      <StatusSelect status="todo" hiddenValues={['in_progress']} onChange={() => undefined} />,
    );
    expect(options()).toEqual(['לביצוע', 'הושלם']);
    rerender(
      <StatusSelect
        status="in_progress"
        hiddenValues={['in_progress']}
        onChange={() => undefined}
      />,
    );
    expect(options()).toEqual(['לביצוע', 'בתהליך', 'הושלם']);
  });

  it('can be disabled', () => {
    render(<StatusSelect status="todo" hiddenValues={[]} disabled onChange={() => undefined} />);
    expect(screen.getByRole('combobox')).toHaveProperty('disabled', true);
  });
});
