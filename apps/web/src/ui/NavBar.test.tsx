import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { NavBar } from './NavBar';

describe('NavBar', () => {
  afterEach(cleanup);

  it('renders the title and the primary action', () => {
    render(
      <NavBar title="הערה חדשה" onBack={() => {}} action={<button type="button">שמור</button>} />,
    );
    expect(screen.getByRole('heading', { name: 'הערה חדשה' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'שמור' })).toBeTruthy();
  });

  it('calls onBack from the back chevron', () => {
    const onBack = vi.fn();
    render(<NavBar title="עריכה" onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: 'sheet.back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
