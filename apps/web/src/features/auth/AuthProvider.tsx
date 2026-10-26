import type { Session } from '@supabase/supabase-js';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api, ApiRequestError } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { AuthContext, type AuthState } from './authContext';

/** Why a session was refused (or not): the API decides, via 403 not_allowed on /me. */
async function checkAccess(): Promise<{ state: AuthState; isAdmin: boolean }> {
  try {
    const me = await api.me();
    return { state: 'allowed', isAdmin: me.isAdmin };
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 403) {
      return { state: 'notAllowed', isAdmin: false };
    }
    throw err;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>('loading');
  const [isAdmin, setIsAdmin] = useState(false);
  const access = useRef<{ state: AuthState; isAdmin: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const apply = (event: string, session: Session | null) => {
      if (!session) {
        access.current = null;
        return setState('signedOut');
      }
      // Only the first check and a fresh sign-in show the loading state; a token refresh
      // re-checks quietly so the screens (and text being typed) stay mounted.
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') setState('loading');
      checkAccess()
        .catch((err: unknown) => {
          // Offline with a session: keep the last known access, else assume allowed.
          // The API still checks every request, so this grants nothing server-side.
          // A quiet refresh never signs the user out over a transient failure (5xx, 429).
          if (event === 'TOKEN_REFRESHED' && access.current) return access.current;
          if (err instanceof TypeError)
            return access.current ?? { state: 'allowed' as const, isAdmin: false };
          throw err;
        })
        .then((result) => {
          if (cancelled) return;
          access.current = result;
          setIsAdmin(result.isAdmin);
          setState(result.state);
        })
        .catch(() => !cancelled && setState('signedOut'));
    };
    const { data } = supabase().auth.onAuthStateChange((event, session) => {
      // Defer: supabase-js forbids calling its own methods inside this callback.
      setTimeout(() => apply(event, session), 0);
    });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase().auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ state, isAdmin, signOut }}>{children}</AuthContext.Provider>
  );
}
