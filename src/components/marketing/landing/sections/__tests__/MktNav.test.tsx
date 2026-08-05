import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import messages from '../../../../../../messages/fr-BE.json';

// MktNav now reads the session server-side via getOptionalUser so the CTAs
// can switch from login/signup to "My cockpit" when the visitor is logged
// in. Mock with a mutable ref so each test can pick its own session state.
const optionalUserRef = { value: null as null | { id: string } };
vi.mock('@/lib/auth/require-user', () => ({
  getOptionalUser: async () => optionalUserRef.value,
}));

function setOptionalUser(value: null | { id: string }): void {
  optionalUserRef.value = value;
}

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

vi.mock('@/components/layout/HeaderNav', () => ({
  HeaderNav: ({ variant, isAuthenticated }: { variant: string; isAuthenticated?: boolean }) => (
    <div
      data-testid="header-nav-mock"
      data-variant={variant}
      data-is-authenticated={String(isAuthenticated ?? false)}
    />
  ),
}));

vi.mock('@/components/brand/AnkoraLogo', () => ({
  AnkoraLogo: ({ className }: { className?: string }) => (
    <svg data-testid="ankora-logo" className={className} />
  ),
}));

import { MktNav } from '../MktNav';

async function renderMktNav() {
  const ui = await MktNav();
  return render(ui);
}

describe('<MktNav />', () => {
  beforeEach(() => {
    setOptionalUser(null);
  });

  it('renders the Ankora logo as the home link', async () => {
    await renderMktNav();
    const home = screen.getByLabelText('Accueil Ankora');
    expect(home).toHaveAttribute('href', '/');
    expect(screen.getByTestId('ankora-logo')).toBeInTheDocument();
  });

  it('renders the marketing nav links pointing at section anchors', async () => {
    await renderMktNav();
    expect(screen.getByRole('link', { name: 'Produit' })).toHaveAttribute('href', '#principles');
    expect(screen.getByRole('link', { name: 'Simulateur' })).toHaveAttribute('href', '#simulator');
  });

  // La section Tarifs est supprimee (2026-08-05) : une carte avec un prix, une
  // liste de features et un bouton EST une offre commerciale, meme a 0 EUR.
  // L'assertion est negative pour que l'ancre ne puisse pas revenir seule et
  // pointer dans le vide — un lien de navigation vers une section absente est
  // un lien mort, et ce depot vient d'en corriger deux.
  it('advertises no pricing section, and no anchor pointing at one', async () => {
    const { container } = await renderMktNav();
    expect(screen.queryByRole('link', { name: /tarifs|pricing/i })).not.toBeInTheDocument();
    expect(container.querySelector('a[href="#pricing"]')).toBeNull();
  });

  it('PR-UX-1: does NOT render Sécurité / Journal in the main nav (benchmark Monarch/YNAB/Copilot)', async () => {
    await renderMktNav();
    // Removed entirely — disabled placeholders were misleading and competitors
    // (Monarch, YNAB, Copilot) do not surface them at top level either. The
    // FSMA/legal footprint stays in the footer via `footer.security`.
    expect(screen.queryByRole('link', { name: 'Sécurité' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Journal' })).not.toBeInTheDocument();
    expect(screen.queryByText('Sécurité')).not.toBeInTheDocument();
    expect(screen.queryByText('Journal')).not.toBeInTheDocument();
  });

  it('renders the Login + Signup CTAs for anonymous visitors', async () => {
    await renderMktNav();
    expect(screen.getByRole('link', { name: 'Se connecter' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: /créer mon compte/i })).toHaveAttribute(
      'href',
      '/signup',
    );
    // « Mon cockpit » est le CTA de l'AUTHENTIFIE, vers /app. Il ne doit pas
    // apparaitre pour un visiteur anonyme — et c'est cette assertion qui a
    // attrape une collision reelle : le libelle d'inscription avait ete mis a
    // « Ouvrir mon cockpit », dont le nom accessible contient « mon cockpit ».
    // Deux liens de destinations differentes portaient le meme nom pour un
    // lecteur d'ecran. Le libelle d'inscription dit maintenant ce qu'il fait.
    expect(screen.queryByRole('link', { name: /mon cockpit/i })).not.toBeInTheDocument();
  });

  it('renders the "Mon cockpit" CTA instead of login/signup when the visitor has a session', async () => {
    setOptionalUser({ id: 'user-thierry' });
    await renderMktNav();
    expect(screen.getByRole('link', { name: /mon cockpit/i })).toHaveAttribute('href', '/app');
    expect(screen.queryByRole('link', { name: 'Se connecter' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /créer mon compte/i })).not.toBeInTheDocument();
  });

  it('mounts the existing HeaderNav drawer for mobile parity', async () => {
    await renderMktNav();
    const drawer = screen.getByTestId('header-nav-mock');
    expect(drawer).toBeInTheDocument();
    expect(drawer).toHaveAttribute('data-variant', 'marketing');
  });

  it('propagates isAuthenticated to the drawer so mobile stays consistent', async () => {
    setOptionalUser({ id: 'user-thierry' });
    await renderMktNav();
    const drawer = screen.getByTestId('header-nav-mock');
    expect(drawer).toHaveAttribute('data-is-authenticated', 'true');
  });

  it('exposes the main navigation with a localised aria-label', async () => {
    await renderMktNav();
    expect(screen.getByRole('navigation', { name: 'Navigation principale' })).toBeInTheDocument();
  });
});
