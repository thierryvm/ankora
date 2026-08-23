import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import messages from '../../../../messages/fr-BE.json';
import { CascadeDuMois, type CascadeDuMoisProps } from '../CascadeDuMois';

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
      // next-intl resolves dotted keys (e.g. `flow.lissage`) against the nested
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

/**
 * Décomposition par défaut : une part par poste, dont la somme vaut le total du
 * poste. Les cas qui testent la décomposition elle-même la remplacent ; les
 * autres ont juste besoin qu'elle soit cohérente, parce qu'un poste dont les
 * parts ne somment pas au total est précisément ce que la règle 10 interdit.
 */
const BASE: CascadeDuMoisProps = {
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
  locale: 'fr-BE' as const,
};

// Harnais TYPÉ, jamais `as never` : sur le hero, ce raccourci a laissé passer
// trois props requises manquantes sans qu'une ligne de `tsc` bouge, et huit cas
// ont explosé à l'exécution. Le coût d'un type exporté est d'une ligne.
const renderCascade = async (over: Partial<CascadeDuMoisProps> = {}) =>
  render(await CascadeDuMois({ ...BASE, ...over }));

describe('<CascadeDuMois />', () => {
  it('porte la barre d’allocation et le titre qui dit à quoi elle sert', async () => {
    await renderCascade();
    expect(screen.getByTestId('cascade-du-mois')).toBeInTheDocument();
    expect(screen.getByTestId('allocation-bar')).toBeInTheDocument();
    expect(screen.getByText(messages.dashboard.situation.cascade.title)).toBeInTheDocument();
  });

  it('le titre porte l’ancre visée par le lien du hero', async () => {
    // Sans cet id, le lien « D'où vient ce chiffre » du pli mène nulle part et
    // la règle 10 est perdue en silence — aucun test de rendu ne s'en plaindrait.
    await renderCascade();
    expect(document.getElementById('cascade-heading')).not.toBeNull();
  });

  it('ADR-021: surfaces an engagements flow row + bar segment when engagements > 0', async () => {
    await renderCascade({ engagementsMensuels: 250, resteDisponible: 412 });
    expect(screen.getByText(messages.dashboard.situation.flow.engagements)).toBeInTheDocument();
    expect(screen.getByTestId('allocation-segment-engagements')).toBeInTheDocument();
  });

  it('ADR-021: hides the engagements row + segment when there are none (default 0)', async () => {
    await renderCascade();
    expect(screen.queryByText(messages.dashboard.situation.flow.engagements)).toBeNull();
    expect(screen.queryByTestId('allocation-segment-engagements')).toBeNull();
  });

  it('ADR-021: the AllocationBar aria mentions engagements only when present', async () => {
    // Base barAria never contains the word « engagements » — the appended clause does.
    await renderCascade({ engagementsMensuels: 250, resteDisponible: 412 });
    const bar = screen.getByTestId('allocation-bar').querySelector('[role="img"]');
    expect(bar?.getAttribute('aria-label')).toContain('engagements');
  });

  it('budget négatif : un seul segment danger, jamais des ratios négatifs', async () => {
    await renderCascade({ resteDisponible: -200, ilTeReste: -400 });
    expect(screen.getByTestId('allocation-bar')).toBeInTheDocument();
    expect(screen.queryByTestId('allocation-segment-charges')).toBeNull();
  });

  it('« Épargne estimée » rend « — » avant le 7ᵉ jour, jamais 0 €', async () => {
    // « pas encore d'estimation » n'est pas « une estimation de zéro ».
    await renderCascade({ epargneEstimee: null });
    expect(screen.getByTestId('situation-epargne-estimee').textContent).toBe('—');
  });
});

/**
 * Règle 10 de `CLAUDE.md` — « aucun montant agrégé sans sa décomposition
 * accessible ».
 *
 * Le constat d'origine, de @thierry : « les 59 € de provisions à verser, rien
 * n'explique pourquoi ce montant, à quelle facture cela correspond ». Ces cas
 * verrouillent que la ligne s'ouvre et qu'elle dit d'où le nombre vient. Ils
 * ont suivi la cascade quand elle a quitté le hero (chantier 6) : c'est le même
 * contrat, à une nouvelle adresse.
 */
describe('<CascadeDuMois /> — décomposition des postes', () => {
  it('la ligne de lissage s’ouvre et nomme chaque facture avec son échéance', async () => {
    await renderCascade({
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
    await renderCascade({
      chargesFixes: 150,
      chargesFixesParts: [{ id: 'loyer', libelle: 'Loyer', montantMensuel: 150, origine: null }],
    });
    const panneau = screen.getByTestId('flow-detail-charges');
    expect(panneau.textContent).toContain('Loyer');
    expect(panneau.textContent).not.toContain('tous les');
    expect(panneau.textContent).not.toContain('une fois par an');
  });

  it('un poste sans parts n’expose aucune disclosure — pas de promesse vide', async () => {
    await renderCascade({ chargesFixes: 0, chargesFixesParts: [] });
    expect(screen.queryByTestId('flow-detail-charges')).toBeNull();
    // La ligne reste affichée : c'est la disclosure qui disparaît, pas le poste.
    expect(screen.getByText(messages.dashboard.situation.flow.chargesFixes)).toBeInTheDocument();
  });

  it('le résumé porte un nom accessible et une cible tactile de 44 px', async () => {
    await renderCascade();
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
    await renderCascade({
      engagementsMensuels: 220,
      resteDisponible: 442,
      engagementsParts: [{ id: 'pret', libelle: 'Prêt auto', montantMensuel: 220, origine: null }],
    });
    expect(screen.getByTestId('flow-detail-engagements').textContent).toContain('Prêt auto');
  });
});
