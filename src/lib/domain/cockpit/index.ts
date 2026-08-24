/**
 * Cockpit domain — pure financial calculations powering the v1.0 dashboard.
 *
 * Cf. specs/dashboard-cockpit-vraie-vision-2026-05-03.md (vault Athenaeum)
 * and ADRs 008-012 (`docs/adr/`).
 *
 * Zero dependency on Supabase or Next.js — all functions consume `Decimal`
 * inputs and return `Decimal` outputs.
 */

export * from './types';
export * from './effort-financier-lisse';
export * from './assistant-virements';
export * from './sante-provisions';
export * from './notifications';
export * from './previsions';
export * from './projection-fonds';
export * from './simulateur';
export * from './situation-mois';
export * from './engagements-lisses';
export * from './depenses-du-mois';
export * from './depenses-par-jour';
export * from './epargne-estimee';
