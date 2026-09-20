import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../select';
import { Input } from '../input';

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
    // rest + hover. Socle v3 (lot 1) : la limite au repos passe de
    // `border-border` a `border-border-control`, et le fond de la carte a la
    // surface de controle. L'attendu suit la DECISION, pas le resultat : ce
    // qu'il verrouille est la PARITE avec Input, et elle est verifiee plus bas
    // en lisant les classes reelles d'un Input rendu cote a cote.
    expect(classes).toContain('border-border-control');
    expect(classes).toContain('bg-control');
    expect(classes).toContain('hover:border-brand-500/40');
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

  // Le cas ci-dessus nomme des classes une par une : il dit CE QUE porte le
  // declencheur, pas qu'il porte LA MEME CHOSE que le champ. La parite « 1:1 »
  // que la JSDoc de `select.tsx` promet n'etait donc verifiee par personne —
  // on pouvait faire evoluer Input seul et garder la suite verte.
  //
  // Ce cas la mesure : il rend un Input a cote et compare les classes qui
  // portent le contrat partage. Il a echoue avant d'etre ecrit (Select portait
  // encore `border-border` quand Input avait pris `border-border-control`).
  it('porte exactement les memes classes de contrat que <Input />', () => {
    render(
      <>
        <Input aria-label="Champ" />
        <Select>
          <SelectTrigger aria-label="Declencheur">
            <SelectValue placeholder="x" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="x">x</SelectItem>
          </SelectContent>
        </Select>
      </>,
    );

    const duChamp = new Set(screen.getByLabelText('Champ').className.split(/\s+/));
    const duDeclencheur = new Set(screen.getByLabelText('Declencheur').className.split(/\s+/));

    // Ce qui doit etre identique : la surface, la limite, le rayon, le focus,
    // l'etat invalide et l'etat eteint. Ce qui n'y est pas (la mise en page du
    // declencheur, son chevron) leur appartient en propre.
    const contrat = [
      'border-border-control',
      'bg-control',
      'rounded-md',
      'hover:border-brand-500/40',
      'focus-visible:border-brand-600',
      'focus-visible:outline-none',
      'aria-invalid:border-danger',
      'aria-invalid:focus-visible:ring-2',
      'disabled:bg-surface-muted',
      'disabled:text-muted-foreground',
    ];

    for (const classe of contrat) {
      expect(duChamp, `Input ne porte pas ${classe}`).toContain(classe);
      expect(duDeclencheur, `SelectTrigger ne porte pas ${classe}`).toContain(classe);
    }
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
