/**
 * Shared building blocks for Server Action unit tests.
 *
 * Vitest's `vi.mock` factory is hoisted above module-scope `const` declarations,
 * so we deliberately avoid exposing spies from this helper — each test owns its
 * own spies and inlines them in `vi.mock`. What we *do* factor out are the
 * static fixtures and the long Supabase fluent chains, which are the real
 * source of duplication across the action test suites.
 */

export const TEST_USER_ID = 'user-123';
export const TEST_WORKSPACE_ID = 'ws-456';

/**
 * Returns the chain produced by
 * `supabase.from('workspace_members').select(...).eq(...).in(...).order(...).limit(...).maybeSingle()`
 * resolving to a single owner-membership row.
 */
export function membershipLookupChain() {
  return {
    select: () => ({
      eq: () => ({
        in: () => ({
          order: () => ({
            limit: () => ({
              maybeSingle: async () => ({
                data: { workspace_id: TEST_WORKSPACE_ID, role: 'owner' as const },
              }),
            }),
          }),
        }),
      }),
    }),
  };
}

/**
 * Returns the response shape of `supabase.auth.getUser()` for an authenticated user.
 */
export function authenticatedUserResponse() {
  return { data: { user: { id: TEST_USER_ID } } };
}
