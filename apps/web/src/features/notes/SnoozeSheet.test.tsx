import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { i18n } from '../../lib/i18n';
import { SnoozeSheet } from './SnoozeSheet';

beforeEach(async () => {
  await i18n.changeLanguage('en');
});
afterEach(cleanup);

// 2026-11-06 is a Friday.
const setup = (snoozedUntil: string | null = null) => {
  const onPick = vi.fn();
  render(
    <SnoozeSheet
      today="2026-11-06"
      snoozedUntil={snoozedUntil}
      onPick={onPick}
      onClose={vi.fn()}
    />,
  );
  return onPick;
};

describe('SnoozeSheet', () => {
  it('picks tomorrow, weekend and next week', () => {
    const onPick = setup();
    fireEvent.click(screen.getByRole('button', { name: /Tomorrow/ }));
    fireEvent.click(screen.getByRole('button', { name: /Weekend/ }));
    fireEvent.click(screen.getByRole('button', { name: /Next week/ }));
    expect(onPick.mock.calls.map((c) => c[0])).toEqual(['2026-11-07', '2026-11-13', '2026-11-08']);
  });

  it('picks a date, limited to the future', () => {
    const onPick = setup();
    const input = screen.getByLabelText('Pick a date');
    expect(input.getAttribute('min')).toBe('2026-11-07');
    fireEvent.change(input, { target: { value: '2026-12-01' } });
    expect(onPick).toHaveBeenCalledWith('2026-12-01');
  });

  it('offers Wake now only when snoozed', () => {
    setup();
    expect(screen.queryByRole('button', { name: 'Wake now' })).toBeNull();
    cleanup();
    const onPick = setup('2026-11-10');
    fireEvent.click(screen.getByRole('button', { name: 'Wake now' }));
    expect(onPick).toHaveBeenCalledWith(null);
  });
});
