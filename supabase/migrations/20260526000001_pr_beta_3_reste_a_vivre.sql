-- =========================================================================
-- PR-BETA-3 (THI-267) — Reste à vivre support for Capacité d'Épargne Réelle
-- tryptique. ADR-009 amendement 2026-05-09.
-- =========================================================================
-- Adds two columns on `workspace_settings` so the dashboard tryptique can
-- distinguish three concepts that PR-D3-bis collapsed into "Plafond
-- Quotidien":
--
--   * Reste disponible  = Revenus − Effort_Financier_Lissé
--   * Reste à vivre     = budget vie courante user-saisi (this migration)
--   * Capacité épargne  = Reste disponible − Reste à vivre
--
-- `reste_a_vivre_default` is the steady-state monthly budget set at
-- onboarding (PR-D5) or inferred from history. `reste_a_vivre_overrides`
-- captures per-month adjustments via the "Ajuster ce mois" drawer
-- (ADR-009 R-10 ajustement manuel). Lookup priority:
-- `overrides[currentYYYYMM] ?? reste_a_vivre_default`.
--
-- The table already has RLS policies declared in 20260416000002_rls_policies
-- — adding columns is automatically covered, no policy patch needed.
-- =========================================================================

alter table public.workspace_settings
  add column if not exists reste_a_vivre_default numeric(12, 2) not null default 500.00,
  add column if not exists reste_a_vivre_overrides jsonb not null default '{}'::jsonb;

-- Defensive guard: `reste_a_vivre_default` must stay non-negative. A budget
-- under zero is nonsensical and would break the tryptique math (capacite =
-- reste_disponible - reste_a_vivre with a negative reste_a_vivre would add
-- instead of subtract). The upper bound 100k matches the Server Action Zod
-- schema (`z.number().min(0).max(100000)`) so DB constraint and app-level
-- validation stay in sync.
alter table public.workspace_settings
  add constraint workspace_settings_reste_a_vivre_default_range
  check (reste_a_vivre_default >= 0 and reste_a_vivre_default <= 100000);

comment on column public.workspace_settings.reste_a_vivre_default is
  'Default monthly reste-à-vivre (vie courante budget, en €). Saisi en onboarding ou ajustable user. ADR-009 amendement 2026-05-09.';

comment on column public.workspace_settings.reste_a_vivre_overrides is
  'Per-month overrides {"YYYY-MM": montant_numeric} for reste-à-vivre. Lookup priority: overrides[currentMonth] > reste_a_vivre_default. ADR-009 R-10.';
