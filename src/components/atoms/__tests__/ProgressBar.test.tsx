import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ProgressBar } from '../ProgressBar';

// The fill is now an SVG <rect>; its width is a viewBox-unit attribute (0..100),
// not an inline `style={{ width }}` (CSP-safe — THI-322). SVG elements expose
// `className` as an SVGAnimatedString, so we read `getAttribute('class')`.
const fillOf = (container: HTMLElement) =>
  container.querySelector('.atm-pbar-fill') as SVGRectElement | null;

describe('<ProgressBar /> (atom CD#3)', () => {
  it('renders progressbar role with default aria attributes', () => {
    render(<ProgressBar value={0.5} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(bar).toHaveAttribute('aria-valuenow', '50');
    expect(bar).toHaveAttribute('aria-label', 'Progression');
  });

  it('renders fill width 0 when value=0 (CSP-safe SVG rect, no inline style)', () => {
    const { container } = render(<ProgressBar value={0} />);
    const fill = fillOf(container);
    expect(fill).not.toBeNull();
    expect(fill?.getAttribute('width')).toBe('0');
    // Strict style-src compliance: no inline style attribute anywhere.
    expect(container.querySelector('[style]')).toBeNull();
  });

  it('renders fill width 100 when value equals max', () => {
    const { container } = render(<ProgressBar value={1} max={1} />);
    expect(fillOf(container)?.getAttribute('width')).toBe('100');
  });

  it('caps width at 100 when value > max and applies danger tone (auto)', () => {
    const { container } = render(<ProgressBar value={1.5} max={1} />);
    const fill = fillOf(container);
    expect(fill?.getAttribute('width')).toBe('100');
    expect(fill?.getAttribute('class')).toContain('atm-pbar--danger');
  });

  it('applies warning tone (auto) when ratio > 0.85 and ≤ 1', () => {
    const { container } = render(<ProgressBar value={0.86} max={1} />);
    expect(fillOf(container)?.getAttribute('class')).toContain('atm-pbar--warning');
  });

  it('applies brand tone (auto) when ratio < 0.85', () => {
    const { container } = render(<ProgressBar value={0.5} max={1} />);
    expect(fillOf(container)?.getAttribute('class')).toContain('atm-pbar--brand');
  });

  it.each([
    ['success', 'atm-pbar--success'],
    ['accent', 'atm-pbar--accent'],
    ['neutral', 'atm-pbar--neutral'],
    ['danger', 'atm-pbar--danger'],
  ] as const)('explicit tone %s overrides auto-tone', (tone, cls) => {
    const { container } = render(<ProgressBar value={0.5} tone={tone} />);
    expect(fillOf(container)?.getAttribute('class')).toContain(cls);
  });

  it('renders 2 fill segments in split mode with default tones', () => {
    const { container } = render(
      <ProgressBar value={0.8} max={1} split={{ affected: 0.6, free: 0.2 }} />,
    );
    const fills = container.querySelectorAll('.atm-pbar-fill');
    expect(fills.length).toBe(2);
    expect(fills[0]?.getAttribute('class')).toContain('atm-pbar--brand');
    expect(fills[0]?.getAttribute('width')).toBe('60');
    expect(fills[1]?.getAttribute('class')).toContain('atm-pbar--accent');
    expect(fills[1]?.getAttribute('width')).toBe('20');
  });

  it('respects explicit affectedTone / freeTone in split mode', () => {
    const { container } = render(
      <ProgressBar
        value={0.9}
        max={1}
        split={{ affected: 0.6, free: 0.3, affectedTone: 'warning', freeTone: 'success' }}
      />,
    );
    const fills = container.querySelectorAll('.atm-pbar-fill');
    expect(fills[0]?.getAttribute('class')).toContain('atm-pbar--warning');
    expect(fills[1]?.getAttribute('class')).toContain('atm-pbar--success');
  });

  it('renders percentage when showValue is true', () => {
    render(<ProgressBar value={0.42} showValue />);
    expect(screen.getByText('42%')).toBeInTheDocument();
  });

  it('renders custom valueLabel when provided', () => {
    render(<ProgressBar value={0.42} showValue valueLabel="420 € / 1000 €" />);
    expect(screen.getByText('420 € / 1000 €')).toBeInTheDocument();
  });

  it('renders cap divider when showCap is true', () => {
    const { container } = render(<ProgressBar value={1} showCap />);
    expect(container.querySelector('.atm-pbar-cap')).toBeTruthy();
  });

  it.each([
    ['sm', 6],
    ['md', 8],
    ['lg', 12],
  ] as const)('applies size %s via class + viewBox height %d (no inline style)', (size, height) => {
    const { container } = render(<ProgressBar value={0.5} size={size} />);
    const bar = container.querySelector('.atm-pbar');
    expect(bar?.getAttribute('class')).toContain(`atm-pbar--${size}`);
    const svg = container.querySelector('.atm-pbar-svg');
    expect(svg?.getAttribute('viewBox')).toBe(`0 0 100 ${height}`);
  });

  it('renders label and sub when provided', () => {
    render(<ProgressBar value={0.5} label="Reste disponible" sub="412 € / 1 000 €" />);
    expect(screen.getByText('Reste disponible')).toBeInTheDocument();
    expect(screen.getByText('412 € / 1 000 €')).toBeInTheDocument();
  });

  it('uses label as aria-label fallback when provided', () => {
    render(<ProgressBar value={0.5} label="Provisions logement" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-label', 'Provisions logement');
  });

  it('clamps negative value to 0', () => {
    const { container } = render(<ProgressBar value={-0.5} />);
    expect(fillOf(container)?.getAttribute('width')).toBe('0');
  });
});
