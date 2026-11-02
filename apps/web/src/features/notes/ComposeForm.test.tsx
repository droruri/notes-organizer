import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { i18n } from '../../lib/i18n';
import { ComposeForm } from './ComposeForm';

beforeEach(async () => {
  await i18n.changeLanguage('en');
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const baseProps = {
  title: '',
  text: '',
  onTitle: vi.fn(),
  onText: vi.fn(),
  online: true,
  suggesting: false,
  suggestFailed: false,
  voicePending: false,
  voiceFailed: false,
  saveFailed: false,
  autoRecord: false,
  onSuggest: vi.fn(),
  onVoice: vi.fn(),
  onCancel: vi.fn(),
};

describe('ComposeForm', () => {
  it('disables Suggest while the body is empty', () => {
    render(<ComposeForm {...baseProps} />);
    expect(screen.getByRole('button', { name: 'Suggest' }).hasAttribute('disabled')).toBe(true);
  });

  it('calls onSuggest when submitted with a body', () => {
    const onSuggest = vi.fn();
    render(<ComposeForm {...baseProps} text="buy milk" onSuggest={onSuggest} />);
    fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
    expect(onSuggest).toHaveBeenCalledTimes(1);
  });

  it('shows the spinner label and disables the button while suggesting', () => {
    render(<ComposeForm {...baseProps} text="buy milk" suggesting />);
    expect(
      screen.getByRole('button', { name: 'Claude is thinking…' }).hasAttribute('disabled'),
    ).toBe(true);
  });

  it('reports title and body edits through their callbacks', () => {
    const onTitle = vi.fn();
    const onText = vi.fn();
    render(<ComposeForm {...baseProps} onTitle={onTitle} onText={onText} />);
    fireEvent.change(screen.getByLabelText('Title (optional)'), { target: { value: 'T' } });
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'B' } });
    expect(onTitle).toHaveBeenCalledWith('T');
    expect(onText).toHaveBeenCalledWith('B');
  });

  it('calls onCancel from the Cancel button', () => {
    const onCancel = vi.fn();
    render(<ComposeForm {...baseProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows the offline notice only when offline', () => {
    const { rerender } = render(<ComposeForm {...baseProps} online />);
    expect(screen.queryByRole('status')).toBeNull();
    rerender(<ComposeForm {...baseProps} online={false} />);
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('shows the save-failed alert when saveFailed is set', () => {
    render(<ComposeForm {...baseProps} saveFailed />);
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});
