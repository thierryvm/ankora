#!/usr/bin/env tsx
/**
 * Imports the user's Coda "DB_Dépenses" table into Ankora.
 *
 * Idempotent: wipes existing categories + charges for the target workspace,
 * then recreates them from the dataset. Run against a real Supabase project
 * using the service role key from .env.local.
 *
 * Where the data lives: this repository is public, so the real categories and
 * charges are NOT in it. They are read from `scripts/import-coda-charges.local.json`,
 * a gitignored file (shape: `CodaDataset` in `scripts/lib/coda-charges-dataset.ts`).
 * Without that file, the import uses a fictional dataset — the run logs which
 * source it picked before writing anything, and refuses to WRITE the fictional
 * dataset unless `--allow-fictional` is passed.
 *
 * Usage:
 *   tsx scripts/import-coda-charges.ts --email=you@example.com [--dry-run] [--allow-fictional]
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/supabase/types';

import { assertWritableDataset, loadCodaDataset } from './lib/coda-charges-dataset';

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
const emailArg = args.get('email');
if (!emailArg || emailArg === 'true') {
  // A bare `--email` parses as 'true': reject it like a missing flag.
  process.stderr.write(
    '[import-coda] FAILED: --email=<address> is required (e.g. --email=you@example.com)\n',
  );
  process.exit(1);
}
const email: string = emailArg;
const dryRun = args.get('dry-run') === 'true';
const allowFictional = args.get('allow-fictional') === 'true';

// ---------- Main ----------
async function main(): Promise<void> {
  // Loaded first: an invalid local file must stop the run before any network
  // call, let alone a write.
  const dataset = loadCodaDataset();
  const { categories, charges } = dataset;
  log(`dataset source=${dataset.source} categories=${categories.length} charges=${charges.length}`);
  assertWritableDataset(dataset.source, { dryRun, allowFictional });

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
    log(`Would seed ${categories.length} categories and ${charges.length} charges:`);
    for (const c of categories) log(`  cat ${c.name} (${c.kind})`);
    for (const c of charges) {
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
      categories.map((c) => ({
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
    charges.map((c, index) => {
      const categoryId = catByName.get(c.category);
      if (!categoryId) {
        // The schema guarantees the category is declared, so reaching this
        // means the insert above did not return it. Refuse rather than import
        // an uncategorised charge. The label is not quoted: it is real data.
        throw new Error(`No inserted category found for charge #${index}`);
      }
      return {
        workspace_id: workspaceId,
        created_by: user.id,
        label: c.label,
        amount: c.amount,
        frequency: c.frequency,
        due_month: c.dueMonth,
        category_id: categoryId,
        is_active: true,
        paid_from: c.paidFrom,
        notes: c.notes ?? null,
      };
    }),
  );
  if (chargesErr) throw chargesErr;
  log(`inserted ${charges.length} charges`);
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
