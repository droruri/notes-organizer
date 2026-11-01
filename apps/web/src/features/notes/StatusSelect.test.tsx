import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '../../lib/i18n';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { StatusSelect } from './StatusSelect';

afterEach(cleanup);

const options = () => screen.getAllByRole('option').map((o) => o.textContent);

describe('StatusSelect', () => {
  it('offers the three tracked statuses and reports any pick', () => {
    const onChange = vi.fn();
    render(<StatusSelect status="todo" onChange={onChange} />);
    expect(options()).toEqual(['לביצוע', 'בתהליך', 'הושלם']);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'done' } });
    expect(onChange).toHaveBeenCalledWith('done');
  });

  it('adds a no-status option that reports null', () => {
    const onChange = vi.fn();
    render(<StatusSelect status="done" allowNone onChange={onChange} />);
    expect(options()).toEqual(['לביצוע', 'בתהליך', 'הושלם', 'ללא סטטוס']);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('can be disabled', () => {
    render(<StatusSelect status="todo" disabled onChange={() => undefined} />);
    expect(screen.getByRole('combobox')).toHaveProperty('disabled', true);
  });
});
