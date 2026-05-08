import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { Button } from '../Button';

describe('<Button /> (atom CD#3)', () => {
  it('renders a <button> element', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' }).tagName).toBe('BUTTON');
  });

  it('applies default variant=primary + size=md', () => {
    render(<Button>Test</Button>);
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
    render(<Button variant={variant}>X</Button>);
    expect(screen.getByRole('button').className).toContain(cls);
  });

  it.each([
    ['sm', 'atm-btn--sm'],
    ['md', 'atm-btn--md'],
    ['lg', 'atm-btn--lg'],
  ] as const)('applies size %s', (size, cls) => {
    render(<Button size={size}>X</Button>);
    expect(screen.getByRole('button').className).toContain(cls);
  });

  it('shows spinner when loading', () => {
    const { container } = render(<Button loading>Loading…</Button>);
    expect(container.querySelector('.atm-btn-spin')).toBeTruthy();
  });

  it('disables button when loading', () => {
    render(<Button loading>Loading…</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('renders icon left and label', () => {
    render(<Button icon={<span data-testid="icon-left">⬇</span>}>Save</Button>);
    expect(screen.getByTestId('icon-left')).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeInTheDocument();
  });

  it('renders icon-only with aria-label', () => {
    render(<Button icon={<span>⬇</span>} aria-label="Download" />);
    const btn = screen.getByRole('button', { name: 'Download' });
    expect(btn.className).toContain('atm-btn--icon-only');
  });

  it('does not call onClick when disabled', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        X
      </Button>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('does not call onClick when loading', () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        X
      </Button>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('forwards ref to <button>', () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(<Button ref={ref}>X</Button>);
    expect(ref.current?.tagName).toBe('BUTTON');
  });

  it('calls onClick when active', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>X</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
