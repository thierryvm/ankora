import Decimal from 'decimal.js';

import {
  CYCLE_MONTHS,
  isPeriodicFrequency,
  monthlyCharges,
  periodicCharges,
  type CockpitCharge,
} from './types';

/**
 * Une part d'un poste du cockpit — ce qui compose un total affiché.
 *
 * Règle 10 de `CLAUDE.md` : aucun montant agrégé ne s'affiche sans sa
 * décomposition accessible. « 59 € de lissage » n'apprend rien ; « assurance
 * habitation — 300 € tous les 3 mois » explique.
 *
 * `origine` porte le montant réel de la facture et la longueur de son cycle,
 * pour que l'interface puisse dire d'où sort la division. Il vaut `null` — et
 * jamais `undefined` par omission — pour une charge mensuelle : 150 € par mois
 * n'a rien à expliquer, et cette absence est une information, pas un oubli.
 * Même convention que `MonthObligation.installmentIndex` (`obligations/types.ts`).
 */
export type PostePart = Readonly<{
  id: string;
  libelle: string;
  /** La part de ce poste dans le total du mois. */
  montantMensuel: Decimal;
  origine: Readonly<{ montantFacture: Decimal; cycleMois: number }> | null;
}>;

/**
 * Un poste : ses parts, et leur somme.
 *
 * **Les parts sont primaires, le total en dérive.** Deux fonctions qui
 * parcourent la même liste, ce sont deux endroits où la condition de filtrage
 * peut diverger — et un test d'invariant ne rattrape la divergence que si
 * quelqu'un pense à le relancer avec le bon cas. Même forme que
 * `aPayerCeMois(obligations)` dans `obligations/du-mois.ts`, pour la même raison.
 */
export type Poste = Readonly<{
  total: Decimal;
  parts: readonly PostePart[];
}>;

/**
 * La somme d'un poste, en un seul endroit.
 *
 * Exportée pour que `engagementsDuMois` (module voisin) l'utilise plutôt que de
 * refaire son propre `reduce` : trois producteurs de `Poste` qui somment chacun
 * de leur côté, ce sont trois endroits où l'ordre des opérations `Decimal` peut
 * diverger — et c'est précisément la maladie que la forme `{ total, parts }`
 * existe pour soigner. Remarque de Sourcery sur la PR #310, acceptée.
 */
export function sommeDesParts(parts: readonly PostePart[]): Decimal {
  return parts.reduce((acc, p) => acc.plus(p.montantMensuel), new Decimal(0));
}

/**
 * Charges fixes du mois — chaque charge mensuelle active, telle quelle.
 *
 * `origine` est `null` partout : une charge mensuelle ne subit aucune division,
 * son montant affiché EST son montant facturé.
 */
export function chargesFixesDuMois(charges: readonly CockpitCharge[]): Poste {
  const parts: PostePart[] = monthlyCharges(charges).map((c) => ({
    id: c.id,
    libelle: c.label,
    montantMensuel: c.amount,
    origine: null,
  }));
  return { total: sommeDesParts(parts), parts };
}

/**
 * Lissage du mois — la part mensuelle de chaque charge NON mensuelle active.
 *   annual     → montant / 12
 *   semiannual → montant / 6
 *   quarterly  → montant / 3
 *   monthly    → absente (déjà comptée dans {@link chargesFixesDuMois})
 *
 * « Lissage » et non « provisions » depuis l'amendement d'ADR-035 du 2026-08-05 :
 * le mot désignait deux nombres de périmètres différents. Ici c'est un **flux
 * théorique** — rien ne bouge sur aucun compte. Ce qui part réellement vers
 * l'épargne s'appelle « à virer », ce qui y dort déjà s'appelle « provisions ».
 *
 * La précision Decimal est conservée ; l'arrondi est le travail de l'affichage.
 */
export function lissageDuMois(charges: readonly CockpitCharge[]): Poste {
  const parts: PostePart[] = periodicCharges(charges).map((c) => {
    // Défensif : `periodicCharges` filtre déjà sur `isPeriodicFrequency`, et
    // `CockpitFrequency` est une union fermée de quatre membres tous couverts
    // par `CYCLE_MONTHS`. Cette branche est inatteignable — elle protège contre
    // une évolution du filtre, pas contre une donnée. Elle vient de
    // `assistant-virements.ts`, dont la boucle a fusionné ici.
    if (!isPeriodicFrequency(c.frequency)) {
      throw new Error('periodicCharges leaked a monthly charge — invariant broken');
    }
    const cycleMois = CYCLE_MONTHS[c.frequency];
    return {
      id: c.id,
      libelle: c.label,
      montantMensuel: c.amount.dividedBy(cycleMois),
      origine: { montantFacture: c.amount, cycleMois },
    };
  });
  return { total: sommeDesParts(parts), parts };
}

/**
 * Somme des charges mensuelles actives.
 *
 * Enveloppe de {@link chargesFixesDuMois} : deux appelants n'ont besoin que du
 * total (`situation-mois.ts:105` et {@link effortFinancierLisse} ci-dessous), et
 * le chemin unique garantit qu'ils ne peuvent pas diverger de la décomposition.
 * Le coût est un tableau construit puis jeté — négligeable à l'échelle d'un
 * budget personnel, et c'est le prix d'une seule source de vérité.
 */
export function totalChargesMensuelles(charges: readonly CockpitCharge[]): Decimal {
  return chargesFixesDuMois(charges).total;
}

/** Enveloppe de {@link lissageDuMois} — même raison que ci-dessus. */
export function provisionsMensuellesLissees(charges: readonly CockpitCharge[]): Decimal {
  return lissageDuMois(charges).total;
}

/**
 * Effort Financier Lissé (ADR-009) =
 *   Σ charges mensuelles + Σ lissage
 *
 * Cf. spec dashboard-cockpit-vraie-vision-2026-05-03 §1.
 * This is what the user "really" pays each month once you smooth out the
 * periodic bills. It feeds the « Budget du mois » figure (ADR-035).
 */
export function effortFinancierLisse(charges: readonly CockpitCharge[]): Decimal {
  return totalChargesMensuelles(charges).plus(provisionsMensuellesLissees(charges));
}
