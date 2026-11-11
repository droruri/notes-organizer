import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { Section } from './Section';

afterEach(cleanup);

describe('Section', () => {
  it('renders a plain heading with count and children by default', () => {
    render(
      <Section title="Overdue" count={2}>
        <p>child</p>
      </Section>,
    );
    screen.getByRole('heading', { name: 'Overdue (2)' });
    screen.getByText('child');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('collapsible starts closed and toggles its children', () => {
    render(
      <Section title="Later" count={3} collapsible>
        <p>child</p>
      </Section>,
    );
    const btn = screen.getByRole('button', { name: 'Later (3)' });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('child')).toBeNull();
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    screen.getByText('child');
    fireEvent.click(btn);
    expect(screen.queryByText('child')).toBeNull();
  });
});
