import * as React from 'react';

import { Card } from '@/components/atoms';
import { getAcquisitionMetrics } from '@/lib/admin';

import { SignupsChart } from '../charts/SignupsChart';
import { SimulatedBadge } from './SimulatedBadge';

/**
 * Section 3 — Acquisition.
 * Server Component fetches metrics, renders signups chart + funnel + GDPR rates.
 *
 * **PR-B2 status: full fixture** (`source: 'mock'`). Wiring real consent
 * tracking deferred to PR-B2-data-wiring-acquisition (consent_event table
 * migration + funnel hooks at signup/email-verified/workspace-created/
 * first-transaction).
 */
export async function AcquisitionSection(): Promise<React.JSX.Element> {
  const metrics = await getAcquisitionMetrics();

  return (
    <Card padding="lg" elevation="raised" eyebrow="Section 3" title="Acquisition">
      {metrics.source === 'mock' && (
        <SimulatedBadge label="Toutes les métriques sont simulées (V0)" />
      )}

      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiBlock label="Signups 24h" value={metrics.signups.last24h} />
        <KpiBlock label="Signups 7j" value={metrics.signups.last7d} />
        <KpiBlock label="Signups 30j" value={metrics.signups.last30d} />
        <KpiBlock
          label="Opt-in analytics"
          value={`${Math.round(metrics.consent.analyticsOptInRate * 100)} %`}
        />
      </div>

      <div className="mt-6">
        <h4 className="text-muted-foreground mb-2 text-xs tracking-wide uppercase">
          Signups · 30 derniers jours
        </h4>
        <SignupsChart series={metrics.signups.series30d} ariaLabel="Signups sur 30 jours" />
      </div>

      <div className="mt-6">
        <h4 className="text-muted-foreground mb-3 text-xs tracking-wide uppercase">
          Entonnoir d&apos;activation
        </h4>
        <ul className="space-y-2">
          {metrics.funnel.map((step, i) => {
            const max = metrics.funnel[0]?.count ?? 1;
            const pct = Math.round((step.count / Math.max(max, 1)) * 100);
            return (
              <li key={step.step} className="flex items-center gap-3">
                <span className="text-muted-foreground w-40 text-xs">
                  {humanizeStep(step.step)}
                </span>
                <div className="bg-card border-border h-6 flex-1 overflow-hidden rounded-md border">
                  <div
                    className="h-full bg-emerald-500/30"
                    style={{ width: `${pct}%` }}
                    aria-hidden="true"
                  />
                </div>
                <span className="w-16 text-right text-sm tabular-nums">{step.count}</span>
                {i > 0 && (
                  <span className="text-muted-foreground w-12 text-right text-xs tabular-nums">
                    {pct}%
                  </span>
                )}
              </li>
            );
          })}
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

function humanizeStep(
  step: 'signup' | 'email_verified' | 'workspace_created' | 'first_transaction',
): string {
  const map = {
    signup: 'Signup',
    email_verified: 'Email vérifié',
    workspace_created: 'Workspace créé',
    first_transaction: 'Première transaction',
  } as const;
  return map[step];
}
