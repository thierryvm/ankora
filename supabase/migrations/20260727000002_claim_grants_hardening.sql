-- =========================================================================
-- claim_pending_deletions — close EXECUTE for anon and authenticated
-- =========================================================================
-- `20260727000001` did `revoke execute … from public`, believing it enough,
-- and said so in a comment. MEASURED on the local stack right after applying
-- it — reading the real ACL rather than the migration text:
--
--   claim_pending_deletions :: postgres=X/postgres | anon=X/postgres
--                            | authenticated=X/postgres | service_role=X/postgres
--
--   POST /rest/v1/rpc/claim_pending_deletions   with the ANON key   →  HTTP 200
--
-- Revoking from `PUBLIC` removes the pseudo-role grant Postgres adds at
-- creation. It does NOT remove the EXPLICIT grants Supabase's default
-- privileges hand to `anon` and `authenticated` on new functions in `public`.
-- Two different things that read alike. `20260528000001` already learned this
-- for the older functions and revoked from all three by name; the new function
-- did not inherit that lesson.
--
-- MEASURED IMPACT TODAY: none. The function is SECURITY INVOKER, so an `anon`
-- caller runs it with `anon` privileges against a table carrying FORCE ROW
-- LEVEL SECURITY, whose policies grant that role nothing — both UPDATE
-- statements match zero rows and the call returns `[]`. No row mutated, no
-- data disclosed.
--
-- Closed anyway, for two reasons that do not depend on today's measurement:
-- least privilege (an unauthenticated caller has no business invoking a GDPR
-- mutation), and the fact that this is an unauthenticated, unrate-limited
-- endpoint issuing two UPDATEs against `deletion_requests`. The safety
-- currently rests entirely on the policies staying exactly as they are; a
-- future policy edit should not be able to turn a grant nobody remembers into
-- an exposure.
-- =========================================================================

revoke execute on function public.claim_pending_deletions(integer)
  from public, anon, authenticated;

-- Idempotent restatement — the only role that may call it.
grant execute on function public.claim_pending_deletions(integer) to service_role;

comment on function public.claim_pending_deletions(integer) is
  'Atomically claims due deletion requests (pending → processing) and re-queues rows stuck in processing for over an hour. SECURITY INVOKER, service_role ONLY: EXECUTE is revoked from public, anon and authenticated — revoking from PUBLIC alone leaves Supabase''s default grants to anon/authenticated in place.';
