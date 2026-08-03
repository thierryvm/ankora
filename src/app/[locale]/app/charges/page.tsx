import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';

import { createClient } from '@/lib/supabase/server';
import { commitmentRowToDomain } from '@/lib/data/commitment-row';
import { getCommitmentsWithLedger } from '@/lib/data/commitments';
import { getWorkspaceSnapshot, toCockpitCharges } from '@/lib/data/workspace-snapshot';
import { todayInAnkoraTz } from '@/lib/date/tz';
import { engagementsMensuelsLisses } from '@/lib/domain/cockpit';
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
import { log } from '@/lib/log';
import type { Locale } from '@/i18n/routing';
import { ChargesClient } from './ChargesClient';

// PR-D5 i18n: was a hardcoded FR string — broke <title> on EN/NL/DE/ES locales.
// Mirrors the pattern already in `accounts/page.tsx` and `settings/page.tsx`.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app.charges');
  return { title: t('title') };
}

type Period = { year: number; month: number };

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
/** No payment data can exist before the app's first release month. */
const PERIOD_FLOOR: Period = { year: 2026, month: 1 };
/** Forward horizon (@thierry 2026-07-19): browse up to a year ahead to see
 *  what's coming — due dates render for that month, ledger is simply empty. */
const FUTURE_SPAN_MONTHS = 12;

const ordinal = (p: Period): number => p.year * 12 + p.month;

/**
 * Month-history navigation (@thierry priority 2026-07-19): `?period=YYYY-MM`
 * selects which month's payment ledger the page shows. Invalid, pre-floor, or
 * beyond-horizon values silently fall back to the current period — the URL is
 * user-controlled input, never trusted.
 */
function parseViewedPeriod(raw: string | undefined, current: Period): Period {
  if (!raw || !PERIOD_RE.test(raw)) return current;
  const [y, m] = raw.split('-').map(Number) as [number, number];
  const candidate = { year: y, month: m };
  if (
    ordinal(candidate) > ordinal(current) + FUTURE_SPAN_MONTHS ||
    ordinal(candidate) < ordinal(PERIOD_FLOOR)
  ) {
    return current;
  }
  return candidate;
}

const shift = (p: Period, delta: 1 | -1): Period => {
  const total = p.year * 12 + (p.month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
};

const toParam = (p: Period): string => `${p.year}-${String(p.month).padStart(2, '0')}`;

export default async function ChargesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const [snapshot, params, locale] = await Promise.all([
    getWorkspaceSnapshot(),
    searchParams,
    getLocale() as Promise<Locale>,
  ]);

  const current = snapshot.currentPeriod;
  const viewed = parseViewedPeriod(params.period, current);
  const isCurrent = ordinal(viewed) === ordinal(current);

  // Chantier 3 — the month's obligations are ONE list. Commitments are read
  // here for the same reason they are read on the cockpit: their instalments
  // are cash leaving the account this month, and until now the only screen
  // showing them was a different tab. Same single read as `/app/commitments`,
  // so the two surfaces can never disagree on what is owed.
  const { commitments: commitmentRows, paidKeysByCommitment } = await getCommitmentsWithLedger(
    snapshot.workspaceId,
  );

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
  const prev = shift(viewed, -1);
  const next = shift(viewed, 1);

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
      duplicates={detecterDoublonsProbables({
        charges: cockpitCharges,
        commitments,
        ref: viewed,
      }).map((d) => ({ ...d }))}
      bulk={{ gesture: bulkGesture, pastDueCount: pastDue.length }}
      periodNav={{
        label: monthLabel(viewed),
        prevParam: ordinal(prev) >= ordinal(PERIOD_FLOOR) ? toParam(prev) : null,
        nextParam: ordinal(next) <= ordinal(current) + FUTURE_SPAN_MONTHS ? toParam(next) : null,
        isCurrent,
        currentLabel: monthLabel(current),
      }}
    />
  );
}
