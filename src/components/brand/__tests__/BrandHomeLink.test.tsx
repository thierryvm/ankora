import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { BrandHomeLink } from '../BrandHomeLink';

describe('<BrandHomeLink />', () => {
  it('wraps the Ankora wordmark in a link to / with the supplied aria-label', () => {
    render(<BrandHomeLink ariaLabel="Accueil Ankora" />);
    const link = screen.getByRole('link', { name: 'Accueil Ankora' });
    expect(link).toHaveAttribute('href', '/');
  });

  it('hides the inner SVG from assistive tech to avoid duplicate announcements', () => {
    const { container } = render(<BrandHomeLink ariaLabel="Home" />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('focusable')).toBe('false');
    // Critically: the SVG should NOT carry its own aria-label, otherwise
    // SR users would hear "Ankora" + the parent link's aria-label.
    expect(svg?.getAttribute('aria-label')).toBeNull();
  });

  it('forwards logoClassName to the AnkoraLogo for sizing per surface', () => {
    const { container } = render(<BrandHomeLink ariaLabel="Home" logoClassName="h-7 w-auto" />);
    const svg = container.querySelector('svg');
    expect(svg?.className.baseVal ?? '').toContain('h-7');
  });

  it('applies the canonical focus + press animation classes', () => {
    render(<BrandHomeLink ariaLabel="Home" />);
    const link = screen.getByRole('link', { name: 'Home' });
    expect(link.className).toContain('focus-visible:ring-brand-600');
    expect(link.className).toContain('motion-safe:active:scale-95');
    expect(link.className).toContain('transition-transform');
  });

  it('merges an optional className without losing the canonical pattern', () => {
    render(<BrandHomeLink ariaLabel="Home" className="extra-class" />);
    const link = screen.getByRole('link', { name: 'Home' });
    expect(link.className).toContain('extra-class');
    expect(link.className).toContain('focus-visible:ring-brand-600');
  });
});
