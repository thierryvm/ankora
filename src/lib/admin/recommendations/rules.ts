import type { AcquisitionMetrics, ProductHealthMetrics, TechHealthMetrics } from '../types';
import type { RecommendationCard } from './types';

/**
 * Rule-based recommendations engine — pure TypeScript, no I/O, no LLM.
 *
 * Each rule is a pure function `(metrics) => RecommendationCard | null`. The
 * engine evaluates rules in order and returns the non-null cards sorted by
 * severity (`critical` > `warning` > `info`). Rules can be added/tuned
 * without DB migration.
 *
 * R-02 FSMA-safe constraint: rules emit operational signals only (errors,
 * signups, deficit threshold). They never recommend investment moves nor
 * cite individual user data.
 */

export interface AdminMetricsBundle {
  readonly tech: TechHealthMetrics;
  readonly product: ProductHealthMetrics;
  readonly acquisition: AcquisitionMetrics;
}

type Rule = (metrics: AdminMetricsBundle) => RecommendationCard | null;

const SEVERITY_ORDER: Record<RecommendationCard['severity'], number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

/**
 * R-01: Errors rate spike — critical if >100 errors in last 24h.
 * Source signal: Section 1 Sentry errors series last24h.totalCount.
 */
const errorsSpikeRule: Rule = ({ tech }) => {
  const count = tech.errors.last24h.totalCount;
  if (count <= 100) return null;
  return {
    id: 'errors-spike-24h',
    severity: 'critical',
    title: 'Pic d’erreurs détecté (24h)',
    body: `${count} erreurs sur les 24 dernières heures. Investiguer Sentry pour identifier le pattern et corriger la cause racine avant qu’il ne contamine d’autres surfaces.`,
    cta: { label: 'Ouvrir Sentry', href: 'https://sentry.io' },
    triggeredBy: 'tech.errors.last24h.totalCount > 100',
  };
};

/**
 * R-02: Tests pass rate dégradé — critical if < 95%.
 * Source signal: Section 1 testsPassRate.
 */
const testsRateRule: Rule = ({ tech }) => {
  if (tech.testsPassRate >= 0.95) return null;
  const pct = Math.round(tech.testsPassRate * 100);
  return {
    id: 'tests-rate-low',
    severity: 'critical',
    title: 'Suite de tests en dégradation',
    body: `${pct}% de tests verts (seuil cible 95%). Investiguer la CI : flake déterministe, régression code, ou env CI corrompu. Bloquant pour merge en l’état.`,
    cta: { label: 'Voir CI', href: 'https://github.com/thierryvm/ankora/actions' },
    triggeredBy: 'tech.testsPassRate < 0.95',
  };
};

/**
 * R-03: Acquisition stall — warning if signups_30d == 0 && activeWorkspaces > 0.
 * Source signal: Section 3 signups.last30d, Section 2 activeWorkspaces.
 */
const acquisitionStallRule: Rule = ({ acquisition, product }) => {
  if (acquisition.signups.last30d > 0) return null;
  if (product.activeWorkspaces === 0) return null;
  return {
    id: 'acquisition-stall-30d',
    severity: 'warning',
    title: 'Aucun nouveau workspace depuis 30 jours',
    body: `Le produit a ${product.activeWorkspaces} workspace(s) actif(s) mais 0 nouveau signup sur 30j. Pousser l’acquisition (landing SEO, partenariats, content marketing).`,
    triggeredBy: 'acquisition.signups.last30d == 0 && product.activeWorkspaces > 0',
  };
};

/**
 * R-04: Déficit threshold — warning if deficit_count_pct > 30% des workspaces.
 * Source signal: Section 2 deficitWorkspaceCount / activeWorkspaces.
 * Renvoie sur ADR-011 (flow détection déficit) pour révision logique métier.
 */
const deficitThresholdRule: Rule = ({ product }) => {
  if (product.activeWorkspaces === 0) return null;
  const pct = product.deficitWorkspaceCount / product.activeWorkspaces;
  if (pct <= 0.3) return null;
  const pctRounded = Math.round(pct * 100);
  return {
    id: 'deficit-threshold-exceeded',
    severity: 'warning',
    title: `${pctRounded}% des workspaces en déficit`,
    body: `${product.deficitWorkspaceCount}/${product.activeWorkspaces} workspaces actifs sont en déficit. Réviser le flow de détection (ADR-011) : seuil trop laxiste, ou vrai signal d’accompagnement à renforcer ?`,
    triggeredBy: 'product.deficitWorkspaceCount / product.activeWorkspaces > 0.3',
  };
};

/**
 * R-05: GDPR consent low opt-in — info if analyticsOptInRate < 30%.
 * Source signal: Section 3 consent.analyticsOptInRate.
 * Pas critique (consent doit rester libre), mais signal si copy banner peu engageant.
 */
const consentOptInRule: Rule = ({ acquisition }) => {
  if (acquisition.consent.sampleSize < 20) return null;
  if (acquisition.consent.analyticsOptInRate >= 0.3) return null;
  const pct = Math.round(acquisition.consent.analyticsOptInRate * 100);
  return {
    id: 'gdpr-consent-low-opt-in',
    severity: 'info',
    title: `Opt-in analytics à ${pct}%`,
    body: `Sur les ${acquisition.consent.sampleSize} dernières décisions GDPR, seules ${pct}% acceptent les analytics. Si la donnée est utile au produit, revoir la copy banner pour expliquer le bénéfice utilisateur (R-06 anti-culpa).`,
    triggeredBy: 'acquisition.consent.analyticsOptInRate < 0.3 && sampleSize >= 20',
  };
};

const RULES: ReadonlyArray<Rule> = [
  errorsSpikeRule,
  testsRateRule,
  acquisitionStallRule,
  deficitThresholdRule,
  consentOptInRule,
];

/**
 * Run all rules against the metrics bundle and return triggered cards
 * sorted by severity (critical → warning → info).
 */
export function generateRecommendations(
  metrics: AdminMetricsBundle,
): ReadonlyArray<RecommendationCard> {
  const triggered = RULES.map((rule) => rule(metrics)).filter(
    (card): card is RecommendationCard => card !== null,
  );
  return [...triggered].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
