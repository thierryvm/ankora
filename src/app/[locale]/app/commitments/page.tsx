import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';

import { commitmentRowToDomain } from '@/lib/data/commitment-row';
import { getCommitmentsWithLedger } from '@/lib/data/commitments';
import { aPayerCeMois, obligationsDuMois } from '@/lib/domain/obligations';
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

  // E5 — « ce mois : k échéances, X ». The same derivation `/app/charges`
  // uses for its commitment rows (`obligationsDuMois`), with no charges in
  // the input so only instalments come back; paid ones included, like the
  // mockup's `echeancesDuMois`. Summed by the domain's `aPayerCeMois`.
  const dueThisMonth = obligationsDuMois({
    charges: [],
    chargePayments: new Map(),
    commitments: commitments.map((c) => ({ ...commitmentRowToDomain(c), label: c.label })),
    paidKeysByCommitment: new Map(
      Object.entries(paidKeysByCommitment).map(([id, keys]) => [id, new Set(keys)] as const),
    ),
    ref: snapshot.currentPeriod,
  });

  return (
    <CommitmentsClient
      commitments={commitments}
      paidKeysByCommitment={paidKeysByCommitment}
      currentPeriod={snapshot.currentPeriod}
      thisMonth={{
        total: aPayerCeMois(dueThisMonth).toNumber(),
        parts: dueThisMonth.map((o) => ({
          id: o.id,
          label: o.label,
          amount: o.amountDue.toNumber(),
          isPaid: o.isPaid,
        })),
      }}
      locale={locale}
    />
  );
}
