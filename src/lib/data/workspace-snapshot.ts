import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { money, type Charge, type Expense } from '@/lib/domain/types';

export type WorkspaceSnapshot = {
  workspaceId: string;
  workspaceName: string;
  monthlyIncome: number | null;
  savingsBalance: number;
  monthsTracked: number;
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
  }>;
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

  const [wsRes, settingsRes, chargesRes] = await Promise.all([
    supabase.from('workspaces').select('id, name, monthly_income').eq('id', workspaceId).single(),
    supabase
      .from('workspace_settings')
      .select('savings_balance, months_tracked')
      .eq('workspace_id', workspaceId)
      .maybeSingle(),
    supabase
      .from('charges')
      .select('id, label, amount, frequency, due_month, category_id, is_active, notes')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: true }),
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
  }));

  const charges: Charge[] = rawCharges.map((c) => ({
    id: c.id,
    label: c.label,
    amount: money(c.amount),
    frequency: c.frequency as Charge['frequency'],
    dueMonth: c.dueMonth,
    categoryId: c.categoryId,
    isActive: c.isActive,
  }));

  return {
    workspaceId,
    workspaceName: wsRes.data.name,
    monthlyIncome: wsRes.data.monthly_income,
    savingsBalance: Number(settingsRes.data?.savings_balance ?? 0),
    monthsTracked: Math.max(1, settingsRes.data?.months_tracked ?? 1),
    charges,
    rawCharges,
  };
}

export async function getExpenses(workspaceId: string, limit = 50): Promise<Expense[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('expenses')
    .select('id, label, amount, occurred_on, category_id, note')
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
  }));
}
