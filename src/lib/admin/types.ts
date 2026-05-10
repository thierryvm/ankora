import { z } from 'zod';

/**
 * Admin panel V1 metric payload schemas — sections 1, 2, 3.
 *
 * **Status PR-B2 mock-only vertical slice (Option A — verrouillé @thierry/@cowork
 * 2026-05-10).** The four sections ship with the following data sources:
 *
 * | Section | Source PR-B2 | Real-data wiring deferred to |
 * |---|---|---|
 * | 1 Tech health (Sentry + Vercel + GitHub) | full fixture | PR-B2-data-wiring-tech (Sentry SDK + Vercel REST + Octokit setup) |
 * | 2 Product health sub A (workspaces, audit_log) | **real** | shipped here |
 * | 2 Product health sub B (deficit, provisions, capacité, RLS) | fixture | PR-B2-data-wiring-product (post ADR-017/018 migrations) |
 * | 3 Acquisition (signups, GDPR consent, funnel) | full fixture | PR-B2-data-wiring-acquisition (consent_event table migration) |
 * | 4 Recommendations rule-based | **real** (pure TS engine over above metrics) | shipped here (`./recommendations/rules.ts`) |
 *
 * Schemas pin the consumer contract so future real-data wiring swaps the
 * implementation without breaking the UI.
 */

// ============================================================================
// Section 1 — Tech health (full fixture in PR-B2)
// ============================================================================

export const TimeWindowSchema = z.enum(['24h', '7d', '30d']);
export type TimeWindow = z.infer<typeof TimeWindowSchema>;

export const ErrorRatePointSchema = z.object({
  timestamp: z.string().datetime(),
  count: z.number().int().nonnegative(),
});
export type ErrorRatePoint = z.infer<typeof ErrorRatePointSchema>;

export const ErrorRateSeriesSchema = z.object({
  window: TimeWindowSchema,
  totalCount: z.number().int().nonnegative(),
  points: z.array(ErrorRatePointSchema),
});
export type ErrorRateSeries = z.infer<typeof ErrorRateSeriesSchema>;

export const VercelDeploySchema = z.object({
  id: z.string(),
  state: z.enum(['READY', 'BUILDING', 'ERROR', 'CANCELED', 'QUEUED']),
  branch: z.string(),
  durationMs: z.number().int().nonnegative().nullable(),
  createdAt: z.string().datetime(),
});
export type VercelDeploy = z.infer<typeof VercelDeploySchema>;

export const TechHealthMetricsSchema = z.object({
  source: z.literal('mock').or(z.literal('live')),
  generatedAt: z.string().datetime(),
  errors: z.object({
    last24h: ErrorRateSeriesSchema,
    last7d: ErrorRateSeriesSchema,
    last30d: ErrorRateSeriesSchema,
  }),
  deploys: z.array(VercelDeploySchema).max(10),
  buildSizeKb: z.number().int().nonnegative(),
  testsPassRate: z.number().min(0).max(1),
  testsLastRun: z.string().datetime(),
});
export type TechHealthMetrics = z.infer<typeof TechHealthMetricsSchema>;

// ============================================================================
// Section 2 — Product health (partial-mock in PR-B2: sub A real, sub B fixture)
// ============================================================================

export const AuditEventCountSchema = z.object({
  eventType: z.string(),
  count: z.number().int().nonnegative(),
});
export type AuditEventCount = z.infer<typeof AuditEventCountSchema>;

export const ProductHealthMetricsSchema = z.object({
  // 'partial-mock' = sub A workspaces+audit_log live, sub B deficit/provisions/RLS fixture.
  source: z.enum(['mock', 'partial-mock', 'live']),
  generatedAt: z.string().datetime(),

  // Sub A — real queries (Supabase admin)
  activeWorkspaces: z.number().int().nonnegative(),
  auditLogEvents7d: z.array(AuditEventCountSchema),
  auditLogEvents30d: z.array(AuditEventCountSchema),

  // Sub B — fixture (deferred to PR-B2-data-wiring-product, post ADR-017/018)
  provisionsActive: z.number().int().nonnegative(),
  capaciteEpargneAvgEur: z.number().nonnegative(),
  deficitWorkspaceCount: z.number().int().nonnegative(),
  transfersPending: z.number().int().nonnegative(),
  rlsCoveragePct: z.number().min(0).max(1),
  rlsTablesAudited: z.number().int().nonnegative(),
  rlsTablesTotal: z.number().int().nonnegative(),
});
export type ProductHealthMetrics = z.infer<typeof ProductHealthMetricsSchema>;

// ============================================================================
// Section 3 — Acquisition (full fixture in PR-B2)
// ============================================================================

export const SignupPointSchema = z.object({
  date: z.string(),
  count: z.number().int().nonnegative(),
});
export type SignupPoint = z.infer<typeof SignupPointSchema>;

export const FunnelStepSchema = z.object({
  step: z.enum(['signup', 'email_verified', 'workspace_created', 'first_transaction']),
  count: z.number().int().nonnegative(),
});
export type FunnelStep = z.infer<typeof FunnelStepSchema>;

export const AcquisitionMetricsSchema = z.object({
  source: z.literal('mock').or(z.literal('live')),
  generatedAt: z.string().datetime(),
  signups: z.object({
    last24h: z.number().int().nonnegative(),
    last7d: z.number().int().nonnegative(),
    last30d: z.number().int().nonnegative(),
    series30d: z.array(SignupPointSchema),
  }),
  consent: z.object({
    analyticsOptInRate: z.number().min(0).max(1),
    marketingOptInRate: z.number().min(0).max(1),
    sampleSize: z.number().int().nonnegative(),
  }),
  funnel: z.array(FunnelStepSchema).length(4),
});
export type AcquisitionMetrics = z.infer<typeof AcquisitionMetricsSchema>;
