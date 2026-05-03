-- =========================================================================
-- PR-D1 (Voie D Foundations) — Migration 4/4
-- charge_payments: per-period payment tracking (toggle paye)
-- =========================================================================
-- Cf. ADR-007 (consolidation placeholder) + ADR-011 + spec
-- `dashboard-cockpit-vraie-vision-2026-05-03.md` §"Data models cibles".
--
-- Each row records that a specific charge has been settled for a specific
-- (year, month) period. The Santé Provisions algorithm (ADR-011) consults
-- this table to know whether a periodic charge due "ce mois" has already
-- been paid (which advances the wrap-around to the next cycle).
--
-- The UNIQUE (charge_id, period_year, period_month) constraint enforces
-- one payment per period per charge — no double-counting.
--
-- `bucket_id` is reserved nullable for ADR-015 (savings_buckets, PR-D5+);
-- it doesn't reference a real table yet — added as plain UUID for forward
-- compatibility, with no FK so this migration stays self-contained.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Table
-- -------------------------------------------------------------------------
create table if not exists public.charge_payments (
  id            uuid primary key default uuid_generate_v4(),
  charge_id     uuid not null references public.charges(id) on delete cascade,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  period_year   smallint not null check (period_year between 2000 and 2100),
  period_month  smallint not null check (period_month between 1 and 12),
  paid_at       timestamptz not null default now(),
  paid_amount   numeric(12, 2) not null check (paid_amount >= 0),
  bucket_id     uuid,
  note          text check (note is null or char_length(note) <= 500),
  created_by    uuid not null references public.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique (charge_id, period_year, period_month)
);

-- -------------------------------------------------------------------------
-- 2. Indexes
-- -------------------------------------------------------------------------
create index if not exists charge_payments_period_idx
  on public.charge_payments (workspace_id, period_year, period_month);

create index if not exists charge_payments_charge_idx
  on public.charge_payments (charge_id, period_year desc, period_month desc);

-- -------------------------------------------------------------------------
-- 3. Row-Level Security
-- -------------------------------------------------------------------------
alter table public.charge_payments enable row level security;
alter table public.charge_payments force  row level security;

create policy "charge_payments_member_select" on public.charge_payments
  for select using (public.is_workspace_member(workspace_id));

create policy "charge_payments_editor_write" on public.charge_payments
  for all using (public.is_workspace_editor(workspace_id))
  with check (public.is_workspace_editor(workspace_id) and created_by = auth.uid());

-- -------------------------------------------------------------------------
-- 4. Documentation
-- -------------------------------------------------------------------------
comment on table public.charge_payments is
  'Per-period payment records for charges. UNIQUE on (charge_id, period_year, period_month) prevents double-counting. Drives the Santé Provisions algorithm (ADR-011) and the toggle paye UX (PR-D4).';
comment on column public.charge_payments.bucket_id is
  'Forward-compat reserved column for ADR-015 (savings_buckets). Plain UUID, no FK — will become FK to savings_buckets in PR-D5+.';
comment on column public.charge_payments.paid_amount is
  'Actual amount settled (may differ from charge.amount if user paid more/less). Defaults to charge.amount in the application layer.';
