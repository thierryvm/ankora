// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { readdirSync } from 'node:fs';

import { describe, it, expect } from 'vitest';

/**
 * No new hand-rolled sliding panel. Ever.
 *
 * `docs/specs/sheet-primitive-contract.md` §4 asked for this guard, on the
 * pattern of `app-destinations.test.ts` which has already earned its keep. The
 * defect it locks out is precise and documented: six panels shipped, each
 * re-deriving `Escape`, the scroll lock and the focus trap from scratch, and
 * the three written FIRST — the ones opened daily — ended up without a focus
 * trap or `env(safe-area-inset-bottom)`. Nothing failed, because nothing looked.
 *
 * ## Why there is an allowlist rather than a clean sweep
 *
 * Migrating the five surviving panels is chantier C4, deliberately AFTER the
 * primitive has been proven on a real call-site (`DECISIONS-ANKORA.md` §Q8: a
 * primitive is extracted, not decreed). A guard that only passes once C4 lands
 * would have to be written after C4 — and then it would never have prevented
 * anything. So it ships now, with the five known offenders named.
 *
 * The list may only ever SHRINK. Adding to it is how a guard becomes a
 * formality: the test fails on any NEW file that re-implements the behaviour,
 * and fails again if a listed file is fixed but not struck off.
 */

const SRC = fileURLToPath(new URL('../../../', import.meta.url));

/**
 * The five panels that still own their modal behaviour, to be absorbed by
 * `<Sheet>` in C4. `AjusterResteAVivreDrawer` was the sixth; ADR-035 deleted it.
 */
const PENDING_MIGRATION: readonly string[] = [
  'app/[locale]/app/charges/ChargeEditDrawer.tsx',
  'app/[locale]/app/expenses/ExpenseEditDrawer.tsx',
  'components/dashboard/SimulatorDrawer.tsx',
  'components/layout/MoreSheet.tsx',
  'components/layout/HeaderNav.tsx',
];

/** The primitive itself is where this behaviour is SUPPOSED to live. */
const THE_PRIMITIVE = 'components/primitives/Sheet.tsx';

/** shadcn's Radix wrapper: 0 call-sites, kept pending the ADR-028 arbitration. */
const UNUSED_SHADCN = 'components/ui/sheet.tsx';

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Panels whose NAME does not advertise what they are.
 *
 * The glob below matches `*Drawer*.tsx` / `*Sheet*.tsx`, which is the honest
 * surface for a name-based guard — but `HeaderNav.tsx` is a full sliding drawer
 * with its own scroll lock and Escape handler, and the glob cannot see it. Left
 * implicit, the guard would silently under-cover the very file class it exists
 * for. Named explicitly instead.
 */
const PANELS_THE_GLOB_CANNOT_SEE: readonly string[] = ['components/layout/HeaderNav.tsx'];

/** Files whose NAME advertises a sliding panel — the surface this guard covers. */
function panelFiles(): { path: string; source: string }[] {
  return walk(SRC)
    .filter(
      (file) =>
        /(Drawer|Sheet)[^/\\]*\.tsx$/.test(file) ||
        PANELS_THE_GLOB_CANNOT_SEE.some((known) =>
          relative(SRC, file).replace(/\\/g, '/').endsWith(known),
        ),
    )
    .filter((file) => !/__tests__/.test(file))
    .map((file) => ({
      path: relative(SRC, file).replace(/\\/g, '/'),
      source: readFileSync(file, 'utf8'),
    }));
}

/** Does this file re-implement Escape-to-close itself? */
const ownsEscape = (source: string) => /['"]Escape['"]/.test(source);

/**
 * Does this file re-implement the body scroll lock itself?
 *
 * `\bbody\.style\.` and not `document\.body\.style\.`: the primitive destructures
 * (`const { body } = document`), and a regex that missed it would have declared
 * the primitive innocent — making the last case in this file vacuous, which is
 * exactly the failure mode a guard must not have.
 */
const ownsScrollLock = (source: string) => /\bbody\.style\.(overflow|position)/.test(source);

describe('the Sheet primitive is the only place modal behaviour is implemented', () => {
  const files = panelFiles();

  it('finds the panel files at all (a broken glob would make this suite vacuous)', () => {
    expect(files.map((f) => f.path)).toContain(THE_PRIMITIVE);
    expect(files.length).toBeGreaterThan(PENDING_MIGRATION.length);
  });

  it('has no panel outside the primitive re-implementing Escape or the scroll lock', () => {
    const offenders = files
      .filter((f) => f.path !== THE_PRIMITIVE && f.path !== UNUSED_SHADCN)
      .filter((f) => ownsEscape(f.source) || ownsScrollLock(f.source))
      .map((f) => f.path)
      .filter((path) => !PENDING_MIGRATION.includes(path));

    expect(
      offenders,
      `these panels re-implement modal behaviour instead of using <Sheet>:\n${offenders.join('\n')}\n` +
        `Compose the primitive. If this is a legacy file being migrated in C4, ` +
        `it belongs in PENDING_MIGRATION — and that list may only shrink.`,
    ).toEqual([]);
  });

  it('keeps the pending list honest — a migrated panel must be struck off', () => {
    const byPath = new Map(files.map((f) => [f.path, f.source]));
    const stale = PENDING_MIGRATION.filter((path) => {
      const source = byPath.get(path);
      // A deleted file is also "no longer an offender".
      if (source === undefined) return true;
      return !ownsEscape(source) && !ownsScrollLock(source);
    });

    expect(
      stale,
      `these are listed as pending migration but no longer own their modal ` +
        `behaviour (migrated or deleted). Remove them from PENDING_MIGRATION:\n${stale.join('\n')}`,
    ).toEqual([]);
  });

  it('records that the primitive is the one that does own it', () => {
    const primitive = files.find((f) => f.path === THE_PRIMITIVE)?.source ?? '';
    expect(ownsEscape(primitive)).toBe(true);
    expect(ownsScrollLock(primitive)).toBe(true);
  });
});
