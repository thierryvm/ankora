import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';

import { Input } from '../input';

describe('<Input />', () => {
  it('renders an input element with the given type', () => {
    render(<Input type="email" placeholder="Email" />);
    const input = screen.getByPlaceholderText('Email');
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe('INPUT');
    expect(input).toHaveAttribute('type', 'email');
  });

  it('respects the disabled prop', () => {
    render(<Input disabled placeholder="Disabled" />);
    const input = screen.getByPlaceholderText('Disabled');
    expect(input).toBeDisabled();
  });

  it('flags invalid state via aria-invalid', () => {
    render(<Input aria-invalid placeholder="Invalid" />);
    const input = screen.getByPlaceholderText('Invalid');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('updates as a controlled component', () => {
    function Controlled() {
      const [value, setValue] = useState('');
      return (
        <Input
          aria-label="controlled"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      );
    }
    render(<Controlled />);
    const input = screen.getByLabelText('controlled') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'hello' } });
    expect(input.value).toBe('hello');
  });

  // PR-UI-1 (THI-298) — focus is a single thin `border-brand-600` (WCAG 2.4.11
  // conformant as the sole indicator), NO ring halo (@thierry: the 2px ring
  // read as a thick frame). Guards against the previous ring-based contracts.
  it('uses a thin focus border only (brand-600, no ring)', () => {
    render(<Input placeholder="focus-test" />);
    const input = screen.getByPlaceholderText('focus-test');
    // Token-exact check: a ring on a *valid* focus would be the bare
    // `focus-visible:ring-2` token. The danger ring is `aria-invalid:focus-...`
    // so a substring check would false-positive — split into exact classes.
    const classes = input.className.split(/\s+/);
    expect(classes).toContain('focus-visible:border-brand-600');
    expect(classes).toContain('focus-visible:outline-none');
    expect(classes).not.toContain('focus-visible:ring-2');
    expect(classes).not.toContain('focus-visible:ring-brand-500/50');
    expect(classes).not.toContain('focus-visible:ring-brand-500/30');
    expect(classes).not.toContain('focus-visible:border-brand-700');
    expect(classes).not.toContain('focus-visible:border-transparent');
  });

  // PR-UI-1 (THI-298) — at rest the field keeps a full border (affordance),
  // with a subtle brand hint on hover. Thinning the rest border was rejected
  // (broke affordance on the dark shell).
  it('keeps a full rest border with a subtle brand hover hint', () => {
    render(<Input placeholder="rest-test" />);
    const input = screen.getByPlaceholderText('rest-test');
    expect(input.className).toContain('border-border');
    expect(input.className).toContain('hover:border-brand-500/40');
  });

  // PR-UI-1 (THI-298) — the invalid state must survive the focus contract:
  // `border-transparent` on focus must NOT erase the danger border. We assert
  // the presence of all three invalid classes (anti-accidental-removal). The
  // real cascade override is proven by the live-test, not jsdom (which does
  // not compute source-order CSS specificity).
  it('preserves the aria-invalid danger border/ring across rest and focus', () => {
    render(<Input aria-invalid placeholder="invalid-test" />);
    const input = screen.getByPlaceholderText('invalid-test');
    // The Tailwind variants only fire when aria-invalid is actually on the
    // node — assert the attribute first so the test covers the state end-to-end.
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.className).toContain('aria-invalid:border-danger');
    expect(input.className).toContain('aria-invalid:focus-visible:border-danger');
    expect(input.className).toContain('aria-invalid:focus-visible:ring-danger');
  });

  // PR-UI-2 — type="number" must hide the webkit spin buttons AND force
  // appearance: textfield so the wheel/scroll cannot bump the amount.
  it('disables the scroll-spin behaviour on type="number"', () => {
    render(<Input type="number" placeholder="amount" />);
    const input = screen.getByPlaceholderText('amount');
    expect(input.className).toContain('[appearance:textfield]');
    expect(input.className).toContain('[&::-webkit-inner-spin-button]:appearance-none');
    expect(input.className).toContain('[&::-webkit-outer-spin-button]:appearance-none');
  });

  // PR-UI-2 — non-number inputs must NOT carry the textfield-appearance
  // override, so checkbox / radio / range / color keep their native UI.
  it('does not strip the native UI from non-numeric types', () => {
    render(<Input type="text" placeholder="text-test" />);
    const input = screen.getByPlaceholderText('text-test');
    expect(input.className).not.toContain('[appearance:textfield]');
    expect(input.className).not.toContain('[&::-webkit-inner-spin-button]');
  });

  // PR-UI-2 — propagate `color-scheme: dark` on the `[data-theme="dark"]`
  // shell so the native calendar/time icons stay visible (they default to
  // black-on-black otherwise). Tailwind 4 canonical: `dark:scheme-dark`.
  it('opts every input into the dark color-scheme on dark theme', () => {
    render(<Input type="date" placeholder="date-test" />);
    const input = screen.getByPlaceholderText('date-test');
    expect(input.className).toContain('dark:scheme-dark');
  });
});
