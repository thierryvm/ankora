import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Avatar } from '../Avatar';

describe('<Avatar /> (atom CD#3)', () => {
  it.each([
    ['xs', 20],
    ['sm', 28],
    ['md', 36],
    ['lg', 44],
    ['xl', 56],
  ] as const)('applies size %s with width/height %d px (inline)', (size, px) => {
    const { container } = render(<Avatar size={size} initials="TM" />);
    const root = container.querySelector('.atm-avatar') as HTMLElement | null;
    expect(root).not.toBeNull();
    expect(root?.style.width).toBe(`${px}px`);
    expect(root?.style.height).toBe(`${px}px`);
  });

  it('defaults to size md (36px) when size not provided', () => {
    const { container } = render(<Avatar initials="TM" />);
    const root = container.querySelector('.atm-avatar') as HTMLElement | null;
    expect(root?.style.width).toBe('36px');
  });

  it('applies rounded shape (default) using --radius-md token', () => {
    const { container } = render(<Avatar initials="TM" />);
    const root = container.querySelector('.atm-avatar') as HTMLElement | null;
    expect(root?.style.borderRadius).toBe('var(--radius-md)');
  });

  it('applies circle shape with 50% border-radius', () => {
    const { container } = render(<Avatar initials="TM" shape="circle" />);
    const root = container.querySelector('.atm-avatar') as HTMLElement | null;
    expect(root?.style.borderRadius).toBe('50%');
  });

  it('renders emoji as text node when emoji prop provided', () => {
    render(<Avatar emoji="🍕" />);
    expect(screen.getByText('🍕')).toBeInTheDocument();
  });

  it('renders icon ReactNode when emoji not provided', () => {
    render(<Avatar icon={<span data-testid="custom-icon">★</span>} />);
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
  });

  it('renders initials when neither emoji nor icon provided', () => {
    render(<Avatar initials="TM" />);
    expect(screen.getByText('TM')).toBeInTheDocument();
  });

  it('priority emoji > icon: renders emoji and not icon when both supplied', () => {
    render(<Avatar emoji="🍕" icon={<span data-testid="custom-icon">★</span>} />);
    expect(screen.getByText('🍕')).toBeInTheDocument();
    expect(screen.queryByTestId('custom-icon')).not.toBeInTheDocument();
  });

  it('priority emoji > initials: emoji wins over initials', () => {
    render(<Avatar emoji="🍕" initials="TM" />);
    expect(screen.getByText('🍕')).toBeInTheDocument();
    expect(screen.queryByText('TM')).not.toBeInTheDocument();
  });

  it('priority icon > initials: icon wins when no emoji', () => {
    render(<Avatar icon={<span data-testid="custom-icon">★</span>} initials="TM" />);
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
    expect(screen.queryByText('TM')).not.toBeInTheDocument();
  });

  it('applies color-mix background using provided hex color', () => {
    const { container } = render(<Avatar initials="TM" color="#14b8a6" />);
    const root = container.querySelector('.atm-avatar') as HTMLElement | null;
    const style = root?.getAttribute('style') ?? '';
    expect(style).toContain('color-mix');
    // jsdom normalises hex → rgb; accept either form
    const hasTeal = style.includes('#14b8a6') || style.includes('rgb(20, 184, 166)');
    expect(hasTeal).toBe(true);
  });

  it('uses fallback color #94a3b8 when no color provided', () => {
    const { container } = render(<Avatar initials="TM" />);
    const root = container.querySelector('.atm-avatar') as HTMLElement | null;
    const style = root?.getAttribute('style') ?? '';
    const hasGrey = style.includes('#94a3b8') || style.includes('rgb(148, 163, 184)');
    expect(hasGrey).toBe(true);
  });

  it('exposes role="img" + aria-label when label prop provided', () => {
    render(<Avatar initials="TM" label="Thierry Mottet" />);
    const img = screen.getByRole('img', { name: 'Thierry Mottet' });
    expect(img).toBeInTheDocument();
  });

  it('does not expose role when label not provided', () => {
    const { container } = render(<Avatar initials="TM" />);
    const root = container.querySelector('.atm-avatar') as HTMLElement | null;
    expect(root?.getAttribute('role')).toBeNull();
    expect(root?.getAttribute('aria-label')).toBeNull();
  });

  it('font-size on root scales to ~50% of px (md=36 → 18px)', () => {
    const { container } = render(<Avatar emoji="🍕" size="md" />);
    const root = container.querySelector('.atm-avatar') as HTMLElement | null;
    expect(root?.style.fontSize).toBe('18px');
  });

  it('initials sub-span font-size scales to ~40% of px (md=36 → 14px)', () => {
    const { container } = render(<Avatar initials="TM" size="md" />);
    const init = container.querySelector('.atm-avatar-init') as HTMLElement | null;
    expect(init).not.toBeNull();
    expect(init?.style.fontSize).toBe('14px');
  });

  it('font-size scaling at xl (56 → 28px root, 22px initials)', () => {
    const { container } = render(<Avatar initials="TM" size="xl" />);
    const root = container.querySelector('.atm-avatar') as HTMLElement | null;
    const init = container.querySelector('.atm-avatar-init') as HTMLElement | null;
    expect(root?.style.fontSize).toBe('28px');
    // round(56 * 0.4) = round(22.4) = 22
    expect(init?.style.fontSize).toBe('22px');
  });
});
