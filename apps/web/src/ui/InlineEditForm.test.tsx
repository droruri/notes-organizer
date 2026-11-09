import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { InlineEditForm } from './InlineEditForm';

afterEach(cleanup);

function setup(disabled = false) {
  const onChange = vi.fn();
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  render(
    <InlineEditForm
      label="name"
      value="abc"
      onChange={onChange}
      onSubmit={onSubmit}
      onCancel={onCancel}
      disabled={disabled}
      saveLabel="Save"
      cancelLabel="Cancel"
    />,
  );
  return { onChange, onSubmit, onCancel };
}

describe('InlineEditForm', () => {
  it('reports typing', () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText('name'), { target: { value: 'abcd' } });
    expect(onChange).toHaveBeenCalledWith('abcd');
  });

  it('submits with the default prevented', () => {
    const { onSubmit } = setup();
    const form = screen.getByLabelText('name').closest('form');
    expect(form).not.toBeNull();
    if (!form) return;
    const notPrevented = fireEvent.submit(form);
    expect(notPrevented).toBe(false);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('cancels', () => {
    const { onCancel, onSubmit } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('disables only the save button', () => {
    setup(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save' }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Cancel' }).disabled).toBe(false);
  });
});
