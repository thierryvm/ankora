import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { AnkButton } from '../AnkButton';

describe('<AnkButton /> (atom CD#3)', () => {
  it('renders a <button> element', () => {
    render(<AnkButton>Click me</AnkButton>);
    expect(screen.getByRole('button', { name: 'Click me' }).tagName).toBe('BUTTON');
  });

  it('applies default variant=primary + size=md', () => {
    render(<AnkButton>Test</AnkButton>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('atm-btn--primary');
    expect(btn.className).toContain('atm-btn--md');
  });

  it.each([
    ['primary', 'atm-btn--primary'],
    ['secondary', 'atm-btn--secondary'],
    ['ghost', 'atm-btn--ghost'],
    ['destructive', 'atm-btn--destructive'],
  ] as const)('applies variant %s', (variant, cls) => {
    render(<AnkButton variant={variant}>X</AnkButton>);
    expect(screen.getByRole('button').className).toContain(cls);
  });

  it.each([
    ['sm', 'atm-btn--sm'],
    ['md', 'atm-btn--md'],
    ['lg', 'atm-btn--lg'],
  ] as const)('applies size %s', (size, cls) => {
    render(<AnkButton size={size}>X</AnkButton>);
    expect(screen.getByRole('button').className).toContain(cls);
  });

  it('shows spinner when loading', () => {
    const { container } = render(<AnkButton loading>Loading…</AnkButton>);
    expect(container.querySelector('.atm-btn-spin')).toBeTruthy();
  });

  it('disables button when loading', () => {
    render(<AnkButton loading>Loading…</AnkButton>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('renders icon left and label', () => {
    render(<AnkButton icon={<span data-testid="icon-left">⬇</span>}>Save</AnkButton>);
    expect(screen.getByTestId('icon-left')).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeInTheDocument();
  });

  it('renders icon-only with aria-label', () => {
    render(<AnkButton icon={<span>⬇</span>} aria-label="Download" />);
    const btn = screen.getByRole('button', { name: 'Download' });
    expect(btn.className).toContain('atm-btn--icon-only');
  });

  it('does not call onClick when disabled', () => {
    const onClick = vi.fn();
    render(
      <AnkButton disabled onClick={onClick}>
        X
      </AnkButton>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('does not call onClick when loading', () => {
    const onClick = vi.fn();
    render(
      <AnkButton loading onClick={onClick}>
        X
      </AnkButton>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('forwards ref to <button>', () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(<AnkButton ref={ref}>X</AnkButton>);
    expect(ref.current?.tagName).toBe('BUTTON');
  });

  it('calls onClick when active', () => {
    const onClick = vi.fn();
    render(<AnkButton onClick={onClick}>X</AnkButton>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
