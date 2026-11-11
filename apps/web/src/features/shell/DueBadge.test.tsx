import { render } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vite-plus/test';
import { i18n } from '../../lib/i18n';
import { DueBadge } from './DueBadge';

describe('DueBadge', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders nothing at zero', () => {
    const { container } = render(<DueBadge count={0} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows the number, hidden from assistive tech', () => {
    const { container } = render(<DueBadge count={5} />);
    const pill = container.querySelector('span');
    expect(pill?.textContent).toBe('5');
    expect(pill?.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows 99 as is and 99+ above it', () => {
    const { container, rerender } = render(<DueBadge count={99} />);
    expect(container.querySelector('span')?.textContent).toBe('99');
    rerender(<DueBadge count={100} />);
    expect(container.querySelector('span')?.textContent).toBe('99+');
  });
});
