import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '../../lib/i18n';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { ApiRequestError } from '../../lib/api';
import { UsersScreen } from './UsersScreen';

afterEach(cleanup);

const row = (email: string, isAdmin: boolean) => ({
  email,
  isAdmin,
  createdAt: '2026-01-01T00:00:00.000Z',
});

function setup(overrides: Partial<Parameters<typeof UsersScreen>[0]['usersApi'] & object> = {}) {
  const usersApi = {
    list: vi.fn(async () => [row('me@x.com', true), row('dana@x.com', false)]),
    add: vi.fn(async (i: { email: string }) => row(i.email, false)),
    setAdmin: vi.fn(async (email: string, isAdmin: boolean) => row(email, isAdmin)),
    remove: vi.fn(async () => undefined),
    ...overrides,
  };
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <UsersScreen onBack={() => undefined} usersApi={usersApi} />
    </QueryClientProvider>,
  );
  return usersApi;
}

describe('UsersScreen', () => {
  it('lists emails with an admin badge', async () => {
    setup();
    expect(await screen.findByText('dana@x.com')).toBeTruthy();
    expect(screen.getAllByText('מנהל').length).toBe(2); // badge + add-form checkbox label
  });

  it('adds an email with the admin checkbox', async () => {
    const api = setup();
    await screen.findByText('dana@x.com');
    fireEvent.change(screen.getByLabelText('כתובת אימייל של Google'), {
      target: { value: 'new@x.com' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'הוספה' }));
    await waitFor(() =>
      expect(api.add).toHaveBeenCalledWith({ email: 'new@x.com', isAdmin: true }),
    );
  });

  it('shows the 409 error inline in Hebrew', async () => {
    setup({
      add: vi.fn(async () => {
        throw new ApiRequestError(409, 'exists', 'x');
      }),
    });
    await screen.findByText('dana@x.com');
    fireEvent.change(screen.getByLabelText('כתובת אימייל של Google'), {
      target: { value: 'dana@x.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'הוספה' }));
    expect((await screen.findByRole('alert')).textContent).toBe('האימייל הזה כבר ברשימה.');
  });

  it('asks to confirm before removing, and shows last_admin inline', async () => {
    const api = setup({
      remove: vi.fn(async () => {
        throw new ApiRequestError(422, 'last_admin', 'x');
      }),
    });
    await screen.findByText('dana@x.com');
    fireEvent.click(screen.getAllByRole('button', { name: 'הסרה' })[1] as HTMLElement);
    expect(api.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'כן, להסיר' }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('dana@x.com'));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'אי אפשר להסיר או להוריד את המנהל האחרון.',
    );
  });

  it('toggles admin', async () => {
    const api = setup();
    await screen.findByText('dana@x.com');
    fireEvent.click(screen.getByRole('button', { name: 'הפיכה למנהל' }));
    await waitFor(() => expect(api.setAdmin).toHaveBeenCalledWith('dana@x.com', true));
  });
});
