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
});
