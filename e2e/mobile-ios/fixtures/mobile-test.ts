/**
 * Mobile-iOS test fixture — sprint Mobile Recovery (PR-QA-1b, 4 mai 2026).
 *
 * Thin wrapper that re-exports the project-wide `test` (with consent banner
 * pre-seeded — cf. ../helpers/test.ts) and adds two opt-in fixtures for specs
 * that need an authenticated, onboarded user with a real Supabase backend:
 *
 *   - `admin`        — AdminClient | null. When null, the env is not set for
 *                      full e2e (no SUPABASE_SERVICE_ROLE_KEY, or dummy CI
 *                      values). Specs read this directly when they need to
 *                      call `seedUserWithCharges()` for custom charge sets.
 *
 *   - `seededUser`   — Pre-seeded onboarded user (no charges). Cleaned up in
 *                      teardown. **Auto-skips the test** when no admin is
 *                      available — specs do NOT need to call
 *                      `test.skip(!seededUser, …)` themselves. This avoids
 *                      the latent-debt risk of a spec forgetting the guard
 *                      and dereferencing a null user.
 *
 * Patterns chosen for cohesion with the rest of `e2e/`:
 * - Reuses `adminClientOrNull()` / `seedOnboardedUser()` / `deleteSeededUser()`
 *   from `../helpers/seed.ts` — no duplication of Supabase admin logic.
 *
 * Why a wrapper rather than a brand-new fixtures/test-account.ts (per the
 * @cowork brief): the existing helpers already do this exact job, and the
 * Ankora architecture rule "no duplication" prevails. Re-using the helpers
 * keeps a single source of truth for the seed/cleanup contract.
 */

import { test as baseTest } from '../../helpers/test';
import {
  adminClientOrNull,
  deleteSeededUser,
  seedOnboardedUser,
  type AdminClient,
  type SeedCharge,
} from '../../helpers/seed';

export type SeededUser = {
  email: string;
  password: string;
  userId: string;
  workspaceId: string;
};

type MobileFixtures = {
  /**
   * Admin Supabase client, or null when env is not configured for full e2e.
   * Tests that destructure `admin` directly should `test.skip(!admin, …)`
   * upfront. Tests that destructure `seededUser` are auto-skipped — no
   * manual guard needed.
   */
  admin: AdminClient | null;
  /**
   * Pre-seeded onboarded user with no charges. Cleaned up in teardown.
   * **Type is non-null in the test body**: when the env is not configured,
   * the fixture calls `test.skip()` BEFORE the test runs, so any spec that
   * destructures `seededUser` can safely use it without a null check.
   */
  seededUser: SeededUser;
};

export const test = baseTest.extend<MobileFixtures>({
  admin: async ({}, run) => {
    const client = adminClientOrNull();
    await run(client);
  },
  seededUser: async ({ admin }, run, testInfo) => {
    if (!admin) {
      // Auto-skip: the spec asked for a seededUser but the env can't provide
      // one. Mark the test skipped with a clear reason so reports stay
      // honest (no false-positive pass).
      testInfo.skip(
        true,
        'seededUser fixture requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY — env not configured for full e2e.',
      );
      // Unreachable — testInfo.skip() throws — but TypeScript needs a return.
      return;
    }
    const user = await seedOnboardedUser(admin, []);
    try {
      await run(user);
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  },
});

export { expect } from '../../helpers/test';

/**
 * Helper for specs that need a seeded user WITH charges. Call inside the
 * test body after asserting `admin` is non-null. Cleanup is the caller's
 * responsibility (try/finally with `deleteSeededUser`).
 */
export async function seedUserWithCharges(
  admin: AdminClient,
  charges: SeedCharge[],
): Promise<SeededUser> {
  return seedOnboardedUser(admin, charges);
}

export { deleteSeededUser } from '../../helpers/seed';
