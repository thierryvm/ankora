import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { AnkoraLogo } from '../AnkoraLogo';

describe('<AnkoraLogo />', () => {
  it('renders an SVG with role="img" and accessible aria-label', () => {
    render(<AnkoraLogo />);
    const svg = screen.getByRole('img', { name: 'Ankora' });
    expect(svg.tagName).toBe('svg');
  });

  it('renders the wordmark variant by default (viewBox 280×64)', () => {
    render(<AnkoraLogo />);
    const svg = screen.getByRole('img', { name: 'Ankora' });
    expect(svg.getAttribute('viewBox')).toBe('0 0 280 64');
  });

  it('renders the compact variant when wordmark={false} (viewBox 64×64)', () => {
    render(<AnkoraLogo wordmark={false} />);
    const svg = screen.getByRole('img', { name: 'Ankora' });
    expect(svg.getAttribute('viewBox')).toBe('0 0 64 64');
  });

  it('forwards className while keeping the select-none default', () => {
    render(<AnkoraLogo className="custom-test h-8 w-auto" />);
    const svg = screen.getByRole('img', { name: 'Ankora' });
    // SVG className is SVGAnimatedString; getAttribute is the cleanest cross-runtime accessor
    const cls = svg.getAttribute('class') ?? '';
    expect(cls).toContain('h-8');
    expect(cls).toContain('select-none');
  });

  it('uses the locked Laiton accent (#d4a017) on the eyelet circle (regression guard)', () => {
    // ADR-005 + design-principles-2026.md §6 lock the brand accent to
    // Laiton nautique #d4a017. Any future palette refactor that drops
    // this value back to amber #F59E0B (or any other) must be intentional
    // and update this assertion.
    const { container } = render(<AnkoraLogo />);
    const circle = container.querySelector('circle[stroke="#d4a017"]');
    expect(circle).not.toBeNull();
    // Negative regression: the legacy amber must not reappear silently
    const amberCircle = container.querySelector('circle[stroke="#F59E0B"]');
    expect(amberCircle).toBeNull();
  });
});
