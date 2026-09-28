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
import { soldeAffiche, type SoldeAffiche } from '@/lib/domain/accounts/solde-affiche';
import type { AccountType } from '@/lib/schemas/account';
import {
  depensesDuMoisDeBudget,
  fenetreDuMoisDeBudget,
  type FenetreDuMois,
} from '@/lib/domain/budget/mois-de-budget';
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
  /**
   * `ref` is the budget month running now (ADR-047): the calendar month, or
   * the next one once its income has arrived.
   */
  isCurrentMonth: boolean;
  /** The days of `ref` as a budget month (ADR-047) — `joursDuMois` is its length. */
  fenetre: FenetreDuMois;
  /** The spending of `ref` — the one subtracted from « Il te reste ». */
  monthlyExpenses: Expense[];
  engagementsMensuels: Poste['total'];
  decomposition: MonthDecomposition;
  paymentsLedger: PaymentLedger;
  cockpitCharges: readonly CockpitCharge[];
  soldeEpargneActuel: ReturnType<typeof money>;
  /** No statement on the provisions account: the reserve starts from 0, and says so. */
  provisionsSansReleve: boolean;
  /** Today's balance of each account, as the Accounts page shows it (tour 59). */
  soldesComptes: Partial<Record<AccountType, SoldeAffiche>>;
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
  const ref = input.viewed?.ref ?? snapshot.moisDeBudget;
  const isCurrentMonth = isSamePeriod(ref, snapshot.moisDeBudget);
  const monthPayments = input.viewed?.payments ?? snapshot.currentMonthPayments;
  // ADR-047 — ranged here by the whole journal, whichever read supplied them:
  // the list the cockpit shows is the list « Dépensé » sums, never a wider one.
  const monthlyExpenses = depensesDuMoisDeBudget(
    input.viewed?.expenses ?? snapshot.monthlyExpenses,
    ref,
    input.ledger.movements,
  );
  const cockpitCharges = toCockpitCharges(snapshot.charges);

  // Tour 59 — one balance per account: the one the Accounts page shows, read
  // from the journal on TODAY (whatever month is viewed), never the
  // `accounts.balance` column, which only follows the statements.
  const todayIso = todayIsoInBrussels();
  const soldesComptes = soldesDesComptes(input, todayIso);
  const provisions = soldesComptes.provisions;
  const provisionsSansReleve = provisions === undefined || provisions.etat === 'aucun';
  // Without a statement the reserve starts from 0 — and `provisionsSansReleve`
  // makes the screen say so, never pass that 0 off as a balance.
  const soldeEpargneActuel = provisions?.etat === 'lu' ? provisions.montant : money(0);

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
  //
  // ADR-047 — the days are those of the BUDGET month: October opened by a
  // salary on 28 September counts from the 28th. The running month is the
  // snapshot's budget month, not the calendar one.
  const fenetre = fenetreDuMoisDeBudget(ref, input.ledger.movements);
  const joursDuMois = fenetre.jours;
  const ecoules =
    Math.round(
      (Date.parse(`${todayIso}T00:00:00Z`) - Date.parse(`${fenetre.debut}T00:00:00Z`)) / 86_400_000,
    ) + 1;
  const joursEcoules = isCurrentMonth ? Math.min(joursDuMois, Math.max(1, ecoules)) : joursDuMois;
  const joursRestants = isCurrentMonth ? Math.max(1, joursDuMois - joursEcoules + 1) : 0;

  // ADR-035 — « Dépensé ce mois ». `monthlyExpenses` is already server-filtered
  // to the reference month; running the domain filter over it again is cheap
  // and keeps the figure correct if that guarantee ever moves.
  const depenses = depensesDuMois(monthlyExpenses, ref, input.ledger.movements);

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
    // Tour 56 — a month before the running budget month is finished: its
    // base income is the money received (`revenuDeBase`).
    moisTermine:
      ref.year * 12 + ref.month < snapshot.moisDeBudget.year * 12 + snapshot.moisDeBudget.month,
  });

  return {
    ref,
    isCurrentMonth,
    fenetre,
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
    provisionsSansReleve,
    soldesComptes,
    // Today's balance of the daily account belongs to today. Next to another
    // month's « Il te reste » it would read as that month's money.
    soldeQuotidien:
      isCurrentMonth && soldesComptes.daily_card?.etat === 'lu'
        ? soldesComptes.daily_card.montant
        : null,
  };
}

/**
 * The balance of every account of the workspace, by the function and on the
 * day the Accounts page uses — so the two screens cannot disagree.
 */
function soldesDesComptes(
  input: MonthSituationInputs,
  todayIso: string,
): Partial<Record<AccountType, SoldeAffiche>> {
  const out: Partial<Record<AccountType, SoldeAffiche>> = {};
  for (const account of input.snapshot.accounts) {
    out[account.accountType] = soldeAffiche(
      accountBalanceView({
        accountType: account.accountType,
        statements: input.ledger.statements,
        movements: input.ledger.movements,
        // ADR-045 D22 — expenses and paid bills leave their account too.
        debits: input.ledger.debits,
        today: new Date(`${todayIso}T00:00:00Z`),
      }),
    );
  }
  return out;
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
  //
  // ADR-047 — the snapshot holds the RUNNING BUDGET month's expenses and the
  // CALENDAR month's bills paid. When both are the month shown, nothing more is
  // read; otherwise that month's activity is, ranged by the whole journal.
  const ref = viewed ?? snapshot.moisDeBudget;
  const other =
    isSamePeriod(ref, snapshot.moisDeBudget) && isSamePeriod(ref, snapshot.currentPeriod)
      ? null
      : ref;
  const activity = other
    ? await readMonthActivity(snapshot.workspaceId, other, ledger.movements)
    : null;
  const inputs: MonthSituationInputs = {
    snapshot,
    commitments,
    paidKeysByCommitment,
    ledger: { statements: ledger.statements, movements: ledger.movements, debits: ledger.debits },
    ...(other && activity ? { viewed: { ref: other, ...activity } } : {}),
  };
  return { ...inputs, ...computeMonthSituation(inputs) };
}
