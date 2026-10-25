import type { AddUserBody, AllowedUser } from '@notes/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiRequestError } from '../../lib/api';

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
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t('users.title')}</h2>
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border border-line px-3 py-1 hover:bg-surface-hover"
        >
          {t('users.back')}
        </button>
      </div>

      <form
        className="flex flex-wrap items-center gap-2"
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
          className="min-w-0 flex-1 rounded-md border border-line bg-bg px-3 py-2"
        />
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={admin} onChange={(e) => setAdmin(e.target.checked)} />
          {t('users.adminCheckbox')}
        </label>
        <button
          type="submit"
          disabled={add.isPending}
          className="rounded-md border border-line px-3 py-2 hover:bg-surface-hover disabled:opacity-50"
        >
          {t('users.add')}
        </button>
      </form>

      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {users.isPending && <p className="text-muted">{t('users.loading')}</p>}
      {users.isError && (
        <p role="alert" className="text-danger">
          {t('users.errors.generic')}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {users.data?.map((u) => (
          <li key={u.email} className="flex flex-col gap-2 rounded-md border border-line p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span dir="ltr" className="break-all">
                {u.email}
              </span>
              {u.isAdmin && (
                <span className="rounded-full bg-surface-hover px-2 py-0.5 text-xs">
                  {t('users.admin')}
                </span>
              )}
            </div>
            {confirming === u.email ? (
              <div className="flex flex-wrap items-center gap-2">
                <span>{t('users.confirmRemove', { email: u.email })}</span>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    remove.mutate(u.email);
                  }}
                  className="rounded-md border border-line px-3 py-1 text-danger hover:bg-surface-hover"
                >
                  {t('users.confirmYes')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(null)}
                  className="rounded-md border border-line px-3 py-1 hover:bg-surface-hover"
                >
                  {t('users.cancel')}
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    toggle.mutate(u);
                  }}
                  className="rounded-md border border-line px-3 py-1 hover:bg-surface-hover"
                >
                  {u.isAdmin ? t('users.removeAdmin') : t('users.makeAdmin')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(u.email)}
                  className="rounded-md border border-line px-3 py-1 text-danger hover:bg-surface-hover"
                >
                  {t('users.remove')}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
