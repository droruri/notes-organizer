import { createContext, useContext } from 'react';

export type AuthState = 'loading' | 'signedOut' | 'allowed' | 'notAllowed';

export const AuthContext = createContext<{
  state: AuthState;
  isAdmin: boolean;
  signOut: () => Promise<void>;
} | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
