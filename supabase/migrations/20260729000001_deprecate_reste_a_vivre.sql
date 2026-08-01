-- ADR-035 — deprecate the daily-living envelope (« reste à vivre »).
--
-- Context. `20260526000001_pr_beta_3_reste_a_vivre.sql` added
-- `reste_a_vivre_default numeric(12,2) not null default 500.00` plus a
-- per-month override map. A user who never set the value still got a progress
-- bar, a "X €/day" figure and an overspend badge computed against 500 € they
-- had never chosen: it looked like a measurement, it was a factory constant.
-- ADR-035 removes the concept rather than the default — the hero figure now
-- answers "can I spend this?" in real time, without asking anyone to invent a
-- number.
--
-- As of this migration the application code no longer READS either column
-- (`src/lib/data/workspace-snapshot.ts` stopped selecting them). This migration
-- only stops the database from asserting a default that nothing consumes.
--
-- NOT a DROP COLUMN, deliberately, for three reasons:
--   1. `reste_a_vivre_overrides` holds real user input. Dropping it is not
--      reversible and this project has no staging environment and no PITR.
--   2. The repo has never dropped a column. The established pattern
--      (20260503000001, 20260503000002) is to mark it DEPRECATED and let a
--      later, explicitly named PR remove it once nothing has read it for a
--      while.
--   3. Deploy order. Code that stops reading a column is safe to ship before
--      the column moves; the reverse is not.
--
-- Rollback: `alter table ... alter column reste_a_vivre_default set default
-- 500.00, set not null;` — safe as long as no row holds NULL.

alter table public.workspace_settings
  alter column reste_a_vivre_default drop not null,
  alter column reste_a_vivre_default drop default;

comment on column public.workspace_settings.reste_a_vivre_default is
  'DEPRECATED (ADR-035, 2026-07-29) — the daily-living envelope was removed from the product. No longer read by the application. NOT NULL and the 500.00 default are dropped so nothing can silently reintroduce an unchosen budget. Column kept for now; removal belongs to a dedicated later PR.';

comment on column public.workspace_settings.reste_a_vivre_overrides is
  'DEPRECATED (ADR-035, 2026-07-29) — per-month overrides of the removed envelope. No longer read by the application. Retained because it holds user-entered values and this project has no staging environment; removal belongs to a dedicated later PR.';

-- The range CHECK is left in place on purpose: it costs nothing, and while the
-- column still exists it keeps any stray write honest.
