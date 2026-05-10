import { TechHealthMetricsSchema, type TechHealthMetrics } from '../types';

/**
 * Section 1 — Tech health metrics.
 *
 * **Status PR-B2 : full fixture.** Real wiring deferred to
 * `PR-B2-data-wiring-tech` (Sentry SDK + DSN, Vercel REST API token, GitHub
 * PAT + Octokit). Once those land, swap `getTechHealthMetrics()` to read
 * live and return `source: 'live'`. The Zod schema pins the consumer
 * contract so the swap doesn't break the UI.
 *
 * Fixture is deterministic (no random) so SSR + tests are stable.
 */

function buildFixture(): TechHealthMetrics {
  const now = new Date();
  const isoNow = now.toISOString();

  // Last 24h: hourly buckets, gentle bell curve (peak around midday).
  const hourly24h = [3, 2, 1, 0, 0, 1, 2, 4, 6, 5, 3, 2, 1, 1, 2, 3, 5, 7, 6, 4, 3, 2, 1, 1];
  const points24h = hourly24h.map((count, i) => ({
    timestamp: new Date(now.getTime() - (23 - i) * 60 * 60 * 1000).toISOString(),
    count,
  }));

  // Last 7d: daily buckets, baseline ~35 errors/day.
  const daily7d = [42, 38, 51, 29, 45, 33, 28];
  const points7d = daily7d.map((count, i) => ({
    timestamp: new Date(now.getTime() - (6 - i) * 24 * 60 * 60 * 1000).toISOString(),
    count,
  }));

  // Last 30d: deterministic-ish series (modulo for variation without randomness).
  const points30d = Array.from({ length: 30 }, (_, i) => ({
    timestamp: new Date(now.getTime() - (29 - i) * 24 * 60 * 60 * 1000).toISOString(),
    count: 30 + ((i * 7) % 25),
  }));

  const sum = (pts: ReadonlyArray<{ count: number }>): number =>
    pts.reduce((acc, p) => acc + p.count, 0);

  return TechHealthMetricsSchema.parse({
    source: 'mock',
    generatedAt: isoNow,
    errors: {
      last24h: { window: '24h', totalCount: sum(points24h), points: points24h },
      last7d: { window: '7d', totalCount: sum(points7d), points: points7d },
      last30d: { window: '30d', totalCount: sum(points30d), points: points30d },
    },
    deploys: [
      {
        id: 'dpl_mock_01',
        state: 'READY',
        branch: 'main',
        durationMs: 78_400,
        createdAt: new Date(now.getTime() - 35 * 60 * 1000).toISOString(),
      },
      {
        id: 'dpl_mock_02',
        state: 'READY',
        branch: 'feat/pr-b2-mock-vertical-slice',
        durationMs: 92_100,
        createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'dpl_mock_03',
        state: 'ERROR',
        branch: 'feat/temp',
        durationMs: 23_500,
        createdAt: new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString(),
      },
    ],
    buildSizeKb: 1842,
    testsPassRate: 1.0,
    testsLastRun: new Date(now.getTime() - 8 * 60 * 1000).toISOString(),
  });
}

export async function getTechHealthMetrics(): Promise<TechHealthMetrics> {
  return buildFixture();
}
