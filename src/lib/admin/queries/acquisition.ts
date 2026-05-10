import { AcquisitionMetricsSchema, type AcquisitionMetrics } from '../types';

/**
 * Section 3 — Acquisition metrics.
 *
 * **Status PR-B2 : full fixture.** Real wiring deferred to
 * `PR-B2-data-wiring-acquisition` (requires `consent_event` table migration
 * — currently no schema for tracking consent decisions over time, only the
 * `audit_log` trail of auth.signup which doesn't separate analytics vs
 * marketing opt-in rates).
 *
 * Schema pinned now so the future swap to live queries doesn't break UI.
 */

function buildFixture(): AcquisitionMetrics {
  const now = new Date();

  // 30-day signup series (deterministic — no random for SSR stability)
  const series30d = Array.from({ length: 30 }, (_, i) => {
    const date = new Date(now.getTime() - (29 - i) * 24 * 60 * 60 * 1000);
    return {
      date: date.toISOString().slice(0, 10),
      count: 1 + ((i * 3) % 7),
    };
  });

  const last30d = series30d.reduce((acc, p) => acc + p.count, 0);
  const last7d = series30d.slice(-7).reduce((acc, p) => acc + p.count, 0);
  const last24h = series30d[series30d.length - 1]?.count ?? 0;

  return AcquisitionMetricsSchema.parse({
    source: 'mock',
    generatedAt: now.toISOString(),
    signups: {
      last24h,
      last7d,
      last30d,
      series30d,
    },
    consent: {
      analyticsOptInRate: 0.42,
      marketingOptInRate: 0.18,
      sampleSize: last30d,
    },
    funnel: [
      { step: 'signup', count: last30d },
      { step: 'email_verified', count: Math.round(last30d * 0.91) },
      { step: 'workspace_created', count: Math.round(last30d * 0.78) },
      { step: 'first_transaction', count: Math.round(last30d * 0.46) },
    ],
  });
}

export async function getAcquisitionMetrics(): Promise<AcquisitionMetrics> {
  return buildFixture();
}
