import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { getWorkspaceSnapshot } from '@/lib/data/workspace-snapshot';
import { getCommitmentsWithLedger } from '@/lib/data/commitments';
import { commitmentRowToDomain } from '@/lib/data/commitment-row';
import { engagementsMensuelsLisses } from '@/lib/domain/cockpit';
import { SimulatorClient } from './SimulatorClient';

// PR-D5 i18n: was a hardcoded FR string. See `charges/page.tsx`.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app.simulator');
  return { title: t('title') };
}

export default async function SimulatorPage() {
  const snapshot = await getWorkspaceSnapshot();
  // ADR-021: same engagements read as the dashboard, so the standalone
  // simulator's "Reste disponible" baseline matches the hero's.
  const { commitments, paidKeysByCommitment } = await getCommitmentsWithLedger(
    snapshot.workspaceId,
  );
  const commitmentLedger = new Map(
    Object.entries(paidKeysByCommitment).map(([id, keys]) => [id, new Set(keys)] as const),
  );
  const engagementsMensuels = engagementsMensuelsLisses(
    commitments.map(commitmentRowToDomain),
    commitmentLedger,
    snapshot.currentPeriod,
  );
  return (
    <SimulatorClient
      charges={snapshot.rawCharges}
      revenus={snapshot.monthlyIncome ?? 0}
      engagementsMensuels={engagementsMensuels.toNumber()}
    />
  );
}
