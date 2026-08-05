import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import messages from '../../../../../../messages/fr-BE.json';

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => {
    const ns = messages as Record<string, unknown>;
    let cursor: unknown = ns;
    for (const part of namespace.split('.')) {
      cursor = (cursor as Record<string, unknown>)[part];
    }
    return (key: string) => {
      const parts = key.split('.');
      let value: unknown = cursor;
      for (const part of parts) {
        if (typeof value === 'object' && value !== null && part in value) {
          value = (value as Record<string, unknown>)[part];
        } else {
          return key;
        }
      }
      return typeof value === 'string' ? value : key;
    };
  },
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@/components/brand/AnkoraLogo', () => ({
  AnkoraLogo: ({ className }: { className?: string }) => (
    <svg data-testid="ankora-logo" className={className} />
  ),
}));

// The cookie-preferences button is a client component reading the `footer`
// namespace through the client hook. Resolve it from the same fr-BE file the
// server mock uses, so the assertion below sees the real label rather than a
// stub — the point of the test is that this control is REACHABLE from the
// landing, and a stub would prove nothing about that.
vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => {
    const ns = (messages as Record<string, unknown>)[namespace] as Record<string, string>;
    return (key: string) => ns[key] ?? key;
  },
}));

vi.mock('@/components/gdpr/ConsentBanner', () => ({ reopenConsentBanner: vi.fn() }));

import { MktFooter } from '../MktFooter';

async function renderMktFooter() {
  return render(await MktFooter());
}

describe('<MktFooter />', () => {
  it('renders the small mono logo + copyright line', async () => {
    await renderMktFooter();
    expect(screen.getByTestId('ankora-logo')).toBeInTheDocument();
    expect(screen.getByText(/éditeur ancré à Bruxelles/i)).toBeInTheDocument();
  });

  it('points every legal link at the route its label names', async () => {
    await renderMktFooter();
    expect(screen.getByRole('link', { name: 'Conditions' })).toHaveAttribute('href', '/legal/cgu');
    expect(screen.getByRole('link', { name: 'Confidentialité' })).toHaveAttribute(
      'href',
      '/legal/privacy',
    );
    expect(screen.getByRole('link', { name: 'Cookies' })).toHaveAttribute('href', '/legal/cookies');
  });

  // Ce test exigeait `href="/"` pour un lien intitulé « Contact » — il
  // épinglait donc le défaut au lieu de l'interdire. L'assertion porte
  // maintenant sur ce qui rend le lien honnête : il doit mener AILLEURS que
  // sur la page courante, et vers un moyen de contact réel.
  it('renders Contact as a real contact means, never as a link back to the page itself', async () => {
    await renderMktFooter();
    const contact = screen.getByRole('link', { name: 'Contact' });
    const href = contact.getAttribute('href');
    expect(href).not.toBe('/');
    expect(href).toMatch(/^mailto:.+@.+\..+/);
  });

  // Une entrée grisée « Sécurité » pointant sur `#` annonçait une page que
  // l'issue #79 n'a jamais livrée. Elle est retirée : l'assertion négative
  // interdit son retour tant que la page n'existe pas — y compris sous forme
  // de placeholder, qui était précisément le problème.
  it('advertises no page that does not exist', async () => {
    const { container } = await renderMktFooter();
    expect(screen.queryByText('Sécurité')).not.toBeInTheDocument();
    expect(container.querySelector('[aria-disabled="true"]')).toBeNull();
    expect(container.querySelector('a[href="#"]')).toBeNull();
  });

  // RGPD art. 7(3) : retirer son consentement doit être aussi simple que le
  // donner. La landing est la page où il se donne — c'était la seule du site
  // où il ne pouvait pas se reprendre.
  it('exposes the cookie-preferences control on the landing itself', async () => {
    await renderMktFooter();
    expect(
      screen.getByRole('button', { name: /modifier mes préférences cookies/i }),
    ).toBeInTheDocument();
  });

  it('renders inside a <footer> landmark with a top border', async () => {
    const { container } = await renderMktFooter();
    const footer = container.querySelector('footer');
    expect(footer).not.toBeNull();
    expect(footer?.className).toContain('border-t');
  });
});
