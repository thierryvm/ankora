-- =========================================================================
-- GDPR art. 17 — deletion queue: count the attempts, so the queue keeps moving
-- =========================================================================
-- Decisions: docs/adr/ADR-042-file-de-suppression-compter-les-tentatives.md
-- Amends:    docs/adr/ADR-024-file-de-suppression-de-compte.md (D1, D2, D6)
-- Unblocks:  setting CRON_SECRET, i.e. arming the right to erasure at all.
--
-- The defect this closes: `claim_pending_deletions` had NO notion of an
-- attempt. A row after one failure and a row after three hundred were
-- IDENTICAL in the database, so 25 permanently-failing rows would take the
-- batch every night, forever, and no fresh request would ever be reached. The
-- only signal was a log line on a platform with no log drain and no alerting.
--
-- Nothing here arms anything either: `CRON_SECRET` is still unset, so the
-- route still answers 401. This migration makes the arming SAFE, it does not
-- perform it. The arming is a runbook, not a PR (ADR-042 §Découpage).
--
-- Why no SECURITY DEFINER, still: `20260417000002_rls_hardening.sql` puts
-- FORCE ROW LEVEL SECURITY on `deletion_requests`, and FORCE applies to the
-- table OWNER. A DEFINER function owned by `postgres` could write ZERO ROWS
-- WITHOUT RAISING. Everything below stays SECURITY INVOKER, called by
-- `service_role`.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. The five columns
-- -------------------------------------------------------------------------
-- Risk of this migration is nil INDEPENDENTLY of what the table holds, and
-- that is how it must be stated: `attempts` arrives with `default 0`, the four
-- others are nullable, the new status invalidates no existing row, and the
-- anchor invariant below is satisfied by every pre-existing row precisely
-- because their `attempts` is 0.
alter table public.deletion_requests
  add column if not exists attempts integer not null default 0,
  add column if not exists last_attempted_at timestamptz,
  add column if not exists last_error_code text,
  add column if not exists attempt_cycle_started_at timestamptz,
  add column if not exists retried_at timestamptz;

comment on column public.deletion_requests.attempts is
  'Claims in the CURRENT attempt cycle. Incremented by claim_pending_deletions() in SQL — never by Node: a run that dies mid-batch (timeout, serverless crash) would count nothing, and those are exactly the failures that loop. Reset to 0 by the person''s own "retry" action, which is why the cross-cycle history lives in the audit trail and not here.';

comment on column public.deletion_requests.last_attempted_at is
  'When a real attempt was made — written by the CALLER at verdict, never at claim time. Written at claim time it would merely restate what claimed_at and attempt_cycle_started_at already say, and would contradict the claimed-is-not-attempted distinction this schema exists to make. It is the only column separating a row claimed five times without being tried from a row genuinely tried five times.';

comment on column public.deletion_requests.last_error_code is
  'Closed vocabulary, never a message. A raw GoTrue message can embed an email address, and this row is readable by the person through deletion_self_select — the "no identifier" rule of ADR-024 covered logs and the response body, not the database.';

comment on column public.deletion_requests.attempt_cycle_started_at is
  'When the CURRENT attempt cycle began — the anchor of the quarantine conjunction. Neither scheduled_for (never slides, so it stops measuring anything five days past due, and a retry resets attempts without touching it) nor last_attempted_at (slides too much: a row tried daily would never quarantine) can play this role. Set by the claim when NULL, never touched afterwards, reset to NULL by the retry action.';

comment on column public.deletion_requests.retried_at is
  'When the person relaunched their own erasure. It has its own column because none of the others can carry it: requested_at is the original request, scheduled_for does not move, claimed_at is NULL right after a retry, last_attempted_at dates an attempt, and the anchor is NULL between the retry and the first claim — up to 24 h of a screen showing nothing. Reading it from audit_log is excluded: that table has no client policy at all.';

-- -------------------------------------------------------------------------
-- 2. `failed` — a status of PENDING NON-COMPLIANCE, not a terminal state
-- -------------------------------------------------------------------------
-- Quarantine does not stop the art. 12(3) clock. A `failed` row on day 30 is
-- a breach, not a solved problem. This status makes the failure VISIBLE; it
-- does not make it lawful.
alter table public.deletion_requests
  drop constraint if exists deletion_requests_status_check;

alter table public.deletion_requests
  add constraint deletion_requests_status_check
  check (status in ('pending', 'processing', 'cancelled', 'completed', 'failed'));

-- Closed vocabulary, and `null` is admitted EXPLICITLY: a row that has never
-- been claimed carries attempts = 0 and no code, so a four-value enumeration
-- alone would reject every insert made by requestDeletion().
alter table public.deletion_requests
  drop constraint if exists deletion_requests_last_error_code_check;

alter table public.deletion_requests
  add constraint deletion_requests_last_error_code_check
  check (
    last_error_code is null
    or last_error_code in ('gotrue_error', 'pseudonymise_error', 'unknown', 'not_attempted')
  );

-- INVARIANT n° 4 — a CONSTRAINT, not a hope, and the only one of the four
-- that is mechanically enforced rather than merely testable.
--
-- If the anchor were missing while attempts > 0, the temporal conjunct of the
-- quarantine would evaluate to NULL — hence never true — and the row would
-- become UNQUARANTINABLE FOR EVER while still taking a slot in the batch every
-- night. That is the silent freeze of #285, reproduced identically by the very
-- guard meant to close it. With this constraint the same mistake fails loudly,
-- at write time.
alter table public.deletion_requests
  drop constraint if exists deletion_requests_attempt_anchor_check;

alter table public.deletion_requests
  add constraint deletion_requests_attempt_anchor_check
  check (attempts = 0 or attempt_cycle_started_at is not null);

-- -------------------------------------------------------------------------
-- 3. `failed` is an ACTIVE status in the uniqueness index
-- -------------------------------------------------------------------------
-- One person, at most one active request, whatever its status.
--
-- Both branches of the alternative broke something, which is why this is a
-- decision and not a detail:
--   - `failed` NOT active → a person accumulates a `failed` row and a new
--     `pending` one; `settings/page.tsx` does `.maybeSingle()` and justifies it
--     BY THIS INDEX, so two matching rows make the settings page fail with a
--     PostgREST error — for the person concerned, and only for them.
--   - `failed` active, with no other fix → `requestDeletion()` takes a 23505,
--     looks for the existing row among pending/processing only, finds nothing,
--     and throws: the person could NEVER re-request their erasure. A pure
--     art. 17 blocker. Closed by the discriminated return in deletion.ts.
--
-- No collapsing pass before the rebuild, unlike 20260727000001:51-61: the
-- `failed` status does not exist yet, so no row can collide. Written here so
-- that nobody adds a "just in case" UPDATE that would write in production for
-- no reason.
drop index if exists public.deletion_requests_one_active_idx;

create unique index deletion_requests_one_active_idx
  on public.deletion_requests(user_id)
  where status in ('pending', 'processing', 'failed');

-- -------------------------------------------------------------------------
-- 4. claim_pending_deletions(batch_size) — resume, quarantine, then claim
-- -------------------------------------------------------------------------
create or replace function public.claim_pending_deletions(batch_size integer)
returns table(request_id uuid, target_user_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  -- INVARIANT n° 5 (ADR-042 G9) — the single source of the threshold. It would
  -- otherwise appear in the quarantine, in the claim filter and in the UI copy.
  -- The interface deliberately does NOT repeat it: it phrases without a number.
  max_attempts constant integer := 5;
  -- Paired with max_attempts, and the pairing is the point: the conjunction is
  -- what makes "5 attempts" mean "5 days" instead of merely assuming it.
  cycle_grace  constant interval := interval '5 days';
begin
  -- =====================================================================
  -- INVARIANT n° 1 — the order below is resume → quarantine → claim, and it
  -- is the ONLY correct one.
  --   quarantine → resume → claim: a row resumed after the quarantine escapes
  --     it for a whole day, in a loop.
  --   resume → claim → quarantine: a row at 5 attempts is claimed before being
  --     seen, and the quarantine — which only touches `pending` — never sees it
  --     again.
  -- =====================================================================

  -- ---------------------------------------------------------------------
  -- 4a. Resume what a previous run stranded in `processing`
  -- ---------------------------------------------------------------------
  -- INVARIANT — this 1 hour threshold MUST stay GREATER than the `maxDuration`
  -- of src/app/api/cron/gdpr/route.ts (60 s). If a live run outlives the
  -- threshold, the next run steals its batch and the same account is deleted
  -- twice. Whoever raises maxDuration to 300 s is touching TWO guards now: the
  -- anti-double-deletion one, and the safety of the cancel button (see 4b).
  --
  -- `claimed_at`, NOT `requested_at`: a row is only claimable a whole grace
  -- period after being requested, so a test on `requested_at` would be ALWAYS
  -- TRUE and every run would re-queue every in-flight row.
  --
  -- The `claimed_at is null` disjunction is not defensive noise: without it,
  -- `null < now() - interval '1 hour'` yields NULL, so a `processing` row
  -- carrying no timestamp would never be re-queued, never claimed, never seen.
  --
  -- It keeps NULLING `claimed_at`, and touches NONE of the four attempt
  -- columns — `attempts`, `last_attempted_at`, `last_error_code` and
  -- `attempt_cycle_started_at` are all listed on purpose. A literal reader of a
  -- three-item list would conclude the anchor may be reset here, and an anchor
  -- reset by the resume makes the row unquarantinable. The reason the resume
  -- may keep erasing `claimed_at` is that `attempts` now carries the history it
  -- used to destroy: the column keeps ONE meaning — a run holds this row.
  update public.deletion_requests
     set status = 'pending',
         claimed_at = null
   where status = 'processing'
     and (claimed_at is null or claimed_at < now() - interval '1 hour');

  -- ---------------------------------------------------------------------
  -- 4b. Quarantine: 5 attempts AND 5 days elapsed
  -- ---------------------------------------------------------------------
  -- The conjunction is not belt-and-braces, it is the correctness condition.
  -- A claim is not an attempt: the batch may run out of time, the RPC response
  -- may be lost after the UPDATE committed, and a human may invoke the route
  -- five times while debugging. On the count alone, any of those three empties
  -- everybody's budget without a single GoTrue call ever going out. The
  -- temporal conjunct makes "5 attempts" MEAN "5 days" instead of assuming it,
  -- and it depends on no human discipline.
  --
  -- INVARIANT n° 2 — the quarantine matches `status = 'pending'` ONLY, and
  -- that predicate is what makes the cancel button of ADR-042 G5 safe. Under
  -- READ COMMITTED two concurrent invocations are safe solely because of it:
  -- the second one re-evaluates the predicate after the lock is released, sees
  -- `processing`, and skips. Written as `attempts >= max_attempts` alone, this
  -- statement would mark `failed` a row whose GoTrue call is IN FLIGHT — and
  -- the screen would then offer a cancel button for it.
  --
  -- INVARIANT n° 3 — every `failed` row carries `claimed_at is null`. The chain
  -- already guarantees it (a row only returns to `pending` through 4a, which
  -- nulls the column) so nothing is written here: writing it would MASK a
  -- violation instead of letting a proof catch it. That invariant is what turns
  -- the safety of the cancel button from an argument into an assertion.
  --
  -- No automatic retry, ever: an automatic retry loop is what produced the
  -- problem. The way out is a human gesture — the person's own (ADR-042 G5).
  update public.deletion_requests
     set status = 'failed'
   where status = 'pending'
     and attempts >= max_attempts
     and attempt_cycle_started_at < now() - cycle_grace;

  -- ---------------------------------------------------------------------
  -- 4c. Claim
  -- ---------------------------------------------------------------------
  -- A row reset by 4a is eligible right here, in this same call: recovery
  -- should not need a second run.
  return query
  with claimed as (
    update public.deletion_requests
       set status = 'processing',
           claimed_at = now(),
           attempts = attempts + 1,
           -- Set when NULL, never touched afterwards. The condition tests the
           -- NULLITY of the anchor, NOT `attempts = 0` — the two are equivalent
           -- while invariant n° 4 holds, and they differ exactly when it does
           -- not: the nullity form RE-LAYS an anchor (five days lost, the row
           -- becomes quarantinable again), the `attempts = 0` form never lays
           -- one again and freezes the row for life. Nullity wins.
           --
           -- One more conditional expression in the same SET list, under the
           -- same row lock: no second statement, therefore no new concurrency
           -- window.
           attempt_cycle_started_at = coalesce(attempt_cycle_started_at, now()),
           -- Cleared with the increment. Without this, a failure code from day
           -- 3 would stay glued to a day-4 attempt that died before acting.
           -- `last_attempted_at` is deliberately NOT written here — the caller
           -- writes it at verdict, and that is what separates "claimed" from
           -- "attempted".
           last_error_code = 'not_attempted'
     where id in (
       select id
         from public.deletion_requests
        where status = 'pending'
          and scheduled_for <= now()
          -- REDUNDANT BELT with the quarantine above, and it carries the SAME
          -- predicate on purpose. `attempts >= max_attempts` alone would NOT be
          -- redundant: between the 5th claim and the 5th day, a row satisfies
          -- the count but not the conjunction, so it would be neither claimable
          -- nor quarantinable — frozen and invisible, which is the very defect
          -- this migration closes. The five-debug-invocations case makes it
          -- concrete: it would freeze the WHOLE queue for five days without
          -- marking a single row.
          --
          -- Written this way the belt can never disagree with 4b, and it still
          -- protects the claim should 4b ever be removed. Two layers, one
          -- predicate: whoever deletes one of them should read this first.
          and not (
            attempts >= max_attempts
            and attempt_cycle_started_at < now() - cycle_grace
          )
        -- Never-tried rows go first (ADR-042 G4). Without this, for five days
        -- twenty-five failing rows would keep taking the batch ahead of a
        -- request filed the same morning.
        --
        -- Residual, named rather than fixed: this removes starvation caused by
        -- FAILURES and creates one caused by INFLUX — a row at attempts = 1 is
        -- indefinitely overtaken by fresh rows at 0. Holds while the daily due
        -- influx stays < batch_size; beyond that (~400 accounts) age must
        -- become the primary arbiter again. Counter n° 2 of the admin panel is
        -- what sees a row starving this way, because such a row never becomes
        -- `failed`.
        order by attempts asc, scheduled_for asc
        -- `coalesce` first: `least(null, 100)` is 100 in Postgres, NULL being
        -- ignored, so a null batch size would claim the MAXIMUM rather than the
        -- minimum.
        limit greatest(1, least(coalesce(batch_size, 1), 100))
        -- Comfort, NOT correctness: under READ COMMITTED a second invocation
        -- would block, then see `processing`.
        for update skip locked
     )
    returning id, user_id
  )
  select id, user_id from claimed;
end $$;

comment on function public.claim_pending_deletions(integer) is
  'Resumes rows stranded in processing, quarantines rows that failed 5 times over at least 5 days (status failed), then claims due requests (pending → processing) youngest-attempt-count first. SECURITY INVOKER: must be called by service_role. The three steps are ordered and the order is the only correct one — see the invariants in the body.';

-- `revoke from public` BEFORE the grant: Postgres grants EXECUTE to PUBLIC on
-- function creation, so revoking from `anon`/`authenticated` alone removes
-- nothing (Supabase advisor 0028). `create or replace` preserves the existing
-- ACL, so this is belt-and-braces — and cheap enough to keep next to a function
-- that can destroy accounts.
revoke execute on function public.claim_pending_deletions(integer) from public;
grant  execute on function public.claim_pending_deletions(integer) to service_role;

-- -------------------------------------------------------------------------
-- 5. The client policy follows the screen
-- -------------------------------------------------------------------------
-- The product path goes through `createServiceRoleClient()`, which bypasses
-- RLS entirely, so this policy is defence in depth against a direct PostgREST
-- call — nothing more. It is widened anyway: leaving it narrow would also be
-- defensible, but the SILENCE is what would guarantee a future reader
-- "corrects" the inconsistency between a screen offering cancellation on
-- `failed` and a policy refusing it.
--
-- Nothing opens: the `with check` still pins `status = 'cancelled'` and
-- `auth.uid() = user_id`, no path lets a client write `failed` itself
-- (`deletion_self_insert` was dropped in 20260727000001:164), and the row of
-- another person stays unreachable.
drop policy if exists "deletion_self_update" on public.deletion_requests;
create policy "deletion_self_update" on public.deletion_requests
  for update
  using (auth.uid() = user_id and status in ('pending', 'failed'))
  with check (auth.uid() = user_id and status = 'cancelled');
