import type { Session } from '@supabase/supabase-js';
import { useEffect, useState, type ReactNode } from 'react';
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

  useEffect(() => {
    let cancelled = false;
    const apply = (session: Session | null) => {
      if (!session) return setState('signedOut');
      setState('loading');
      checkAccess()
        .then((access) => {
          if (cancelled) return;
          setIsAdmin(access.isAdmin);
          setState(access.state);
        })
        .catch(() => !cancelled && setState('signedOut'));
    };
    const { data } = supabase().auth.onAuthStateChange((_event, session) => {
      // Defer: supabase-js forbids calling its own methods inside this callback.
      setTimeout(() => apply(session), 0);
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
