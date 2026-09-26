import { ANKORA_TIMEZONE } from '@/lib/date/tz';
import { money } from '@/lib/domain/types';
import {
  calculerSituationDuMois,
  chargesFixesDuMois,
  depensesDuMois,
  engagementsDuMois,
  lissageDuMois,
  paymentKey,
  type PaymentLedger,
  type Poste,
  type SituationDuMois,
} from '@/lib/domain/cockpit';
import { commitmentRowToDomain } from '@/lib/data/commitment-row';
import { loadAccountLedger, type AccountLedger } from '@/lib/data/operations';
import { DataReadUnavailableError } from '@/lib/data/read-failure';
import { accountBalanceView } from '@/lib/domain/accounts/operations-view';
import { operationsDuMois } from '@/lib/domain/cockpit/operations-du-mois';
import { createClient } from '@/lib/supabase/server';
import { getCommitmentsWithLedger } from '@/lib/data/commitments';
import {
  getSnapshotWith,
  readMonthActivity,
  toCockpitCharges,
  type WorkspaceSnapshot,
} from '@/lib/data/workspace-snapshot';
import { isSamePeriod, type Period } from '@/lib/domain/period/viewed-period';
import type { Expense } from '@/lib/domain/types';
import type { AppRoute } from '@/lib/data/render-timing';
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
  /**
   * The operations journal (ADR-045), read in full. PR D: « Il te reste »
   * subtracts what was put aside and adds what was received on top of the
   * income, so the figure is never computed without it.
   */
  ledger: AccountLedger;
  /**
   * ADR-046, lot 2 — the month the cockpit shows when it is not the current
   * one, with that month's bills paid and spending. Absent: the current month,
   * read by the snapshot. Nothing is computed differently; only the month the
   * same functions receive changes.
   */
  viewed?: {
    ref: Period;
    payments: WorkspaceSnapshot['currentMonthPayments'];
    expenses: Expense[];
  };
};

/**
 * De quoi chacun des trois postes soustractifs du hero est fait — règle 10 de
 * `CLAUDE.md` : « aucun montant agrégé sans sa décomposition accessible ».
 *
 * Les parts descendent AVEC le chiffre, elles ne se recalculent pas à
 * l'affichage. C'est le corollaire de conception de la règle : un composant qui
 * reçoit un total sans ses composantes est mal découpé, et deux calculs de la
 * même somme finissent toujours par diverger.
 *
 * Chaque `Poste` porte son propre total, dérivé de ses parts. Le hero continue
 * de lire `situation.chargesFixes` / `.provisionsLissees` / `.engagementsMensuels`
 * pour les montants affichés : ce sont les mêmes valeurs, au centime, produites
 * par le même parcours de liste.
 */
export type MonthDecomposition = {
  chargesFixes: Poste;
  /** « Lissage » depuis l'amendement d'ADR-035 — la part mensuelle des factures non mensuelles. */
  lissage: Poste;
  engagements: Poste;
};

export type MonthSituationBundle = MonthSituation & {
  /** The month every figure of this bundle is about. */
  ref: Period;
  /** `ref` is the snapshot's current month (Europe/Brussels). */
  isCurrentMonth: boolean;
  /** The spending of `ref` — the one subtracted from « Il te reste ». */
  monthlyExpenses: Expense[];
  engagementsMensuels: Poste['total'];
  decomposition: MonthDecomposition;
  paymentsLedger: PaymentLedger;
  cockpitCharges: readonly CockpitCharge[];
  soldeEpargneActuel: ReturnType<typeof money>;
  /**
   * The balance of the account that pays for daily life (`daily_card`),
   * computed from its latest statement and the operations since — the same
   * function and the same day as the Accounts page, so the two show the same
   * amount. `null` without that account or without any statement: the line
   * then does not appear at all.
   */
  soldeQuotidien: ReturnType<typeof money> | null;
};

/**
 * Derive the month's situation from data already fetched.
 *
 * Not pure — it reads the wall clock — but every other input is passed in, so
 * the arithmetic itself stays testable through `calculerSituationDuMois`.
 */
export function computeMonthSituation(input: MonthSituationInputs): MonthSituationBundle {
  const { snapshot } = input;
  const ref = input.viewed?.ref ?? snapshot.currentPeriod;
  const isCurrentMonth = isSamePeriod(ref, snapshot.currentPeriod);
  const monthPayments = input.viewed?.payments ?? snapshot.currentMonthPayments;
  const monthlyExpenses = input.viewed?.expenses ?? snapshot.monthlyExpenses;
  const cockpitCharges = toCockpitCharges(snapshot.charges);

  const provisionsAccount = snapshot.accounts.find((a) => a.accountType === 'provisions');
  const soldeEpargneActuel = money(provisionsAccount?.balance ?? 0);

  const paymentsLedger: PaymentLedger = new Map(
    monthPayments.map((p) => [paymentKey(p.chargeId, p.periodYear, p.periodMonth), true]),
  );

  // ADR-021 — the smoothed monthly burden of active finite commitments, so the
  // hero's « Budget du mois » reconciles with the « Mes engagements » card.
  const commitmentLedger = new Map(
    Object.entries(input.paidKeysByCommitment).map(([id, keys]) => [id, new Set(keys)] as const),
  );
  // `engagementsDuMois` plutôt que `engagementsMensuelsLisses` : même filtre,
  // même total, mais il rend aussi les parts. Le libellé est repris de la ligne
  // (`c.label`) et non du domaine — `commitmentRowToDomain` ne le transporte
  // pas, et une décomposition sans nom n'explique rien.
  const engagements = engagementsDuMois(
    input.commitments.map((c) => ({ ...commitmentRowToDomain(c), label: c.label })),
    commitmentLedger,
    ref,
  );
  const engagementsMensuels = engagements.total;

  // Lot 2 of ADR-046: `ref` may be a month the user chose. Outside the current
  // month, `joursRestants = 0` suppresses the per-day hint, and the month
  // counts as fully elapsed so the projection behind « Épargne estimée » is a
  // completed month rather than a partial one — the guard that was defensive
  // until now, unchanged.
  const todayIso = todayIsoInBrussels();
  const [bYear, bMonth, bDay] = todayIso.split('-').map(Number);
  const isCurrentPeriod = bYear === ref.year && bMonth === ref.month;
  const joursDuMois = new Date(ref.year, ref.month, 0).getDate();
  const joursRestants = isCurrentPeriod ? Math.max(1, joursDuMois - (bDay ?? 1) + 1) : 0;
  const joursEcoules = isCurrentPeriod
    ? Math.min(joursDuMois, Math.max(1, bDay ?? 1))
    : joursDuMois;

  // ADR-035 — « Dépensé ce mois ». `monthlyExpenses` is already server-filtered
  // to the reference month; running the domain filter over it again is cheap
  // and keeps the figure correct if that guarantee ever moves.
  const depenses = depensesDuMois(monthlyExpenses, ref);

  const situation = calculerSituationDuMois({
    // Distinct from the Transfer plan's income (which coerces null → 0): the
    // situation needs the genuine null to drive the THI-335 incomplet state,
    // where no figure at all is shown rather than an anxiety-inducing zero.
    revenus: snapshot.monthlyIncome === null ? null : money(snapshot.monthlyIncome),
    charges: cockpitCharges,
    soldeEpargneActuel,
    payments: paymentsLedger,
    ref,
    engagementsMensuels,
    depensesDuMois: depenses,
    operations: operationsDuMois(input.ledger.movements, ref),
    joursEcoules,
    joursDuMois,
  });

  return {
    ref,
    isCurrentMonth,
    monthlyExpenses,
    situation,
    joursEcoules,
    joursRestants,
    joursDuMois,
    todayIso,
    engagementsMensuels,
    decomposition: {
      chargesFixes: chargesFixesDuMois(cockpitCharges),
      lissage: lissageDuMois(cockpitCharges),
      engagements,
    },
    paymentsLedger,
    cockpitCharges,
    soldeEpargneActuel,
    // Today's balance of the daily account belongs to today. Next to another
    // month's « Il te reste » it would read as that month's money.
    soldeQuotidien: isCurrentMonth ? soldeDuQuotidien(input, todayIso) : null,
  };
}

function soldeDuQuotidien(input: MonthSituationInputs, todayIso: string) {
  if (!input.snapshot.accounts.some((a) => a.accountType === 'daily_card')) return null;
  const view = accountBalanceView({
    accountType: 'daily_card',
    statements: input.ledger.statements,
    movements: input.ledger.movements,
    today: new Date(`${todayIso}T00:00:00Z`),
  });
  if (view === null) return null;
  return view.computed?.balance ?? view.read.balance;
}

/**
 * Fetch everything the month's situation needs, then derive it.
 *
 * Used by the cockpit page and by the ⊕ sheet's context action. The snapshot
 * and the commitment ledger are returned alongside so the caller does not
 * re-read them.
 */
export async function loadMonthSituation(
  route: AppRoute | null = null,
  viewed: Period | null = null,
): Promise<MonthSituationBundle & MonthSituationInputs> {
  // The commitments and the account journal need only the workspace id: both
  // leave with the snapshot reads, in one wave, instead of two waves after it.
  const [snapshot, [{ commitments, paidKeysByCommitment }, ledger]] = await getSnapshotWith(
    route,
    async (workspaceId) =>
      Promise.all([
        getCommitmentsWithLedger(workspaceId),
        loadAccountLedger(await createClient(), workspaceId),
      ]),
  );
  // PR D — a figure computed without its operations would silently ignore
  // every transfer made: the worst lie the cockpit could tell. An unreadable
  // journal is a read failure like any other one this figure depends on.
  if (!ledger.ok) throw new DataReadUnavailableError('month-situation.ledger', null);
  // Another month than the snapshot's: its bills paid and its spending are
  // read after the snapshot, because the snapshot is what says which month is
  // current. The current month reads nothing more than before.
  const other = viewed !== null && !isSamePeriod(viewed, snapshot.currentPeriod) ? viewed : null;
  const activity = other ? await readMonthActivity(snapshot.workspaceId, other) : null;
  const inputs: MonthSituationInputs = {
    snapshot,
    commitments,
    paidKeysByCommitment,
    ledger: { statements: ledger.statements, movements: ledger.movements },
    ...(other && activity ? { viewed: { ref: other, ...activity } } : {}),
  };
  return { ...inputs, ...computeMonthSituation(inputs) };
}
