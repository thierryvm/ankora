import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Progress } from '../progress';

// The fill is an SVG <rect>; its width is a viewBox-unit attribute (0..100),
// not an inline `style={{ width }}` (CSP-safe — THI-322). SVG elements expose
// `className` as an SVGAnimatedString, so we read `getAttribute('class')`.
const fillOf = (container: HTMLElement) => container.querySelector('rect') as SVGRectElement | null;

describe('<Progress />', () => {
  it('renders progressbar role with default aria attributes', () => {
    render(<Progress value={0.5} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(bar).toHaveAttribute('aria-valuenow', '50');
    expect(bar).toHaveAttribute('aria-label', 'Progression');
  });

  it('renders fill width 0 when value=0 (CSP-safe SVG rect, no inline style)', () => {
    const { container } = render(<Progress value={0} />);
    const fill = fillOf(container);
    expect(fill).not.toBeNull();
    expect(fill?.getAttribute('width')).toBe('0');
    // Strict style-src compliance: no inline style attribute anywhere.
    expect(container.querySelector('[style]')).toBeNull();
  });

  it('renders fill width 100 when value equals max', () => {
    const { container } = render(<Progress value={1} max={1} />);
    expect(fillOf(container)?.getAttribute('width')).toBe('100');
  });

  it('caps width at 100 when value > max and applies danger tone (auto)', () => {
    const { container } = render(<Progress value={1.5} max={1} />);
    const fill = fillOf(container);
    expect(fill?.getAttribute('width')).toBe('100');
    expect(fill?.getAttribute('class')).toContain('fill-danger');
  });

  it('applies warning tone (auto) when ratio > 0.85 and ≤ 1', () => {
    const { container } = render(<Progress value={0.86} max={1} />);
    expect(fillOf(container)?.getAttribute('class')).toContain('fill-warning');
  });

  it('applies brand tone (auto) when ratio < 0.85', () => {
    const { container } = render(<Progress value={0.5} max={1} />);
    expect(fillOf(container)?.getAttribute('class')).toContain('fill-brand-500');
  });

  it.each([
    ['success', 'fill-success'],
    ['neutral', 'fill-muted'],
    ['danger', 'fill-danger'],
    ['warning', 'fill-warning'],
  ] as const)('explicit tone %s overrides auto-tone', (tone, cls) => {
    const { container } = render(<Progress value={0.5} tone={tone} />);
    expect(fillOf(container)?.getAttribute('class')).toContain(cls);
  });

  it('renders percentage when showValue is true', () => {
    render(<Progress value={0.42} showValue />);
    expect(screen.getByText('42%')).toBeInTheDocument();
  });

  it.each([
    ['sm', 6, 'h-1.5'],
    ['md', 8, 'h-2'],
    ['lg', 12, 'h-3'],
  ] as const)(
    'applies size %s via class + viewBox height %d (no inline style)',
    (size, height, heightClass) => {
      const { container } = render(<Progress value={0.5} size={size} />);
      expect(screen.getByRole('progressbar').getAttribute('class')).toContain(heightClass);
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('viewBox')).toBe(`0 0 100 ${height}`);
    },
  );

  it('renders the label when provided', () => {
    render(<Progress value={0.5} label="Provisions logement" />);
    expect(screen.getByText('Provisions logement')).toBeInTheDocument();
  });

  it('uses label as aria-label fallback when provided', () => {
    render(<Progress value={0.5} label="Provisions logement" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-label', 'Provisions logement');
  });

  it('clamps negative value to 0', () => {
    const { container } = render(<Progress value={-0.5} />);
    expect(fillOf(container)?.getAttribute('width')).toBe('0');
  });
});
