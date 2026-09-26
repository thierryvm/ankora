import { moisDansLaPhrase } from '@/components/cockpit/mois-vu';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';

import { createClient } from '@/lib/supabase/server';
import { commitmentRowToDomain } from '@/lib/data/commitment-row';
import { getCommitmentsWithLedger } from '@/lib/data/commitments';
import { getSnapshotWith, toCockpitCharges } from '@/lib/data/workspace-snapshot';
import { todayInAnkoraTz } from '@/lib/date/tz';
import {
  chargesFixesDuMois,
  engagementsDuMois,
  engagementsMensuelsLisses,
  lissageDuMois,
  type Poste,
} from '@/lib/domain/cockpit';
import { paymentKey, type PaymentLedger } from '@/lib/domain/cockpit/types';
import {
  aPayerCeMois,
  detecterDoublonsProbables,
  echeancesPassees,
  effortLisse,
  effortLisseAnnuel,
  gesteGroupePour,
  obligationsDuMois,
  type NamedCommitment,
} from '@/lib/domain/obligations';
import { formatMonth } from '@/lib/i18n/formatters';
import {
  isSamePeriod,
  parseViewedPeriod,
  viewedPeriodNav,
  type Period,
} from '@/lib/domain/period/viewed-period';
import { log } from '@/lib/log';
import type { Locale } from '@/i18n/routing';
import { ChargesClient } from './ChargesClient';

// PR-D5 i18n: was a hardcoded FR string — broke <title> on EN/NL/DE/ES locales.
// Mirrors the pattern already in `accounts/page.tsx` and `settings/page.tsx`.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app.charges');
  return { title: t('title') };
}

/** A domain `Poste` as plain numbers — Decimal never crosses the RSC boundary. */
const posteView = (poste: Poste) => ({
  total: poste.total.toNumber(),
  parts: poste.parts.map((p) => ({
    id: p.id,
    label: p.libelle,
    monthly: p.montantMensuel.toNumber(),
    invoiceAmount: p.origine?.montantFacture.toNumber() ?? p.montantMensuel.toNumber(),
    cycleMonths: p.origine?.cycleMois ?? 1,
  })),
});

export default async function ChargesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  // The commitments read needs only the workspace id: it leaves with the
  // snapshot reads (see the note on commitments below).
  const [[snapshot, { commitments: commitmentRows, paidKeysByCommitment }], params, locale] =
    await Promise.all([
      getSnapshotWith('/app/charges', (workspaceId) => getCommitmentsWithLedger(workspaceId)),
      searchParams,
      getLocale() as Promise<Locale>,
    ]);

  const current = snapshot.currentPeriod;
  const viewed = parseViewedPeriod(params.period, current);
  const isCurrent = isSamePeriod(viewed, current);

  // Chantier 3 — the month's obligations are ONE list. Commitments are read
  // here for the same reason they are read on the cockpit: their instalments
  // are cash leaving the account this month, and until now the only screen
  // showing them was a different tab. Same single read as `/app/commitments`,
  // so the two surfaces can never disagree on what is owed. (Read above, with
  // the snapshot.)

  // Paid charge ids for the VIEWED period. Current month comes free with the
  // snapshot; a past month needs one extra RLS-scoped read. The toggle action
  // re-verifies workspace ownership before any write — these ids are only
  // optimistic-UI seed data the user already owns.
  let paidChargeIds = snapshot.currentMonthPayments.map((p) => p.chargeId);
  if (!isCurrent) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('charge_payments')
      .select('charge_id')
      .eq('workspace_id', snapshot.workspaceId)
      .eq('period_year', viewed.year)
      .eq('period_month', viewed.month);
    if (error) {
      log.error('Failed to load viewed-period charge payments', {
        workspace_id: snapshot.workspaceId,
        error_code: error.code ?? 'unknown',
      });
    }
    paidChargeIds = (data ?? []).map((p) => p.charge_id);
  }

  const monthLabel = (p: Period) => `${formatMonth(p.month, locale, 'long')} ${p.year}`;
  const nav = viewedPeriodNav(viewed, current);

  // --- The month's obligations, derived (never generated). ---
  const cockpitCharges = toCockpitCharges(snapshot.charges);
  const commitments: NamedCommitment[] = commitmentRows.map((c) => ({
    ...commitmentRowToDomain(c),
    label: c.label,
  }));
  const commitmentLedger = new Map(
    Object.entries(paidKeysByCommitment).map(([id, keys]) => [id, new Set(keys)] as const),
  );
  const chargePayments: PaymentLedger = new Map(
    paidChargeIds.map((id) => [paymentKey(id, viewed.year, viewed.month), true]),
  );

  const obligations = obligationsDuMois({
    charges: cockpitCharges,
    chargePayments,
    commitments,
    paidKeysByCommitment: commitmentLedger,
    ref: viewed,
  });

  // « Effort lissé » is a property of the CURRENT month's obligations, not of
  // the month being browsed: it is the standing monthly burden, and quoting a
  // past month's version of it next to a past month's cash would invent a
  // second meaning for the same words.
  const engagementsMensuels = engagementsMensuelsLisses(commitments, commitmentLedger, current);

  const pastDue = echeancesPassees(obligations, viewed, todayInAnkoraTz());
  const bulkGesture = gesteGroupePour(pastDue);

  return (
    // Money totals stay pure-domain Decimal server-side, crossed as plain
    // `number` — Decimal never traverses the RSC boundary.
    <ChargesClient
      charges={snapshot.rawCharges}
      paidChargeIds={paidChargeIds}
      viewedPeriod={viewed}
      commitmentInstalments={obligations
        .filter((o) => o.source === 'commitment')
        .map((o) => ({
          id: o.id,
          label: o.label,
          amountDue: o.amountDue.toNumber(),
          paymentDay: o.paymentDay,
          isPaid: o.isPaid,
          installmentIndex: o.installmentIndex ?? 1,
          installmentsTotal: o.installmentsTotal ?? 1,
        }))}
      aPayerCeMoisTotal={aPayerCeMois(obligations).toNumber()}
      effortLisseTotal={effortLisse(cockpitCharges, engagementsMensuels).toNumber()}
      effortLisseAnnuelTotal={effortLisseAnnuel(cockpitCharges, engagementsMensuels).toNumber()}
      // « Effort lissé » in its narrow sense (F-3): the monthly share of the
      // NON-monthly bills only, with the bill each part comes from (DESIGN-v3
      // rule 28). Read from the domain's existing decomposition — no new sum.
      lissage={posteView(lissageDuMois(cockpitCharges))}
      // The two other shares of « Compté chaque mois » (rule of code 10). Same
      // domain producers as the cockpit's cascade; `effortLisse` is exactly
      // fixes + lissage + engagements, each `Poste` summing its own parts.
      // Engagements at the CURRENT month, like `engagementsMensuels` above.
      monthlyBills={posteView(chargesFixesDuMois(cockpitCharges))}
      commitmentShare={posteView(engagementsDuMois(commitments, commitmentLedger, current))}
      duplicates={detecterDoublonsProbables({
        charges: cockpitCharges,
        commitments,
        ref: viewed,
      }).map((d) => ({ ...d }))}
      bulk={{ gesture: bulkGesture, pastDueCount: pastDue.length }}
      periodNav={{
        label: monthLabel(viewed),
        prevParam: nav.prevParam,
        nextParam: nav.nextParam,
        isCurrent,
        // Mid-sentence (« Revenir à septembre 2026 »): never the title's capital.
        currentLabel: `${moisDansLaPhrase(current.month, locale)} ${current.year}`,
      }}
    />
  );
}
