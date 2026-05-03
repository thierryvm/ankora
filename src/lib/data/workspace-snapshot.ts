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
  kind: AccountKind;
  label: string;
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
    categoryId: string | null;
    isActive: boolean;
    notes: string | null;
    paidFrom: ChargePaidFrom;
  }>;
  /** Expenses occurring in the current calendar month (server-filtered). */
  monthlyExpenses: Expense[];
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

  const [wsRes, settingsRes, chargesRes, accountsRes, monthlyExpensesRes] = await Promise.all([
    supabase
      .from('workspaces')
      .select('id, name, monthly_income, vie_courante_monthly_transfer')
      .eq('id', workspaceId)
      .single(),
    supabase
      .from('workspace_settings')
      .select('savings_balance, months_tracked')
      .eq('workspace_id', workspaceId)
      .maybeSingle(),
    supabase
      .from('charges')
      .select('id, label, amount, frequency, due_month, category_id, is_active, notes, paid_from')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: true }),
    supabase.from('accounts').select('kind, label, balance').eq('workspace_id', workspaceId),
    supabase
      .from('expenses')
      .select('id, label, amount, occurred_on, category_id, note, paid_from')
      .eq('workspace_id', workspaceId)
      .gte('occurred_on', startOfMonth)
      .lt('occurred_on', startOfNextMonth)
      .order('occurred_on', { ascending: false }),
  ]);

  if (wsRes.error || !wsRes.data) redirect('/onboarding');

  const rawCharges = (chargesRes.data ?? []).map((c) => ({
    id: c.id,
    label: c.label,
    amount: Number(c.amount),
    frequency: c.frequency,
    dueMonth: c.due_month,
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
    categoryId: c.categoryId,
    isActive: c.isActive,
    paidFrom: c.paidFrom,
  }));

  const accounts: AccountSnapshot[] = (accountsRes.data ?? []).map((a) => ({
    kind: a.kind as AccountKind,
    label: a.label,
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
