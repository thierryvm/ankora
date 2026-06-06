-- Epic « Factures cohérentes » / THI-329 — backfill payment_months to the full
-- cadence derived from (frequency, due_month).
--
-- Root cause: 20260503000002 (l.57-59) backfilled every PERIODIC charge to
-- `array[due_month]` — a SINGLE month — instead of the full cadence. A
-- quarterly charge with due_month=1 stored `{1}` instead of `{1,4,7,10}`, so
-- `nextDueDateForCharge` resolved its next occurrence a year away
-- (e.g. S.W.D.E « janv. 2027 »). This recomputes the canonical schedule,
-- mirroring `paymentMonthsFromFrequency()` (src/lib/domain/charges):
--   monthly    → [1..12]
--   quarterly  → [a, a+3, a+6, a+9]   (mod 12, 1-based, sorted, deduped)
--   semiannual → [a, a+6]
--   annual     → [a]                  (a = due_month)
--
-- Idempotent + zero-loss: only rows whose stored array DIFFERS from the
-- canonical one are touched (no DELETE, monthly [1..12] rows untouched). Runs
-- as table owner → RLS bypassed. due_month is NOT NULL + CHECK 1..12, so the
-- arithmetic is always well-formed.
--
-- NOTE: this does NOT change the anchor (due_month). A charge mis-anchored at
-- creation (e.g. S.W.D.E real anchor = May, stored = January) is de-broken into
-- a VALID quarterly set here; the user corrects the real anchor via CadenceField
-- (PR-D / THI-301).

with recomputed as (
  select
    id,
    (
      case frequency
        when 'monthly' then array[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
        when 'quarterly' then (
          select array_agg(distinct ((due_month + o - 1) % 12) + 1 order by ((due_month + o - 1) % 12) + 1)
          from unnest(array[0, 3, 6, 9]) as o
        )
        when 'semiannual' then (
          select array_agg(distinct ((due_month + o - 1) % 12) + 1 order by ((due_month + o - 1) % 12) + 1)
          from unnest(array[0, 6]) as o
        )
        when 'annual' then array[due_month]
        else payment_months -- defensive: unknown frequency → leave untouched
      end
    )::smallint[] as pm
  from public.charges
)
update public.charges c
set payment_months = r.pm
from recomputed r
where c.id = r.id
  and c.payment_months is distinct from r.pm;
