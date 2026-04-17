#!/usr/bin/env tsx
/**
 * Imports the user's Coda "DB_Dépenses" table into Ankora.
 *
 * Idempotent: wipes existing categories + charges for the target workspace,
 * then recreates them from the hard-coded list below. Run against a real
 * Supabase project using the service role key from .env.local.
 *
 * Usage:
 *   tsx scripts/import-coda-charges.ts --email=thierryvm@hotmail.com --dry-run
 *   tsx scripts/import-coda-charges.ts --email=thierryvm@hotmail.com
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/supabase/types';

// ---------- .env.local loader ----------
function loadEnvLocal(): void {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match) continue;
      const [, key, value] = match;
      if (!key || key in process.env) continue;
      process.env[key] = value?.replace(/^"(.*)"$/, '$1') ?? '';
    }
  } catch {
    // .env.local missing — fall through to process.env
  }
}
loadEnvLocal();

// ---------- CLI args ----------
const rawArgs = process.argv.slice(2);
const args = new Map<string, string>();
for (const a of rawArgs) {
  const m = a.match(/^--([a-zA-Z0-9-]+)(?:=(.*))?$/);
  if (!m) continue;
  const [, k, v] = m;
  if (!k) continue;
  args.set(k, v ?? 'true');
}
const email = args.get('email') ?? 'thierryvm@hotmail.com';
const dryRun = args.get('dry-run') === 'true';

// ---------- Reference data ----------
type CategoryKind = 'fixed' | 'variable' | 'income';
type CategoryDef = { name: string; color: string; icon: string; kind: CategoryKind };

const CATEGORIES: CategoryDef[] = [
  { name: 'Logement', color: '#4F46E5', icon: 'home', kind: 'fixed' },
  { name: 'Abonnements', color: '#8B5CF6', icon: 'repeat', kind: 'fixed' },
  { name: 'Assurances', color: '#0EA5E9', icon: 'shield', kind: 'fixed' },
  { name: 'Transport', color: '#F59E0B', icon: 'car', kind: 'fixed' },
  { name: 'Santé', color: '#EC4899', icon: 'heart', kind: 'fixed' },
  { name: 'Taxes', color: '#DC2626', icon: 'landmark', kind: 'fixed' },
  { name: 'Famille', color: '#14B8A6', icon: 'users', kind: 'fixed' },
  { name: 'Courses', color: '#22C55E', icon: 'shopping-cart', kind: 'variable' },
  { name: 'Autres', color: '#6B7280', icon: 'circle', kind: 'variable' },
];

type ChargeFrequency = 'monthly' | 'quarterly' | 'semiannual' | 'annual';
type PaidFrom = 'principal' | 'epargne';
type CodaCharge = {
  label: string;
  category: string;
  amount: number;
  frequency: ChargeFrequency;
  dueMonth: number;
  paidFrom: PaidFrom;
  notes?: string;
};

const CHARGES: CodaCharge[] = [
  {
    label: 'Loyer',
    category: 'Logement',
    amount: 740,
    frequency: 'monthly',
    dueMonth: 1,
    paidFrom: 'principal',
  },
  {
    label: 'Charges (immeuble)',
    category: 'Logement',
    amount: 120,
    frequency: 'monthly',
    dueMonth: 1,
    paidFrom: 'principal',
  },
  {
    label: 'MEGA',
    category: 'Logement',
    amount: 55,
    frequency: 'monthly',
    dueMonth: 1,
    paidFrom: 'principal',
  },
  {
    label: 'Pension alimentaire',
    category: 'Famille',
    amount: 120,
    frequency: 'monthly',
    dueMonth: 1,
    paidFrom: 'principal',
  },
  {
    label: 'Impôt',
    category: 'Taxes',
    amount: 220,
    frequency: 'monthly',
    dueMonth: 1,
    paidFrom: 'principal',
  },
  {
    label: 'Solidaris (1)',
    category: 'Santé',
    amount: 14,
    frequency: 'monthly',
    dueMonth: 1,
    paidFrom: 'principal',
  },
  {
    label: 'Solidaris (2)',
    category: 'Santé',
    amount: 22,
    frequency: 'monthly',
    dueMonth: 1,
    paidFrom: 'principal',
  },
  {
    label: 'FGTB',
    category: 'Autres',
    amount: 19,
    frequency: 'monthly',
    dueMonth: 1,
    paidFrom: 'principal',
  },
  {
    label: 'Apple One',
    category: 'Abonnements',
    amount: 3,
    frequency: 'monthly',
    dueMonth: 1,
    paidFrom: 'principal',
  },
  {
    label: 'Netflix',
    category: 'Abonnements',
    amount: 22,
    frequency: 'monthly',
    dueMonth: 1,
    paidFrom: 'principal',
  },
  {
    label: 'Voo',
    category: 'Abonnements',
    amount: 78,
    frequency: 'monthly',
    dueMonth: 1,
    paidFrom: 'principal',
  },
  {
    label: 'Proximus',
    category: 'Abonnements',
    amount: 55,
    frequency: 'monthly',
    dueMonth: 1,
    paidFrom: 'principal',
  },
  {
    label: 'PlayStation abo',
    category: 'Abonnements',
    amount: 9,
    frequency: 'monthly',
    dueMonth: 1,
    paidFrom: 'principal',
  },
  {
    label: 'Belfius',
    category: 'Autres',
    amount: 6,
    frequency: 'monthly',
    dueMonth: 1,
    paidFrom: 'principal',
  },
  {
    label: 'Assurance auto',
    category: 'Assurances',
    amount: 150,
    frequency: 'monthly',
    dueMonth: 1,
    paidFrom: 'principal',
  },
  {
    label: 'Crédit voiture',
    category: 'Transport',
    amount: 250,
    frequency: 'monthly',
    dueMonth: 1,
    paidFrom: 'principal',
  },
  {
    label: 'S.W.D.E (eaux)',
    category: 'Logement',
    amount: 45,
    frequency: 'quarterly',
    dueMonth: 1,
    paidFrom: 'epargne',
    notes: 'Cycle trimestriel — dueMonth à préciser',
  },
  {
    label: 'Taxe voiture',
    category: 'Taxes',
    amount: 300,
    frequency: 'annual',
    dueMonth: 6,
    paidFrom: 'epargne',
    notes: 'Échéance 01/06/2026',
  },
  {
    label: 'Taxe poubelle',
    category: 'Taxes',
    amount: 120,
    frequency: 'annual',
    dueMonth: 3,
    paidFrom: 'epargne',
    notes: 'Payée le 25/03/2026',
  },
  {
    label: 'Taxe égout',
    category: 'Taxes',
    amount: 55,
    frequency: 'annual',
    dueMonth: 3,
    paidFrom: 'epargne',
    notes: 'Payée le 25/03/2026',
  },
  {
    label: 'Dashlane',
    category: 'Abonnements',
    amount: 53,
    frequency: 'annual',
    dueMonth: 4,
    paidFrom: 'epargne',
    notes: 'Payée le 11/04/2026',
  },
];

// ---------- Main ----------
async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  const admin: SupabaseClient<Database> = createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  log(`target=${email} dry-run=${dryRun}`);

  const { data: listed, error: listErr } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (listErr) throw listErr;
  const user = listed.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) throw new Error(`User not found: ${email}`);
  log(`user_id=${user.id}`);

  const { data: membership, error: memberErr } = await admin
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (memberErr) throw memberErr;
  if (!membership) throw new Error('No workspace membership found for this user');
  const workspaceId = membership.workspace_id;
  log(`workspace_id=${workspaceId} role=${membership.role}`);

  if (dryRun) {
    log('DRY RUN — no writes.');
    log(`Would seed ${CATEGORIES.length} categories and ${CHARGES.length} charges:`);
    for (const c of CATEGORIES) log(`  cat ${c.name} (${c.kind})`);
    for (const c of CHARGES) {
      log(
        `  charge ${c.label.padEnd(24)} ${String(c.amount).padStart(4)}€ ${c.frequency.padEnd(10)} month=${c.dueMonth} from=${c.paidFrom}`,
      );
    }
    return;
  }

  const { error: delChargesErr } = await admin
    .from('charges')
    .delete()
    .eq('workspace_id', workspaceId);
  if (delChargesErr) throw delChargesErr;
  const { error: delCatsErr } = await admin
    .from('categories')
    .delete()
    .eq('workspace_id', workspaceId);
  if (delCatsErr) throw delCatsErr;
  log('cleared existing charges + categories');

  const { data: catsInserted, error: catsErr } = await admin
    .from('categories')
    .insert(
      CATEGORIES.map((c) => ({
        workspace_id: workspaceId,
        created_by: user.id,
        name: c.name,
        color: c.color,
        icon: c.icon,
        kind: c.kind,
      })),
    )
    .select('id, name');
  if (catsErr) throw catsErr;
  const catByName = new Map<string, string>((catsInserted ?? []).map((c) => [c.name, c.id]));
  log(`inserted ${catsInserted?.length ?? 0} categories`);

  const { error: chargesErr } = await admin.from('charges').insert(
    CHARGES.map((c) => ({
      workspace_id: workspaceId,
      created_by: user.id,
      label: c.label,
      amount: c.amount,
      frequency: c.frequency,
      due_month: c.dueMonth,
      category_id: catByName.get(c.category) ?? null,
      is_active: true,
      paid_from: c.paidFrom,
      notes: c.notes ?? null,
    })),
  );
  if (chargesErr) throw chargesErr;
  log(`inserted ${CHARGES.length} charges`);
  log('done');
}

function log(message: string): void {
  process.stdout.write(`[import-coda] ${message}\n`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[import-coda] FAILED: ${message}\n`);
  if (err instanceof Error && err.stack) {
    process.stderr.write(`${err.stack}\n`);
  }
  process.exit(1);
});
