/**
 * Next.js control-flow exceptions detector — shared by Server Actions and
 * Client Components that wrap `await action()` calls in a try/catch.
 *
 * ## Why this exists
 *
 * `redirect()` and `notFound()` from `next/navigation` work by THROWING a
 * special error that the Next.js framework catches at the boundary of the
 * Server Action (or Route Handler, or Page) and converts into a redirect /
 * 404 response. **Catching that error in user code is a bug** — it
 * swallows the framework signal and the user never gets bounced.
 *
 * The Next.js docs are explicit about this:
 *
 *   > Internally, `redirect()` throws an error that gets handled by Next.js.
 *   > Do NOT catch this error in your own code.
 *   — https://nextjs.org/docs/app/api-reference/functions/redirect
 *
 * Same rule applies to `notFound()`.
 *
 * ## The pitfall
 *
 * Both Server Actions and the Client Components that `await` them must
 * propagate these errors. A try/catch like:
 *
 *   try { await myAction(); } catch (err) { toast.error(...); }
 *
 * catches NEXT_REDIRECT and shows a generic toast instead of letting the
 * framework bounce the user. PR-BETA-3 hotfix #3 (2026-05-26) shipped
 * exactly this bug — the `await updateResteAVivreOverrideAction(...)` on
 * the client side swallowed the NEXT_REDIRECT thrown when the user's
 * session expired, leaving the user staring at a red toast instead of the
 * `/login` page.
 *
 * ## Usage
 *
 * Wrap the catch block:
 *
 *   try { ... } catch (err) {
 *     if (isNextControlFlowError(err)) throw err;
 *     // your real error handling
 *   }
 *
 * Works identically on both sides (Server Action body, Client Component
 * around `await action()`).
 *
 * ## Detection strategy
 *
 * Next.js attaches a `digest` string starting with `NEXT_REDIRECT` or
 * `NEXT_NOT_FOUND` on the thrown error. Older versions used `error.message`
 * as the marker. We check both to stay robust across Next.js minor
 * versions — the `next/dist/...` internal import paths shift between
 * releases and would be a bigger maintenance liability.
 */
export function isNextControlFlowError(err: unknown): err is Error {
  if (!(err instanceof Error)) return false;

  // Modern path (Next.js 14+): the framework attaches a `.digest` string.
  // Format example: 'NEXT_REDIRECT;replace;/login;307;' or 'NEXT_NOT_FOUND'.
  const digest = (err as Error & { digest?: unknown }).digest;
  if (typeof digest === 'string') {
    if (digest.startsWith('NEXT_REDIRECT')) return true;
    if (digest.startsWith('NEXT_NOT_FOUND')) return true;
  }

  // Fallback: some legacy code paths surface the error with just the
  // canonical message and no digest. Cross-version safety net.
  if (err.message === 'NEXT_REDIRECT' || err.message === 'NEXT_NOT_FOUND') {
    return true;
  }

  return false;
}
