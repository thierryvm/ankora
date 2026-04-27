import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Num } from '../num';

describe('<Num />', () => {
  it('renders a <span> with the default md class (.num-md)', () => {
    render(<Num>1 234</Num>);
    const el = screen.getByText('1 234');
    expect(el.tagName).toBe('SPAN');
    expect(el.className).toContain('num-md');
  });

  it.each([
    ['xl', 'num-xl'],
    ['lg', 'num-lg'],
    ['md', 'num-md'],
  ] as const)('applies the %s size class (.%s)', (size, expected) => {
    render(<Num size={size}>42</Num>);
    expect(screen.getByText('42').className).toContain(expected);
  });

  it('falls back to font-mono + tabular-nums for size="sm" (no preset class)', () => {
    render(<Num size="sm">0.99</Num>);
    const cls = screen.getByText('0.99').className;
    expect(cls).toContain('font-mono');
    expect(cls).toContain('tabular-nums');
    expect(cls).not.toContain('num-md');
  });

  it('does not apply .num-accent by default', () => {
    render(<Num>500 €</Num>);
    expect(screen.getByText('500 €').className).not.toContain('num-accent');
  });

  it('applies .num-accent when tone="accent"', () => {
    render(<Num tone="accent">+1 200 €</Num>);
    expect(screen.getByText('+1 200 €').className).toContain('num-accent');
  });

  it('merges a custom className', () => {
    render(<Num className="mt-2">x</Num>);
    const cls = screen.getByText('x').className;
    expect(cls).toContain('num-md');
    expect(cls).toContain('mt-2');
  });
});
