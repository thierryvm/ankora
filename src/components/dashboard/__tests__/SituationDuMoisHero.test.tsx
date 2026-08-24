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
 * Le hero et la courbe doivent être D'ACCORD sur l'état du mois.
 *
 * Le seuil à trois états était écrit deux fois — dans `MonthCurve` pour la
 * teinte, dans le hero pour le mot — et rien ne les comparait. Un `>` devenu
 * `>=` d'un seul côté aurait affiché « budget dépassé » sous un trait vert,
 * précisément au point limite. Les deux passent désormais par `etatDuMois`, et
 * ces cas-ci le vérifient à l'écran plutôt que par lecture de code.
 */
const ETATS_ATTENDUS = [
  ['dans-le-rythme', 200, 'pace.onTrack'],
  ['au-dessus', 500, 'pace.faster'],
  ['depasse', 900, 'pace.exceeded'],
] as const;

const BASE: Omit<SituationDuMoisHeroProps, 'statut'> = {
  revenus: 2500,
  chargesFixes: 1500,
  provisionsLissees: 338,
  engagementsMensuels: 0,
  resteDisponible: 662,
  depensesDuMois: 200,
  ilTeReste: 462,
  deficitEpargne: 0,
  rattrapageMensuel: 0,
  joursRestants: 18,
  // Day 13 of 31 — a month whose 200 € of spending (30 % of the 662 € budget) is
  // slightly ahead of an even pace (42 %), so the curve renders neutrally by
  // default and each state gets an explicit case below.
  joursEcoules: 13,
  joursDuMois: 31,
  // A linear month reaching exactly `depensesDuMois` on day 13. Coherent on
  // purpose: `MonthCurve` ends its line on the figure it is GIVEN, so a series
  // that contradicted the total would hide a real defect rather than expose it.
  serieDuMois: Array.from({ length: 31 }, (_, i) => ({
    jour: i + 1,
    cumule: Math.min(200, ((i + 1) * 200) / 13),
  })),
  // Day 13 ≥ 7, so the projection exists: 200 × 31 / 13 ≈ 476,92.
  depensesProjetees: 476.92,
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
  it('vert: shows hero label + reassuring status, no plan link', async () => {
    await renderHero({ statut: 'vert' });
    expect(screen.getByTestId('situation-hero-value')).toBeInTheDocument();
    expect(screen.getAllByText(messages.dashboard.situation.heroLabel).length).toBeGreaterThan(0);
    expect(screen.getByText(messages.dashboard.situation.statut.vert)).toBeInTheDocument();
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
    const digits = (nudge?.textContent ?? '').replace(/[\s  ]/g, '');
    expect(digits).toContain('2200'); // 1500 + 300 + 400 — engagements folded in
    expect(digits).not.toContain('1800'); // the charges+provisions-only figure
  });

  it('incomplet (THI-335): shows setup CTA, no negative amount', async () => {
    const { container } = await renderHero({ statut: 'incomplet', revenus: 0 });
    expect(screen.getByText(messages.dashboard.situation.incomplet.title)).toBeInTheDocument();
    expect(screen.getByTestId('situation-setup-cta')).toBeInTheDocument();
    expect(container.textContent ?? '').not.toContain('−');
    expect(container.textContent ?? '').not.toMatch(/-\d/);
  });
});

/**
 * Chantier 6 — « le pli est le budget de conception ».
 *
 * Mesuré au navigateur le 2026-08-23 sur un iPhone 14 : la fenêtre utile fait
 * 550 px (664 moins l'en-tête collant et la barre d'onglets), et cette carte en
 * mesurait 554. Elle était donc coupée en plein milieu de sa cascade, à chaque
 * chargement.
 *
 * Ces cas verrouillent ce que la séparation NE DOIT PAS avoir coûté. Ils sont
 * délibérément écrits en négatif — ce qui ne doit plus être là — parce qu'un
 * bloc qui revient s'empiler ici est exactement la régression que la mesure
 * seule ne rattraperait qu'après coup, au navigateur.
 */
describe('<SituationDuMoisHero /> — le pli ne porte que la réponse', () => {
  it('la cascade et sa barre d’allocation ne sont plus dans cette carte', async () => {
    await renderHero({ statut: 'vert' });
    expect(screen.queryByTestId('allocation-bar')).toBeNull();
    expect(screen.queryByTestId('cascade-du-mois')).toBeNull();
    // Les trois disclosures de décomposition ont suivi la cascade.
    expect(screen.queryByTestId('flow-detail-charges')).toBeNull();
    expect(screen.queryByTestId('flow-detail-lissage')).toBeNull();
    expect(screen.queryByTestId('flow-detail-engagements')).toBeNull();
  });

  it('un seul montant dominant : « Il te reste », et aucun autre en grand', async () => {
    const { container } = await renderHero({ statut: 'vert' });
    // §3.1 de la spec : « deux grands nombres ne font pas une réponse, ils font
    // une question ». jsdom ne calcule pas de mise en page ; ce qu'on peut
    // vérifier ici est la classe qui produit la taille — 46 px, unique.
    const grands = container.querySelectorAll('[class*="text-[46px]"]');
    expect(grands).toHaveLength(1);
    expect(screen.getByTestId('situation-hero-value')).toBeInTheDocument();
  });

  it('le chiffre reste ouvrable : un lien nommé mène à sa décomposition', async () => {
    await renderHero({ statut: 'vert' });
    const lien = screen.getByTestId('situation-cascade-link');
    // Règle 10 de `CLAUDE.md` : sortir la cascade du pli sans ce lien
    // transformerait la règle en perte. L'ancre doit viser la carte, pas la page.
    expect(lien.getAttribute('href')).toBe('/app#cascade-heading');
    expect(lien.textContent).toContain(messages.dashboard.situation.cascade.lien);
  });

  it('l’état incomplet n’offre pas ce lien — il n’y a rien à décomposer', async () => {
    await renderHero({ statut: 'incomplet', revenus: 0 });
    expect(screen.queryByTestId('situation-cascade-link')).toBeNull();
  });
});

describe('SituationDuMoisHero — le hero et la courbe disent le MÊME état', () => {
  it.each(ETATS_ATTENDUS)(
    'état %s : la teinte du tracé et le mot du verdict sortent du même seuil',
    async (etat, depensesDuMois, cle) => {
      await renderHero({
        statut: 'vert',
        depensesDuMois,
        ilTeReste: BASE.resteDisponible - depensesDuMois,
      });
      expect(screen.getByTestId('month-curve')).toHaveAttribute('data-etat', etat);
      const attendu = messages.dashboard.situation.pace[cle.split('.')[1] as 'onTrack'];
      expect(screen.getByTestId('month-curve-verdict')).toHaveTextContent(attendu);
    },
  );

  it('n’écrit aucun verdict quand le budget est nul', () => {
    // Pas d'échelle, donc pas de proportion à énoncer — et le chiffre du hero
    // porte déjà le constat. Le seuil partagé rend `null`, les deux côtés se
    // taisent ensemble.
    return renderHero({ statut: 'vert', resteDisponible: 0, ilTeReste: 0 }).then(() => {
      expect(screen.queryByTestId('month-curve-verdict')).toBeNull();
    });
  });
});
