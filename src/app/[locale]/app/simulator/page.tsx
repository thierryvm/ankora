import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { getWorkspaceSnapshot } from '@/lib/data/workspace-snapshot';
import { SimulatorClient } from './SimulatorClient';

// PR-D5 i18n: was a hardcoded FR string. See `charges/page.tsx`.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app.simulator');
  return { title: t('title') };
}

export default async function SimulatorPage() {
  const snapshot = await getWorkspaceSnapshot();
  return <SimulatorClient charges={snapshot.rawCharges} revenus={snapshot.monthlyIncome ?? 0} />;
}
