-- =========================================================================
-- PR-D1 (Voie D Foundations) — Migration 2/4
-- charges: payment_months[], payment_day, sort_order
-- =========================================================================
-- Cf. spec `dashboard-cockpit-vraie-vision-2026-05-03.md` §"Data models cibles".
--
-- Adds the schedule precision required by the cockpit:
--   * payment_months  — multi-month schedule (e.g. trimestrielle [3, 6, 9, 12])
--   * payment_day     — exact day of the month (1-31) for the bell notifications
--   * sort_order      — user-customisable order (drag & drop in PR-D4)
--
-- `category_id` already exists from the initial schema (no-op here).
-- `due_month` is preserved as-is during PR-D1 (legacy reads in
-- getWorkspaceSnapshot / charges actions). PR-D4 will deprecate it once
-- the UI exclusively reads `payment_months`.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. New columns
-- -------------------------------------------------------------------------
alter table public.charges
  add column if not exists payment_months smallint[] not null
    default array[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]::smallint[],
  add column if not exists payment_day smallint not null default 1
    check (payment_day between 1 and 31),
  add column if not exists sort_order integer not null default 0;

-- -------------------------------------------------------------------------
-- 2. Constraint: every entry of payment_months must be in 1..12
--    Postgres interdit les subqueries dans les CHECK constraints (SQLSTATE 0A000),
--    on utilise donc l'opérateur `<@` (contained by) qui est immutable et
--    accepté en CHECK : tous les éléments du tableau doivent être dans
--    l'ensemble [1,2,...,12].
-- -------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'charges_payment_months_range'
  ) then
    alter table public.charges
      add constraint charges_payment_months_range
      check (
        array_length(payment_months, 1) is null
        or (
          array_length(payment_months, 1) between 1 and 12
          and payment_months <@ array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]
        )
      );
  end if;
end $$;

-- -------------------------------------------------------------------------
-- 3. Backfill payment_months from the existing due_month for periodic
--    charges (monthly keep their default of all 12 months).
-- -------------------------------------------------------------------------
update public.charges
   set payment_months = array[due_month]::smallint[]
 where frequency in ('quarterly', 'semiannual', 'annual')
   and payment_months = array[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]::smallint[];

-- -------------------------------------------------------------------------
-- 4. Index on workspace_id + sort_order to speed up the ordered list query
-- -------------------------------------------------------------------------
create index if not exists charges_workspace_sort_idx
  on public.charges (workspace_id, sort_order, created_at);

-- -------------------------------------------------------------------------
-- 5. Documentation
-- -------------------------------------------------------------------------
comment on column public.charges.payment_months is
  'Months (1-12) when this charge is due. Monthly charges default to all 12; periodic charges to a subset (e.g. trimestrielle [3,6,9,12]). Drives the Assistant Virements + Prévisions 6 mois algorithms.';
comment on column public.charges.payment_day is
  'Day of the month (1-31) when this charge falls due. Used by the bell notifications (J-3, J-1, en retard).';
comment on column public.charges.sort_order is
  'User-customisable order in the "À payer en {mois}" list (PR-D4 drag & drop). Default 0 = sort by created_at.';
comment on column public.charges.due_month is
  'DEPRECATED — kept during PR-D1 to avoid breaking legacy reads. Will be dropped in PR-D4 once the UI exclusively reads payment_months.';
