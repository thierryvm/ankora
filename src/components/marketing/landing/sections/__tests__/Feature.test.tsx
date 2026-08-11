import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import messages from '../../../../../../messages/fr-BE.json';
import { FEATURE_WATERFALL_DEMO } from '../../constants';

vi.mock('next-intl/server', () => ({
  getLocale: async () => 'fr-BE',
  getTranslations: async (namespace: string) => {
    const ns = messages as Record<string, unknown>;
    let cursor: unknown = ns;
    for (const part of namespace.split('.')) {
      cursor = (cursor as Record<string, unknown>)[part];
    }
    return (key: string, params?: Record<string, string | number>) => {
      const parts = key.split('.');
      let value: unknown = cursor;
      for (const part of parts) {
        if (typeof value === 'object' && value !== null && part in value) {
          value = (value as Record<string, unknown>)[part];
        } else {
          return key;
        }
      }
      if (typeof value === 'string' && params) {
        return value.replace(/\{(\w+)\}/g, (_, k: string) =>
          k in params ? String(params[k]) : `{${k}}`,
        );
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

import { Feature } from '../Feature';

async function renderFeature() {
  return render(await Feature());
}

// Exact fr-BE typography. These literals contain REAL no-break spaces
// (U+00A0) and a real minus (U+2212) — invisible on screen, but toContain
// compares code points, so a plain space smuggled into the bundle fails
// here. Pinned as literals, not read from the bundle: a probe fed by the
// same file the component reads can distinguish neither an NBSP regression
// nor a copy drift (testing-library's normalizer folds NBSP, hence the
// assertions below read raw textContent).
const FR_INCOME = '+2 466 €';
const FR_EXPENSES = '−1 959 €';
const FR_AVAILABLE = '+507 €';

describe('<Feature /> — the cascade as a statement (PR L3)', () => {
  it('renders the eyebrow + h2 split on 2 lines + description', async () => {
    await renderFeature();
    expect(screen.getByText('La cascade du mois', { selector: 'p' })).toBeInTheDocument();
    // h2, not h3: the section heading was an outline orphan until PR L3
    // (no h2 existed in the section — WCAG 1.3.1, ui-auditor on L2).
    const h2 = screen.getByRole('heading', { level: 2 });
    expect(h2.textContent).toContain('Du salaire au net disponible.');
    expect(h2.textContent).toContain("En un seul coup d'œil.");
    expect(h2).toHaveAttribute('id', 'feature-heading');
  });

  /**
   * Les deux liens doivent AVANCER dans la page. « Voir un exemple » menait à
   * /signup — un formulaire d'inscription, ou le cockpit pour un visiteur
   * connecté (`redirectIfSignedIn`), jamais un exemple, alors que l'exemple est
   * la carte affichée juste à côté. « Comment ça marche ? » renvoyait vers
   * #principles, une section déjà dépassée par le lecteur.
   *
   * Le cas vérifie donc la DESTINATION et l'ORDRE : le simulateur est la
   * section suivante, la FAQ vient après.
   */
  it('renders 2 CTAs that move the reader FORWARD (#simulator, then #faq)', async () => {
    const { container } = await renderFeature();
    expect(screen.getByRole('link', { name: /tester un changement/i })).toHaveAttribute(
      'href',
      '#simulator',
    );
    expect(screen.getByRole('link', { name: /comment ça marche/i })).toHaveAttribute(
      'href',
      '#faq',
    );
    // Aucun lien de cette section ne doit repartir vers l'inscription : c'est
    // le rôle du hero et du pied de page, pas celui d'une démonstration.
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).not.toContain('/signup');
  });

  it('exposes the cascade in a <figure> with a localised aria-label carrying NBSP amounts', async () => {
    const { container } = await renderFeature();
    const figure = container.querySelector('figure[aria-label]');
    expect(figure).not.toBeNull();
    const aria = figure!.getAttribute('aria-label')!;
    expect(aria).toContain('Cascade illustrative');
    expect(aria).toContain('2 466 €');
    expect(aria).toContain('507 €');
  });

  it('renders the 3 canonical steps in an <ol> (Revenus, Dépenses courantes, Argent disponible)', async () => {
    const { container } = await renderFeature();
    const list = container.querySelector('ol');
    expect(list).not.toBeNull();

    const items = list!.querySelectorAll(':scope > li');
    expect(items.length).toBe(3);

    expect(within(list!).getByText('Revenus')).toBeInTheDocument();
    expect(within(list!).getByText('Dépenses courantes')).toBeInTheDocument();
    expect(within(list!).getByText('Argent disponible')).toBeInTheDocument();
  });

  it('pins the exact NBSP typography of the three amounts via raw textContent', async () => {
    const { container } = await renderFeature();
    const items = [...container.querySelectorAll('ol > li')].map((li) => li.textContent ?? '');
    expect(items[0]).toContain(FR_INCOME);
    expect(items[1]).toContain(FR_EXPENSES);
    expect(items[2]).toContain(FR_AVAILABLE);
  });

  it('renders the provisions sub-caption AND its inline definition under the expenses step', async () => {
    await renderFeature();
    const caption = screen.getByText(/lissés vers provisions affectées/i);
    expect(caption).toBeInTheDocument();
    expect(caption.textContent).toContain(String(FEATURE_WATERFALL_DEMO.provisions));
    // "Provisions" explained at first contact (plan-cadre §L3.2) —
    // descriptive copy only, no advice (FSMA).
    expect(screen.getByText(/Une provision : l'argent mis de côté/i)).toBeInTheDocument();
  });

  it('carries no decorative SVG connectors and no aria-hidden list items', async () => {
    const { container } = await renderFeature();
    const list = container.querySelector('ol');
    expect(list).not.toBeNull();
    // PR L3: the arrows belonged to the old dashboard-mockup grammar — the
    // statement rules and the reading order replaced them. Nothing in the
    // <ol> should be hidden from assistive tech.
    expect(list!.querySelectorAll('svg').length).toBe(0);
    expect(list!.querySelectorAll('li[aria-hidden="true"]').length).toBe(0);
  });

  it('renders the amounts in neutral ink — no success/danger colour coding', async () => {
    const { container } = await renderFeature();
    // The sign inside the string is the only carrier of direction (guarded
    // per-bundle by constants.test.ts); colour must not come back as a
    // second, colour-only channel (WCAG 1.4.1, ADR-035 §3 « jamais de vert »).
    const list = container.querySelector('ol')!;
    expect(list.innerHTML).not.toMatch(/text-success|text-danger|text-brand-text-strong/);
  });
});
