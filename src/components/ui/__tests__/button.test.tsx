import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { Button, buttonVariants } from '../button';

describe('<Button />', () => {
  it('renders a <button> by default', () => {
    render(<Button>Click me</Button>);
    const button = screen.getByRole('button', { name: 'Click me' });
    expect(button.tagName).toBe('BUTTON');
  });

  it('applies the default variant + size classes', () => {
    render(<Button>Default</Button>);
    const button = screen.getByRole('button');
    // default variant = brand-700 background; default size = h-10 px-4
    expect(button.className).toContain('bg-brand-700');
    expect(button.className).toContain('h-10');
  });

  it.each([
    ['default', 'bg-brand-700'],
    ['destructive', 'bg-danger'],
    ['outline', 'border-border'],
    ['secondary', 'bg-brand-100'],
    ['ghost', 'text-foreground'],
    ['link', 'underline-offset-4'],
  ] as const)('applies the %s variant', (variant, expectedClass) => {
    render(<Button variant={variant}>Test</Button>);
    expect(screen.getByRole('button').className).toContain(expectedClass);
  });

  it.each([
    ['sm', 'h-9'],
    ['lg', 'h-12'],
    ['icon', 'w-10'],
  ] as const)('applies the %s size', (size, expectedClass) => {
    render(<Button size={size}>Test</Button>);
    expect(screen.getByRole('button').className).toContain(expectedClass);
  });

  it('respects disabled and prevents click handlers', () => {
    const handleClick = vi.fn();
    render(
      <Button disabled onClick={handleClick}>
        Disabled
      </Button>,
    );
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('renders as a slotted child when asChild is true', () => {
    render(
      <Button asChild>
        {/* External href so @next/next/no-html-link-for-pages doesn't flag this test */}
        <a href="https://example.com/external">Open cockpit</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Open cockpit' });
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', 'https://example.com/external');
    // cva variant classes still applied to the slotted element
    expect(link.className).toContain('bg-brand-700');
  });

  it('exposes buttonVariants as a class generator', () => {
    expect(typeof buttonVariants).toBe('function');
    expect(buttonVariants({ variant: 'destructive', size: 'sm' })).toContain('bg-danger');
  });
});
