import type { AddUserBody, AllowedUser } from '@notes/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiRequestError } from '../../lib/api';
import { Icon } from '../../ui/Icon';
import { Loading } from '../../ui/Loading';

type UsersApi = {
  list: () => Promise<AllowedUser[]>;
  add: (input: AddUserBody) => Promise<AllowedUser>;
  setAdmin: (email: string, isAdmin: boolean) => Promise<AllowedUser>;
  remove: (email: string) => Promise<undefined>;
};

const defaultApi: UsersApi = {
  list: api.users,
  add: api.addUser,
  setAdmin: api.setUserAdmin,
  remove: api.removeUser,
};

const KNOWN_ERRORS = ['exists', 'invalid_email', 'last_admin', 'cannot_change_self'];

/** Admin screen: the allow list, with add, role toggle and remove. */
export function UsersScreen({
  onBack,
  usersApi = defaultApi,
}: {
  onBack: () => void;
  usersApi?: UsersApi;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [admin, setAdmin] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const users = useQuery({ queryKey: ['users'], queryFn: usersApi.list });

  const onError = (err: unknown) => {
    const code = err instanceof ApiRequestError ? err.code : undefined;
    setError(t(`users.errors.${code && KNOWN_ERRORS.includes(code) ? code : 'generic'}`));
  };
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['users'] });
  const add = useMutation({
    mutationFn: (input: AddUserBody) => usersApi.add(input),
    onSuccess: () => {
      setEmail('');
      setAdmin(false);
      return refresh();
    },
    onError,
  });
  const toggle = useMutation({
    mutationFn: (u: AllowedUser) => usersApi.setAdmin(u.email, !u.isAdmin),
    onSuccess: refresh,
    onError,
  });
  const remove = useMutation({
    mutationFn: (userEmail: string) => usersApi.remove(userEmail),
    onSuccess: () => {
      setConfirming(null);
      return refresh();
    },
    onError: (err) => {
      setConfirming(null);
      onError(err);
    },
  });

  return (
    <section className="enter-rise flex flex-col gap-5">
      <div className="flex flex-col items-start gap-2">
        <button type="button" onClick={onBack} className="btn btn-ghost btn-sm -ms-3 text-muted">
          <Icon name="back" size={16} />
          {t('users.back')}
        </button>
        <h2 className="text-[1.75rem] leading-tight font-bold tracking-tight">
          {t('users.title')}
        </h2>
      </div>

      <form
        className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-center"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          add.mutate({ email, isAdmin: admin });
        }}
      >
        <input
          type="email"
          dir="ltr"
          aria-label={t('users.emailLabel')}
          placeholder={t('users.emailLabel')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="off"
          spellCheck={false}
          className="field w-full min-w-0 sm:flex-1"
        />
        <div className="flex items-center justify-between gap-3">
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={admin}
              onChange={(e) => setAdmin(e.target.checked)}
              className="check"
            />
            {t('users.adminCheckbox')}
          </label>
          <button type="submit" disabled={add.isPending} className="btn btn-primary">
            <Icon name="plus" size={16} />
            {t('users.add')}
          </button>
        </div>
      </form>

      {error && (
        <p role="alert" className="notice notice-danger">
          {error}
        </p>
      )}
      {users.isPending && <Loading label={t('users.loading')} />}
      {users.isError && (
        <p role="alert" className="notice notice-danger">
          {t('users.errors.generic')}
        </p>
      )}

      {users.data && users.data.length > 0 && (
        <ul className="card flex flex-col divide-y divide-line overflow-hidden">
          {users.data.map((u) => (
            <li
              key={u.email}
              className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
            >
              <span
                aria-hidden="true"
                className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft font-semibold text-accent uppercase"
              >
                {u.email.slice(0, 1)}
              </span>
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <span dir="ltr" className="min-w-0 [overflow-wrap:anywhere]">
                  {u.email}
                </span>
                {u.isAdmin && (
                  <span className="pill bg-accent-soft text-accent">{t('users.admin')}</span>
                )}
              </div>
              {confirming === u.email ? (
                <div className="notice notice-danger col-span-full flex-wrap items-center">
                  <span className="me-auto">{t('users.confirmRemove', { email: u.email })}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      remove.mutate(u.email);
                    }}
                    className="btn btn-sm btn-danger"
                  >
                    {t('users.confirmYes')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    className="btn btn-ghost btn-sm"
                  >
                    {t('users.cancel')}
                  </button>
                </div>
              ) : (
                // Under the email on a phone (lined up with it), beside it on wider screens.
                <div className="col-start-2 -ms-3 flex flex-wrap gap-1 sm:col-start-3 sm:ms-0">
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      toggle.mutate(u);
                    }}
                    className="btn btn-ghost btn-sm"
                  >
                    {u.isAdmin ? t('users.removeAdmin') : t('users.makeAdmin')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(u.email)}
                    className="btn btn-ghost btn-sm btn-danger"
                  >
                    {t('users.remove')}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
