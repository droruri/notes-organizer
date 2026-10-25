import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';

// The seeded local user from supabase/seed.sql; rendered only when import.meta.env.DEV.
const DEV_EMAIL = 'dev@notes.local';
const DEV_PASSWORD = 'devpassword';

export function DevSignIn() {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={() =>
        void supabase().auth.signInWithPassword({ email: DEV_EMAIL, password: DEV_PASSWORD })
      }
      className="rounded-md border border-line px-3 py-1 text-sm hover:bg-surface-hover"
    >
      {t('auth.devSignIn')}
    </button>
  );
}
