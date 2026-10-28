import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './authContext';
import { NoAccess } from './NoAccess';
import { SignIn } from './SignIn';
import { Loading } from '../../ui/Loading';

/** Renders the app only for an allowed user; otherwise sign-in or the no-access screen. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { state, signOut } = useAuth();
  if (state === 'loading') return <Loading label={t('auth.loading')} />;
  if (state === 'signedOut') return <SignIn />;
  if (state === 'notAllowed') return <NoAccess onSignOut={() => void signOut()} />;
  return <>{children}</>;
}
