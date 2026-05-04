/**
 * Mobile-iOS test fixture — sprint Mobile Recovery (PR-QA-1b, 4 mai 2026).
 *
 * Thin wrapper that re-exports the project-wide `test` (with consent banner
 * pre-seeded — cf. ../helpers/test.ts) and adds an opt-in `seededUser`
 * fixture for specs that need an authenticated, onboarded user with a real
 * Supabase backend. Cleanup happens automatically in the fixture teardown.
 *
 * Patterns chosen for cohesion with the rest of `e2e/`:
 * - Reuses `adminClientOrNull()` / `seedOnboardedUser()` / `deleteSeededUser()`
 *   from `../helpers/seed.ts` — no duplication of Supabase admin logic.
 * - When env is not configured for full e2e (no SUPABASE_SERVICE_ROLE_KEY,
 *   or it's the dummy CI key), the fixture returns null and specs are
 *   expected to call `test.skip(!seededUser, '…')` upfront.
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
   * Specs MUST `test.skip(!admin, '…')` when they need DB access.
   */
  admin: AdminClient | null;
  /**
   * Pre-seeded onboarded user with no charges. Cleaned up in teardown.
   * Specs that need charges should call `seedOnboardedUserWith(charges)`
   * via the `admin` fixture directly.
   */
  seededUser: SeededUser | null;
};

export const test = baseTest.extend<MobileFixtures>({
  admin: async ({}, run) => {
    const client = adminClientOrNull();
    await run(client);
  },
  seededUser: async ({ admin }, run) => {
    if (!admin) {
      await run(null);
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
