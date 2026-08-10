import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import type { Database } from '@/lib/supabase/types';
import type { TestUser } from './user';

export type AdminClient = SupabaseClient<Database>;

type SeededUser = TestUser & {
  userId: string;
  workspaceId: string;
};

export type SeedCharge = {
  label: string;
  amount: number;
  frequency: 'monthly' | 'quarterly' | 'semiannual' | 'annual';
  dueMonth: number;
  paidFrom: 'principal' | 'epargne';
};

/**
 * Returns an admin Supabase client, or null when the environment cannot provide
 * one. Callers skip the test on null.
 *
 * Readiness is DECLARED, not sniffed. It used to be inferred from the URL —
 * `url.includes('localhost:54321')` meant "dummy CI value, skip". That heuristic
 * made a real local Supabase stack indistinguishable from a placeholder, so
 * `supabase start` in CI would have changed nothing: every authenticated spec
 * would have kept skipping. Whoever starts the stack now says so with
 * E2E_SUPABASE_READY=1.
 *
 * The distinction that matters: NO flag means "this environment was never meant
 * to run authenticated specs" → skip, which is legitimate. Flag set but the
 * client cannot be built means something is BROKEN → throw. Returning null there
 * would report a green, mostly-skipped run — the exact failure this whole step
 * exists to remove.
 */
export function adminClientOrNull(): AdminClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const declaredReady = process.env.E2E_SUPABASE_READY === '1';

  // A truncated or placeholder key: both local and hosted service_role keys are
  // JWTs well over 40 characters.
  const usable = Boolean(url) && Boolean(key) && (key?.length ?? 0) >= 40;

  if (!usable) {
    if (declaredReady) {
      throw new Error(
        'E2E_SUPABASE_READY=1 but no usable Supabase admin credentials: ' +
          `NEXT_PUBLIC_SUPABASE_URL=${url ? 'set' : 'MISSING'}, ` +
          `SUPABASE_SERVICE_ROLE_KEY=${key ? `${key.length} chars` : 'MISSING'}. ` +
          'Refusing to skip silently — fix the environment or unset the flag.',
      );
    }
    return null;
  }

  return createClient<Database>(url!, key!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Create an email-confirmed, onboarded user with a seeded workspace. Returns
 * credentials + IDs so the caller can clean up (via deleteSeededUser) and
 * assert against DB state.
 */
export async function seedOnboardedUser(
  admin: AdminClient,
  charges: SeedCharge[] = [],
): Promise<SeededUser> {
  const id = randomBytes(6).toString('hex');
  const email = `ankora-e2e+${id}@ankora.test`;
  const password = `Tests${id.toUpperCase()}!9`;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    throw new Error(`createUser failed: ${createError?.message ?? 'no user'}`);
  }
  const userId = created.user.id;

  const { error: onboardError } = await admin
    .from('users')
    .update({ onboarded_at: new Date().toISOString() })
    .eq('id', userId);
  if (onboardError) throw new Error(`mark onboarded: ${onboardError.message}`);

  const { data: membership, error: memberError } = await admin
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)
    .single();
  if (memberError || !membership) {
    throw new Error(`lookup workspace: ${memberError?.message ?? 'none'}`);
  }
  const workspaceId = membership.workspace_id;

  if (charges.length > 0) {
    const { error: chargesError } = await admin.from('charges').insert(
      charges.map((c) => ({
        workspace_id: workspaceId,
        created_by: userId,
        label: c.label,
        amount: c.amount,
        frequency: c.frequency,
        due_month: c.dueMonth,
        is_active: true,
        paid_from: c.paidFrom,
      })),
    );
    if (chargesError) throw new Error(`seed charges: ${chargesError.message}`);
  }

  return { email, password, userId, workspaceId };
}

/**
 * Supprime l'utilisateur éphémère — et **échoue si la suppression échoue**.
 *
 * Le `await` nu qui tenait ici avalait l'erreur, et ce n'était pas un détail de
 * propreté : cet appel est le SEUL endroit du dépôt qui exécute la chaîne
 * complète `auth.users → users → workspaces → {accounts, charge_payments,
 * commitment_payments}`. Depuis J1 (ADR-038 D3) cette chaîne traverse une clé
 * étrangère composite de plus. Si la cascade cassait, GoTrue rendrait une
 * erreur, le helper l'aurait avalée, la spec serait passée au vert — et un
 * utilisateur de test aurait fui à chaque exécution.
 *
 * Autrement dit : un mécanisme qui ne peut pas échouer ne prouve rien. Relevé
 * par `rls-flow-tester` le 2026-08-10.
 *
 * « User not found » est toléré : le nettoyage tourne en `finally`, donc il peut
 * courir après un test qui a déjà supprimé le compte. Toute autre erreur est
 * une information, pas un désagrément.
 */
export async function deleteSeededUser(admin: AdminClient, userId: string): Promise<void> {
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error && !/not\s*found/i.test(error.message)) {
    throw new Error(`deleteSeededUser: ${error.message}`);
  }
}
