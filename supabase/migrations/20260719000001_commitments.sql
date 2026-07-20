-- =========================================================================
-- Épic « Dettes & échéanciers » PR-1 — commitments + commitment_payments
-- =========================================================================
-- Ankora only modelled INFINITE recurring charges. Three real needs did not
-- fit (@thierry 2026-07-19): a debt with a remaining balance (car loan), a
-- FINITE instalment plan (SPF tax arrangement), and a one-off future bill.
-- One object covers all three: an engagement with a finite number of
-- instalments. Everything else (end date, remaining balance, progress) is
-- DERIVED in the pure domain — never stored, so it can never drift.
--
-- Payments reuse the exact charge_payments shape/policies: ticking an
-- instalment is the same gesture the user already knows.
-- =========================================================================

create table if not exists public.commitments (
  id                 uuid primary key default uuid_generate_v4(),
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  created_by         uuid not null references public.users(id) on delete cascade,
  label              text not null check (char_length(label) between 1 and 120),
  -- debt: car loan · installment_plan: SPF arrangement · one_off: future bill
  kind               text not null check (kind in ('debt', 'installment_plan', 'one_off')),
  -- Amount still engaged at creation (D3 locked: the user types the REMAINING
  -- balance from their statement, not the original borrowed amount).
  total_amount       numeric(12, 2) not null check (total_amount >= 0),
  -- Amount of ONE instalment. Null for one_off (the whole total is due once).
  installment_amount numeric(12, 2) check (installment_amount is null or installment_amount >= 0),
  installments_total smallint not null check (installments_total between 1 and 600),
  -- Anchor = the NEXT instalment (D3), not the historical start.
  start_year         smallint not null check (start_year between 2000 and 2100),
  start_month        smallint not null check (start_month between 1 and 12),
  payment_day        smallint not null default 1 check (payment_day between 1 and 31),
  frequency          text not null default 'monthly'
                     check (frequency in ('monthly', 'quarterly', 'semiannual', 'annual')),
  category_id        uuid references public.categories(id) on delete set null,
  notes              text check (char_length(notes) <= 500),
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- A one_off is exactly one instalment; multi-instalment kinds must carry
  -- an instalment amount (the UI cannot produce anything else).
  constraint commitments_one_off_single check (
    kind <> 'one_off' or installments_total = 1
  ),
  constraint commitments_installment_amount_required check (
    installments_total = 1 or installment_amount is not null
  )
);

create index if not exists commitments_workspace_idx
  on public.commitments (workspace_id, is_active);

-- -------------------------------------------------------------------------
-- Payments — twin of charge_payments (same shape, same guarantees)
-- -------------------------------------------------------------------------
create table if not exists public.commitment_payments (
  id            uuid primary key default uuid_generate_v4(),
  commitment_id uuid not null references public.commitments(id) on delete cascade,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  period_year   smallint not null check (period_year between 2000 and 2100),
  period_month  smallint not null check (period_month between 1 and 12),
  paid_at       timestamptz not null default now(),
  paid_amount   numeric(12, 2) not null check (paid_amount >= 0),
  note          text check (note is null or char_length(note) <= 500),
  created_by    uuid not null references public.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  -- One tick per instalment period — makes the toggle idempotent.
  unique (commitment_id, period_year, period_month)
);

create index if not exists commitment_payments_period_idx
  on public.commitment_payments (workspace_id, period_year, period_month);

create index if not exists commitment_payments_commitment_idx
  on public.commitment_payments (commitment_id, period_year desc, period_month desc);

-- -------------------------------------------------------------------------
-- Row-Level Security — identical contract to charges / charge_payments
-- -------------------------------------------------------------------------
alter table public.commitments enable row level security;
alter table public.commitments force  row level security;

create policy "commitments_member_select" on public.commitments
  for select using (public.is_workspace_member(workspace_id));

create policy "commitments_editor_write" on public.commitments
  for all using (public.is_workspace_editor(workspace_id))
  with check (public.is_workspace_editor(workspace_id) and created_by = auth.uid());

alter table public.commitment_payments enable row level security;
alter table public.commitment_payments force  row level security;

create policy "commitment_payments_member_select" on public.commitment_payments
  for select using (public.is_workspace_member(workspace_id));

create policy "commitment_payments_editor_write" on public.commitment_payments
  for all using (public.is_workspace_editor(workspace_id))
  with check (public.is_workspace_editor(workspace_id) and created_by = auth.uid());

-- updated_at trigger, same as every other table
create trigger commitments_touch_updated_at
  before update on public.commitments
  for each row execute function public.touch_updated_at();
