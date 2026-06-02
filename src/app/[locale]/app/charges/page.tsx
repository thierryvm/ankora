import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { getWorkspaceSnapshot } from '@/lib/data/workspace-snapshot';
import { annualTotal, monthlyProvisionTotal, subtotalByFrequency } from '@/lib/domain/budget';
import { ChargesClient } from './ChargesClient';

// PR-D5 i18n: was a hardcoded FR string — broke <title> on EN/NL/DE/ES locales.
// Mirrors the pattern already in `accounts/page.tsx` and `settings/page.tsx`.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app.charges');
  return { title: t('title') };
}

export default async function ChargesPage() {
  const snapshot = await getWorkspaceSnapshot();

  // Money totals are computed in the pure domain (Decimal) and crossed to the
  // client as plain `number` — Decimal must never traverse the RSC boundary
  // (cf. project_decimal_rsc_boundary). All three skip inactive charges, so the
  // per-group subtotals reconcile with the global smoothed/annual totals.
  const subtotals = subtotalByFrequency(snapshot.charges);

  return (
    <ChargesClient
      charges={snapshot.rawCharges}
      subtotals={{
        monthly: subtotals.monthly.toNumber(),
        quarterly: subtotals.quarterly.toNumber(),
        semiannual: subtotals.semiannual.toNumber(),
        annual: subtotals.annual.toNumber(),
      }}
      monthlyProvisionTotal={monthlyProvisionTotal(snapshot.charges).toNumber()}
      annualTotal={annualTotal(snapshot.charges).toNumber()}
    />
  );
}
