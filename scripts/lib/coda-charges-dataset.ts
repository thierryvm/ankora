/**
 * Dataset for `scripts/import-coda-charges.ts`.
 *
 * The real data (someone's actual budget) never lives in this repository,
 * which is public. It is read from a gitignored JSON file,
 * `scripts/import-coda-charges.local.json`. Without that file, the import runs
 * on `FICTIONAL_DATASET`, a made-up set with the same shape.
 *
 * Pure module: no Supabase, no side effect at import time. Filesystem access
 * happens only when `loadCodaDataset()` is called, and can be injected.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { z } from 'zod';

// ---------- Types ----------
export type CategoryKind = 'fixed' | 'variable' | 'income';
export type CategoryDef = { name: string; color: string; icon: string; kind: CategoryKind };

export type ChargeFrequency = 'monthly' | 'quarterly' | 'semiannual' | 'annual';
export type PaidFrom = 'principal' | 'epargne';
export type CodaCharge = {
  label: string;
  category: string;
  amount: number;
  frequency: ChargeFrequency;
  dueMonth: number;
  paidFrom: PaidFrom;
  notes?: string;
};

export type CodaDataset = { categories: CategoryDef[]; charges: CodaCharge[] };
export type LoadedDataset = CodaDataset & { source: 'local' | 'fictional' };

// ---------- Schema ----------
// Bounds mirror `public.categories` in supabase/migrations/20260416000001_initial_schema.sql:
// name length 1-60, color as a 6-digit hex, kind in ('fixed','variable','income').
const categorySchema = z
  .object({
    name: z.string().min(1).max(60),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    icon: z.string().min(1),
    kind: z.enum(['fixed', 'variable', 'income']),
  })
  .strict();

const chargeSchema = z
  .object({
    // Mirrors the database checks (char_length(label) between 1 and 120,
    // char_length(notes) <= 500): the import wipes the workspace before it
    // inserts, so a row the database would reject has to fail here first.
    label: z.string().min(1).max(120),
    category: z.string().min(1),
    amount: z.number().positive().refine(Number.isFinite, { message: 'must be finite' }),
    frequency: z.enum(['monthly', 'quarterly', 'semiannual', 'annual']),
    dueMonth: z.number().int().min(1).max(12),
    paidFrom: z.enum(['principal', 'epargne']),
    notes: z.string().max(500).optional(),
  })
  .strict();

export const codaDatasetSchema = z
  .object({
    categories: z.array(categorySchema),
    charges: z.array(chargeSchema),
  })
  .strict()
  .superRefine((dataset, ctx) => {
    // Custom messages never quote the offending value: this schema validates
    // real personal data, and its errors end up in terminal output.
    const seen = new Set<string>();
    dataset.categories.forEach((category, index) => {
      if (seen.has(category.name)) {
        ctx.addIssue({
          code: 'custom',
          path: ['categories', index, 'name'],
          message: 'duplicate category name',
        });
      }
      seen.add(category.name);
    });

    dataset.charges.forEach((charge, index) => {
      if (!seen.has(charge.category)) {
        ctx.addIssue({
          code: 'custom',
          path: ['charges', index, 'category'],
          message: 'references a category that is not declared in categories',
        });
      }
    });
  });

// ---------- Fictional dataset ----------
// Invented labels and round amounts. Colors satisfy the hex check of
// `categories.color`; `categories.icon` is free text with no constraint and no
// reader in the app, so the names below are only descriptive.
const FICTIONAL_CATEGORIES: CategoryDef[] = [
  { name: 'Logement (exemple)', color: '#3B82F6', icon: 'home', kind: 'fixed' },
  { name: 'Énergie (exemple)', color: '#F59E0B', icon: 'zap', kind: 'fixed' },
  { name: 'Assurances (exemple)', color: '#10B981', icon: 'shield', kind: 'fixed' },
  { name: 'Transport (exemple)', color: '#06B6D4', icon: 'car', kind: 'variable' },
  { name: 'Télécom (exemple)', color: '#8B5CF6', icon: 'smartphone', kind: 'fixed' },
  { name: 'Taxes (exemple)', color: '#71717A', icon: 'landmark', kind: 'fixed' },
  { name: 'Santé (exemple)', color: '#F43F5E', icon: 'heart-pulse', kind: 'variable' },
  { name: 'Loisirs (exemple)', color: '#EC4899', icon: 'music', kind: 'variable' },
  { name: 'Revenus (exemple)', color: '#22C55E', icon: 'wallet', kind: 'income' },
];

const FICTIONAL_NOTE = 'Donnée fictive, à remplacer par le fichier local.';

const FICTIONAL_CHARGES: CodaCharge[] = [
  {
    label: 'Loyer (exemple)',
    category: 'Logement (exemple)',
    amount: 800,
    frequency: 'monthly',
    dueMonth: 1,
    paidFrom: 'principal',
  },
  {
    label: 'Charges communes (exemple)',
    category: 'Logement (exemple)',
    amount: 100,
    frequency: 'quarterly',
    dueMonth: 1,
    paidFrom: 'principal',
  },
  {
    label: 'Électricité (exemple)',
    category: 'Énergie (exemple)',
    amount: 90,
    frequency: 'monthly',
    dueMonth: 1,
    paidFrom: 'principal',
  },
  {
    label: 'Gaz (exemple)',
    category: 'Énergie (exemple)',
    amount: 70,
    frequency: 'monthly',
    dueMonth: 1,
    paidFrom: 'principal',
  },
  {
    label: 'Eau (exemple)',
    category: 'Énergie (exemple)',
    amount: 150,
    frequency: 'semiannual',
    dueMonth: 3,
    paidFrom: 'epargne',
  },
  {
    label: 'Assurance habitation (exemple)',
    category: 'Assurances (exemple)',
    amount: 240,
    frequency: 'annual',
    dueMonth: 2,
    paidFrom: 'epargne',
  },
  {
    label: 'Assurance auto (exemple)',
    category: 'Assurances (exemple)',
    amount: 600,
    frequency: 'annual',
    dueMonth: 4,
    paidFrom: 'epargne',
  },
  {
    label: 'Assurance familiale (exemple)',
    category: 'Assurances (exemple)',
    amount: 100,
    frequency: 'annual',
    dueMonth: 6,
    paidFrom: 'epargne',
  },
  {
    label: 'Abonnement transport (exemple)',
    category: 'Transport (exemple)',
    amount: 50,
    frequency: 'monthly',
    dueMonth: 1,
    paidFrom: 'principal',
  },
  {
    label: 'Entretien véhicule (exemple)',
    category: 'Transport (exemple)',
    amount: 300,
    frequency: 'annual',
    dueMonth: 9,
    paidFrom: 'epargne',
  },
  {
    label: 'Carburant (exemple)',
    category: 'Transport (exemple)',
    amount: 120,
    frequency: 'monthly',
    dueMonth: 1,
    paidFrom: 'principal',
  },
  {
    label: 'Internet (exemple)',
    category: 'Télécom (exemple)',
    amount: 50,
    frequency: 'monthly',
    dueMonth: 1,
    paidFrom: 'principal',
  },
  {
    label: 'Téléphone mobile (exemple)',
    category: 'Télécom (exemple)',
    amount: 20,
    frequency: 'monthly',
    dueMonth: 1,
    paidFrom: 'principal',
  },
  {
    label: 'Taxe communale (exemple)',
    category: 'Taxes (exemple)',
    amount: 200,
    frequency: 'annual',
    dueMonth: 10,
    paidFrom: 'epargne',
  },
  {
    label: 'Taxe de circulation (exemple)',
    category: 'Taxes (exemple)',
    amount: 250,
    frequency: 'annual',
    dueMonth: 5,
    paidFrom: 'epargne',
  },
  {
    label: 'Mutuelle (exemple)',
    category: 'Santé (exemple)',
    amount: 30,
    frequency: 'quarterly',
    dueMonth: 1,
    paidFrom: 'principal',
  },
  {
    label: 'Lunettes (exemple)',
    category: 'Santé (exemple)',
    amount: 200,
    frequency: 'annual',
    dueMonth: 11,
    paidFrom: 'epargne',
  },
  {
    label: 'Streaming (exemple)',
    category: 'Loisirs (exemple)',
    amount: 10,
    frequency: 'monthly',
    dueMonth: 1,
    paidFrom: 'principal',
  },
  {
    label: 'Salle de sport (exemple)',
    category: 'Loisirs (exemple)',
    amount: 180,
    frequency: 'semiannual',
    dueMonth: 1,
    paidFrom: 'epargne',
    notes: FICTIONAL_NOTE,
  },
  {
    label: 'Cotisation club (exemple)',
    category: 'Loisirs (exemple)',
    amount: 60,
    frequency: 'annual',
    dueMonth: 9,
    paidFrom: 'epargne',
    notes: FICTIONAL_NOTE,
  },
  {
    label: 'Ramonage (exemple)',
    category: 'Logement (exemple)',
    amount: 80,
    frequency: 'annual',
    dueMonth: 10,
    paidFrom: 'epargne',
    notes: FICTIONAL_NOTE,
  },
  {
    label: 'Contrôle technique (exemple)',
    category: 'Transport (exemple)',
    amount: 40,
    frequency: 'annual',
    dueMonth: 7,
    paidFrom: 'epargne',
    notes: FICTIONAL_NOTE,
  },
  {
    label: 'Frais bancaires (exemple)',
    category: 'Taxes (exemple)',
    amount: 30,
    frequency: 'quarterly',
    dueMonth: 3,
    paidFrom: 'principal',
    notes: FICTIONAL_NOTE,
  },
];

export const FICTIONAL_DATASET: CodaDataset = {
  categories: FICTIONAL_CATEGORIES,
  charges: FICTIONAL_CHARGES,
};

// ---------- Loader ----------
export const DEFAULT_LOCAL_DATASET_PATH = resolve(
  process.cwd(),
  'scripts',
  'import-coda-charges.local.json',
);

/**
 * Refuses a destructive import of the fictional dataset unless asked for.
 *
 * The import wipes the workspace's categories before seeding, and dependent
 * rows keep their category only through `on delete set null`: a run that
 * silently fell back to fictional data (local file missing, wrong working
 * directory, fresh worktree) would replace a real setup with made-up one and
 * drop the categorisation of existing rows. A dry run writes nothing, so it
 * stays allowed.
 */
export function assertWritableDataset(
  source: LoadedDataset['source'],
  flags: { dryRun: boolean; allowFictional: boolean },
): void {
  if (source === 'fictional' && !flags.dryRun && !flags.allowFictional) {
    throw new Error(
      'Refusing to write the fictional dataset: no local dataset file was found. ' +
        'Create scripts/import-coda-charges.local.json, or pass --allow-fictional to seed the sample on purpose.',
    );
  }
}

export type LoadCodaDatasetOptions = {
  localPath?: string;
  readFile?: (path: string) => string;
  exists?: (path: string) => boolean;
};

/**
 * Returns the local dataset when its file exists, the fictional one otherwise.
 *
 * A local file that exists but cannot be read, parsed or validated throws:
 * falling back to fictional data there would import made-up charges over a
 * real workspace without anyone noticing. Error messages name the path and
 * the reason, never the file content — `JSON.parse` errors quote a fragment
 * of their input, so their message is deliberately not forwarded.
 */
export function loadCodaDataset(options: LoadCodaDatasetOptions = {}): LoadedDataset {
  const localPath = options.localPath ?? DEFAULT_LOCAL_DATASET_PATH;
  const exists = options.exists ?? existsSync;
  const readFile = options.readFile ?? ((path: string) => readFileSync(path, 'utf8'));

  if (!exists(localPath)) {
    return { source: 'fictional', ...FICTIONAL_DATASET };
  }

  let raw: string;
  try {
    raw = readFile(localPath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code ?? 'unknown error';
    throw new Error(`Cannot read local dataset ${localPath}: ${code}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`Local dataset ${localPath} is not valid JSON`);
  }

  const parsed = codaDatasetSchema.safeParse(json);
  if (!parsed.success) {
    // Built-in issues are reduced to their code; only the messages written in
    // `superRefine` above are forwarded, since they are known not to quote data.
    const reasons = parsed.error.issues
      .map((issue) => {
        const path = issue.path.map(String).join('.') || '(root)';
        return `${path}: ${issue.code === 'custom' ? issue.message : issue.code}`;
      })
      .join('; ');
    throw new Error(`Local dataset ${localPath} does not match the expected schema — ${reasons}`);
  }

  return { source: 'local', ...parsed.data };
}
