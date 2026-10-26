import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { AppMenu } from './AppMenu';

beforeEach(() => {
  document.documentElement.dir = 'rtl';
});
afterEach(cleanup);

const handlers = () => ({ onNotes: vi.fn(), onImport: vi.fn(), onSignOut: vi.fn() });
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
    fireEvent.click(screen.getByRole('menuitem', { name: 'auth.signOut' }));
    expect(h.onSignOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('offers Notes, Import and Sign out to everyone, and Import works', () => {
    const h = handlers();
    render(<AppMenu {...h} />);
    open();
    expect(screen.getAllByRole('menuitem')).toHaveLength(3);
    expect(screen.queryByRole('menuitem', { name: 'users.menu' })).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: 'import.open' }));
    expect(h.onImport).toHaveBeenCalledTimes(1);
  });

  it('shows Users only to an admin', () => {
    const onUsers = vi.fn();
    render(<AppMenu {...handlers()} onUsers={onUsers} />);
    open();
    expect(screen.getAllByRole('menuitem')).toHaveLength(4);
    fireEvent.click(screen.getByRole('menuitem', { name: 'users.menu' }));
    expect(onUsers).toHaveBeenCalledTimes(1);
  });
});
