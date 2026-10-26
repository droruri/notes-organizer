import { act, cleanup, render, screen } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { ApiRequestError } from '../../lib/api';

type Listener = (event: string, session: Session | null) => void;
const h = vi.hoisted(() => ({
  listener: null as null | ((e: string, s: Session | null) => void),
  me: vi.fn(),
  clear: vi.fn(),
  removeClient: vi.fn(async () => {}),
}));

vi.mock('@tanstack/react-query', async (orig) => ({
  ...(await orig<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => ({ clear: h.clear }),
}));
vi.mock('../../lib/queryPersist', () => ({
  clearCache: async (qc: { clear: () => void }) => {
    qc.clear();
    await h.removeClient();
  },
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

import { AuthGate } from './AuthGate';
import { AuthProvider } from './AuthProvider';
import { useAuth } from './authContext';

const session = { access_token: 't' } as Session;

const mounts = vi.fn();
function Probe() {
  const { state, isAdmin } = useAuth();
  useEffect(() => {
    mounts();
  }, []);
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

  it('a token refresh does not unmount the children, even if /me fails with a 500', async () => {
    h.me.mockResolvedValue({ isAdmin: false });
    mounts.mockClear();
    render(
      <AuthProvider>
        <AuthGate>
          <Probe />
        </AuthGate>
      </AuthProvider>,
    );
    await fire('INITIAL_SESSION', session);
    expect(screen.getByTestId('p')).toBeTruthy();
    h.me.mockRejectedValue(new ApiRequestError(500, undefined, 'boom'));
    await fire('TOKEN_REFRESHED', session);
    expect(screen.getByTestId('p')).toBeTruthy();
    expect(mounts).toHaveBeenCalledTimes(1);
  });

  it('clears the in-memory and persisted cache on sign-out and on any signed-out transition', async () => {
    h.me.mockResolvedValue({ isAdmin: false });
    h.clear.mockClear();
    h.removeClient.mockClear();
    const grabbed: { signOut: () => Promise<void> } = { signOut: async () => {} };
    function Grab() {
      const auth = useAuth();
      useEffect(() => {
        grabbed.signOut = auth.signOut;
      });
      return null;
    }
    render(
      <AuthProvider>
        <Grab />
      </AuthProvider>,
    );
    await fire('INITIAL_SESSION', session);
    expect(h.clear).not.toHaveBeenCalled();
    await act(async () => {
      await grabbed.signOut();
    });
    expect(h.clear).toHaveBeenCalledTimes(1);
    expect(h.removeClient).toHaveBeenCalledTimes(1);
    await fire('SIGNED_OUT', null);
    expect(h.clear).toHaveBeenCalledTimes(2);
    expect(h.removeClient).toHaveBeenCalledTimes(2);
  });
});
