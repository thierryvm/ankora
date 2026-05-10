import * as React from 'react';

import { Card } from '@/components/atoms';
import { getTechHealthMetrics } from '@/lib/admin';

import { ErrorRateChart } from '../charts/ErrorRateChart';
import { SimulatedBadge } from './SimulatedBadge';

/**
 * Section 1 — Tech health.
 * Server Component fetches metrics, renders KPIs + Client chart leaf.
 *
 * **PR-B2 status: full fixture** (`source: 'mock'`). Wiring real Sentry +
 * Vercel + GitHub deferred to PR-B2-data-wiring-tech (separate PR, est. 2j).
 */
export async function TechHealthSection(): Promise<React.JSX.Element> {
  const metrics = await getTechHealthMetrics();

  return (
    <Card padding="lg" elevation="raised" eyebrow="Section 1" title="Santé technique">
      {metrics.source === 'mock' && (
        <SimulatedBadge label="Toutes les métriques sont simulées (V0)" />
      )}

      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiBlock label="Erreurs 24h" value={metrics.errors.last24h.totalCount} />
        <KpiBlock label="Erreurs 7j" value={metrics.errors.last7d.totalCount} />
        <KpiBlock label="Tests verts" value={`${Math.round(metrics.testsPassRate * 100)} %`} />
        <KpiBlock label="Build" value={`${Math.round(metrics.buildSizeKb / 10) / 100} MB`} />
      </div>

      <div className="mt-6">
        <h4 className="text-muted-foreground mb-2 text-xs tracking-wide uppercase">
          Erreurs · 7 derniers jours
        </h4>
        <ErrorRateChart points={metrics.errors.last7d.points} ariaLabel="Erreurs sur 7 jours" />
      </div>

      <div className="mt-6">
        <h4 className="text-muted-foreground mb-2 text-xs tracking-wide uppercase">
          Déploiements récents
        </h4>
        <ul className="space-y-2">
          {metrics.deploys.map((d) => (
            <li
              key={d.id}
              className="border-border flex items-center justify-between rounded-md border px-3 py-2 text-sm"
            >
              <span className="font-mono text-xs">{d.branch}</span>
              <span className="flex items-center gap-3">
                <DeployStateBadge state={d.state} />
                <span className="text-muted-foreground text-xs">
                  {d.durationMs ? `${Math.round(d.durationMs / 1000)}s` : '—'}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function KpiBlock({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string | number;
}): React.JSX.Element {
  return (
    <div className="border-border bg-card rounded-md border px-3 py-3">
      <div className="text-muted-foreground text-xs tracking-wide uppercase">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function DeployStateBadge({
  state,
}: {
  readonly state: 'READY' | 'BUILDING' | 'ERROR' | 'CANCELED' | 'QUEUED';
}): React.JSX.Element {
  const map: Record<typeof state, { label: string; cls: string }> = {
    READY: { label: 'OK', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
    BUILDING: { label: 'Build', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
    ERROR: { label: 'Échec', cls: 'bg-red-500/15 text-red-700 dark:text-red-300' },
    CANCELED: { label: 'Annulé', cls: 'bg-gray-500/15 text-gray-700 dark:text-gray-300' },
    QUEUED: { label: 'En file', cls: 'bg-blue-500/15 text-blue-700 dark:text-blue-300' },
  };
  const { label, cls } = map[state];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}
