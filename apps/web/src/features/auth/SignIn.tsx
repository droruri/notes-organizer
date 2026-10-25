import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { DevSignIn } from './DevSignIn';

export function SignIn() {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col items-start gap-3">
      <button
        type="button"
        onClick={() =>
          void supabase().auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin },
          })
        }
        className="rounded-md border border-line px-3 py-1 text-sm hover:bg-surface-hover"
      >
        {t('auth.signInGoogle')}
      </button>
      {import.meta.env.DEV ? <DevSignIn /> : null}
    </section>
  );
}
