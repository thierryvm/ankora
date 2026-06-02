import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { AllocationBar } from '../AllocationBar';

describe('<AllocationBar />', () => {
  it('renders one <rect> per segment with cumulative x offsets', () => {
    render(
      <AllocationBar
        ariaLabel="Répartition test"
        segments={[
          { key: 'a', ratio: 0.5, fill: 'var(--color-info)' },
          { key: 'b', ratio: 0.25, fill: 'var(--color-success)' },
        ]}
      />,
    );
    const a = screen.getByTestId('allocation-segment-a');
    const b = screen.getByTestId('allocation-segment-b');
    expect(a.getAttribute('x')).toBe('0');
    expect(a.getAttribute('width')).toBe('50');
    expect(b.getAttribute('x')).toBe('50');
    expect(b.getAttribute('width')).toBe('25');
  });

  it('exposes the accessible breakdown via role=img + aria-label', () => {
    render(
      <AllocationBar
        ariaLabel="Répartition de tes revenus"
        segments={[{ key: 'a', ratio: 1, fill: 'var(--color-danger)' }]}
      />,
    );
    expect(screen.getByRole('img', { name: 'Répartition de tes revenus' })).toBeInTheDocument();
  });

  it('clamps a ratio above 1 to width 100 and never overflows the cursor', () => {
    render(
      <AllocationBar
        ariaLabel="Clamp"
        segments={[
          { key: 'a', ratio: 1.3, fill: 'var(--color-info)' },
          { key: 'b', ratio: 0.4, fill: 'var(--color-success)' },
        ]}
      />,
    );
    expect(screen.getByTestId('allocation-segment-a').getAttribute('width')).toBe('100');
    // cursor already at 100 → second segment starts at 100, width clamped to 0.
    expect(screen.getByTestId('allocation-segment-b').getAttribute('x')).toBe('100');
    expect(screen.getByTestId('allocation-segment-b').getAttribute('width')).toBe('0');
  });

  it('uses NO inline style attribute (CSP strict — geometry via SVG attrs only)', () => {
    const { container } = render(
      <AllocationBar
        ariaLabel="No style"
        segments={[{ key: 'a', ratio: 0.5, fill: 'var(--color-info)' }]}
      />,
    );
    expect(container.querySelector('[style]')).toBeNull();
  });
});
