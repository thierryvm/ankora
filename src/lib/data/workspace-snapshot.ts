import { redirect } from 'next/navigation';

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
 * `effortFinancierLisse()` and `capaciteEpargneReelle()` expect (PR-D1).
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

/**
 * Canonical timezone for month-boundary calculations on the dashboard.
 * Ankora is FSMA-scoped to Belgium and `next-intl` already uses Europe/Brussels
 * for date formatting. Computing month boundaries in this timezone avoids
 * drifting one day around midnight UTC for end-of-month expenses.
 *
 * Multi-tenant per-workspace timezone is a post-launch concern (PR-D2).
 */
const ANKORA_TIMEZONE = 'Europe/Brussels';

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
  /**
   * Monthly "vie courante" budget used by the Capacité d'Épargne Réelle
   * tryptique (ADR-009 amendement 2026-05-09). Resolved per-request as
   * `workspace_settings.reste_a_vivre_overrides[currentYYYYMM]`
   * ?? `reste_a_vivre_default`. Always a non-negative finite number.
   * Added PR-BETA-3 (THI-267).
   */
  resteAVivre: number;
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
};

/**
 * Fetch the authenticated user's primary workspace snapshot.
 * Redirects to /onboarding if the user has no workspace or hasn't completed onboarding.
 */
export async function getWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('onboarded_at')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.onboarded_at) redirect('/onboarding');

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!membership) redirect('/onboarding');

  const workspaceId = membership.workspace_id;

  const { startISO: startOfMonth, nextStartISO: startOfNextMonth } = getCurrentMonthBoundariesISO();

  // Derive current (year, month) from the same TZ as the cashflow boundaries
  // so `currentMonthPayments` and `monthlyExpenses` always agree on "this month".
  const [yearStr, monthStr] = startOfMonth.split('-');
  const currentYear = Number(yearStr);
  const currentMonth = Number(monthStr);

  const [wsRes, settingsRes, chargesRes, accountsRes, monthlyExpensesRes, currentMonthPaymentsRes] =
    await Promise.all([
      supabase
        .from('workspaces')
        .select('id, name, monthly_income, vie_courante_monthly_transfer')
        .eq('id', workspaceId)
        .single(),
      supabase
        .from('workspace_settings')
        .select(
          // PR-BETA-3 (THI-267) added `reste_a_vivre_default` +
          // `reste_a_vivre_overrides` for the Capacité tryptique. Read both
          // here so the dashboard can resolve the current-month value in a
          // single round-trip (no extra query in the page component).
          'savings_balance, months_tracked, reste_a_vivre_default, reste_a_vivre_overrides',
        )
        .eq('workspace_id', workspaceId)
        .maybeSingle(),
      supabase
        .from('charges')
        // PR THI-192 (2026-05-19): added `payment_day, payment_months` to
        // the SELECT. The PR-D1 migration `20260503000002` shipped these
        // columns with defaults but no code path was reading them — every
        // downstream consumer (cockpit math, notifications, upcoming bills)
        // was running on the stub `paymentDay: 1` set in `toCockpitCharges`.
        .select(
          'id, label, amount, frequency, due_month, payment_day, payment_months, category_id, is_active, notes, paid_from',
        )
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
    ]);

  if (wsRes.error || !wsRes.data) redirect('/onboarding');

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

  // PR-BETA-3 (THI-267) — resolve the current-month reste-à-vivre using
  // overrides[YYYY-MM] ?? default. Supabase's generated types may still
  // type the new JSONB column as `Json | null` until `supabase:types` is
  // re-run post-migration, hence the defensive cast.
  const currentYYYYMM = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
  const settingsRow = settingsRes.data as {
    savings_balance: number | null;
    months_tracked: number | null;
    reste_a_vivre_default: number | string | null;
    reste_a_vivre_overrides: Record<string, number | string> | null;
  } | null;
  const resteAVivreDefault = Number(settingsRow?.reste_a_vivre_default ?? 500);
  const overrideRaw = settingsRow?.reste_a_vivre_overrides?.[currentYYYYMM];
  const resteAVivreOverride = overrideRaw === undefined ? undefined : Number(overrideRaw);
  const resolvedResteAVivre =
    resteAVivreOverride !== undefined && Number.isFinite(resteAVivreOverride)
      ? resteAVivreOverride
      : Number.isFinite(resteAVivreDefault)
        ? resteAVivreDefault
        : 500;
  const resteAVivre = Math.max(0, resolvedResteAVivre);

  return {
    workspaceId,
    workspaceName: wsRes.data.name,
    monthlyIncome: wsRes.data.monthly_income,
    vieCouranteMonthlyTransfer: wsRes.data.vie_courante_monthly_transfer,
    savingsBalance: Number(settingsRes.data?.savings_balance ?? 0),
    monthsTracked: Math.max(1, settingsRes.data?.months_tracked ?? 1),
    resteAVivre,
    accounts,
    charges,
    rawCharges,
    monthlyExpenses,
    currentMonthPayments,
    currentPeriod: { year: currentYear, month: currentMonth },
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
