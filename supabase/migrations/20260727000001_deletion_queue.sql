-- =========================================================================
-- GDPR art. 17 — deletion queue: schema for a resumable executor
-- =========================================================================
-- Decisions: docs/adr/ADR-024-file-de-suppression-de-compte.md
-- Plan:      docs/plans/step-3b-deletion-queue.md
--
-- This migration adds the schema a cron executor needs. It arms NOTHING:
-- `executeDeletion()` still has no caller after this merge. The route that
-- calls it ships separately (PR-B), so that its review answers one question
-- only — can this fire when it should not?
--
-- Why no SECURITY DEFINER anywhere below: `20260417000002_rls_hardening.sql`
-- puts FORCE ROW LEVEL SECURITY on `audit_log` and `deletion_requests`, and
-- FORCE applies to the table OWNER. A SECURITY DEFINER function owned by
-- `postgres` would write ZERO ROWS WITHOUT RAISING if the hosted `postgres`
-- lacks BYPASSRLS — which we cannot measure. Every function here is
-- SECURITY INVOKER, called by `service_role`, which is the one role whose
-- BYPASSRLS the application already depends on and exercises daily.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. `processing` status + `claimed_at`
-- -------------------------------------------------------------------------
-- The inline CHECK from 20260416000001_initial_schema.sql:131 is auto-named
-- `deletion_requests_status_check`. That name is deterministic — but a
-- migration touching account deletion does not get to fail on a bet.
alter table public.deletion_requests
  drop constraint if exists deletion_requests_status_check;

alter table public.deletion_requests
  add constraint deletion_requests_status_check
  check (status in ('pending', 'processing', 'cancelled', 'completed'));

alter table public.deletion_requests
  add column if not exists claimed_at timestamptz;

comment on column public.deletion_requests.claimed_at is
  'When a run took ownership of this row. The stale-row reset tests THIS column, never requested_at — see claim_pending_deletions().';

-- -------------------------------------------------------------------------
-- 2. Collapse duplicate pending requests, then forbid new ones
-- -------------------------------------------------------------------------
-- ⚠️ THIS STATEMENT WRITES IN PRODUCTION. Its push is gated on reading
--    `select user_id, count(*) from public.deletion_requests
--      where status='pending' group by 1 having count(*) > 1;`
--    returning zero rows. Row count reported in docs/prs/PR-3B-A-report.md.
--
-- The most recent request survives, so nobody loses the erasure they asked
-- for; the older duplicates are cancelled rather than deleted, so the trail
-- of what happened stays readable.
update public.deletion_requests d
   set status = 'cancelled',
       cancelled_at = now()
 where d.status = 'pending'
   and exists (
     select 1
       from public.deletion_requests d2
      where d2.user_id = d.user_id
        and d2.status = 'pending'
        and d2.requested_at > d.requested_at
   );

-- Covers BOTH active statuses. Indexing 'pending' alone would make the
-- stale-row reset (processing → pending) violate this very constraint
-- whenever another request for the same person were already pending.
create unique index if not exists deletion_requests_one_active_idx
  on public.deletion_requests(user_id)
  where status in ('pending', 'processing');

-- -------------------------------------------------------------------------
-- 3. claim_pending_deletions(batch_size)
-- -------------------------------------------------------------------------
-- `update … limit … for update skip locked … returning` is not expressible
-- through PostgREST, which is the only reason this is a function at all. It
-- touches the `public` schema exclusively and asks for no new privilege.
create or replace function public.claim_pending_deletions(batch_size integer)
returns table(request_id uuid, target_user_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- INVARIANT — this 1 hour threshold MUST stay GREATER than the
  -- `maxDuration` of src/app/api/cron/gdpr/route.ts (60 s). The two values
  -- are a couple: if a live run outlives the threshold, the next run steals
  -- its batch and the same account is deleted twice. Whoever raises
  -- maxDuration to 300 s in six months is touching the anti-double-deletion
  -- guard, and should learn it here rather than from an incident.
  --
  -- `claimed_at`, NOT `requested_at`. A row is only claimable at
  -- `scheduled_for <= now()`, i.e. 14 days after `requested_at`, so a test on
  -- `requested_at` would be ALWAYS TRUE: every run would re-queue every
  -- in-flight row — including the ones a concurrent run is processing, its
  -- claiming transaction having already committed before the GoTrue call.
  --
  -- The `claimed_at is null` disjunction is not defensive noise: without it,
  -- `null < now() - interval '1 hour'` yields NULL, so a `processing` row
  -- carrying no timestamp is never re-queued, never claimed, and never seen —
  -- frozen forever, in silence, which is the exact failure class this step
  -- removes. No path produces that state today (the claim below writes both
  -- columns in one statement, and RLS forbids a client writing `processing`),
  -- and it cannot steal a live batch precisely because a live run never has
  -- `(processing, null)`.
  update public.deletion_requests
     set status = 'pending',
         claimed_at = null
   where status = 'processing'
     and (claimed_at is null or claimed_at < now() - interval '1 hour');

  -- A row just reset above is eligible for the claim below, in this same
  -- call. That is the intent: recovery should not need a second run.
  return query
  with claimed as (
    update public.deletion_requests
       set status = 'processing',
           claimed_at = now()
     where id in (
       select id
         from public.deletion_requests
        where status = 'pending'
          and scheduled_for <= now()
        order by scheduled_for
        -- `coalesce` first: `least(null, 100)` is 100 in Postgres, NULL being
        -- ignored, so a null batch size would claim the MAXIMUM rather than
        -- the minimum. Theoretical (one caller, hardcoded 25) and cheap.
        limit greatest(1, least(coalesce(batch_size, 1), 100))
        -- Comfort, NOT correctness: under READ COMMITTED a second invocation
        -- would block, then see `processing`. Nobody should later believe the
        -- safety depends on this clause.
        for update skip locked
     )
    returning id, user_id
  )
  select id, user_id from claimed;
end $$;

comment on function public.claim_pending_deletions(integer) is
  'Atomically claims due deletion requests (pending → processing) and re-queues rows stuck in processing for over an hour. SECURITY INVOKER: must be called by service_role.';

-- `revoke from public` BEFORE the grant: Postgres grants EXECUTE to PUBLIC on
-- function creation, so revoking from `anon`/`authenticated` alone removes
-- nothing (Supabase advisor 0028).
revoke execute on function public.claim_pending_deletions(integer) from public;
grant  execute on function public.claim_pending_deletions(integer) to service_role;

-- -------------------------------------------------------------------------
-- 4. Client policies: remove the insert, narrow the update
-- -------------------------------------------------------------------------
-- `deletion_self_insert` let a client insert its OWN row with `scheduled_for`
-- in the past, or `status='completed'`. Inert today; ARMED, that is immediate
-- self-deletion — while the 14-day grace period is precisely the mitigation
-- against a stolen session.
--
-- Requiring a future date closes nothing ("future" allows now() + 1 second),
-- and a hardcoded `now() + 13 days` would duplicate inside an RLS policy a
-- value ADR-023 fixes elsewhere, guaranteeing silent divergence the day it is
-- revised. Measured instead: `deletion_requests` is written in exactly one
-- place (src/lib/gdpr/deletion.ts), through the service-role client, which
-- bypasses RLS. NO CLIENT INSERT EXISTS. The policy grants a capability the
-- product does not use — and it is the capability, not its date, that is the
-- vector.
drop policy if exists "deletion_self_insert" on public.deletion_requests;

-- Only transition a client may perform: pending → cancelled.
-- `with check` cannot see OLD, so it cannot freeze `scheduled_for` — but a
-- cancelled row can never re-enter the queue, so a date changed on the way
-- out is inert.
drop policy if exists "deletion_self_update" on public.deletion_requests;
create policy "deletion_self_update" on public.deletion_requests
  for update
  using (auth.uid() = user_id and status = 'pending')
  with check (auth.uid() = user_id and status = 'cancelled');

-- -------------------------------------------------------------------------
-- 5. purge_audit_log_older_than_12_months() → SECURITY INVOKER
-- -------------------------------------------------------------------------
-- Same defect class as the rejected design 1, on a function that has existed
-- since April and has never been called — so has never been observed. As
-- DEFINER on a FORCE RLS table it may delete nothing and report success. As
-- INVOKER called by service_role it works measurably. Body unchanged.
create or replace function public.purge_audit_log_older_than_12_months()
returns integer
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  deleted_count integer;
begin
  delete from public.audit_log
  where occurred_at < (now() - interval '12 months');
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

comment on function public.purge_audit_log_older_than_12_months() is
  'Purges audit_log rows older than 12 months. SECURITY INVOKER: must be called by service_role — as SECURITY DEFINER it could delete zero rows without raising, audit_log carrying FORCE ROW LEVEL SECURITY. Returns the number of rows deleted.';

revoke execute on function public.purge_audit_log_older_than_12_months() from public;
grant  execute on function public.purge_audit_log_older_than_12_months() to service_role;
