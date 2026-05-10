import { z } from 'zod';

/**
 * Section 4 — Rule-based recommendations.
 *
 * **Status PR-B2 : real implementation** (pure TS engine, no external deps).
 * The rules engine reads metrics from sections 1-3 and emits prioritized
 * RecommendationCard items. R-02 FSMA-safe : no LLM, no investment advice;
 * the engine surfaces operational signals only (errors rate, signups stall,
 * deficit threshold, etc.).
 *
 * Severity ladder:
 *   - `info`     — observation worth tracking (e.g. signups slowed but >0)
 *   - `warning`  — needs attention this week (e.g. deficit > 30%)
 *   - `critical` — needs attention now (e.g. errors spike, tests rate < 95%)
 */

export const RecommendationSeveritySchema = z.enum(['info', 'warning', 'critical']);
export type RecommendationSeverity = z.infer<typeof RecommendationSeveritySchema>;

export const RecommendationCardSchema = z.object({
  id: z.string().min(1),
  severity: RecommendationSeveritySchema,
  title: z.string().min(1),
  body: z.string().min(1),
  cta: z
    .object({
      label: z.string().min(1),
      href: z.string(),
    })
    .optional(),
  triggeredBy: z.string().min(1),
});
export type RecommendationCard = z.infer<typeof RecommendationCardSchema>;
