import { ANKORA_TIMEZONE } from '@/lib/date/tz';
import { money } from '@/lib/domain/types';
import {
  calculerSituationDuMois,
  depensesDuMois,
  engagementsMensuelsLisses,
  paymentKey,
  type PaymentLedger,
  type SituationDuMois,
} from '@/lib/domain/cockpit';
import { commitmentRowToDomain } from '@/lib/data/commitment-row';
import { getCommitmentsWithLedger } from '@/lib/data/commitments';
import {
  getWorkspaceSnapshot,
  toCockpitCharges,
  type WorkspaceSnapshot,
} from '@/lib/data/workspace-snapshot';
import type { CockpitCharge } from '@/lib/domain/cockpit/types';

/**
 * The month's four figures (ADR-035), assembled once.
 *
 * ## Why this file exists
 *
 * `calculerSituationDuMois` needs seven inputs, three of which have to be
 * derived first: the smoothed commitment burden, the payment ledger, and the
 * elapsed/total day counts in Europe/Brussels. Until now that assembly lived
 * inline in `app/[locale]/app/page.tsx` — fine while the cockpit was the only
 * screen that needed « Il te reste ».
 *
 * Chantier 2 adds a second reader: the ⊕ expense sheet, reachable from any
 * screen, which shows « Il te restera X € » *before* the user commits. Two
 * copies of a seven-input assembly is how the two surfaces come to disagree by
 * a few euros, and « the app contradicts itself » is the exact disease this
 * refonte is treating. Same doctrine as `getCommitmentsWithLedger`: one read,
 * so the card and the page can never diverge.
 */

export type MonthSituation = {
  situation: SituationDuMois;
  /** Days elapsed in the reference month, today included. */
  joursEcoules: number;
  /** Days left including today. 0 when the reference month is not the current one. */
  joursRestants: number;
  joursDuMois: number;
  /** Today, ISO, in Europe/Brussels — the app's canonical wall clock. */
  todayIso: string;
};

/** Today in Europe/Brussels as `YYYY-MM-DD`. `en-CA` is the ISO-shaped locale. */
export function todayIsoInBrussels(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ANKORA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export type MonthSituationInputs = {
  snapshot: WorkspaceSnapshot;
  commitments: Awaited<ReturnType<typeof getCommitmentsWithLedger>>['commitments'];
  paidKeysByCommitment: Awaited<
    ReturnType<typeof getCommitmentsWithLedger>
  >['paidKeysByCommitment'];
};

export type MonthSituationBundle = MonthSituation & {
  engagementsMensuels: ReturnType<typeof engagementsMensuelsLisses>;
  paymentsLedger: PaymentLedger;
  cockpitCharges: readonly CockpitCharge[];
  soldeEpargneActuel: ReturnType<typeof money>;
};

/**
 * Derive the month's situation from data already fetched.
 *
 * Not pure — it reads the wall clock — but every other input is passed in, so
 * the arithmetic itself stays testable through `calculerSituationDuMois`.
 */
export function computeMonthSituation(input: MonthSituationInputs): MonthSituationBundle {
  const { snapshot } = input;
  const cockpitCharges = toCockpitCharges(snapshot.charges);

  const provisionsAccount = snapshot.accounts.find((a) => a.accountType === 'provisions');
  const soldeEpargneActuel = money(provisionsAccount?.balance ?? 0);

  const paymentsLedger: PaymentLedger = new Map(
    snapshot.currentMonthPayments.map((p) => [
      paymentKey(p.chargeId, p.periodYear, p.periodMonth),
      true,
    ]),
  );

  // ADR-021 — the smoothed monthly burden of active finite commitments, so the
  // hero's « Budget du mois » reconciles with the « Mes engagements » card.
  const commitmentLedger = new Map(
    Object.entries(input.paidKeysByCommitment).map(([id, keys]) => [id, new Set(keys)] as const),
  );
  const engagementsMensuels = engagementsMensuelsLisses(
    input.commitments.map(commitmentRowToDomain),
    commitmentLedger,
    snapshot.currentPeriod,
  );

  // `currentPeriod` is derived from `new Date()` in this same TZ by the
  // snapshot, so it is always the current calendar month. The guard is
  // defensive: if it ever diverged, `joursRestants = 0` suppresses the per-day
  // hint, and a past month counts as fully elapsed so the projection behind
  // « Épargne estimée » is a completed month rather than a partial one.
  const todayIso = todayIsoInBrussels();
  const [bYear, bMonth, bDay] = todayIso.split('-').map(Number);
  const isCurrentPeriod =
    bYear === snapshot.currentPeriod.year && bMonth === snapshot.currentPeriod.month;
  const joursDuMois = new Date(
    snapshot.currentPeriod.year,
    snapshot.currentPeriod.month,
    0,
  ).getDate();
  const joursRestants = isCurrentPeriod ? Math.max(1, joursDuMois - (bDay ?? 1) + 1) : 0;
  const joursEcoules = isCurrentPeriod
    ? Math.min(joursDuMois, Math.max(1, bDay ?? 1))
    : joursDuMois;

  // ADR-035 — « Dépensé ce mois ». `monthlyExpenses` is already server-filtered
  // to the reference month; running the domain filter over it again is cheap
  // and keeps the figure correct if that guarantee ever moves.
  const depenses = depensesDuMois(snapshot.monthlyExpenses, snapshot.currentPeriod);

  const situation = calculerSituationDuMois({
    // Distinct from the Transfer plan's income (which coerces null → 0): the
    // situation needs the genuine null to drive the THI-335 incomplet state,
    // where no figure at all is shown rather than an anxiety-inducing zero.
    revenus: snapshot.monthlyIncome === null ? null : money(snapshot.monthlyIncome),
    charges: cockpitCharges,
    soldeEpargneActuel,
    payments: paymentsLedger,
    ref: snapshot.currentPeriod,
    engagementsMensuels,
    depensesDuMois: depenses,
    joursEcoules,
    joursDuMois,
  });

  return {
    situation,
    joursEcoules,
    joursRestants,
    joursDuMois,
    todayIso,
    engagementsMensuels,
    paymentsLedger,
    cockpitCharges,
    soldeEpargneActuel,
  };
}

/**
 * Fetch everything the month's situation needs, then derive it.
 *
 * Used by the cockpit page and by the ⊕ sheet's context action. The snapshot
 * and the commitment ledger are returned alongside so the caller does not
 * re-read them.
 */
export async function loadMonthSituation(): Promise<MonthSituationBundle & MonthSituationInputs> {
  const snapshot = await getWorkspaceSnapshot();
  const { commitments, paidKeysByCommitment } = await getCommitmentsWithLedger(
    snapshot.workspaceId,
  );
  const inputs = { snapshot, commitments, paidKeysByCommitment };
  return { ...inputs, ...computeMonthSituation(inputs) };
}
