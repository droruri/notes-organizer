import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { ImportMenu } from './ImportMenu';

afterEach(cleanup);

describe('ImportMenu', () => {
  it('closes on Escape and returns focus to the menu button', () => {
    render(<ImportMenu onImport={() => {}} />);
    const toggle = screen.getByRole('button', { expanded: false });
    fireEvent.click(toggle);
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(toggle);
  });
});
