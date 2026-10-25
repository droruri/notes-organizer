import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '../../lib/i18n';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { NoAccess } from './NoAccess';

afterEach(cleanup);

describe('NoAccess', () => {
  it('explains there is no access and signs out on click', () => {
    const onSignOut = vi.fn();
    render(<NoAccess onSignOut={onSignOut} />);
    expect(screen.getByText('אין לך גישה')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'התנתקות' }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });
});
