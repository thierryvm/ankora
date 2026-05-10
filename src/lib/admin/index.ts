/**
 * Barrel exports — admin panel shared lib.
 */

export type {
  AcquisitionMetrics,
  AuditEventCount,
  ErrorRatePoint,
  ErrorRateSeries,
  FunnelStep,
  ProductHealthMetrics,
  SignupPoint,
  TechHealthMetrics,
  TimeWindow,
  VercelDeploy,
} from './types';

export {
  AcquisitionMetricsSchema,
  ProductHealthMetricsSchema,
  TechHealthMetricsSchema,
  TimeWindowSchema,
} from './types';

export { getAcquisitionMetrics } from './queries/acquisition';
export { getProductHealthMetrics } from './queries/product-health';
export { getTechHealthMetrics } from './queries/tech-health';

export { generateRecommendations, type AdminMetricsBundle } from './recommendations/rules';
export type { RecommendationCard, RecommendationSeverity } from './recommendations/types';
export { RecommendationCardSchema, RecommendationSeveritySchema } from './recommendations/types';
