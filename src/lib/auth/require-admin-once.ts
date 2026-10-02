import 'server-only';

import { cache } from 'react';

import { requireAdmin } from './require-admin';

/**
 * `requireAdmin()`, run once per request.
 *
 * Next renders a layout and its page IN PARALLEL: a guard in
 * `admin/layout.tsx` alone does not stop the page's own reads from starting —
 * for an anonymous visitor too. The admin page reads with the service-role
 * client (security review of 2 October 2026), so it must wait for the verdict
 * itself. Calling `requireAdmin()` a second time would rate-limit and audit
 * every visit twice; `cache` shares one verdict between the layout and the page
 * of the same request. `requireAdmin()` itself is unchanged and stays the only
 * door.
 */
export const requireAdminOnce = cache(requireAdmin);
