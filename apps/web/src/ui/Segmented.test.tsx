import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { Segmented } from './Segmented';

const OPTIONS = [null, 'a', 'b'] as const;

function setup(props: { value: 'a' | 'b' | null; disabled?: boolean }) {
  const onChange = vi.fn();
  render(
    <Segmented
      label="group"
      options={OPTIONS}
      value={props.value}
      labelOf={(o) => o ?? 'none'}
      disabled={props.disabled ?? false}
      onChange={onChange}
    />,
  );
  return onChange;
}

describe('Segmented', () => {
  afterEach(cleanup);

  it('renders one radio per option and marks the current one', () => {
    setup({ value: 'a' });
    expect(screen.getByRole('radiogroup', { name: 'group' })).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: 'a' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'none' }).getAttribute('aria-checked')).toBe('false');
  });

  it('calls onChange for another option, including null, but not for the current one', () => {
    const onChange = setup({ value: 'a' });
    fireEvent.click(screen.getByRole('radio', { name: 'a' }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('radio', { name: 'b' }));
    expect(onChange).toHaveBeenCalledWith('b');
    fireEvent.click(screen.getByRole('radio', { name: 'none' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('disables every button', () => {
    setup({ value: null, disabled: true });
    for (const radio of screen.getAllByRole('radio'))
      expect(radio).toHaveProperty('disabled', true);
  });
});
