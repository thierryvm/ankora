import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';

import { createClient } from '@/lib/supabase/server';
import { getWorkspaceSnapshot } from '@/lib/data/workspace-snapshot';
import { annualTotal, monthlyProvisionTotal, subtotalByFrequency } from '@/lib/domain/budget';
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

const ordinal = (p: Period): number => p.year * 12 + p.month;

/**
 * Month-history navigation (@thierry priority 2026-07-19): `?period=YYYY-MM`
 * selects which month's payment ledger the page shows. Invalid, future, or
 * pre-floor values silently fall back to the current period — the URL is
 * user-controlled input, never trusted.
 */
function parseViewedPeriod(raw: string | undefined, current: Period): Period {
  if (!raw || !PERIOD_RE.test(raw)) return current;
  const [y, m] = raw.split('-').map(Number) as [number, number];
  const candidate = { year: y, month: m };
  if (ordinal(candidate) > ordinal(current) || ordinal(candidate) < ordinal(PERIOD_FLOOR)) {
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

  // Money totals are computed in the pure domain (Decimal) and crossed to the
  // client as plain `number` — Decimal must never traverse the RSC boundary
  // (cf. project_decimal_rsc_boundary). All three skip inactive charges, so the
  // per-group subtotals reconcile with the global smoothed/annual totals.
  const subtotals = subtotalByFrequency(snapshot.charges);

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
      paidChargeIds={paidChargeIds}
      currentPeriod={viewed}
      periodNav={{
        label: monthLabel(viewed),
        prevParam: ordinal(prev) >= ordinal(PERIOD_FLOOR) ? toParam(prev) : null,
        nextParam: isCurrent ? null : toParam(next),
        isCurrent,
        currentLabel: monthLabel(current),
      }}
    />
  );
}
