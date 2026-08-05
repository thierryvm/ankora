import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import messages from '../../../../messages/fr-BE.json';
import { SituationDuMoisHero, type SituationDuMoisHeroProps } from '../SituationDuMoisHero';

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => {
    const ns =
      (messages as Record<string, Record<string, unknown>>)[namespace.split('.')[0] ?? ''] ?? {};
    const sub = namespace
      .split('.')
      .slice(1)
      .reduce<unknown>((acc, key) => {
        if (typeof acc === 'object' && acc !== null && key in acc) {
          return (acc as Record<string, unknown>)[key];
        }
        return undefined;
      }, ns);
    return (key: string, vars?: Record<string, unknown>) => {
      // next-intl resolves dotted keys (e.g. `statut.vert`) against the nested
      // namespace — walk the path, don't do a flat lookup.
      const value = key.split('.').reduce<unknown>((acc, k) => {
        if (typeof acc === 'object' && acc !== null && k in acc) {
          return (acc as Record<string, unknown>)[k];
        }
        return undefined;
      }, sub);
      if (typeof value !== 'string') return key;
      return vars ? value.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`)) : value;
    };
  },
}));

// The Hero uses the locale-aware `Link` (plan + setup CTAs). next-intl's real
// `createNavigation` imports `next/navigation`, unresolvable under jsdom —
// mock it to a plain anchor, same pattern as the sibling card tests.
vi.mock('@/i18n/navigation', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Link: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

/**
 * Décomposition par défaut : une part par poste, dont la somme vaut le total du
 * poste. Les cas qui testent la décomposition elle-même la remplacent ; les
 * autres ont juste besoin qu'elle soit cohérente, parce qu'un poste dont les
 * parts ne somment pas au total est précisément ce que la règle 10 interdit.
 */
const BASE: Omit<SituationDuMoisHeroProps, 'statut'> = {
  revenus: 2500,
  chargesFixes: 1500,
  provisionsLissees: 338,
  engagementsMensuels: 0,
  chargesFixesParts: [{ id: 'loyer', libelle: 'Loyer', montantMensuel: 1500, origine: null }],
  lissageParts: [
    {
      id: 'assurance',
      libelle: 'Assurance habitation',
      montantMensuel: 338,
      origine: { montantFacture: 1014, cycleMois: 3 },
    },
  ],
  engagementsParts: [],
  resteDisponible: 662,
  depensesDuMois: 200,
  ilTeReste: 462,
  epargneEstimee: 318,
  deficitEpargne: 0,
  rattrapageMensuel: 0,
  provisionsAJour: true,
  joursRestants: 18,
  // Day 13 of 31 — a month whose 200 € of spending (30 % of the 662 € budget) is
  // slightly ahead of an even pace (42 %), so the pace bar renders neutrally by
  // default and each state gets an explicit case below.
  joursEcoules: 13,
  joursDuMois: 31,
  locale: 'fr-BE' as const,
};

// Plus de `as never` : il désactivait toute vérification de type sur les props
// du composant, ce qui a laissé passer trois props requises manquantes et deux
// props mortes. Le harnais est désormais typé, donc un oubli est une erreur de
// compilation et non huit `TypeError` à l'exécution.
const renderHero = async (
  over: Partial<SituationDuMoisHeroProps> & Pick<SituationDuMoisHeroProps, 'statut'>,
) => render(await SituationDuMoisHero({ ...BASE, ...over }));

describe('<SituationDuMoisHero />', () => {
  it('vert: shows hero label + reassuring status, AllocationBar + Adjust trigger, no plan link', async () => {
    await renderHero({ statut: 'vert' });
    expect(screen.getByTestId('situation-hero-value')).toBeInTheDocument();
    // « Il te reste » is the hero eyebrow AND the flow row of the same figure.
    expect(screen.getAllByText(messages.dashboard.situation.heroLabel).length).toBeGreaterThan(0);
    expect(screen.getByText(messages.dashboard.situation.statut.vert)).toBeInTheDocument();
    expect(screen.getByTestId('allocation-bar')).toBeInTheDocument();
    // ADR-035 — the « Ajuster ce mois » trigger went with the envelope: there is
    // no longer a number for the user to set.
    expect(screen.queryByTestId('reste-a-vivre-trigger')).toBeNull();
    expect(screen.queryByTestId('situation-nudge-link')).toBeNull();
  });

  it('orange (« Il te reste » < 0): shows the overspend nudge + a plan link', async () => {
    await renderHero({ statut: 'orange', ilTeReste: -60, resteDisponible: 440 });
    expect(screen.getByText(messages.dashboard.situation.statut.orangeDepasse)).toBeInTheDocument();
    expect(screen.getByTestId('situation-nudge-link')).toBeInTheDocument();
  });

  // `capacite: 200` traînait ici : ADR-035 a supprimé la capacité d'épargne des
  // props du composant, et le harnais typé en `as never` laissait passer une
  // prop que rien ne lisait. Le cas n'en dépendait pas — la branche du nudge se
  // décide sur `ilTeReste >= 0`, que `BASE` fournit déjà (462 €).
  it('orange (déficit de provisions, « Il te reste » positif) : affiche le nudge provisions', async () => {
    await renderHero({
      statut: 'orange',
      provisionsAJour: false,
      deficitEpargne: 300,
      rattrapageMensuel: 100,
    });
    expect(
      screen.getByText(messages.dashboard.situation.statut.orangeProvisions),
    ).toBeInTheDocument();
  });

  it('rouge: shows the rouge status + plan link', async () => {
    await renderHero({ statut: 'rouge', resteDisponible: -180 });
    expect(screen.getByText(messages.dashboard.situation.statut.rouge)).toBeInTheDocument();
    expect(screen.getByTestId('situation-nudge-link')).toBeInTheDocument();
  });

  it('ADR-021: surfaces an engagements flow row + bar segment when engagements > 0', async () => {
    await renderHero({ statut: 'vert', engagementsMensuels: 250, resteDisponible: 412 });
    expect(screen.getByText(messages.dashboard.situation.flow.engagements)).toBeInTheDocument();
    expect(screen.getByTestId('allocation-segment-engagements')).toBeInTheDocument();
  });

  it('ADR-021: hides the engagements row + segment when there are none (default 0)', async () => {
    await renderHero({ statut: 'vert' });
    expect(screen.queryByText(messages.dashboard.situation.flow.engagements)).toBeNull();
    expect(screen.queryByTestId('allocation-segment-engagements')).toBeNull();
  });

  it('ADR-021: the rouge nudge folds engagements into the obligations total', async () => {
    await renderHero({
      statut: 'rouge',
      revenus: 2000,
      chargesFixes: 1500,
      provisionsLissees: 300,
      engagementsMensuels: 400,
      resteDisponible: -200,
    });
    // nudge.rouge interpolates obligations = 1500 + 300 + 400 = 2200 (not 1800).
    const nudge = screen.getByTestId('situation-nudge-link').closest('div');
    const digits = (nudge?.textContent ?? '').replace(/[\s  ]/g, '');
    expect(digits).toContain('2200'); // 1500 + 300 + 400 — engagements folded in
    expect(digits).not.toContain('1800'); // the charges+provisions-only figure
  });

  it('ADR-021: the AllocationBar aria mentions engagements only when present', async () => {
    // Base barAria never contains the word « engagements » — the appended clause does.
    await renderHero({ statut: 'vert', engagementsMensuels: 250, resteDisponible: 412 });
    // Scoped to the allocation bar: the hero carries TWO role="img" graphics
    // since the pace bar landed, so a bare getByRole('img') is now ambiguous.
    const bar = screen.getByTestId('allocation-bar').querySelector('[role="img"]');
    expect(bar?.getAttribute('aria-label')).toContain('engagements');
  });

  it('incomplet (THI-335): shows setup CTA, no AllocationBar, no negative amount', async () => {
    const { container } = await renderHero({ statut: 'incomplet', revenus: 0 });
    expect(screen.getByText(messages.dashboard.situation.incomplet.title)).toBeInTheDocument();
    expect(screen.getByTestId('situation-setup-cta')).toBeInTheDocument();
    expect(screen.queryByTestId('allocation-bar')).toBeNull();
    expect(container.textContent ?? '').not.toContain('−');
    expect(container.textContent ?? '').not.toMatch(/-\d/);
  });
});

/**
 * Règle 10 de `CLAUDE.md` — « aucun montant agrégé sans sa décomposition
 * accessible ».
 *
 * Le constat d'origine, de @thierry : « les 59 € de provisions à verser, rien
 * n'explique pourquoi ce montant, à quelle facture cela correspond ». Ces cas
 * verrouillent que la ligne s'ouvre et qu'elle dit d'où le nombre vient.
 */
describe('<SituationDuMoisHero /> — décomposition des postes', () => {
  it('la ligne de lissage s’ouvre et nomme chaque facture avec son échéance', async () => {
    await renderHero({
      statut: 'vert',
      provisionsLissees: 59,
      lissageParts: [
        {
          id: 'auto',
          libelle: 'Assurance auto',
          montantMensuel: 23.33,
          origine: { montantFacture: 70, cycleMois: 3 },
        },
        {
          id: 'precompte',
          libelle: 'Précompte immobilier',
          montantMensuel: 18,
          origine: { montantFacture: 216, cycleMois: 12 },
        },
        {
          id: 'dechets',
          libelle: 'Taxe déchets',
          montantMensuel: 17.67,
          origine: { montantFacture: 106, cycleMois: 6 },
        },
      ],
    });

    const panneau = screen.getByTestId('flow-detail-lissage');
    // Le libellé de chaque poste — c'est la réponse à « à quoi ça correspond ».
    expect(panneau.textContent).toContain('Assurance auto');
    expect(panneau.textContent).toContain('Précompte immobilier');
    expect(panneau.textContent).toContain('Taxe déchets');
    // Et son échéance, sans laquelle la part reste un nombre sans histoire.
    const texte = (panneau.textContent ?? '').replace(/[\s ]/g, ' ');
    expect(texte).toContain('tous les 3 mois');
    expect(texte).toContain('une fois par an');
    expect(texte).toContain('tous les 6 mois');
  });

  it('une charge mensuelle n’affiche aucune échéance — 150 €/mois n’a rien à expliquer', async () => {
    await renderHero({
      statut: 'vert',
      chargesFixes: 150,
      chargesFixesParts: [{ id: 'loyer', libelle: 'Loyer', montantMensuel: 150, origine: null }],
    });
    const panneau = screen.getByTestId('flow-detail-charges');
    expect(panneau.textContent).toContain('Loyer');
    expect(panneau.textContent).not.toContain('tous les');
    expect(panneau.textContent).not.toContain('une fois par an');
  });

  it('un poste sans parts n’expose aucune disclosure — pas de promesse vide', async () => {
    await renderHero({ statut: 'vert', chargesFixes: 0, chargesFixesParts: [] });
    expect(screen.queryByTestId('flow-detail-charges')).toBeNull();
    // La ligne reste affichée : c'est la disclosure qui disparaît, pas le poste.
    expect(screen.getByText(messages.dashboard.situation.flow.chargesFixes)).toBeInTheDocument();
  });

  it('le résumé porte un nom accessible et une cible tactile de 44 px', async () => {
    await renderHero({ statut: 'vert' });
    const resume = screen.getByTestId('flow-detail-lissage').querySelector('summary');
    expect(resume).not.toBeNull();
    // « Détail : Lissage » — sans quoi le lecteur d'écran n'annonce qu'un montant.
    expect(resume?.textContent).toContain(messages.dashboard.situation.flow.lissage);
    // `min-h-11` = 44 px, le minimum tactile Apple HIG. jsdom ne calcule pas de
    // mise en page, donc on vérifie la classe qui la produit ; la mesure réelle
    // au DOM est faite au navigateur avant livraison.
    expect(resume?.className).toContain('min-h-11');
  });

  it('les engagements se décomposent aussi — la règle vaut pour les trois postes', async () => {
    await renderHero({
      statut: 'vert',
      engagementsMensuels: 220,
      resteDisponible: 442,
      engagementsParts: [{ id: 'pret', libelle: 'Prêt auto', montantMensuel: 220, origine: null }],
    });
    expect(screen.getByTestId('flow-detail-engagements').textContent).toContain('Prêt auto');
  });
});
