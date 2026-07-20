import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';

import { createClient } from '@/lib/supabase/server';
import { getWorkspaceSnapshot } from '@/lib/data/workspace-snapshot';
import { log } from '@/lib/log';
import type { Locale } from '@/i18n/routing';
import { CommitmentsClient, type RawCommitment } from './CommitmentsClient';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app.commitments');
  return { title: t('title') };
}

export default async function CommitmentsPage() {
  const [snapshot, locale] = await Promise.all([
    getWorkspaceSnapshot(),
    getLocale() as Promise<Locale>,
  ]);

  const supabase = await createClient();
  // Both reads are RLS-scoped; the explicit workspace filter is belt-and-braces
  // (same contract as the charges page).
  const [commitmentsRes, paymentsRes] = await Promise.all([
    supabase
      .from('commitments')
      // `select('*')` on purpose (incident 2026-07-18): an explicit column list
      // referencing a not-yet-migrated column fails the WHOLE query and renders
      // an empty page that looks like data loss.
      .select('*')
      .eq('workspace_id', snapshot.workspaceId)
      .order('created_at', { ascending: true }),
    supabase
      .from('commitment_payments')
      .select('commitment_id, period_year, period_month')
      .eq('workspace_id', snapshot.workspaceId),
  ]);

  if (commitmentsRes.error) {
    log.error('Failed to load commitments', {
      workspace_id: snapshot.workspaceId,
      error_code: commitmentsRes.error.code ?? 'unknown',
    });
  }
  if (paymentsRes.error) {
    log.error('Failed to load commitment payments', {
      workspace_id: snapshot.workspaceId,
      error_code: paymentsRes.error.code ?? 'unknown',
    });
  }

  const commitments: RawCommitment[] = (commitmentsRes.data ?? []).map((c) => ({
    id: c.id,
    label: c.label,
    kind: c.kind as RawCommitment['kind'],
    totalAmount: Number(c.total_amount),
    installmentAmount: c.installment_amount === null ? null : Number(c.installment_amount),
    installmentsTotal: c.installments_total,
    startYear: c.start_year,
    startMonth: c.start_month,
    paymentDay: c.payment_day,
    frequency: c.frequency as RawCommitment['frequency'],
    notes: c.notes,
    isActive: c.is_active,
  }));

  // Ledger keys shared with the pure domain (`periodKey`): `${year}-${month}`.
  const paidKeysByCommitment: Record<string, string[]> = {};
  for (const p of paymentsRes.data ?? []) {
    const key = `${p.period_year}-${p.period_month}`;
    (paidKeysByCommitment[p.commitment_id] ??= []).push(key);
  }

  return (
    <CommitmentsClient
      commitments={commitments}
      paidKeysByCommitment={paidKeysByCommitment}
      currentPeriod={snapshot.currentPeriod}
      locale={locale}
    />
  );
}
