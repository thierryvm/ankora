import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/log';
import type { CommitmentRow } from '@/lib/data/commitment-row';

export type { CommitmentRow } from '@/lib/data/commitment-row';

export type CommitmentsWithLedger = {
  commitments: CommitmentRow[];
  /** Ledger keys (`${year}-${month}`, matching the domain's `periodKey`) per commitment id. */
  paidKeysByCommitment: Record<string, string[]>;
};

/**
 * Single read used by BOTH the commitments page and the dashboard card, so the
 * two surfaces can never disagree on what is owed.
 *
 * `select('*')` on purpose (incident 2026-07-18): an explicit column list
 * mentioning a not-yet-migrated column fails the WHOLE query, and a swallowed
 * failure renders an empty screen that looks exactly like data loss. Both reads
 * are RLS-scoped; the explicit workspace filter is belt-and-braces.
 */
export async function getCommitmentsWithLedger(
  workspaceId: string,
): Promise<CommitmentsWithLedger> {
  const supabase = await createClient();
  const [commitmentsRes, paymentsRes] = await Promise.all([
    supabase
      .from('commitments')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: true }),
    supabase
      .from('commitment_payments')
      .select('commitment_id, period_year, period_month')
      .eq('workspace_id', workspaceId),
  ]);

  if (commitmentsRes.error) {
    log.error('Failed to load commitments', {
      workspace_id: workspaceId,
      error_code: commitmentsRes.error.code ?? 'unknown',
    });
  }
  if (paymentsRes.error) {
    log.error('Failed to load commitment payments', {
      workspace_id: workspaceId,
      error_code: paymentsRes.error.code ?? 'unknown',
    });
  }

  const commitments: CommitmentRow[] = (commitmentsRes.data ?? []).map((c) => ({
    id: c.id,
    label: c.label,
    kind: c.kind as CommitmentRow['kind'],
    totalAmount: Number(c.total_amount),
    installmentAmount: c.installment_amount === null ? null : Number(c.installment_amount),
    installmentsTotal: c.installments_total,
    startYear: c.start_year,
    startMonth: c.start_month,
    paymentDay: c.payment_day,
    frequency: c.frequency as CommitmentRow['frequency'],
    notes: c.notes,
    isActive: c.is_active,
  }));

  const paidKeysByCommitment: Record<string, string[]> = {};
  for (const p of paymentsRes.data ?? []) {
    const key = `${p.period_year}-${p.period_month}`;
    (paidKeysByCommitment[p.commitment_id] ??= []).push(key);
  }

  return { commitments, paidKeysByCommitment };
}
