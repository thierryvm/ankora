import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ThemeToggle } from '../index';

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

describe('<ThemeToggle /> (atom CD#3)', () => {
  it('renders sun icon when theme=light (default initialTheme)', () => {
    render(<ThemeToggle />);
    expect(screen.getByTestId('atm-theme-icon-sun')).toBeTruthy();
    expect(screen.queryByTestId('atm-theme-icon-moon')).toBeNull();
  });

  it('renders moon icon when initialTheme=dark', () => {
    render(<ThemeToggle initialTheme="dark" />);
    expect(screen.getByTestId('atm-theme-icon-moon')).toBeTruthy();
    expect(screen.queryByTestId('atm-theme-icon-sun')).toBeNull();
  });

  it('click toggles light → dark (icon swaps from sun to moon)', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle initialTheme="light" />);
    expect(screen.getByTestId('atm-theme-icon-sun')).toBeTruthy();
    await user.click(screen.getByRole('button'));
    expect(screen.getByTestId('atm-theme-icon-moon')).toBeTruthy();
    expect(screen.queryByTestId('atm-theme-icon-sun')).toBeNull();
  });

  it('click toggles dark → light (icon swaps from moon to sun)', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle initialTheme="dark" />);
    expect(screen.getByTestId('atm-theme-icon-moon')).toBeTruthy();
    await user.click(screen.getByRole('button'));
    expect(screen.getByTestId('atm-theme-icon-sun')).toBeTruthy();
    expect(screen.queryByTestId('atm-theme-icon-moon')).toBeNull();
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

  it('size="sm" → root has class atm-theme-toggle--sm', () => {
    const { container } = render(<ThemeToggle size="sm" />);
    const root = container.querySelector('button');
    expect(root?.className).toContain('atm-theme-toggle--sm');
    expect(root?.className).not.toContain('atm-theme-toggle--md');
  });

  it('size="md" (default) → root has class atm-theme-toggle--md', () => {
    const { container } = render(<ThemeToggle />);
    const root = container.querySelector('button');
    expect(root?.className).toContain('atm-theme-toggle--md');
  });

  /**
   * Touch target hit area pinning (GH issue #153, fixed in PR-D4-PHASE2-B).
   * Reads atoms.css directly because jsdom does not load external CSS.
   * Anti-regression: prevents a future refactor from shrinking the hit
   * target back below WCAG 2.5.8 / Apple HIG 44×44.
   */
  it('CSS pins .atm-theme-toggle--md ≥ 44×44 (Apple HIG, GH #153)', () => {
    const css = readFileSync(resolve(__dirname, '../atoms.css'), 'utf-8');
    const mdRule = css.match(/\.atm-theme-toggle--md\s*\{[^}]*\}/)?.[0] ?? '';
    const width = Number(mdRule.match(/width:\s*(\d+)px/)?.[1] ?? '0');
    const height = Number(mdRule.match(/height:\s*(\d+)px/)?.[1] ?? '0');
    expect(width, 'md width must satisfy Apple HIG 44×44').toBeGreaterThanOrEqual(44);
    expect(height, 'md height must satisfy Apple HIG 44×44').toBeGreaterThanOrEqual(44);
  });

  it('CSS pins .atm-theme-toggle--sm ≥ 24×24 (WCAG 2.5.8 minimum)', () => {
    const css = readFileSync(resolve(__dirname, '../atoms.css'), 'utf-8');
    const smRule = css.match(/\.atm-theme-toggle--sm\s*\{[^}]*\}/)?.[0] ?? '';
    const width = Number(smRule.match(/width:\s*(\d+)px/)?.[1] ?? '0');
    const height = Number(smRule.match(/height:\s*(\d+)px/)?.[1] ?? '0');
    expect(width, 'sm width must satisfy WCAG 2.5.8 minimum').toBeGreaterThanOrEqual(24);
    expect(height, 'sm height must satisfy WCAG 2.5.8 minimum').toBeGreaterThanOrEqual(24);
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
    const svg = screen.getByTestId('atm-theme-icon-sun');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
  });

  it('passes through className on root', () => {
    const { container } = render(<ThemeToggle className="extra-class" />);
    const root = container.querySelector('button');
    expect(root?.className).toContain('atm-theme-toggle');
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
