import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';

import { getCommitmentsWithLedger } from '@/lib/data/commitments';
import { getSnapshotWith } from '@/lib/data/workspace-snapshot';
import type { Locale } from '@/i18n/routing';
import { CommitmentsClient } from './CommitmentsClient';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app.commitments');
  return { title: t('title') };
}

export default async function CommitmentsPage() {
  // Shared read — the dashboard card uses the exact same source, so the two
  // surfaces can never disagree on what is owed. It needs only the workspace
  // id, so it leaves with the snapshot reads instead of after them.
  const [[snapshot, { commitments, paidKeysByCommitment }], locale] = await Promise.all([
    getSnapshotWith('/app/commitments', (workspaceId) => getCommitmentsWithLedger(workspaceId)),
    getLocale() as Promise<Locale>,
  ]);

  return (
    <CommitmentsClient
      commitments={commitments}
      paidKeysByCommitment={paidKeysByCommitment}
      currentPeriod={snapshot.currentPeriod}
      locale={locale}
    />
  );
}
