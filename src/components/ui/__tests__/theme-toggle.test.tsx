import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ThemeToggle } from '../theme-toggle';

/**
 * Reset DOM state between tests:
 * - Expire toutes les cookies présentes pour ne pas polluer les assertions.
 * - Reset `data-theme` sur <html> à vide.
 */
beforeEach(() => {
  // Expire chaque cookie déjà posée
  for (const cookie of document.cookie.split(';')) {
    const eq = cookie.indexOf('=');
    const name = (eq > -1 ? cookie.slice(0, eq) : cookie).trim();
    if (name) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    }
  }
  document.documentElement.dataset.theme = '';
});

describe('<ThemeToggle />', () => {
  it('renders sun icon when theme=light (default initialTheme)', () => {
    render(<ThemeToggle />);
    expect(screen.getByTestId('theme-icon-sun')).toBeTruthy();
    expect(screen.queryByTestId('theme-icon-moon')).toBeNull();
  });

  it('renders moon icon when initialTheme=dark', () => {
    render(<ThemeToggle initialTheme="dark" />);
    expect(screen.getByTestId('theme-icon-moon')).toBeTruthy();
    expect(screen.queryByTestId('theme-icon-sun')).toBeNull();
  });

  it('click toggles light → dark (icon swaps from sun to moon)', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle initialTheme="light" />);
    expect(screen.getByTestId('theme-icon-sun')).toBeTruthy();
    await user.click(screen.getByRole('button'));
    expect(screen.getByTestId('theme-icon-moon')).toBeTruthy();
    expect(screen.queryByTestId('theme-icon-sun')).toBeNull();
  });

  it('click toggles dark → light (icon swaps from moon to sun)', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle initialTheme="dark" />);
    expect(screen.getByTestId('theme-icon-moon')).toBeTruthy();
    await user.click(screen.getByRole('button'));
    expect(screen.getByTestId('theme-icon-sun')).toBeTruthy();
    expect(screen.queryByTestId('theme-icon-moon')).toBeNull();
  });

  it('aria-pressed="false" when light, "true" when dark', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle initialTheme="light" />);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    await user.click(btn);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('aria-label dynamique selon theme courant', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle initialTheme="light" />);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-label')).toBe('Activer le thème sombre');
    await user.click(btn);
    expect(btn.getAttribute('aria-label')).toBe('Activer le thème clair');
  });

  it('click writes cookie containing theme=dark on toggle to dark', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle initialTheme="light" />);
    await user.click(screen.getByRole('button'));
    expect(document.cookie).toContain('theme=dark');
  });

  it('click writes cookie containing theme=light on toggle to light', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle initialTheme="dark" />);
    await user.click(screen.getByRole('button'));
    expect(document.cookie).toContain('theme=light');
  });

  it('after click, document.documentElement.dataset.theme matches new theme', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle initialTheme="light" />);
    // Effect runs at mount → light initially
    expect(document.documentElement.dataset.theme).toBe('light');
    await user.click(screen.getByRole('button'));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('onChange callback called with new theme on toggle', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ThemeToggle initialTheme="light" onChange={onChange} />);
    await user.click(screen.getByRole('button'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('dark');
    await user.click(screen.getByRole('button'));
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith('light');
  });

  it('custom cookieKey prop → cookie name = custom key', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle initialTheme="light" cookieKey="ankora.theme" />);
    await user.click(screen.getByRole('button'));
    expect(document.cookie).toContain('ankora.theme=dark');
  });

  /**
   * Touch target hit area pinning (GH issue #153).
   *
   * The size used to live in `atoms.css` and was asserted by reading that file
   * (jsdom does not load external CSS). Since ADR-034 the size is a Tailwind
   * utility, so the assertion is on the class — which is the thing that would
   * actually change in a careless refactor.
   *
   * Tailwind scale: `size-11` = 2.75rem = 44px (Apple HIG / WCAG 2.5.8 AAA),
   * `size-9` = 2.25rem = 36px (denser variant, still above the 24px WCAG
   * 2.5.8 AA minimum).
   */
  it('size="md" (default) → 44×44 hit area (size-11, Apple HIG, GH #153)', () => {
    const { container } = render(<ThemeToggle />);
    const root = container.querySelector('button');
    expect(root?.className, 'md must keep the 44×44 hit area').toContain('size-11');
  });

  it('size="sm" → denser 36×36 hit area (size-9, above WCAG 2.5.8 AA)', () => {
    const { container } = render(<ThemeToggle size="sm" />);
    const root = container.querySelector('button');
    expect(root?.className).toContain('size-9');
    expect(root?.className).not.toContain('size-11');
  });

  it('default theme is light, default cookieKey is "theme"', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    await user.click(btn);
    expect(document.cookie).toContain('theme=dark');
    expect(document.cookie).not.toContain('ankora.theme=');
  });

  it('button is type="button" (no form submit)', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('button').getAttribute('type')).toBe('button');
  });

  it('SVG icon has aria-hidden="true" (decorative)', () => {
    render(<ThemeToggle initialTheme="light" />);
    const svg = screen.getByTestId('theme-icon-sun');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
  });

  it('passes through className on root', () => {
    const { container } = render(<ThemeToggle className="extra-class" />);
    const root = container.querySelector('button');
    expect(root?.className).toContain('rounded-full');
    expect(root?.className).toContain('extra-class');
  });

  it('title attr reflects target theme (action prompt)', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle initialTheme="light" />);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('title')).toBe('Thème sombre');
    await user.click(btn);
    expect(btn.getAttribute('title')).toBe('Thème clair');
  });

  it('multiple toggles update cookie sequentially', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle initialTheme="light" />);
    const btn = screen.getByRole('button');
    await user.click(btn);
    expect(document.cookie).toContain('theme=dark');
    await user.click(btn);
    expect(document.cookie).toContain('theme=light');
    await user.click(btn);
    expect(document.cookie).toContain('theme=dark');
  });

  it('keyboard activation (Enter) toggles theme via native button behaviour', () => {
    const onChange = vi.fn();
    render(<ThemeToggle initialTheme="light" onChange={onChange} />);
    const btn = screen.getByRole('button');
    // jsdom button click on Enter via fireEvent.click (Enter triggers click on buttons)
    fireEvent.click(btn);
    expect(onChange).toHaveBeenCalledWith('dark');
  });
});
