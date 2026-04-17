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
 * Returns an admin Supabase client or null if the env is not configured
 * for full authenticated e2e (e.g. dummy CI values). Callers should skip
 * the test when null.
 */
export function adminClientOrNull(): AdminClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (url.includes('localhost:54321')) return null;
  if (key.length < 40) return null;
  return createClient<Database>(url, key, {
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

export async function deleteSeededUser(admin: AdminClient, userId: string): Promise<void> {
  await admin.auth.admin.deleteUser(userId);
}
