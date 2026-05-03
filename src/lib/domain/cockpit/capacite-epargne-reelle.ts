import Decimal from 'decimal.js';

import { effortFinancierLisse } from './effort-financier-lisse';
import type { CockpitCharge } from './types';

export type CapaciteEpargneReelleInput = Readonly<{
  revenus: Decimal;
  charges: readonly CockpitCharge[];
  plafondQuotidien: Decimal;
}>;

export type CapaciteEpargneReelleOutput = Readonly<{
  /** Σ charges mensuelles + provisions lissées (cf. ADR-009 + effort-financier-lisse). */
  effortFinancierLisse: Decimal;
  /** revenus - effort - plafond. May be negative. */
  capacite: Decimal;
  /** Convenience flag for the UI. */
  isPositive: boolean;
}>;

/**
 * Capacité d'Épargne Réelle (ADR-009) =
 *   Revenus - Effort_Financier_Lissé - Plafond_Quotidien
 *
 * The KPI hero of the cockpit. Designed to be stable mois-après-mois (the
 * lissage absorbs the volatility of periodic bills) and to be honest about
 * whether the user's lifestyle fits inside their income on a true annual
 * basis.
 *
 * No clamping: if revenus = 0 or plafond > revenus, this returns a negative
 * value and the UI layer is responsible for messaging the user.
 */
export function capaciteEpargneReelle(
  input: CapaciteEpargneReelleInput,
): CapaciteEpargneReelleOutput {
  const effort = effortFinancierLisse(input.charges);
  const capacite = input.revenus.minus(effort).minus(input.plafondQuotidien);
  return {
    effortFinancierLisse: effort,
    capacite,
    isPositive: capacite.gte(0),
  };
}
