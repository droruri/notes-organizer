import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { Panes } from './Panes';

afterEach(cleanup);

const root = (c: HTMLElement) => c.querySelector('[data-panes]');

describe('Panes', () => {
  it('shows the detail and marks the panes as detail-open', () => {
    const { container } = render(<Panes list="L" detail="D" placeholder="P" />);
    expect(root(container)?.hasAttribute('data-detail-open')).toBe(true);
    expect(screen.getByText('D').getAttribute('data-slot')).toBe('detail');
    expect(screen.queryByText('P')).toBeNull();
  });

  it('shows the placeholder, hidden below lg, when there is no detail', () => {
    const { container } = render(<Panes list="L" placeholder="P" />);
    expect(root(container)?.hasAttribute('data-detail-open')).toBe(false);
    const slot = screen.getByText('P').closest('[data-slot="detail"]');
    expect(slot?.className).toContain('max-lg:hidden');
  });

  it('renders only the list with neither', () => {
    const { container } = render(<Panes list="L" />);
    expect(screen.getByText('L').getAttribute('data-slot')).toBe('list');
    expect(container.querySelector('[data-slot="detail"]')).toBeNull();
  });
});
