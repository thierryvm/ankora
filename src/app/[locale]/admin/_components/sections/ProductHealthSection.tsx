import * as React from 'react';

import { Card } from '@/components/atoms';
import { getProductHealthMetrics } from '@/lib/admin';

import { SimulatedBadge } from './SimulatedBadge';

/**
 * Section 2 — Product health.
 * Server Component fetches metrics (sub A real if Supabase reachable, sub B
 * fixture). Renders KPI cards + audit log activity table.
 *
 * **PR-B2 status: partial-mock** — `workspaces.count()` + `audit_log` events
 * 7d/30d are real. Deficit, provisions, capacité épargne, RLS coverage are
 * fixtures (deferred to PR-B2-data-wiring-product post ADR-017/018).
 */
export async function ProductHealthSection(): Promise<React.JSX.Element> {
  const metrics = await getProductHealthMetrics();
  const realLive = metrics.source === 'partial-mock';

  return (
    <Card padding="lg" elevation="raised" eyebrow="Section 2" title="Santé produit">
      {realLive ? (
        <SimulatedBadge label="Sub A (workspaces, audit log) live · Sub B (déficit, provisions, RLS) simulé" />
      ) : (
        <SimulatedBadge label="Toutes les métriques en fallback fixture (Supabase indisponible)" />
      )}

      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiBlock label="Workspaces actifs" value={metrics.activeWorkspaces} live={realLive} />
        <KpiBlock label="Provisions actives" value={metrics.provisionsActive} simulated />
        <KpiBlock
          label="Capacité épargne (€)"
          value={metrics.capaciteEpargneAvgEur.toFixed(0)}
          simulated
        />
        <KpiBlock label="Workspaces déficit" value={metrics.deficitWorkspaceCount} simulated />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3">
        <KpiBlock label="Transferts pending" value={metrics.transfersPending} simulated />
        <KpiBlock
          label="RLS coverage"
          value={`${Math.round(metrics.rlsCoveragePct * 100)} %`}
          simulated
        />
        <KpiBlock
          label="Tables RLS auditées"
          value={`${metrics.rlsTablesAudited} / ${metrics.rlsTablesTotal}`}
          simulated
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <AuditEventList title="Audit log · 7 derniers jours" events={metrics.auditLogEvents7d} />
        <AuditEventList title="Audit log · 30 derniers jours" events={metrics.auditLogEvents30d} />
      </div>
    </Card>
  );
}

function KpiBlock({
  label,
  value,
  live,
  simulated,
}: {
  readonly label: string;
  readonly value: string | number;
  readonly live?: boolean;
  readonly simulated?: boolean;
}): React.JSX.Element {
  return (
    <div className="border-border bg-card rounded-md border px-3 py-3">
      <div className="text-muted-foreground flex items-center gap-2 text-xs tracking-wide uppercase">
        <span>{label}</span>
        {live && (
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" aria-label="Live" />
        )}
        {simulated && (
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" aria-label="Simulé" />
        )}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function AuditEventList({
  title,
  events,
}: {
  readonly title: string;
  readonly events: ReadonlyArray<{ readonly eventType: string; readonly count: number }>;
}): React.JSX.Element {
  return (
    <div>
      <h4 className="text-muted-foreground mb-2 text-xs tracking-wide uppercase">{title}</h4>
      {events.length === 0 ? (
        <p className="text-muted-foreground text-sm">Aucun événement.</p>
      ) : (
        <ul className="space-y-1">
          {events.map((e) => (
            <li
              key={e.eventType}
              className="border-border flex items-center justify-between border-b py-1 text-sm last:border-b-0"
            >
              <span className="font-mono text-xs">{e.eventType}</span>
              <span className="tabular-nums">{e.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
