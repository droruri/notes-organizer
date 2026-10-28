import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { DevSignIn } from './DevSignIn';

export function SignIn() {
  const { t } = useTranslation();
  return (
    <section className="enter-rise mx-auto mt-10 flex max-w-sm flex-col items-center gap-6 text-center">
      <div aria-hidden="true" className="relative h-32 w-60">
        <div className="card slip status-done absolute inset-x-6 top-0 h-20 -rotate-6 p-4 ps-5 opacity-70">
          <div className="h-2 w-3/4 rounded-full bg-line" />
        </div>
        <div className="card slip status-in_progress absolute inset-x-3 top-4 h-20 rotate-3 p-4 ps-5">
          <div className="h-2 w-2/3 rounded-full bg-line" />
        </div>
        <div className="card slip status-todo absolute inset-x-0 top-10 flex h-20 flex-col gap-2.5 p-4 ps-5">
          <div className="h-2 w-5/6 rounded-full bg-line-strong/50" />
          <div className="flex gap-1.5">
            <span className="marker">{t('notes.picker.new')}</span>
            <span className="h-4 w-12 rounded-md border border-line" />
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="text-[1.75rem] leading-tight font-bold tracking-tight">
          {t('auth.welcome.title')}
        </h2>
        <p className="text-muted">{t('auth.welcome.body')}</p>
      </div>
      <div className="flex w-full flex-col gap-2">
        <button
          type="button"
          onClick={() =>
            void supabase().auth.signInWithOAuth({
              provider: 'google',
              options: { redirectTo: window.location.origin },
            })
          }
          className="btn w-full"
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
            <path
              fill="#EA4335"
              d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.2l7.9 6.2C12.4 13.6 17.7 9.5 24 9.5z"
            />
            <path
              fill="#4285F4"
              d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.8c4.3-4 6.9-9.9 6.9-17.2z"
            />
            <path
              fill="#FBBC05"
              d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.2C.9 16.6 0 20.2 0 24s.9 7.4 2.6 10.8l7.9-6.2z"
            />
            <path
              fill="#34A853"
              d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.8c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.2C6.6 42.6 14.6 48 24 48z"
            />
          </svg>
          {t('auth.signInGoogle')}
        </button>
        {import.meta.env.DEV ? <DevSignIn /> : null}
      </div>
    </section>
  );
}
