import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Chip } from '../Chip';

describe('<Chip />', () => {
  it('renders label', () => {
    render(<Chip label="Test" />);
    expect(screen.getByText('Test')).toBeInTheDocument();
  });

  it('applies color via inline style (color-mix background + border)', () => {
    render(<Chip label="Brand" color="#14b8a6" />);
    const span = screen.getByText('Brand').parentElement!;
    const style = span.getAttribute('style') ?? '';
    expect(style).toContain('color-mix');
    // jsdom normalises hex → rgb; accept either form
    const hasTeal = style.includes('#14b8a6') || style.includes('rgb(20, 184, 166)');
    expect(hasTeal).toBe(true);
  });

  it('uses fallback grey when no color provided', () => {
    render(<Chip label="X" />);
    const span = screen.getByText('X').parentElement!;
    const style = span.getAttribute('style') ?? '';
    // jsdom normalises hex → rgb; accept either form
    const hasGrey = style.includes('#94a3b8') || style.includes('rgb(148, 163, 184)');
    expect(hasGrey).toBe(true);
  });

  it.each([
    ['s', '11px'],
    ['m', '12px'],
    ['l', '13px'],
  ] as const)('applies size %s with font-size %s', (size, fs) => {
    render(<Chip label="X" size={size} />);
    const span = screen.getByText('X').parentElement!;
    expect(span.getAttribute('style')).toContain(fs);
  });

  it('renders emoji when provided', () => {
    render(<Chip label="Pizza" emoji="🍕" />);
    expect(screen.getByText('🍕')).toBeInTheDocument();
  });

  it('renders custom icon node', () => {
    render(<Chip label="X" icon={<span data-testid="custom-icon">⭐</span>} />);
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
  });

  it('shows close button when removable', () => {
    render(<Chip label="X" removable onRemove={() => {}} />);
    expect(screen.getByRole('button', { name: /retirer/i })).toBeInTheDocument();
  });

  it('calls onRemove when close button clicked', () => {
    const onRemove = vi.fn();
    render(<Chip label="X" removable onRemove={onRemove} />);
    fireEvent.click(screen.getByRole('button', { name: /retirer/i }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('does not render close button when not removable', () => {
    render(<Chip label="X" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
