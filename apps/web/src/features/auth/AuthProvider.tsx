import type { Session } from '@supabase/supabase-js';
import { useEffect, useState, type ReactNode } from 'react';
import { api, ApiRequestError } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { AuthContext, type AuthState } from './authContext';

/** Why a session was refused (or not): the API decides, via 403 not_allowed on /settings. */
async function checkAccess(): Promise<AuthState> {
  try {
    await api.settings();
    return 'allowed';
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 403) return 'notAllowed';
    throw err;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>('loading');

  useEffect(() => {
    let cancelled = false;
    const apply = (session: Session | null) => {
      if (!session) return setState('signedOut');
      setState('loading');
      checkAccess()
        .then((s) => !cancelled && setState(s))
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

  return <AuthContext.Provider value={{ state, signOut }}>{children}</AuthContext.Provider>;
}
