import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import '../../lib/i18n';
import { AuthContext, type AuthState } from '../auth/authContext';
import { Shell } from './Shell';

function renderShell(state: AuthState) {
  render(
    <MemoryRouter>
      <AuthContext.Provider value={{ state, isAdmin: false, signOut: async () => {} }}>
        <Shell>
          <p>content</p>
        </Shell>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

describe('Shell', () => {
  afterEach(cleanup);

  it('shows no header while access is checked on reload', () => {
    renderShell('loading');
    expect(screen.queryByRole('banner')).toBeNull();
  });

  it('shows the header with the language switch when signed out', () => {
    renderShell('signedOut');
    expect(screen.getByRole('banner')).toBeTruthy();
  });

  it('shows no header when signed in (the sidebar and tab bar take over)', () => {
    renderShell('allowed');
    expect(screen.queryByRole('banner')).toBeNull();
  });
});
