import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '../../lib/i18n';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

const signInWithOAuth = vi.fn();
vi.mock('../../lib/supabase', () => ({ supabase: () => ({ auth: { signInWithOAuth } }) }));

import { SignIn } from './SignIn';

const replace = vi.fn();

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function click() {
  vi.stubGlobal('location', { origin: 'http://app.test', replace });
  render(<SignIn />);
  fireEvent.click(screen.getByRole('button', { name: 'התחברות עם Google' }));
}

describe('SignIn', () => {
  it('starts OAuth without the browser redirect and replaces location with the URL', async () => {
    signInWithOAuth.mockResolvedValue({ data: { url: 'https://google.test/auth' }, error: null });
    click();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('https://google.test/auth'));
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'http://app.test', skipBrowserRedirect: true },
    });
  });

  it('shows an alert and does not navigate on error', async () => {
    signInWithOAuth.mockResolvedValue({ data: { url: null }, error: new Error('off') });
    click();
    expect((await screen.findByRole('alert')).textContent).toBe('ההתחברות נכשלה. נסו שוב.');
    expect(replace).not.toHaveBeenCalled();
  });
});
