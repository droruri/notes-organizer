import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { i18n } from '../../lib/i18n';
import { AppMenu } from './AppMenu';

beforeEach(() => {
  document.documentElement.dir = 'rtl';
});
afterEach(cleanup);

const setup = (props: { isAdmin?: boolean } = {}) => {
  const h = { onPick: vi.fn(), onSignOut: vi.fn(), onDone: vi.fn() };
  render(<AppMenu {...h} {...props} />);
  return h;
};

describe('AppMenu', () => {
  it('signs out and reports done', () => {
    const h = setup();
    fireEvent.click(screen.getByRole('menuitem', { name: i18n.t('auth.signOut') }));
    expect(h.onSignOut).toHaveBeenCalledTimes(1);
    expect(h.onDone).toHaveBeenCalledTimes(1);
  });

  it('offers Import, Categories & tags, Settings and Sign out to everyone', () => {
    const h = setup();
    expect(screen.getAllByRole('menuitem')).toHaveLength(4);
    expect(screen.queryByRole('menuitem', { name: i18n.t('users.menu') })).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: i18n.t('import.open') }));
    fireEvent.click(screen.getByRole('menuitem', { name: i18n.t('taxonomy.menu') }));
    fireEvent.click(screen.getByRole('menuitem', { name: i18n.t('notes.formSettings.title') }));
    expect(h.onPick.mock.calls.map((c) => c[0])).toEqual(['import', 'taxonomy', 'settings']);
  });

  it('shows Users only to an admin', () => {
    const h = setup({ isAdmin: true });
    expect(screen.getAllByRole('menuitem')).toHaveLength(5);
    fireEvent.click(screen.getByRole('menuitem', { name: i18n.t('users.menu') }));
    expect(h.onPick).toHaveBeenCalledWith('users');
  });

  it('moves focus with the arrow keys, wrapping', () => {
    setup();
    const items = screen.getAllByRole('menuitem');
    items[0]?.focus();
    fireEvent.keyDown(items[0] as HTMLElement, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items[items.length - 1]);
  });

  it('switches the language from inside the menu', async () => {
    await i18n.changeLanguage('he');
    setup();
    const english = screen.getByRole('menuitemradio', { name: 'English' });
    expect(english.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(english);
    expect(document.documentElement.lang).toBe('en');
    expect(
      screen.getByRole('menuitemradio', { name: 'English' }).getAttribute('aria-checked'),
    ).toBe('true');
    await i18n.changeLanguage('he');
  });
});
