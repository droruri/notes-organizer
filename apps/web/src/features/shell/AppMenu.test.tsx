import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { i18n } from '../../lib/i18n';
import { AppMenu } from './AppMenu';

beforeEach(() => {
  document.documentElement.dir = 'rtl';
});
afterEach(cleanup);

const handlers = () => ({
  onNotes: vi.fn(),
  onImport: vi.fn(),
  onTaxonomy: vi.fn(),
  onWorkspaces: vi.fn(),
  onSignOut: vi.fn(),
});
const open = () => fireEvent.click(screen.getByRole('button', { expanded: false }));

describe('AppMenu', () => {
  it('closes on Escape and returns focus to the menu button', () => {
    render(<AppMenu {...handlers()} />);
    const toggle = screen.getByRole('button', { expanded: false });
    fireEvent.click(toggle);
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(toggle);
  });

  it('signs out and closes the menu', () => {
    const h = handlers();
    render(<AppMenu {...h} />);
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: i18n.t('auth.signOut') }));
    expect(h.onSignOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('offers Notes, Import, Categories & tags and Sign out to everyone, and Import works', () => {
    const h = handlers();
    render(<AppMenu {...h} />);
    open();
    expect(screen.getAllByRole('menuitem')).toHaveLength(5);
    expect(screen.queryByRole('menuitem', { name: i18n.t('users.menu') })).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: i18n.t('import.open') }));
    expect(h.onImport).toHaveBeenCalledTimes(1);
  });

  it('opens Categories & tags', () => {
    const h = handlers();
    render(<AppMenu {...h} />);
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: i18n.t('taxonomy.menu') }));
    expect(h.onTaxonomy).toHaveBeenCalledTimes(1);
  });

  it('shows Users only to an admin', () => {
    const onUsers = vi.fn();
    render(<AppMenu {...handlers()} onUsers={onUsers} />);
    open();
    expect(screen.getAllByRole('menuitem')).toHaveLength(6);
    fireEvent.click(screen.getByRole('menuitem', { name: i18n.t('users.menu') }));
    expect(onUsers).toHaveBeenCalledTimes(1);
  });

  it('switches the language from inside the menu and stays open', async () => {
    await i18n.changeLanguage('he');
    render(<AppMenu {...handlers()} />);
    open();
    const english = screen.getByRole('menuitemradio', { name: 'English' });
    expect(english.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(english);
    expect(document.documentElement.lang).toBe('en');
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(
      screen.getByRole('menuitemradio', { name: 'English' }).getAttribute('aria-checked'),
    ).toBe('true');
    await i18n.changeLanguage('he');
  });
});
