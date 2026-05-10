import * as React from 'react';

import { Card } from '@/components/atoms';
import {
  generateRecommendations,
  getAcquisitionMetrics,
  getProductHealthMetrics,
  getTechHealthMetrics,
  type RecommendationCard,
} from '@/lib/admin';

/**
 * Section 4 — Rule-based recommendations.
 *
 * **PR-B2 status: REAL** — pure TS rules engine evaluates the metrics from
 * sections 1-3 and emits prioritized cards. R-02 FSMA-safe: operational
 * signals only, no LLM, no investment advice. Severity ladder critical →
 * warning → info.
 *
 * The engine is exhaustively tested in
 * `src/lib/admin/recommendations/__tests__/rules.test.ts` (PR-B2 Commit 4).
 */
export async function RecommendationsSection(): Promise<React.JSX.Element> {
  const [tech, product, acquisition] = await Promise.all([
    getTechHealthMetrics(),
    getProductHealthMetrics(),
    getAcquisitionMetrics(),
  ]);

  const recommendations = generateRecommendations({ tech, product, acquisition });

  return (
    <Card padding="lg" elevation="raised" eyebrow="Section 4" title="Recommandations rule-based">
      {recommendations.length === 0 ? (
        <p className="text-muted-foreground mt-4 text-sm">
          Tout va bien. Aucune règle déclenchée sur les métriques actuelles.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {recommendations.map((card) => (
            <RecommendationCardItem key={card.id} card={card} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function RecommendationCardItem({
  card,
}: {
  readonly card: RecommendationCard;
}): React.JSX.Element {
  const severityCls: Record<RecommendationCard['severity'], string> = {
    critical: 'border-red-500/40 bg-red-500/5',
    warning: 'border-amber-500/40 bg-amber-500/5',
    info: 'border-blue-500/40 bg-blue-500/5',
  };

  const severityLabel: Record<RecommendationCard['severity'], string> = {
    critical: 'Critique',
    warning: 'À surveiller',
    info: 'Info',
  };

  return (
    <li className={`rounded-md border px-4 py-3 ${severityCls[card.severity]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold tracking-wide uppercase">
              {severityLabel[card.severity]}
            </span>
            <span className="text-muted-foreground text-xs">·</span>
            <span className="text-muted-foreground text-xs">{card.id}</span>
          </div>
          <h4 className="mt-1 text-sm font-semibold">{card.title}</h4>
          <p className="text-muted-foreground mt-1 text-sm">{card.body}</p>
          <p className="text-muted-foreground/70 mt-2 font-mono text-xs">
            Trigger: {card.triggeredBy}
          </p>
        </div>
        {card.cta && (
          <a
            href={card.cta.href}
            className="border-border hover:bg-card shrink-0 rounded-md border bg-transparent px-3 py-1.5 text-xs font-medium"
          >
            {card.cta.label}
          </a>
        )}
      </div>
    </li>
  );
}
