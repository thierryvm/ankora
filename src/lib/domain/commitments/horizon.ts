import type { CommitmentFrequency, Period } from './schedule';

const MONTHS_BETWEEN: Record<CommitmentFrequency, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

const ordinal = (p: Period): number => p.year * 12 + (p.month - 1);

/**
 * The three ways a user can tell Ankora when an engagement ends.
 *
 * The monthly amount always comes from the charge being converted, so exactly
 * ONE of these is missing — and almost nobody has all three. The contract of
 * §1.7: one door is enough, and no door demands the contract, the rate or the
 * original capital, none of which the model stores.
 */
export type PorteHorizon =
  /** « Ça se termine vers juin 2029 » — the date read off a memory. */
  | Readonly<{ kind: 'dateDeFin'; year: number; month: number }>
  /** « Il me reste 35 mensualités » — read off a statement. */
  | Readonly<{ kind: 'echeancesRestantes'; count: number }>
  /** « Mon relevé dit 8 750 € » — the door that survives a lost contract. */
  | Readonly<{ kind: 'soldeRestantDu'; balance: number }>;

export type PorteKind = PorteHorizon['kind'];

export type DeriverHorizonOptions = Readonly<{
  /** Anchor = the NEXT instalment (locked decision D3). */
  anchor: Period;
  /** One instalment, in euros. Comes from the charge. */
  installmentAmount: number;
  frequency: CommitmentFrequency;
}>;

/**
 * `installmentsTotal` implied by one door, or `null` when the door yields
 * nothing usable (a date before the anchor, a zero amount, a balance smaller
 * than half an instalment).
 *
 * The date door counts the anchor itself: an engagement anchored on August 2026
 * and ending June 2029 has 35 monthly instalments, not 34 — the last one is
 * paid, not skipped.
 */
export function deriverInstallmentsTotal(
  porte: PorteHorizon,
  opts: DeriverHorizonOptions,
): number | null {
  switch (porte.kind) {
    case 'dateDeFin': {
      const step = MONTHS_BETWEEN[opts.frequency];
      const gap = ordinal({ year: porte.year, month: porte.month }) - ordinal(opts.anchor);
      if (gap < 0) return null;
      return Math.floor(gap / step) + 1;
    }
    case 'echeancesRestantes':
      return Number.isInteger(porte.count) && porte.count >= 1 ? porte.count : null;
    case 'soldeRestantDu': {
      if (opts.installmentAmount <= 0 || porte.balance <= 0) return null;
      const count = Math.round(porte.balance / opts.installmentAmount);
      return count >= 1 ? count : null;
    }
  }
}

export type EcartPorte = Readonly<{
  porte: PorteKind;
  installmentsTotal: number;
}>;

export type ConfrontationHorizon = Readonly<{
  /** The count Ankora records. */
  installmentsTotal: number;
  /** Which door produced it. */
  porteRetenue: PorteKind;
  /**
   * Doors that were filled in and disagree with the retained one. Displayed,
   * never arbitrated: the user is told the two numbers and their origin, and
   * both stay exactly as typed.
   */
  ecarts: readonly EcartPorte[];
}>;

/**
 * Priority when several doors are filled: the most direct wins.
 *
 * `echeancesRestantes` IS the field, with no derivation between what the user
 * read and what is stored. The date needs calendar arithmetic; the balance
 * needs a division and a rounding — the most lossy, so it goes last. This
 * order is a tie-break, not a judgement about which the user got right: a
 * divergence is reported either way.
 */
const PRIORITE: readonly PorteKind[] = ['echeancesRestantes', 'dateDeFin', 'soldeRestantDu'];

/**
 * Confront every door the user filled in.
 *
 * > **Three independent doors landing on the same number is a free check.**
 *
 * When two are filled, Ankora compares. When they diverge, it says so and
 * corrects nothing — an app that silently picks one of two numbers the user
 * gave it is an app that cannot be audited. Returns `null` when no door yields
 * anything: the caller must then leave the charge as a charge (§1.7 — without
 * an horizon the conversion adds nothing at all).
 */
export function confronterPortes(
  portes: readonly PorteHorizon[],
  opts: DeriverHorizonOptions,
): ConfrontationHorizon | null {
  const derived = portes
    .map((p) => ({ porte: p.kind, installmentsTotal: deriverInstallmentsTotal(p, opts) }))
    .filter((d): d is EcartPorte => d.installmentsTotal !== null);

  if (derived.length === 0) return null;

  const retenue =
    PRIORITE.map((kind) => derived.find((d) => d.porte === kind)).find((d) => d !== undefined) ??
    derived[0];
  // `derived` is non-empty and every element carries a `porte` from PRIORITE,
  // so the lookup above always resolves — the fallback exists for the checker.
  if (!retenue) return null;

  return {
    installmentsTotal: retenue.installmentsTotal,
    porteRetenue: retenue.porte,
    ecarts: derived.filter((d) => d.installmentsTotal !== retenue.installmentsTotal),
  };
}

/**
 * Relative gap between a total the user typed from memory and the total the
 * schedule implies. Above `TOLERANCE_TOTAL`, both numbers are shown with their
 * origin — « d'après tes 60 échéances de 250 €, le total serait 15 000 € plutôt
 * que 14 500 € ».
 *
 * This figure has NO budgetary consequence: the model stores no "total with
 * interest" field, so a remembered total cannot reach any cockpit figure. That
 * is exactly what makes tolerating the imprecision safe — cf. the
 * non-contamination invariant in `une-obligation-une-table.test.ts`.
 */
export const TOLERANCE_TOTAL = 0.01;

export function ecartRelatif(totalDeMemoire: number, totalDerive: number): number | null {
  if (!Number.isFinite(totalDeMemoire) || totalDeMemoire <= 0 || totalDerive <= 0) return null;
  return Math.abs(totalDerive - totalDeMemoire) / totalDerive;
}

export function totalDivergeSuffisamment(totalDeMemoire: number, totalDerive: number): boolean {
  const ecart = ecartRelatif(totalDeMemoire, totalDerive);
  return ecart !== null && ecart > TOLERANCE_TOTAL;
}
