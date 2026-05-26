'use server';

import { headers } from 'next/headers';

import { createClient } from '@/lib/supabase/server';
import { requireUserWithWorkspace } from '@/lib/auth/require-user';
import { AuditEvent, logAuditEvent } from '@/lib/security/audit-log';
import { rateLimit } from '@/lib/security/rate-limit';
import { resteAVivreMonthOverrideSchema } from '@/lib/schemas/reste-a-vivre';
import { revalidateDashboard } from '@/lib/actions/revalidate';
import { log } from '@/lib/log';
import type { ActionResult } from '@/lib/actions/types';

async function contextFromHeaders(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null;
  return { ip, userAgent: h.get('user-agent') };
}

/**
 * "Ajuster ce mois" — PR-BETA-3 (THI-267) Capacité d'Épargne Réelle tryptique.
 *
 * Writes a per-month override into `workspace_settings.reste_a_vivre_overrides`,
 * a JSONB column keyed by `YYYY-MM`. The dashboard lookup priority is:
 *   `overrides[currentYYYYMM] ?? reste_a_vivre_default`.
 *
 * Security envelope (CLAUDE.md doctrine):
 *   1. `requireUserWithWorkspace()` — Supabase session check + workspace
 *       membership (RLS-friendly). Kept OUTSIDE the try/catch so the
 *       `redirect('/login')` thrown by Next.js when no session propagates
 *       cleanly (catching it would silently swallow the auth bounce).
 *   2. `rateLimit('mutation', user:${userId})` — Upstash sliding window.
 *   3. Zod parse of the input before any DB I/O.
 *   4. Read-modify-write merges into the existing JSONB so concurrent
 *      overrides on different months never overwrite each other within a
 *      single round-trip. RLS guarantees workspace isolation; the explicit
 *      `eq('workspace_id', workspaceId)` is a defence-in-depth check.
 *   5. `logAuditEvent(WORKSPACE_RESTE_A_VIVRE_UPDATED)` — fire-and-forget
 *      so an audit log persistence blip never undoes the user write.
 *      No amount in metadata (PII-adjacent in financial software).
 *   6. `revalidateDashboard()` so the cockpit re-renders with the new
 *      `resteAVivre`. Wrapped in try/catch — if revalidation fails AFTER
 *      the DB write, the data is already saved and we still return ok.
 *
 * PR-BETA-3 hotfix 2026-05-26 (post-merge): added the outer try/catch +
 * non-blocking audit/revalidate so transient Vercel infra incidents
 * (cold-start failures, edge worker crashes) surface as a translated
 * `{ ok: false }` response — never a bare HTTP 503 the client cannot
 * interpret. The drawer is then responsible for keeping the panel open
 * + showing a toast so the user can retry.
 */
export async function updateResteAVivreOverrideAction(input: unknown): Promise<ActionResult> {
  // requireUserWithWorkspace() throws Next.js `redirect()` markers when no
  // session — those MUST propagate (catching them would swallow the auth
  // bounce). Hence kept outside the try/catch below.
  const { user, workspaceId } = await requireUserWithWorkspace();

  try {
    const { ip, userAgent } = await contextFromHeaders();

    const rl = await rateLimit('mutation', `user:${user.id}`);
    if (!rl.success) return { ok: false, errorCode: 'errors.session.rateLimited' };

    const parsed = resteAVivreMonthOverrideSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        errorCode: 'errors.validation.generic',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const supabase = await createClient();
    const { data: settings, error: readError } = await supabase
      .from('workspace_settings')
      .select('reste_a_vivre_overrides')
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (readError) {
      log.error('Failed to read workspace_settings before reste-à-vivre override', {
        workspace_id: workspaceId,
        error_code: readError.code ?? 'unknown',
      });
      return { ok: false, errorCode: 'errors.settings.resteAVivreUpdateFailed' };
    }

    // Defensive cast — Supabase types may lag if `supabase:types` was not
    // re-run after the PR-BETA-3 migration. The JSONB column is canonically
    // `Record<string, number>` per the migration COMMENT.
    const currentOverrides = (settings?.reste_a_vivre_overrides ?? {}) as Record<string, number>;
    const nextOverrides: Record<string, number> = {
      ...currentOverrides,
      [parsed.data.monthYYYYMM]: parsed.data.montant,
    };

    const { error: writeError } = await supabase
      .from('workspace_settings')
      .update({ reste_a_vivre_overrides: nextOverrides })
      .eq('workspace_id', workspaceId);

    if (writeError) {
      log.error('Failed to write workspace_settings reste-à-vivre override', {
        workspace_id: workspaceId,
        error_code: writeError.code ?? 'unknown',
      });
      return { ok: false, errorCode: 'errors.settings.resteAVivreUpdateFailed' };
    }

    // Audit log is best-effort: a transient `audit_log` insert failure must
    // never undo a user write that already succeeded. Fire-and-forget so
    // the failure mode is an error log entry, not an action error response.
    void logAuditEvent(
      AuditEvent.WORKSPACE_RESTE_A_VIVRE_UPDATED,
      { userId: user.id, workspaceId, ipAddress: ip, userAgent },
      { period_yyyymm: parsed.data.monthYYYYMM },
    ).catch((err) => {
      log.error('Audit log failed after reste-à-vivre write succeeded', {
        workspace_id: workspaceId,
        error_message: err instanceof Error ? err.message : String(err),
      });
    });

    // Revalidation runs AFTER the write — if it throws (e.g., transient
    // Next.js cache infra blip), the DB state is still consistent. Swallow
    // and log so the client gets a clean `{ ok: true }` and refreshes.
    try {
      revalidateDashboard();
    } catch (err) {
      log.warn('revalidateDashboard failed after reste-à-vivre write succeeded', {
        workspace_id: workspaceId,
        error_message: err instanceof Error ? err.message : String(err),
      });
    }

    return { ok: true };
  } catch (err) {
    // Outer safety net for any unexpected throw inside the action body
    // (createClient init crash, headers() crash, Zod internal, etc.).
    // Without this catch, a thrown error would surface as a bare HTTP 5xx
    // the drawer cannot interpret — exactly the symptom that prompted
    // this hotfix. Log everything we know so the next investigation has
    // a real stack trace to anchor on.
    log.error('updateResteAVivreOverrideAction unexpected crash', {
      user_id: user.id,
      workspace_id: workspaceId,
      error_message: err instanceof Error ? err.message : String(err),
      error_stack: err instanceof Error ? err.stack : undefined,
    });
    return { ok: false, errorCode: 'errors.settings.resteAVivreUpdateFailed' };
  }
}
