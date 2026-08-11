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

import { FooterCTA } from '../FooterCTA';

async function renderFooterCTA() {
  return render(await FooterCTA());
}

describe('<FooterCTA />', () => {
  it('renders the H2 with lead + serif italic highlight closing on the thesis word', async () => {
    await renderFooterCTA();
    const h2 = screen.getByRole('heading', { level: 2 });
    expect(h2.textContent).toContain('Commence par ce qui est');
    // PR L3 : « déjà à toi. » → « déjà engagé. » — le premier geste dans
    // Ankora est de saisir ses charges engagées, et le bookend hero
    // (« déjà engagé ») ↔ footer se referme sur le mot de la thèse.
    expect(h2.textContent).toContain('déjà engagé.');
    const em = h2.querySelector('em');
    expect(em?.textContent).toBe('déjà engagé.');
  });

  // Renommé : ce test s'appelait « FSMA-safe trial caveat » et exigeait
  // « 30 jours d'essai ». Deux erreurs en une. La FSMA encadre le conseil en
  // placement, pas la durée d'un essai — le nom donnait à une formule
  // commerciale l'apparence d'un garde-fou réglementaire. Et la formule
  // contredisait QUATRE affirmations de la section Tarifs, qui promettent
  // « sans date limite », « pas de limite de temps » et « à vie ».
  it('annonce la gratuité de la Phase 1, sans promettre un essai limité', async () => {
    await renderFooterCTA();
    expect(screen.getByText(/Gratuit pendant la Phase 1/i)).toBeInTheDocument();
    // Garde-fou contre le retour de la contradiction, pas seulement contre son absence.
    expect(screen.queryByText(/30 jours/i)).not.toBeInTheDocument();
  });

  it('renders the primary CTA pointing at /signup', async () => {
    await renderFooterCTA();
    expect(screen.getByRole('link', { name: /créer mon compte/i })).toHaveAttribute(
      'href',
      '/signup',
    );
  });

  it('exposes the section as a named landmark via aria-labelledby="footer-cta-heading"', async () => {
    await renderFooterCTA();
    const section = screen.getByRole('heading', { level: 2 }).closest('section');
    expect(section).toHaveAttribute('aria-labelledby', 'footer-cta-heading');
  });
});
