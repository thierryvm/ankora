import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';

import { getCommitmentsWithLedger } from '@/lib/data/commitments';
import { getWorkspaceSnapshot } from '@/lib/data/workspace-snapshot';
import type { Locale } from '@/i18n/routing';
import { CommitmentsClient } from './CommitmentsClient';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app.commitments');
  return { title: t('title') };
}

export default async function CommitmentsPage() {
  const [snapshot, locale] = await Promise.all([
    getWorkspaceSnapshot(),
    getLocale() as Promise<Locale>,
  ]);

  // Shared read — the dashboard card uses the exact same source, so the two
  // surfaces can never disagree on what is owed.
  const { commitments, paidKeysByCommitment } = await getCommitmentsWithLedger(
    snapshot.workspaceId,
  );

  return (
    <CommitmentsClient
      commitments={commitments}
      paidKeysByCommitment={paidKeysByCommitment}
      currentPeriod={snapshot.currentPeriod}
      locale={locale}
    />
  );
}
