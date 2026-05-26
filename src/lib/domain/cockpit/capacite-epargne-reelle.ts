import Decimal from 'decimal.js';

import { effortFinancierLisse } from './effort-financier-lisse';
import type { CockpitCharge } from './types';

export type CapaciteEpargneReelleInput = Readonly<{
  revenus: Decimal;
  charges: readonly CockpitCharge[];
  /**
   * Monthly "vie courante" budget (groceries, leisure, plaisir, imprévus).
   * ADR-009 amendement 2026-05-09 renamed this from `plafondQuotidien`
   * — the formula is unchanged, the UX wording is the canonical one.
   *
   * The legacy `plafondQuotidien` alias is still accepted for one release
   * cycle while the call-sites migrate (PR-BETA-3 → PR-BETA-4).
   *
   * @see CapaciteEpargneReelleInputLegacy
   */
  resteAVivre: Decimal;
}>;

/**
 * @deprecated Use {@link CapaciteEpargneReelleInput} with `resteAVivre`.
 * Kept for the duration of PR-BETA-3 → PR-BETA-4 to avoid a flag-day on
 * existing call-sites. Will be removed before v1.0 publique.
 */
export type CapaciteEpargneReelleInputLegacy = Readonly<{
  revenus: Decimal;
  charges: readonly CockpitCharge[];
  plafondQuotidien: Decimal;
}>;

export type CapaciteEpargneReelleOutput = Readonly<{
  /** Σ charges mensuelles + provisions lissées (cf. ADR-009 + effort-financier-lisse). */
  effortFinancierLisse: Decimal;
  /**
   * Revenus − Effort_Financier_Lissé. Conceptually: what the user has left
   * BEFORE allocating the "reste à vivre" budget. Stable mois-après-mois.
   * Added PR-BETA-3 so the tryptique UI can expose the breakdown without
   * recomputing the subtraction at the component layer.
   */
  resteDisponible: Decimal;
  /** Passthrough of `input.resteAVivre`. Kept on the output for symmetry. */
  resteAVivre: Decimal;
  /** Reste_disponible − Reste_à_vivre. May be negative. */
  capacite: Decimal;
  /** Convenience flag for the UI. */
  isPositive: boolean;
}>;

function isLegacyInput(
  input: CapaciteEpargneReelleInput | CapaciteEpargneReelleInputLegacy,
): input is CapaciteEpargneReelleInputLegacy {
  return 'plafondQuotidien' in input && !('resteAVivre' in input);
}

/**
 * Capacité d'Épargne Réelle (ADR-009 + amendement 2026-05-09) =
 *   Revenus − Effort_Financier_Lissé − Reste_à_vivre
 *
 * The KPI hero of the cockpit. Designed to be stable mois-après-mois (the
 * lissage absorbs the volatility of periodic bills) and to be honest about
 * whether the user's lifestyle fits inside their income on a true annual
 * basis.
 *
 * No clamping: if revenus = 0 or resteAVivre > revenus − effort, this
 * returns a negative `capacite` and the UI layer is responsible for the
 * messaging.
 *
 * Accepts both the canonical `resteAVivre` shape and the legacy
 * `plafondQuotidien` shape during the PR-BETA-3 transition window.
 */
export function capaciteEpargneReelle(
  input: CapaciteEpargneReelleInput | CapaciteEpargneReelleInputLegacy,
): CapaciteEpargneReelleOutput {
  const resteAVivre = isLegacyInput(input) ? input.plafondQuotidien : input.resteAVivre;
  const effort = effortFinancierLisse(input.charges);
  const resteDisponible = input.revenus.minus(effort);
  const capacite = resteDisponible.minus(resteAVivre);
  return {
    effortFinancierLisse: effort,
    resteDisponible,
    resteAVivre,
    capacite,
    isPositive: capacite.gte(0),
  };
}
