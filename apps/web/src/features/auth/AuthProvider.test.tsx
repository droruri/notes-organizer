import { act, cleanup, render, screen } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { ApiRequestError } from '../../lib/api';

type Listener = (event: string, session: Session | null) => void;
const h = vi.hoisted(() => ({
  listener: null as null | ((e: string, s: Session | null) => void),
  me: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: () => ({
    auth: {
      onAuthStateChange: (cb: Listener) => {
        h.listener = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signOut: async () => {},
    },
  }),
}));
vi.mock('../../lib/api', async (orig) => ({
  ...(await orig<typeof import('../../lib/api')>()),
  api: { me: h.me },
}));

import { AuthProvider } from './AuthProvider';
import { useAuth } from './authContext';

const session = { access_token: 't' } as Session;

function Probe() {
  const { state, isAdmin } = useAuth();
  return <div data-testid="p">{`${state}:${isAdmin}`}</div>;
}

async function fire(event: string, s: Session | null) {
  await act(async () => {
    h.listener?.(event, s);
    await new Promise((r) => setTimeout(r, 5));
  });
}

afterEach(() => {
  cleanup();
  h.me.mockReset();
});

describe('AuthProvider', () => {
  it('assumes allowed, not admin, when /me fails at network level with a session', async () => {
    h.me.mockRejectedValue(new TypeError('Failed to fetch'));
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await fire('INITIAL_SESSION', session);
    expect(screen.getByTestId('p').textContent).toBe('allowed:false');
  });

  it('403 is notAllowed; no session is signedOut', async () => {
    h.me.mockRejectedValue(new ApiRequestError(403, undefined, 'no'));
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await fire('INITIAL_SESSION', session);
    expect(screen.getByTestId('p').textContent).toBe('notAllowed:false');
    await fire('SIGNED_OUT', null);
    expect(screen.getByTestId('p').textContent).toBe('signedOut:false');
  });

  it('a token refresh keeps the state (no loading) and keeps access when offline', async () => {
    h.me.mockResolvedValue({ isAdmin: true });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await fire('INITIAL_SESSION', session);
    expect(screen.getByTestId('p').textContent).toBe('allowed:true');
    h.me.mockReturnValue(new Promise(() => {}));
    await act(async () => {
      h.listener?.('TOKEN_REFRESHED', session);
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(screen.getByTestId('p').textContent).toBe('allowed:true');
    h.me.mockRejectedValue(new TypeError('offline'));
    await fire('TOKEN_REFRESHED', session);
    expect(screen.getByTestId('p').textContent).toBe('allowed:true');
  });
});
