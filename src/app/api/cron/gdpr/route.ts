import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

import { env } from '@/lib/env';
import {
  claimPendingDeletions,
  countStuckDeletions,
  executeDeletion,
  recordDeletionAttempt,
} from '@/lib/gdpr/deletion';
import { deletionErrorCode } from '@/lib/gdpr/deletion-core';
import { purgeAuditLogOlderThan12Months } from '@/lib/gdpr/retention';
import { log } from '@/lib/log';

/**
 * The daily GDPR erasure run — **the only caller of `executeDeletion` in the
 * entire system**, and therefore the only place that can destroy an account.
 *
 * Everything it relies on shipped inert in PR-A (#282); this file is the arming.
 * Decisions: docs/adr/ADR-024-file-de-suppression-de-compte.md.
 *
 * Deliberately NOT rate limited. `rate-limit.ts` fails CLOSED in production, so
 * an Upstash outage would block the exercise of a GDPR right in order to protect
 * an endpoint that is already behind a 32-byte constant-time secret and invoked
 * once a day. Residual accepted and named in ADR-024: an uncounted public
 * endpoint on a plan where the invocation is the scarce resource — the 401
 * before any I/O bounds the cost to CPU.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * INVARIANT — this value MUST stay BELOW the 1 hour stale-claim threshold of
 * `claim_pending_deletions()` (supabase/migrations/20260727000001_deletion_queue.sql).
 *
 * It now anchors TWO guards, not one, and whoever raises it to 300 s is
 * touching both:
 *
 *  1. **Anti-double-deletion.** If a live run outlives the threshold, the next
 *     run steals its batch and the same account is deleted twice.
 *  2. **The safety of the cancel button.** The status screen offers a cancel
 *     control on `failed` (ADR-042 G5), and that is only safe because a row is
 *     `pending` — hence quarantinable — solely when no run has ever claimed it
 *     or when it has been resumed after ≥ 1 h of silence. A run allowed to live
 *     for 300 s narrows that reasoning without touching a line of this file.
 */
export const maxDuration = 60;

/**
 * One run claims at most this many requests. See `capped` below.
 *
 * MUST stay ≤ 100. `claim_pending_deletions` bounds its own limit with
 * `least(coalesce(batch_size, 1), 100)`, so a value above 100 would make the
 * SQL return 100 while `claimed.length >= BATCH_SIZE` never became true — the
 * `capped` alarm would disappear without a sound. Pinned by a test.
 */
export const BATCH_SIZE = 25;

/**
 * A GoTrue or PostgREST message is written by someone else and can embed an id
 * or an address. This route promises `request_id`, never `user_id`, and pino's
 * redaction works by PATH (`*.email`, `headers.authorization`) — it will never
 * see an identifier buried inside a free-form string. Truncated and stripped of
 * UUIDs before it reaches a durable log, one line after we set out to erase one.
 */
function safeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : 'unknown';
  return raw
    .slice(0, 200)
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>');
}

/**
 * The missing-secret error is logged ONCE per cold start.
 *
 * Without this, every anonymous request to an unmetered public endpoint writes
 * a log line while the misconfiguration lasts — a scanner hammering the path
 * would fill the Vercel log for free. The head comment claims the 401 bounds
 * the cost to CPU; that claim is only true if it also bounds log ingestion.
 */
let missingSecretLogged = false;

/**
 * Constant-time comparison that cannot throw.
 *
 * `timingSafeEqual` REJECTS buffers of unequal length — it throws rather than
 * returning false — so feeding it raw tokens turns a wrong-length guess into a
 * 500 and leaks the expected length through the status code. Hashing both sides
 * first makes every comparison 32 bytes against 32 bytes.
 */
function secretMatches(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function GET(request: Request): Promise<NextResponse> {
  const expected = env.CRON_SECRET;

  // A configuration failure must SCREAM; a wrong token must stay MUTE. Both
  // answer 401, so the two are indistinguishable to the caller — the difference
  // lives only in our logs. Without this branch, a cron silently unable to
  // authenticate would look exactly like an attacker being turned away, which
  // is the class of quiet failure this whole step exists to remove.
  if (!expected) {
    if (!missingSecretLogged) {
      missingSecretLogged = true;
      log.error('CRON_SECRET is not configured — the GDPR deletion run cannot authenticate', {
        route: '/api/cron/gdpr',
      });
    }
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!secretMatches(header.slice('Bearer '.length), expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let claimed;
  try {
    claimed = await claimPendingDeletions(BATCH_SIZE);
  } catch (error) {
    log.error('Failed to claim pending deletions', { error_message: safeErrorMessage(error) });
    return NextResponse.json({ error: 'claim_failed' }, { status: 500 });
  }

  let deleted = 0;
  let failed = 0;

  for (const request_ of claimed) {
    try {
      await executeDeletion(request_.userId);
      deleted += 1;
    } catch (error) {
      failed += 1;
      // Each failure is isolated on purpose: Vercel NEVER retries a cron, so a
      // throw here would abandon every remaining account until tomorrow.
      //
      // The row stays `processing` and is re-queued by `claim_pending_deletions`
      // — but NOT "an hour later", as this comment used to claim. The 1 hour is
      // a MINIMUM AGE, not a schedule: the re-queue happens on the next call,
      // and the only caller runs once a day. So the real delay is up to 24 h.
      // Sizing an incident on the old wording was wrong by a factor of 24.
      //
      // `request_id`, NEVER `user_id`. Logging the user id of an erasure that
      // just failed would put the identifier back into a durable log, one line
      // after we set out to remove it.
      log.error('Account erasure failed', {
        request_id: request_.requestId,
        error_message: safeErrorMessage(error),
      });

      // The verdict, written onto the row: WHEN it was really attempted and
      // WHICH step failed. A closed vocabulary, never the message — a raw
      // GoTrue string can embed an email address, and this row is readable by
      // the person concerned.
      //
      // Wrapped, because a failure to record a failure must not abort the rest
      // of the batch: the account erasures still queued matter more than the
      // annotation. And the ROW COUNT is checked rather than assumed —
      // `deletion_requests` carries FORCE ROW LEVEL SECURITY, where a
      // privileged write can touch nothing without raising. Zero here means the
      // attempt counter is running blind, which is precisely the freeze this
      // whole change exists to prevent.
      try {
        const recorded = await recordDeletionAttempt(request_.requestId, deletionErrorCode(error));
        if (recorded === 0) {
          log.error('Deletion attempt could not be recorded — the row was not touched', {
            request_id: request_.requestId,
          });
        }
      } catch (recordError) {
        log.error('Deletion attempt could not be recorded', {
          request_id: request_.requestId,
          error_message: safeErrorMessage(recordError),
        });
      }
    }
  }

  // `purged: 0` is ALSO the healthy answer, and will be until roughly April
  // 2027 — `audit_log` was created on 2026-04-16, so nothing in it can be twelve
  // months old before then. A broken purge and a purge with nothing to do would
  // otherwise be written identically for nine months. `purgeOk` is what
  // separates them.
  let purged: number | null = 0;
  let purgeOk = true;
  try {
    purged = await purgeAuditLogOlderThan12Months();
  } catch (error) {
    purgeOk = false;
    purged = null;
    // Retention is not the reason this run exists. A purge failure is reported
    // and swallowed rather than allowed to mask a successful erasure batch.
    log.error('Audit log retention purge failed', { error_message: safeErrorMessage(error) });
  }

  // The cap does not exist to limit work — it exists to make visible the day 25
  // requests arrive at once. Reaching it means the queue is growing faster than
  // one run a day drains it, and nobody would notice from a 200.
  const capped = claimed.length >= BATCH_SIZE;
  if (capped) {
    log.error('GDPR deletion run hit its batch cap — the queue is growing', {
      claimed: claimed.length,
      batch_size: BATCH_SIZE,
    });
  }

  // How many rows are in quarantine, read AFTER the run so it reflects what the
  // run left behind. A STATE, not a delta: "how many went `failed` during THIS
  // invocation" would need either a change to the RPC's return type — a
  // contract consumed by `deletion-core.ts` and asserted by an e2e spec — or a
  // before/after count, and it would buy a number nobody reads, in a JSON body,
  // on a platform with no log drain. `stuck` is the durable surface, and it is
  // the one the admin panel shows.
  //
  // `null` rather than 0 on failure, for the same reason `purged` is: a broken
  // count and an empty quarantine must not be written identically.
  let stuck: number | null = null;
  try {
    stuck = await countStuckDeletions();
  } catch (error) {
    log.error('Failed to count stuck deletion requests', {
      error_message: safeErrorMessage(error),
    });
  }

  // Counts only. No user id, no email, no request id — this body ends up in
  // Vercel's cron invocation log.
  return NextResponse.json({
    claimed: claimed.length,
    deleted,
    failed,
    purged,
    purgeOk,
    capped,
    stuck,
  });
}
