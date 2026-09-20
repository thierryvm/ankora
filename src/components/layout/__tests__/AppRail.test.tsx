import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { AppRail } from '../AppRail';
import { APP_DESTINATIONS } from '../app-destinations';

/**
 * Le rail est la surface de navigation du bureau depuis le lot 1 du socle v3.
 *
 * Ces cas ne sont pas neufs au sens de la couverture : ils REPRENNENT ce que
 * `Header.test.tsx` vérifiait avant que les destinations quittent la barre
 * haute. Une couverture qui déménage doit arriver quelque part, sinon elle
 * disparaît — et elle disparaît en silence, puisque la suite reste verte.
 */

const pathnameRef = { value: '/app' };

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameRef.value,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe('<AppRail />', () => {
  it('porte les SIX destinations du registre, avec leurs routes', () => {
    render(<AppRail />);
    const liens = screen.getAllByRole('link');

    expect(liens).toHaveLength(APP_DESTINATIONS.length);
    for (const destination of APP_DESTINATIONS) {
      expect(
        liens.some((lien) => lien.getAttribute('href') === destination.href),
        `aucun lien du rail ne pointe vers ${destination.href}`,
      ).toBe(true);
    }
  });

  it('marque la destination courante, et une seule', () => {
    pathnameRef.value = '/app/charges';
    render(<AppRail />);

    const courants = screen
      .getAllByRole('link')
      .filter((lien) => lien.getAttribute('aria-current') === 'page');
    expect(courants).toHaveLength(1);
    expect(courants[0]?.getAttribute('href')).toBe('/app/charges');
  });

  it('ne marque le cockpit que sur /app exactement', () => {
    // `/app` est en correspondance EXACTE dans le registre : sans cela il
    // s'allumerait sur chaque sous-route, et deux destinations seraient
    // courantes à la fois.
    pathnameRef.value = '/app/expenses';
    render(<AppRail />);

    const cockpit = screen
      .getAllByRole('link')
      .find((lien) => lien.getAttribute('href') === '/app');
    expect(cockpit?.getAttribute('aria-current')).toBeNull();
  });

  it('dit l’état courant autrement que par la couleur seule', () => {
    // Une couleur seule ne se lit ni au lecteur d'écran, ni en mode contrastes
    // forcés. Le rail pose `aria-current` ET un filet, pas seulement une teinte.
    pathnameRef.value = '/app';
    render(<AppRail />);

    const cockpit = screen
      .getAllByRole('link')
      .find((lien) => lien.getAttribute('href') === '/app');
    expect(cockpit?.getAttribute('aria-current')).toBe('page');
    expect(cockpit?.className).toContain('before:bg-brand-text');
  });
});
