import { getLocale } from 'next-intl/server';

import { ANKORA_TIMEZONE } from '@/lib/date/tz';

import { redirect } from '@/i18n/navigation';

import { assertReadable } from '@/lib/data/read-failure';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/log';
import {
  money,
  type AccountKind,
  type Charge,
  type ChargePaidFrom,
  type Expense,
} from '@/lib/domain/types';
import type { AccountType, CockpitCharge } from '@/lib/domain/cockpit/types';

/**
 * Adapter from the legacy `Charge` shape (still consumed by Bloc 1 KPI helpers
 * via `Budget.*` / `Transfer.*`) to the cockpit-flavoured `CockpitCharge` that
 * `effortFinancierLisse()` expects (PR-D1).
 *
 * The cockpit math used by PR-D3 only reads `amount`, `frequency`, and
 * `isActive`; `paymentMonths` and `paymentDay` are stubbed from the legacy
 * `dueMonth`. PR-D4+ will read the canonical `payment_months[]` / `payment_day`
 * columns directly from the snapshot once the SELECT is extended.
 */
export function toCockpitCharges(charges: readonly Charge[]): readonly CockpitCharge[] {
  return charges.map((c) => ({
    id: c.id,
    label: c.label,
    amount: c.amount,
    frequency: c.frequency,
    // PR THI-192 (2026-05-19): read the canonical `payment_months[]` /
    // `payment_day` columns that PR-D1 migration `20260503000002` introduced.
    // The previous stub (`paymentMonths: [dueMonth]`, `paymentDay: 1`) forced
    // every charge to be treated as "due on the 1st of its due month",
    // breaking `nextDueDateForCharge()` for THI-192 Prochaines factures and
    // degrading the precision of cockpit Notifications + Santé Provisions.
    paymentMonths: c.paymentMonths,
    paymentDay: c.paymentDay,
    isActive: c.isActive,
  }));
}

function getCurrentMonthBoundariesISO(): { startISO: string; nextStartISO: string } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: ANKORA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const today = formatter.format(new Date()); // "YYYY-MM-DD"
  const [yearStr, monthStr] = today.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const startISO = `${yearStr}-${monthStr}-01`;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextStartISO = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
  return { startISO, nextStartISO };
}

export type AccountSnapshot = {
  /** Legacy column — kept until PR-D-final migrates every consumer to accountType. */
  kind: AccountKind;
  /** Legacy column — kept until PR-D-final migrates every consumer to displayName. */
  label: string;
  /** ADR-008 canonical type. Drives cockpit logic + UI typed cards (PR-D2+). */
  accountType: AccountType;
  /** ADR-008 user-defined display name. Editable inline since PR-D2. */
  displayName: string;
  balance: number;
};

export type WorkspaceSnapshot = {
  workspaceId: string;
  workspaceName: string;
  monthlyIncome: number | null;
  vieCouranteMonthlyTransfer: number | null;
  savingsBalance: number;
  monthsTracked: number;
  accounts: AccountSnapshot[];
  charges: Charge[];
  rawCharges: Array<{
    id: string;
    label: string;
    amount: number;
    frequency: string;
    dueMonth: number;
    // PR-BETA-CLEANUP-2 (THI-281): expose the full schedule so the
    // ChargesClient list can compute `nextDueDateForCharge()` and the
    // form / edit drawer can edit the day-of-month precisely.
    paymentDay: number;
    paymentMonths: readonly number[];
    categoryId: string | null;
    isActive: boolean;
    /** Manual "à surveiller" dashboard marker (THI-329 PR-C). */
    isWatched: boolean;
    notes: string | null;
    paidFrom: ChargePaidFrom;
  }>;
  /** Expenses occurring in the current calendar month (server-filtered). */
  monthlyExpenses: Expense[];
  /**
   * Charge payments for the current `(year, month)` only — drives the
   * "À payer / Payé" toggle UI and the Santé Provisions algorithm.
   * Phase 1 scope (per @cowork validation 2026-05-07): current month only.
   * PR-D5 will widen to a 3-month window once the cockpit needs the offset.
   */
  currentMonthPayments: Array<{
    chargeId: string;
    periodYear: number;
    periodMonth: number;
    paidAmount: number;
    paidAt: string;
  }>;
  /** Reference period used by `currentMonthPayments`. Same TZ as cashflow boundaries. */
  currentPeriod: { year: number; month: number };
  /** The period right before `currentPeriod` (year-wrap aware). */
  previousPeriod: { year: number; month: number };
  /**
   * Charge ids ticked as paid for `previousPeriod` — feeds the "forgotten
   * bills" alert (a bill due last month with no ledger entry was never
   * ticked; the user should check it was actually paid).
   */
  previousMonthPaidChargeIds: string[];
};

/**
 * Fetch the authenticated user's primary workspace snapshot.
 * Redirects to /onboarding if the user has no workspace or hasn't completed onboarding.
 *
 * Every read below whose result decides a redirect goes through `assertReadable`
 * first. Until 2026-07-30 the `error` field of all three was discarded and only
 * `!data` was tested, so a failed SELECT was indistinguishable from a user who
 * had never onboarded — and the dashboard answered a database outage by asking
 * its owner to create their workspace again. The 2026-07-18 note further down
 * this file records the same motif on `charges`; this is that lesson applied to
 * the reads that route rather than the reads that render.
 */
export async function getWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return redirect({ href: '/login', locale: await getLocale() });

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('onboarded_at')
    .eq('id', user.id)
    .maybeSingle();
  assertReadable(profileError, 'workspace-snapshot: users.onboarded_at');
  if (!profile?.onboarded_at) return redirect({ href: '/onboarding', locale: await getLocale() });

  const { data: membership, error: membershipError } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  assertReadable(membershipError, 'workspace-snapshot: workspace_members');
  if (!membership) return redirect({ href: '/onboarding', locale: await getLocale() });

  const workspaceId = membership.workspace_id;

  const { startISO: startOfMonth, nextStartISO: startOfNextMonth } = getCurrentMonthBoundariesISO();

  // Derive current (year, month) from the same TZ as the cashflow boundaries
  // so `currentMonthPayments` and `monthlyExpenses` always agree on "this month".
  const [yearStr, monthStr] = startOfMonth.split('-');
  const currentYear = Number(yearStr);
  const currentMonth = Number(monthStr);
  // Previous period (year-wrap aware) — feeds the "forgotten bills" alert:
  // the ledger is per-period, so last month's unticked bills are invisible
  // unless we read that period too.
  const previousMonth = currentMonth === 1 ? 12 : currentMonth - 1;
  const previousYear = currentMonth === 1 ? currentYear - 1 : currentYear;

  const [
    wsRes,
    settingsRes,
    chargesRes,
    accountsRes,
    monthlyExpensesRes,
    currentMonthPaymentsRes,
    previousMonthPaymentsRes,
  ] = await Promise.all([
    supabase
      .from('workspaces')
      .select('id, name, monthly_income, vie_courante_monthly_transfer')
      .eq('id', workspaceId)
      .single(),
    supabase
      .from('workspace_settings')
      .select(
        // ADR-035 removed the daily-living envelope, so `reste_a_vivre_default`
        // and `reste_a_vivre_overrides` are no longer read. The columns still
        // exist in production — the deprecation migration is written but not
        // applied — they are simply nobody's source of truth any more.
        'savings_balance, months_tracked',
      )
      .eq('workspace_id', workspaceId)
      .maybeSingle(),
    supabase
      .from('charges')
      // `select('*')` on purpose (incident 2026-07-18): an explicit column
      // list containing a NOT-YET-MIGRATED column (`is_watched` preview vs
      // prod schema) makes the WHOLE query fail → the dashboard + charges
      // page silently render empty and look like data loss. `*` returns
      // whatever columns exist, and the mapping defaults the missing ones —
      // the page can never go blank because of a deploy/migration window.
      // Over-fetch is negligible (a few metadata columns on ~20 rows).
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: true }),
    supabase
      .from('accounts')
      .select('kind, label, account_type, display_name, balance')
      .eq('workspace_id', workspaceId),
    supabase
      .from('expenses')
      .select('id, label, amount, occurred_on, category_id, note, paid_from')
      .eq('workspace_id', workspaceId)
      .gte('occurred_on', startOfMonth)
      .lt('occurred_on', startOfNextMonth)
      .order('occurred_on', { ascending: false }),
    supabase
      .from('charge_payments')
      .select('charge_id, period_year, period_month, paid_amount, paid_at')
      .eq('workspace_id', workspaceId)
      .eq('period_year', currentYear)
      .eq('period_month', currentMonth),
    supabase
      .from('charge_payments')
      .select('charge_id')
      .eq('workspace_id', workspaceId)
      .eq('period_year', previousYear)
      .eq('period_month', previousMonth),
  ]);

  // The workspace row is reached through a membership we just read successfully,
  // so "it failed" and "it is not there" have genuinely different meanings here —
  // the second would be a broken foreign key, the first a blip. Only the second
  // is a reason to send someone to onboarding.
  assertReadable(wsRes.error, 'workspace-snapshot: workspaces');
  if (!wsRes.data) return redirect({ href: '/onboarding', locale: await getLocale() });

  // Never swallow a charges read failure silently again (incident 2026-07-18:
  // the `?? []` fallback made a failing SELECT look like an empty workspace).
  if (chargesRes.error) {
    log.error('Failed to load charges for dashboard', {
      workspace_id: workspaceId,
      error_code: chargesRes.error.code ?? 'unknown',
    });
  }

  const rawCharges = (chargesRes.data ?? []).map((c) => ({
    id: c.id,
    label: c.label,
    amount: Number(c.amount),
    frequency: c.frequency,
    dueMonth: c.due_month,
    paymentDay: c.payment_day,
    // Defensive `?? []`: the migration declared `payment_months` as
    // NOT NULL DEFAULT [1..12], but the Supabase TypeScript types are still
    // generated as `number[] | null` until `npm run supabase:types` is
    // re-run post-migration. Guard so the row is structurally typed even if
    // the codegen lags behind the schema.
    paymentMonths: (c.payment_months ?? []) as readonly number[],
    categoryId: c.category_id,
    isActive: c.is_active,
    // `?? false`: tolerate a prod schema where the 20260718000001 migration
    // has not landed yet (deploy/migration ordering window).
    isWatched: c.is_watched ?? false,
    notes: c.notes,
    paidFrom: c.paid_from as ChargePaidFrom,
  }));

  const charges: Charge[] = rawCharges.map((c) => ({
    id: c.id,
    label: c.label,
    amount: money(c.amount),
    frequency: c.frequency as Charge['frequency'],
    dueMonth: c.dueMonth,
    paymentDay: c.paymentDay,
    paymentMonths: c.paymentMonths,
    categoryId: c.categoryId,
    isActive: c.isActive,
    isWatched: c.isWatched,
    paidFrom: c.paidFrom,
  }));

  const accounts: AccountSnapshot[] = (accountsRes.data ?? []).map((a) => ({
    kind: a.kind as AccountKind,
    label: a.label,
    accountType: a.account_type as AccountType,
    displayName: a.display_name,
    balance: Number(a.balance),
  }));

  if (monthlyExpensesRes.error) {
    log.warn('Failed to load monthly expenses for dashboard', {
      workspace_id: workspaceId,
      error_code: monthlyExpensesRes.error.code ?? 'unknown',
    });
  }

  const monthlyExpenses: Expense[] = (monthlyExpensesRes.data ?? []).map((e) => ({
    id: e.id,
    label: e.label,
    amount: money(Number(e.amount)),
    occurredOn: e.occurred_on,
    categoryId: e.category_id,
    note: e.note,
    paidFrom: e.paid_from as AccountKind,
  }));

  if (currentMonthPaymentsRes.error) {
    log.warn('Failed to load current-month charge payments for dashboard', {
      workspace_id: workspaceId,
      error_code: currentMonthPaymentsRes.error.code ?? 'unknown',
    });
  }

  const currentMonthPayments = (currentMonthPaymentsRes.data ?? []).map((p) => ({
    chargeId: p.charge_id,
    periodYear: p.period_year,
    periodMonth: p.period_month,
    paidAmount: Number(p.paid_amount),
    paidAt: p.paid_at,
  }));

  if (previousMonthPaymentsRes.error) {
    log.warn('Failed to load previous-month charge payments for dashboard', {
      workspace_id: workspaceId,
      error_code: previousMonthPaymentsRes.error.code ?? 'unknown',
    });
  }
  const previousMonthPaidChargeIds = (previousMonthPaymentsRes.data ?? []).map((p) => p.charge_id);

  // ADR-035 — the daily-living envelope is gone, and with it the resolution of
  // `reste_a_vivre_overrides[YYYY-MM] ?? reste_a_vivre_default`. The literal
  // `?? 500` that used to close that expression was a second silent source of
  // truth alongside the column default: a user who never set the value still
  // got a progress bar, a "X €/day" and an overspend badge computed against a
  // number they had never chosen. It looked like a measurement; it was a
  // factory constant.
  return {
    workspaceId,
    workspaceName: wsRes.data.name,
    monthlyIncome: wsRes.data.monthly_income,
    vieCouranteMonthlyTransfer: wsRes.data.vie_courante_monthly_transfer,
    savingsBalance: Number(settingsRes.data?.savings_balance ?? 0),
    monthsTracked: Math.max(1, settingsRes.data?.months_tracked ?? 1),
    accounts,
    charges,
    rawCharges,
    monthlyExpenses,
    currentMonthPayments,
    currentPeriod: { year: currentYear, month: currentMonth },
    previousPeriod: { year: previousYear, month: previousMonth },
    previousMonthPaidChargeIds,
  };
}

export async function getExpenses(workspaceId: string, limit = 50): Promise<Expense[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('expenses')
    .select('id, label, amount, occurred_on, category_id, note, paid_from')
    .eq('workspace_id', workspaceId)
    .order('occurred_on', { ascending: false })
    .limit(limit);

  return (data ?? []).map((e) => ({
    id: e.id,
    label: e.label,
    amount: money(Number(e.amount)),
    occurredOn: e.occurred_on,
    categoryId: e.category_id,
    note: e.note,
    paidFrom: e.paid_from as AccountKind,
  }));
}
