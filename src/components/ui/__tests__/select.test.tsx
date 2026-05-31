import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../select';

/**
 * Radix Select uses a portal + pointer events that don't fully work under
 * jsdom. We test the trigger surface (always rendered) and assert the
 * composition is wired correctly. Open/close behavior is covered by
 * Playwright E2E (not Vitest).
 */
describe('<Select /> composition', () => {
  it('renders the trigger with the placeholder when no value is selected', () => {
    render(
      <Select>
        <SelectTrigger aria-label="Compte">
          <SelectValue placeholder="Choisir un compte" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="courant">Compte courant</SelectItem>
          <SelectItem value="epargne">Compte épargne</SelectItem>
        </SelectContent>
      </Select>,
    );
    const trigger = screen.getByLabelText('Compte');
    expect(trigger).toBeInTheDocument();
    expect(trigger.textContent).toContain('Choisir un compte');
  });

  it('renders the selected value when defaultValue is set', () => {
    render(
      <Select defaultValue="epargne">
        <SelectTrigger aria-label="Compte">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="courant">Compte courant</SelectItem>
          <SelectItem value="epargne">Compte épargne</SelectItem>
        </SelectContent>
      </Select>,
    );
    const trigger = screen.getByLabelText('Compte');
    expect(trigger.textContent).toContain('Compte épargne');
  });

  it('respects the disabled prop on the trigger', () => {
    render(
      <Select disabled>
        <SelectTrigger aria-label="Disabled select">
          <SelectValue placeholder="Indisponible" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="x">x</SelectItem>
        </SelectContent>
      </Select>,
    );
    const trigger = screen.getByLabelText('Disabled select');
    expect(trigger).toBeDisabled();
  });

  // PR-UI-1 (THI-298) — the trigger mirrors Input.tsx 1:1: full rest border +
  // subtle brand hover, focus = a single thin `border-brand-600` (no ring), and
  // a loud aria-invalid danger border + ring on invalid+focus. jsdom asserts
  // class presence only; the cascade override is proven by the live-test.
  it('mirrors the Input field contract on focus/hover/invalid', () => {
    render(
      <Select>
        <SelectTrigger aria-label="Contract">
          <SelectValue placeholder="x" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="x">x</SelectItem>
        </SelectContent>
      </Select>,
    );
    const trigger = screen.getByLabelText('Contract');
    const classes = trigger.className.split(/\s+/);
    // rest + hover
    expect(classes).toContain('border-border');
    expect(classes).toContain('hover:border-brand-500/40');
    expect(classes).toContain('transition-colors');
    // focus = thin border only, no ring (token-exact: the danger ring shares
    // the `focus-visible:ring-2` suffix, so check exact tokens not substrings)
    expect(classes).toContain('focus-visible:border-brand-600');
    expect(classes).toContain('focus-visible:outline-none');
    expect(classes).not.toContain('focus-visible:ring-2');
    expect(classes).not.toContain('focus-visible:ring-brand-500/50');
    expect(classes).not.toContain('focus-visible:border-brand-700');
    expect(classes).not.toContain('focus-visible:border-transparent');
    // invalid stays loud: danger border + re-anchored danger ring on focus
    expect(classes).toContain('aria-invalid:border-danger');
    expect(classes).toContain('aria-invalid:focus-visible:border-danger');
    expect(classes).toContain('aria-invalid:focus-visible:ring-2');
    expect(classes).toContain('aria-invalid:focus-visible:ring-danger');
  });

  // PR-UI-1 (THI-298) — mirror the Input end-to-end invalid test: the Tailwind
  // `aria-invalid:*` variants only fire when the attribute reaches the DOM.
  // `aria-invalid` goes on the SelectTrigger (which spreads props onto the
  // underlying button), NOT on the Radix `Select` Root (not a DOM node).
  it('forwards aria-invalid to the trigger and keeps the danger contract', () => {
    render(
      <Select>
        <SelectTrigger aria-label="Invalid select" aria-invalid>
          <SelectValue placeholder="x" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="x">x</SelectItem>
        </SelectContent>
      </Select>,
    );
    const trigger = screen.getByLabelText('Invalid select');
    expect(trigger).toHaveAttribute('aria-invalid', 'true');
    expect(trigger.className).toContain('aria-invalid:border-danger');
    expect(trigger.className).toContain('aria-invalid:focus-visible:border-danger');
    expect(trigger.className).toContain('aria-invalid:focus-visible:ring-danger');
  });
});
