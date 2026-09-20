import type Decimal from 'decimal.js';

import { nextUnpaidDueDate } from '../charges/next-unpaid-due-date';
import { CYCLE_MONTHS, type CockpitCharge, type ReferencePeriod } from './types';

/**
 * « Bientôt » — les factures non mensuelles qui tombent hors du mois courant.
 *
 * ## Pourquoi ce module existe
 *
 * Le cockpit ne montrait une facture non mensuelle que si son propriétaire
 * l'avait cochée « à surveiller » à la main (colonne `is_watched`). Une
 * trimestrielle jamais cochée n'était dite NULLE PART : elle arrivait sans
 * prévenir, alors que le montant, la cadence et le jour d'échéance étaient
 * tous les trois connus depuis le premier jour. Un marqueur manuel demandait
 * à l'utilisateur de faire le travail que la donnée permettait déjà de faire.
 *
 * L'appartenance se calcule donc À LA LECTURE, sur une fenêtre de 60 jours.
 *
 * ## L'union, et pourquoi elle est temporaire
 *
 * `/app/charges` laisse encore cocher « à surveiller ». Tant que ce geste
 * existe, il doit avoir un effet : quelqu'un qui coche une facture s'attend à
 * la revoir au cockpit, même lointaine. La coche est donc gardée comme SECONDE
 * branche de l'union — jamais comme condition. Elle disparaîtra avec sa
 * lecture, dans la même PR de ménage : une case qui ne change plus rien est
 * pire qu'une case absente.
 *
 * Aucune des deux branches n'exempte des autres filtres : une facture cochée
 * qui est mensuelle, ou due ce mois-ci, reste dehors — « Encore à payer » la
 * porte déjà, et la montrer deux fois ferait croire à deux sorties d'argent.
 *
 * Pur : aucun `Date.now()`, aucune I/O. `todayIso` est passé explicitement.
 */

/** La fenêtre, en jours. Décision @thierry du 19 septembre 2026 : « Bientôt »
 *  prend la fenêtre de 60 jours d'« À surveiller », jamais une autre durée. */
export const FENETRE_BIENTOT_JOURS = 60;

/** Une charge telle que « Bientôt » a besoin de la lire. `isWatched` est
 *  optionnel : le domaine n'en dépend pas, et les jeux d'essai des autres
 *  modules n'ont pas à le porter. */
export type ChargeBientot = CockpitCharge & Readonly<{ isWatched?: boolean }>;

/** Ce qui fait entrer une ligne. `fenetre` prime sur `cochee` : c'est la raison
 *  qui survivra au retrait de la case, et une ligne ne paraît jamais deux fois. */
export type RaisonBientot = 'fenetre' | 'cochee';

/** La part mensuelle d'une facture non mensuelle, avec de quoi la vérifier de
 *  tête : le montant de la facture ET la longueur de son cycle. Un quotient
 *  seul est une injonction (règle 10 du CLAUDE.md). */
export type PartMensuelle = Readonly<{
  montantFacture: Decimal;
  cycleMois: number;
  montantMensuel: Decimal;
}>;

export type LigneBientot = Readonly<{
  charge: ChargeBientot;
  /** Prochaine échéance non payée, ISO `YYYY-MM-DD`. */
  dueDateIso: string;
  /** Jours entiers entre `todayIso` et l'échéance. Toujours ≥ 0 ici. */
  joursAvant: number;
  raison: RaisonBientot;
  /** Jamais `null` sur une ligne de « Bientôt » : une ligne est, par
   *  construction, une facture non mensuelle. Le type le dit pour que
   *  l'affichage n'ait aucun trou à combler. */
  partMensuelle: PartMensuelle;
}>;

export type FacturesBientotInput = Readonly<{
  charges: readonly ChargeBientot[];
  payments: ReadonlyMap<string, boolean>;
  /** Aujourd'hui, ISO `YYYY-MM-DD`. */
  todayIso: string;
  /** Le mois que le cockpit affiche. */
  period: ReferencePeriod;
}>;

/**
 * La part mensuelle d'une facture, ou `null` si elle est mensuelle — une
 * mensuelle ne subit aucune division, et lui inventer une « part » ferait
 * croire à un lissage qui n'a pas lieu.
 *
 * Le quotient garde toute sa précision : c'est l'affichage qui arrondit, pas
 * le domaine. Douze arrondis de 33,33 € font 399,96 € au lieu de 400 €.
 */
export function partMensuelle(charge: {
  amount: Decimal;
  frequency: CockpitCharge['frequency'];
}): PartMensuelle | null {
  const cycleMois = CYCLE_MONTHS[charge.frequency];
  if (!cycleMois || cycleMois === 1) return null;
  return {
    montantFacture: charge.amount,
    cycleMois,
    montantMensuel: charge.amount.dividedBy(cycleMois),
  };
}

/** Jours entiers entre deux dates ISO, en UTC — ni fuseau ni heure d'été ne
 *  s'invitent dans un écart de dates. */
function ecartJours(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return Number.NaN;
  return Math.round((to - from) / 86_400_000);
}

export function facturesBientot({
  charges,
  payments,
  todayIso,
  period,
}: FacturesBientotInput): readonly LigneBientot[] {
  const lignes: LigneBientot[] = [];

  for (const charge of charges) {
    if (!charge.isActive) continue;
    // Une mensuelle et une facture due ce mois-ci sont déjà portées par
    // « Encore à payer ». Ces deux filtres priment sur la coche.
    if (charge.frequency === 'monthly') continue;
    if (charge.paymentMonths.includes(period.month)) continue;

    const part = partMensuelle(charge);
    // Inatteignable pour une non-mensuelle (le filtre ci-dessus l'a écartée) ;
    // la garde protège d'une fréquence inconnue arrivée par une donnée.
    if (!part) continue;

    const due = nextUnpaidDueDate(charge, payments, todayIso);
    if (!due) continue;

    const joursAvant = ecartJours(todayIso, due.dueDateIso);
    if (!Number.isFinite(joursAvant) || joursAvant < 0) continue;

    const dansLaFenetre = joursAvant <= FENETRE_BIENTOT_JOURS;
    const cochee = charge.isWatched === true;
    if (!dansLaFenetre && !cochee) continue;

    lignes.push({
      charge,
      dueDateIso: due.dueDateIso,
      joursAvant,
      raison: dansLaFenetre ? 'fenetre' : 'cochee',
      partMensuelle: part,
    });
  }

  return lignes.sort((a, b) =>
    a.dueDateIso < b.dueDateIso ? -1 : a.dueDateIso > b.dueDateIso ? 1 : 0,
  );
}
