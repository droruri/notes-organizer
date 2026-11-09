import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/auth-js';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { meKeys, meQueryOptions } from '../../api';
import { ApiNetworkError, ApiRequestError } from '../../lib/api';
import { clearCache } from '../../lib/queryPersist';
import { auth } from '../../lib/supabase';
import { AuthContext, type AuthState } from './authContext';

/** Why a session was refused (or not): the API decides, via 403 not_allowed on /me. */
async function checkAccess(
  queryClient: QueryClient,
): Promise<{ state: AuthState; isAdmin: boolean }> {
  try {
    const me = await queryClient.fetchQuery(meQueryOptions);
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
  const queryClient = useQueryClient();
  const access = useRef<{ state: AuthState; isAdmin: boolean } | null>(null);
  const userId = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Any way of ending up signed out wipes the cached notes (memory and disk).
    const signedOut = () => {
      access.current = null;
      userId.current = null;
      void clearCache(queryClient);
      setState('signedOut');
    };
    const apply = (event: string, session: Session | null) => {
      if (!session) return signedOut();
      // Another user on this device: the cache and the last access belong to the previous one.
      if (userId.current !== null && userId.current !== session.user.id) {
        access.current = null;
        // Drop the previous user's /me synchronously: clearCache awaits IndexedDB first, and a
        // fetchQuery started meanwhile would otherwise join that user's in-flight request.
        queryClient.removeQueries({ queryKey: meKeys.all });
        void clearCache(queryClient);
      }
      userId.current = session.user.id;
      // Loading shows only while access for this user is unknown (first load, sign-in after
      // sign-out, a different user). Otherwise (token refresh, or auth-js re-emitting
      // SIGNED_IN on tab refocus) re-check quietly so the screens and typed text stay mounted.
      const quiet = access.current !== null;
      if (!quiet) setState('loading');
      checkAccess(queryClient)
        .catch((err: unknown) => {
          // Offline with a session: keep the last known access, else assume allowed.
          // The API still checks every request, so this grants nothing server-side.
          // A quiet re-check never signs the user out over a transient failure (5xx, 429).
          if (quiet && access.current) return access.current;
          if (err instanceof ApiNetworkError)
            return access.current ?? { state: 'allowed' as const, isAdmin: false };
          throw err;
        })
        .then((result) => {
          if (cancelled) return;
          access.current = result;
          setIsAdmin(result.isAdmin);
          setState(result.state);
        })
        .catch(() => !cancelled && signedOut());
    };
    const { data } = auth().onAuthStateChange((event, session) => {
      // Defer: auth-js forbids calling its own methods inside this callback.
      setTimeout(() => apply(event, session), 0);
    });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, [queryClient]);

  const signOut = async () => {
    await auth().signOut();
    await clearCache(queryClient);
  };

  return (
    <AuthContext.Provider value={{ state, isAdmin, signOut }}>{children}</AuthContext.Provider>
  );
}
