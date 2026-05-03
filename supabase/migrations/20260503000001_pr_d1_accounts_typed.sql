-- =========================================================================
-- PR-D1 (Voie D Foundations) — Migration 1/4
-- accounts: account_type ENUM + display_name (additif)
-- =========================================================================
-- Cf. ADR-008 + amendement Cowork 2026-05-03 (mismatch resolution).
--
-- Decision: ADDITIVE migration. We keep the existing `kind` ('principal',
-- 'vie_courante', 'epargne') + `label` columns intact during PR-D1 to avoid
-- breaking `getWorkspaceSnapshot`, `accounts.ts` action, `AccountsClient.tsx`,
-- `account.ts` schema and `AccountKind` domain type.
--
-- The new columns (`account_type`, `display_name`) carry the canonical
-- IronBudget semantics from spec `dashboard-cockpit-vraie-vision-2026-05-03.md`:
--   principal    → income_bills   (where salary lands, fixed monthly bills)
--   vie_courante → daily_card     (daily-spending pot)
--   epargne      → provisions     (smoothing buffer for periodic bills)
--
-- PR-D2 will deprecate `kind`/`label` once UI consumers migrate.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Add new columns (nullable for the backfill window)
-- -------------------------------------------------------------------------
alter table public.accounts
  add column if not exists account_type text
    check (account_type in ('income_bills', 'provisions', 'daily_card')),
  add column if not exists display_name text
    check (display_name is null or char_length(display_name) between 1 and 50);

-- -------------------------------------------------------------------------
-- 2. Backfill from existing kind/label
-- -------------------------------------------------------------------------
update public.accounts
   set account_type = case kind
                        when 'principal'    then 'income_bills'
                        when 'vie_courante' then 'daily_card'
                        when 'epargne'      then 'provisions'
                      end,
       display_name = label
 where account_type is null
    or display_name is null;

-- -------------------------------------------------------------------------
-- 3. Enforce NOT NULL once the backfill is complete
-- -------------------------------------------------------------------------
alter table public.accounts
  alter column account_type set not null,
  alter column display_name set not null;

-- -------------------------------------------------------------------------
-- 4. UNIQUE per (workspace, account_type) — invariant: at most one
--    income_bills / provisions / daily_card per workspace.
--    The existing PK (workspace_id, kind) already enforces unicity per
--    `kind`; this new index enforces the same on the canonical column.
-- -------------------------------------------------------------------------
create unique index if not exists accounts_workspace_account_type_unique
  on public.accounts (workspace_id, account_type);

-- -------------------------------------------------------------------------
-- 5. seed_default_accounts: now writes both legacy and canonical columns.
--    Kept SECURITY DEFINER so handle_new_user can call it during signup
--    before the user has a session.
-- -------------------------------------------------------------------------
create or replace function public.seed_default_accounts(ws_id uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.accounts (workspace_id, kind, label, account_type, display_name)
  values
    (ws_id, 'principal',    'Compte Principal',     'income_bills', 'Compte Principal'),
    (ws_id, 'vie_courante', 'Vie Courante',         'daily_card',   'Carte Quotidien'),
    (ws_id, 'epargne',      'Épargne & Provisions', 'provisions',   'Compte Épargne')
  on conflict (workspace_id, kind) do nothing;
$$;

revoke execute on function public.seed_default_accounts(uuid) from public;

-- -------------------------------------------------------------------------
-- 6. Documentation comments
-- -------------------------------------------------------------------------
comment on column public.accounts.account_type is
  'Canonical semantic type per ADR-008. Drives the cockpit logic (Assistant Virements, Santé Provisions). Never user-editable.';
comment on column public.accounts.display_name is
  'User-defined display name (PR-D2 will expose inline rename). Initially seeded from i18n defaults; users can rename to match their bank labels (e.g. "Belfius", "Revolut").';
comment on column public.accounts.kind is
  'DEPRECATED — kept during PR-D1 to avoid breaking legacy reads. Will be dropped in PR-D2 once UI consumers migrate to account_type.';
comment on column public.accounts.label is
  'DEPRECATED — kept during PR-D1 to avoid breaking legacy reads. Will be dropped in PR-D2 once UI consumers migrate to display_name.';
