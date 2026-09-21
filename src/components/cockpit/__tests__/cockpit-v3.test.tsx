/**
 * Les trois surfaces neuves du cockpit v3 : le repli, la carte de tête, et
 * « Encore à payer » avec son bloc « Bientôt ».
 *
 * Vecteurs FICTIFS de bout en bout (dépôt public) : une famille dont le revenu
 * couvre 505 € de factures mensuelles et 705 € de charges au total.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import messages from '../../../../messages/fr-BE.json';
import { money } from '@/lib/domain/types';
import type { LigneBientot } from '@/lib/domain/cockpit/bientot';
import { formatCurrency } from '@/lib/i18n/formatters';

/**
 * Le compteur d'appels à `settleSpend`, posé AVANT le module mocké (vi.hoisted)
 * parce que `vi.mock` remonte en tête de fichier.
 *
 * Le mock garde le comportement réel et se contente de compter : ce qui doit
 * être prouvé, c'est qu'une vérité serveur fraîche PURGE la figure optimiste —
 * pas qu'une fonction au bon nom existe quelque part.
 */
const sonde = vi.hoisted(() => ({ settle: 0 }));

vi.mock('@/lib/expenses/optimistic-spend', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/expenses/optimistic-spend')>();
  return {
    ...actual,
    settleSpend: () => {
      sonde.settle += 1;
      actual.settleSpend();
    },
  };
});

import { announceOptimisticSpend, settleSpend } from '@/lib/expenses/optimistic-spend';

vi.mock('@/i18n/navigation', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Link: ({ href, children, ...rest }: any) => (
    <a href={typeof href === 'string' ? href : href.pathname} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => {
    const { createTranslator } = await import('next-intl');
    return createTranslator({
      locale: 'fr-BE',
      messages: messages as never,
      namespace: namespace as never,
    });
  },
}));

import { Repli } from '../Repli';
import { IlTeResteCard } from '../IlTeResteCard';
import { EncoreAPayerCard } from '../EncoreAPayerCard';

describe('Repli', () => {
  it('naît FERMÉ, et son titre porte déjà son chiffre', async () => {
    // C'est tout l'intérêt : on ne l'ouvre pas « pour voir s'il y a quelque
    // chose ». Un repli qui s'ouvrirait par défaut ferait perdre le budget de
    // page qu'il est censé tenir.
    render(
      <Repli titre="Mes comptes" cle="3" testId="r">
        <p>Le détail des comptes</p>
      </Repli>,
    );

    const tete = screen.getByRole('button');
    expect(tete).toHaveAttribute('aria-expanded', 'false');
    expect(tete).toHaveTextContent('Mes comptes');
    expect(tete).toHaveTextContent('3');
  });

  it('pointe un aria-controls vers un id RÉELLEMENT présent, même fermé', () => {
    // Démonter le corps casserait le lien annoncé par un lecteur d'écran :
    // `aria-controls` viserait un id absent du document.
    const { container } = render(
      <Repli titre="Mes comptes" cle="3">
        <p>Le détail</p>
      </Repli>,
    );

    const id = screen.getByRole('button').getAttribute('aria-controls');
    expect(id).toBeTruthy();
    const corps = container.querySelector(`#${CSS.escape(id!)}`);
    expect(corps).not.toBeNull();
    expect(corps).toHaveAttribute('hidden');
  });

  it('s’ouvre au clic et rend son contenu lisible', async () => {
    const user = userEvent.setup();
    render(
      <Repli titre="Ce qui a bougé" cle="12 dépenses">
        <p>Colruyt</p>
      </Repli>,
    );

    await user.click(screen.getByRole('button'));

    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Colruyt')).toBeVisible();
  });
});

describe('IlTeResteCard — la ligne de formule', () => {
  /**
   * La contrainte qui compte : la ligne doit être vraie SUR LES NOMBRES
   * AFFICHÉS. Si « Déjà compté » était recalculé par une autre voie que
   * `revenus − resteDisponible`, la soustraction ne tomberait pas juste et
   * n'importe quel lecteur le verrait avant nous.
   */
  const base = {
    ilTeReste: 495,
    resteDisponible: 1295,
    revenus: 2000,
    depensesDuMois: 800,
    retenu: 705,
    misDeCote: 0,
    soldeQuotidien: null as number | null,
    chargesFixes: 505,
    provisionsLissees: 130,
    engagementsMensuels: 70,
    monthLabel: 'septembre',
    incomplet: false,
    locale: 'fr-BE' as const,
    cascade: <p>La cascade</p>,
  };

  it('écrit les quatre nombres, et la soustraction tombe juste', async () => {
    render(await IlTeResteCard(base));

    const formule = screen.getByTestId('cockpit-formule');
    const nombres = (formule.textContent ?? '')
      .replace(/ | /gu, '')
      .match(/-?\d+(?:[.,]\d+)?/gu)!
      .map((n) => Number(n.replace(',', '.')));

    // Revenus − Déjà compté − Dépensé = Il te reste
    expect(nombres).toHaveLength(4);
    const [revenus, retenu, depense, reste] = nombres as [number, number, number, number];
    expect(revenus - retenu - depense).toBeCloseTo(reste, 2);
    expect(reste).toBeCloseTo(base.ilTeReste, 2);
  });

  it('dit « Déjà compté pour tes factures », jamais « Retenu »', async () => {
    render(await IlTeResteCard(base));

    expect(screen.getByTestId('cockpit-formule')).toHaveTextContent(
      'Déjà compté pour tes factures',
    );
    expect(screen.queryByText(/\bRetenu\b/u)).toBeNull();
  });

  it('ouvre la retenue sur ses trois postes (règle 10)', async () => {
    const { container } = render(await IlTeResteCard(base));

    const detail = container.querySelector('[data-retenu]');
    expect(detail?.textContent).toContain('tes factures du mois');
    expect(detail?.textContent).toContain('la part mensuelle de tes grosses factures');
    expect(detail?.textContent).toContain('tes échéances');
  });

  it('sans revenu, ne calcule rien et le dit', async () => {
    render(await IlTeResteCard({ ...base, incomplet: true }));

    expect(screen.getByText('Complète ta situation')).toBeInTheDocument();
    expect(screen.queryByTestId('cockpit-formule')).toBeNull();
  });
});

describe('EncoreAPayerCard — « Bientôt »', () => {
  function ligneBientot(
    id: string,
    label: string,
    facture: number,
    cycle: number,
    dueDateIso: string,
  ): LigneBientot {
    return {
      charge: {
        id,
        label,
        amount: money(facture),
        frequency: cycle === 3 ? 'quarterly' : cycle === 6 ? 'semiannual' : 'annual',
        paymentMonths: [10],
        paymentDay: 5,
        isActive: true,
      },
      dueDateIso,
      joursAvant: 15,
      raison: 'fenetre',
      partMensuelle: {
        montantFacture: money(facture),
        cycleMois: cycle,
        montantMensuel: money(facture).dividedBy(cycle),
      },
    };
  }

  const base = {
    resteAPayer: 505,
    payees: 2,
    total: 5,
    lignes: [
      { id: 'loyer', label: 'Loyer', montant: 450, dueDateIso: '2026-09-28', isOverdue: false },
    ],
    monthLabel: 'septembre',
    locale: 'fr-BE' as const,
  };

  it('dit que cet argent est DÉJÀ retiré de « Il te reste »', async () => {
    // Deux relectures indépendantes du 20 septembre 2026 ont lu « Il te reste »
    // puis « Encore à payer » comme une soustraction restant à faire. Les deux
    // chiffres sont justes ; c'est leur voisinage qui induit en erreur. La
    // ligne est donc là, sous le montant, et dans les deux cas — qu'il reste
    // des factures ou non.
    const { container } = render(await EncoreAPayerCard({ ...base, bientot: [] }));
    const ligne = container.querySelector('[data-testid="encore-a-payer-deja-retire"]');
    expect(ligne?.textContent).toBe('Déjà retiré de ce qu’il te reste.');

    const toutPaye = render(
      await EncoreAPayerCard({ ...base, resteAPayer: 0, lignes: [], bientot: [] }),
    );
    expect(
      toutPaye.container.querySelector('[data-testid="encore-a-payer-deja-retire"]')?.textContent,
    ).toBe('Déjà retiré de ce qu’il te reste.');
  });

  it('montre TOUJOURS la part mensuelle avec sa facture', async () => {
    // « 15 € par mois » ne se vérifie pas ; « 45 € tous les 3 mois → 15,00 €
    // par mois » se vérifie de tête. Les deux moitiés ne se séparent jamais.
    const { container } = render(
      await EncoreAPayerCard({
        ...base,
        bientot: [ligneBientot('eau', 'Eau', 45, 3, '2026-10-05')],
      }),
    );

    const ligne = container.querySelector('[data-bientot]')!;
    const part = within(ligne as HTMLElement).getByText(/tous les 3 mois/u);
    expect(part.textContent).toMatch(/45/u);
    expect(part.textContent).toMatch(/15/u);
  });

  it('chaque ligne de « Bientôt » porte sa part, sans exception', async () => {
    const { container } = render(
      await EncoreAPayerCard({
        ...base,
        bientot: [
          ligneBientot('eau', 'Eau', 45, 3, '2026-10-05'),
          ligneBientot('assurance', 'Assurance', 240, 12, '2026-11-02'),
        ],
      }),
    );

    const lignes = container.querySelectorAll('[data-bientot]');
    expect(lignes).toHaveLength(2);
    for (const l of lignes) {
      expect(l.querySelector('[data-part-mensuelle]')).not.toBeNull();
    }
  });

  it('dit que « Bientôt » est HORS du mois affiché', async () => {
    // Sans cette mention, une facture d'octobre se lit comme une sortie de
    // septembre, et le total du mois paraît faux.
    render(
      await EncoreAPayerCard({
        ...base,
        bientot: [ligneBientot('eau', 'Eau', 45, 3, '2026-10-05')],
      }),
    );

    expect(screen.getByText(/hors de septembre/u)).toBeInTheDocument();
  });

  it('n’affiche aucun bloc « Bientôt » quand rien n’arrive', async () => {
    const { container } = render(await EncoreAPayerCard({ ...base, bientot: [] }));

    expect(container.querySelector('[data-bientot-bloc]')).toBeNull();
  });

  it('descend à 2 lignes du mois quand « Bientôt » en porte, pour tenir le budget de page', async () => {
    const lignes = [
      { id: 'a', label: 'Loyer', montant: 450, dueDateIso: '2026-09-02', isOverdue: false },
      { id: 'b', label: 'Énergie', montant: 120, dueDateIso: '2026-09-10', isOverdue: false },
      { id: 'c', label: 'Internet', montant: 55, dueDateIso: '2026-09-15', isOverdue: false },
    ];

    const sansBientot = render(await EncoreAPayerCard({ ...base, lignes, bientot: [] }));
    expect(sansBientot.container.querySelectorAll('ul > li')).toHaveLength(3);
    sansBientot.unmount();

    const avecBientot = render(
      await EncoreAPayerCard({
        ...base,
        lignes,
        bientot: [ligneBientot('eau', 'Eau', 45, 3, '2026-10-05')],
      }),
    );
    // 2 lignes du mois + 1 ligne de « Bientôt »
    expect(avecBientot.container.querySelectorAll('[data-bientot]')).toHaveLength(1);
    expect(avecBientot.container.querySelectorAll('ul')[0]!.querySelectorAll('li')).toHaveLength(2);
  });
});

/**
 * B1 — la régression du tour 27 : la carte de tête a remplacé
 * `SituationDuMoisHero` sans reprendre son fil optimiste, donc « Il te reste »
 * ne bougeait plus à l'annonce d'une dépense (ADR-010, < 100 ms) et plus
 * personne n'appelait `settleSpend()` : une figure optimiste posée par la
 * feuille ⊕ y serait restée jusqu'au prochain démontage.
 *
 * Les images d'animation sont pilotées à la main, comme dans
 * `HeroAmount.test.tsx` : « ça bouge » se constate, il ne se suppose pas.
 */
describe('IlTeResteCard — le chiffre optimiste (ADR-010)', () => {
  const base = {
    ilTeReste: 495,
    resteDisponible: 1295,
    revenus: 2000,
    depensesDuMois: 800,
    retenu: 705,
    misDeCote: 0,
    soldeQuotidien: null as number | null,
    chargesFixes: 505,
    provisionsLissees: 130,
    engagementsMensuels: 70,
    monthLabel: 'septembre',
    incomplet: false,
    locale: 'fr-BE' as const,
    cascade: <p>La cascade</p>,
  };

  let frames: FrameRequestCallback[] = [];
  const avance = (now: number) => {
    const enAttente = frames;
    frames = [];
    act(() => {
      for (const cb of enAttente) cb(now);
    });
  };

  beforeEach(() => {
    settleSpend();
    sonde.settle = 0;
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    settleSpend();
  });

  // Le texte VISIBLE seulement : le chiffre porte aussi une région live
  // visuellement cachée avec la valeur arrivée, et lire les deux d'un coup
  // rendrait « 450 €450 € ».
  const chiffre = () =>
    Number(
      (
        screen.getByTestId('cockpit-chiffre').querySelector('[aria-hidden="true"]')?.textContent ??
        ''
      )
        .replace(/[^\d,-]/gu, '')
        .replace(',', '.'),
    );

  it('descend dès l’annonce d’une dépense, avant la réponse du serveur', async () => {
    render(await IlTeResteCard(base));
    expect(chiffre()).toBeCloseTo(495, 2);

    // 45 € annoncés : le couple publié par la feuille ⊕ porte les DEUX
    // résultats, « Il te reste » et « Dépensé ce mois ».
    act(() => announceOptimisticSpend({ ilTeReste: 450, depensesDuMois: 845 }));
    avance(0);
    avance(1000);

    expect(chiffre()).toBeCloseTo(450, 2);
  });

  it('emmène la ligne de formule avec lui — l’écran ne se contredit pas', async () => {
    render(await IlTeResteCard(base));

    act(() => announceOptimisticSpend({ ilTeReste: 450, depensesDuMois: 845 }));
    avance(0);
    avance(1000);

    const texte = (screen.getByTestId('cockpit-formule').textContent ?? '').replace(/ | /gu, '');
    expect(texte).toMatch(/845/u);
    expect(texte).toMatch(/450/u);
  });

  it('purge la figure optimiste quand la vérité serveur arrive (settleSpend)', async () => {
    const vue = render(await IlTeResteCard(base));
    sonde.settle = 0;

    act(() => announceOptimisticSpend({ ilTeReste: 450, depensesDuMois: 845 }));
    avance(0);
    avance(1000);
    expect(chiffre()).toBeCloseTo(450, 2);

    // La page revalidée rend la carte avec la nouvelle vérité serveur.
    vue.rerender(await IlTeResteCard({ ...base, ilTeReste: 450, depensesDuMois: 845 }));
    avance(1001);
    avance(2000);

    expect(sonde.settle).toBeGreaterThan(0);
    expect(chiffre()).toBeCloseTo(450, 2);
  });
});

/**
 * I2 — le « € » en tête. `Intl` place l'unité AVANT le nombre en `en`
 * (`€1,234.50`) et en `nl-BE` (`€ 1.234,50`) : une ligne composée en retirant
 * un « € » de fin par expression régulière en gardait quatre dans ces deux
 * langues. Mesuré le 20 septembre 2026 avec `Intl.NumberFormat`.
 *
 * La composition correcte ne touche pas à une chaîne déjà formatée : elle
 * formate des NOMBRES et pose l'unité une seule fois, à la place que la locale
 * lui donne.
 */
describe.each(['fr-BE', 'en', 'nl-BE'] as const)('IlTeResteCard — l’unité en %s', (locale) => {
  const base = {
    ilTeReste: 495,
    resteDisponible: 1295,
    revenus: 2000,
    depensesDuMois: 800,
    retenu: 705,
    misDeCote: 0,
    soldeQuotidien: null as number | null,
    chargesFixes: 505,
    provisionsLissees: 130,
    engagementsMensuels: 70,
    monthLabel: 'septembre',
    incomplet: false,
    cascade: <p>La cascade</p>,
  };

  it('ne porte le « € » qu’une fois dans la ligne de formule', async () => {
    render(await IlTeResteCard({ ...base, locale }));

    const texte = screen.getByTestId('cockpit-formule').textContent ?? '';
    expect(texte.match(/€/gu) ?? []).toHaveLength(1);
    expect(texte).toContain(formatCurrency(base.ilTeReste, locale));
  });
});

describe('Repli « Rythme du mois » — la clé au bord du mois', () => {
  it('dit « dernier jour » quand il ne reste plus un jour entier', async () => {
    // `joursRestants` ne vaut 0 que dans UN cas : la période affichée n'est
    // pas le mois courant (`month-situation.ts`). La clé dit alors « dernier
    // jour », ce qui serait faux pour un mois révolu. Le cas est aujourd'hui
    // inatteignable — `currentPeriod` dérive de `new Date()` — et ce test le
    // FIGE : le jour où le cockpit affichera un mois passé, il rougira, et la
    // phrase sera changée sciemment plutôt que découverte à l'écran.
    const { createTranslator } = await import('next-intl');
    // Le cast : `createTranslator` typé sur le namespace réduit ses clés à
    // `never` hors d'un composant. Ce qui est prouvé ici, c'est la phrase que
    // le fichier de messages produit, pas la typographie de son API.
    const tc = createTranslator({
      locale: 'fr-BE',
      messages: messages as never,
      namespace: 'cockpit' as never,
    }) as unknown as (cle: string, valeurs?: Record<string, unknown>) => string;

    expect(tc('replis.cleRythme', { jours: 0 })).toBe('dernier jour');
    expect(tc('replis.cleRythme', { jours: 1 })).toBe('1 jour restant');
    expect(tc('replis.cleRythme', { jours: 12 })).toBe('12 jours restants');
  });
});

/**
 * PR D — « Mis de côté » enters the formula line only when it is not zero, and
 * the line still rebuilds the headline figure to the cent. Fictitious amounts.
 */
describe('IlTeResteCard — PR D, the set-aside term and the daily account', () => {
  // 2 000 − 705 − 200 − 800 = 295
  const base = {
    ilTeReste: 295,
    resteDisponible: 1095,
    revenus: 2000,
    depensesDuMois: 800,
    retenu: 705,
    misDeCote: 200,
    soldeQuotidien: null as number | null,
    chargesFixes: 505,
    provisionsLissees: 130,
    engagementsMensuels: 70,
    monthLabel: 'septembre',
    incomplet: false,
    locale: 'fr-BE' as const,
    cascade: <p>La cascade</p>,
  };

  const nombresDe = (el: HTMLElement) =>
    (el.textContent ?? '')
      .replace(/[   ]/gu, '')
      .match(/-?\d+(?:[.,]\d+)?/gu)!
      .map((n) => Number(n.replace(',', '.')));

  it('writes five numbers, and the subtraction lands on the headline figure', async () => {
    render(await IlTeResteCard(base));
    const formule = screen.getByTestId('cockpit-formule');
    expect(formule).toHaveTextContent('Mis de côté');
    const nombres = nombresDe(formule);
    expect(nombres).toHaveLength(5);
    const [revenus, retenu, mis, depense, reste] = nombres as [
      number,
      number,
      number,
      number,
      number,
    ];
    expect(Math.round((revenus - retenu - mis - depense) * 100)).toBe(Math.round(reste * 100));
    expect(reste).toBe(base.ilTeReste);
    // « Déjà compté » is the retained amount, never revenus − resteDisponible
    // (which would swallow the set-aside term a second time).
    expect(retenu).toBe(705);
  });

  it('leaves « Mis de côté » out when it is zero', async () => {
    render(await IlTeResteCard({ ...base, misDeCote: 0, ilTeReste: 495, resteDisponible: 1295 }));
    const formule = screen.getByTestId('cockpit-formule');
    expect(formule).not.toHaveTextContent('Mis de côté');
    expect(nombresDe(formule)).toHaveLength(4);
  });

  it('shows the daily account balance with its source, and opens the Accounts page', async () => {
    render(await IlTeResteCard({ ...base, soldeQuotidien: 460 }));
    const lien = screen.getByTestId('cockpit-solde-quotidien');
    expect(lien).toHaveTextContent('Sur ton compte du quotidien');
    expect(lien).toHaveTextContent('calculé depuis tes opérations');
    expect(lien.textContent).toMatch(/460/u);
    expect(lien.getAttribute('href')).toMatch(/\/app\/accounts$/u);
  });

  it('does not show the daily account line at all without a balance', async () => {
    render(await IlTeResteCard(base));
    expect(screen.queryByTestId('cockpit-solde-quotidien')).toBeNull();
  });
});
