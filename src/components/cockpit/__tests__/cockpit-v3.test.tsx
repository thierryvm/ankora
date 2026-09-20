/**
 * Les trois surfaces neuves du cockpit v3 : le repli, la carte de tête, et
 * « Encore à payer » avec son bloc « Bientôt ».
 *
 * Vecteurs FICTIFS de bout en bout (dépôt public) : une famille dont le revenu
 * couvre 505 € de factures mensuelles et 705 € de charges au total.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import messages from '../../../../messages/fr-BE.json';
import { money } from '@/lib/domain/types';
import type { LigneBientot } from '@/lib/domain/cockpit/bientot';

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
