import { createAdminClient } from '@/lib/supabase/server';
import { log } from '@/lib/log';

import {
  ProductHealthMetricsSchema,
  type AuditEventCount,
  type ProductHealthMetrics,
} from '../types';

/**
 * Section 2 — Product health metrics.
 *
 * **Status PR-B2 : partial-mock.**
 *   - Sub A (real, this PR) : `workspaces.count()`, `audit_log` events
 *     groupBy event_type for 7d + 30d windows.
 *   - Sub B (fixture, deferred PR-B2-data-wiring-product post ADR-017/018) :
 *     deficit count, provisions active, capacité épargne moyenne, RLS coverage.
 *
 * Falls back to full fixture if Supabase admin queries crash (dev local
 * without Supabase running, or transient outage). UI surfaces source =
 * `partial-mock` (real-from-supabase) vs `mock` (full fallback) so the
 * "(simulated)" badge can differentiate live vs fallback fixtures.
 */

const FIXTURE_SUB_B = {
  provisionsActive: 312,
  capaciteEpargneAvgEur: 184.5,
  deficitWorkspaceCount: 6,
  transfersPending: 3,
  rlsCoveragePct: 0.95,
  rlsTablesAudited: 19,
  rlsTablesTotal: 20,
} as const;

function buildFullFixture(generatedAt: string): ProductHealthMetrics {
  return ProductHealthMetricsSchema.parse({
    source: 'mock',
    generatedAt,
    activeWorkspaces: 47,
    auditLogEvents7d: [
      { eventType: 'auth.signup', count: 12 },
      { eventType: 'workspace.created', count: 9 },
      { eventType: 'charge.created', count: 38 },
    ],
    auditLogEvents30d: [
      { eventType: 'auth.signup', count: 47 },
      { eventType: 'workspace.created', count: 41 },
      { eventType: 'charge.created', count: 162 },
    ],
    ...FIXTURE_SUB_B,
  });
}

function aggregateByEventType(rows: ReadonlyArray<{ event_type: string }>): AuditEventCount[] {
  const tally = new Map<string, number>();
  for (const r of rows) {
    tally.set(r.event_type, (tally.get(r.event_type) ?? 0) + 1);
  }
  return Array.from(tally.entries())
    .map(([eventType, count]) => ({ eventType, count }))
    .sort((a, b) => b.count - a.count);
}

export async function getProductHealthMetrics(): Promise<ProductHealthMetrics> {
  const generatedAt = new Date().toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const supabase = await createAdminClient();

    // Sub A — live queries
    const [{ count: activeWorkspaces }, { data: events7d }, { data: events30d }] =
      await Promise.all([
        supabase.from('workspaces').select('*', { count: 'exact', head: true }),
        supabase.from('audit_log').select('event_type').gte('occurred_at', sevenDaysAgo),
        supabase.from('audit_log').select('event_type').gte('occurred_at', thirtyDaysAgo),
      ]);

    return ProductHealthMetricsSchema.parse({
      source: 'partial-mock',
      generatedAt,
      activeWorkspaces: activeWorkspaces ?? 0,
      auditLogEvents7d: aggregateByEventType(events7d ?? []),
      auditLogEvents30d: aggregateByEventType(events30d ?? []),
      ...FIXTURE_SUB_B,
    });
  } catch (err) {
    // Fallback : Supabase indisponible (dev local without container, or
    // transient outage) → return full fixture. UI badge shows 'mock' so
    // operators know the data is not live.
    log.warn('getProductHealthMetrics: Supabase admin query failed, falling back to full fixture', {
      err: err instanceof Error ? err.message : String(err),
    });
    return buildFullFixture(generatedAt);
  }
}
