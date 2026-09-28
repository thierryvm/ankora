import type { SupabaseClient } from '@supabase/supabase-js';

import { money, type Charge, type ChargePaidFrom } from '@/lib/domain/types';
import type { Database } from '@/lib/supabase/types';

type ChargeDbRow = Database['public']['Tables']['charges']['Row'];

/**
 * One mapping from a `charges` row to the domain `Charge`, shared by the
 * dashboard snapshot and the server actions that must recompute a plan figure
 * themselves (tour 55: the provisions share of a transfer is never taken from
 * the client). Two mappings would drift, and the screen and the write would
 * then disagree on the same bill.
 *
 * The `??` defaults tolerate a deploy/migration window (incident 2026-07-18).
 */
export function chargeFromRow(c: ChargeDbRow): Charge {
  return {
    id: c.id,
    label: c.label,
    amount: money(Number(c.amount)),
    frequency: c.frequency as Charge['frequency'],
    dueMonth: c.due_month,
    paymentDay: c.payment_day,
    paymentMonths: (c.payment_months ?? []) as readonly number[],
    categoryId: c.category_id,
    isActive: c.is_active,
    isWatched: c.is_watched ?? false,
    paidFrom: c.paid_from as ChargePaidFrom,
  };
}

/**
 * The workspace's charges, or `null` when they cannot be read — never `[]`:
 * an empty list would compute a provisions share of 0 and write the whole
 * transfer as free savings without a word.
 */
export async function loadWorkspaceCharges(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
): Promise<Charge[] | null> {
  const { data, error } = await supabase
    .from('charges')
    .select('*')
    .eq('workspace_id', workspaceId);
  if (error || !data) return null;
  return data.map(chargeFromRow);
}
