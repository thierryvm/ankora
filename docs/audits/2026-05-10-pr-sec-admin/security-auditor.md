# Security Audit -- PR-SEC-ADMIN (feat/sec-admin-hardening HEAD 861be8a)

- **Date**: 2026-05-10
- **Auditor**: security-auditor agent (rapport assemblé par @cowork après quota CC Ankora atteint mid-write)
- **Commits in scope**: 12811a3 to 861be8a (7 commits)
- **Verdict**: PASS_WITH_NOTES

---

## Executive Summary

Sound defense-in-depth on the `/admin` surface: RBAC fail-closed allow-list, rate limit before auth, granular audit logging, cache + referrer headers, robots exclusion, conditional nav link. No P0 blocker. Two P1 findings (audit integrity + GDPR minimization), two P2 notes, one P3 informational.

---

## Findings

### P1-A — `x-pathname` header never set; audit log records `/admin` for all sub-routes

**File**: `src/lib/auth/require-admin.ts:42`
**Severity**: P1 — audit integrity (not access control)

`require-admin.ts` reads `x-pathname` from request headers to populate the `path` field in all three `admin.access.*` audit events. `proxy.ts` (the middleware) never sets this header — it only injects `x-nonce` and `content-security-policy`. Every audit event therefore persists `path: "/admin"` regardless of which sub-route was actually requested. When PR-B2 delivers real admin sub-pages (dashboard, users, etc.) the audit trail will be useless for incident investigation.

**Recommended fix**: In `src/proxy.ts`, after `handleI18nRouting`, add:

```ts
request.headers.set('x-pathname', request.nextUrl.pathname);
```

No security regression; the header is server-side only, never forwarded to the client.

---

### P1-B — `attempted_user_id` in denied-event metadata duplicates `context.userId`

**File**: `src/lib/auth/require-admin.ts:68-73`, `src/lib/security/audit-log.ts:87`
**Severity**: P1 — GDPR Article 5(1)(c) data minimization

`logAuditEvent(ADMIN_ACCESS_DENIED, { userId: user.id, ... }, { ..., attempted_user_id: user.id })` persists the same UUID in both the canonical `user_id` column and `metadata.attempted_user_id`. ADR-019 justifies it as "cross-correlation with auth.signup events", but the canonical `user_id` column already serves that purpose — any query joining on `user_id` already has it. Storing identical data twice is redundant under GDPR minimization.

**Recommended fix**: Remove `attempted_user_id` from the denied-event metadata object in `require-admin.ts:72`. Remove the key from `SAFE_METADATA_KEYS` in `audit-log.ts` to prevent accidental re-addition in future PRs.

---

### P2-A — `ANKORA_ADMIN_USER_IDS` Zod schema does not validate UUID format

**File**: `src/lib/env.ts:23`
**Severity**: P2 — misconfiguration risk at deploy time

`ANKORA_ADMIN_USER_IDS: z.string().default('').optional()` accepts arbitrary strings. A typo (extra whitespace, truncated UUID, copy-paste error) silently produces an allow-list entry that will never match a Supabase user ID. Fail-closed semantics prevent unauthorized access, but the founder is locked out of admin with no startup-time warning.

**Recommended fix**: Add a `superRefine` or `transform` step in `env.ts` that splits on `,`, trims, filters empty tokens, then validates each against `z.string().uuid()`. Build will fail fast on misconfiguration instead of silently locking out the admin.

---

### P2-B — `audit_log.ip_address` has no documented retention or anonymization policy

**File**: `supabase/migrations/20260416000001_initial_schema.sql:117`, `src/lib/security/audit-log.ts:111`
**Severity**: P2 — GDPR Article 5(1)(e) storage limitation (pre-existing gap, worsened by this PR)

`audit_log.ip_address` is `inet` (full precision, IPv6-capable). IP addresses are personal data under CJEU Breyer. This PR adds three new admin events that explicitly log IP for unauthenticated rate-limited requests where no user consent could have been obtained. There is no documented retention period, no automatic anonymization/truncation after N days, and no mention of audit log IP in the consent/privacy flow. Deny-all RLS is correct (no unauthorized read risk), but the storage limitation gap is real.

**Recommended fix**:

1. Document a retention policy in `docs/gdpr/` (e.g., 90-day rolling delete or `/24` prefix anonymization after 30 days).
2. Add a Supabase `pg_cron` job or Edge Function to enforce deletion/truncation.
3. Add a line in the privacy policy referencing security audit log IP storage.
4. Delegate full sweep to `gdpr-compliance-auditor` agent.

---

### P3 — Timing attack on `Set.has(user.id)` is computationally infeasible (informational)

**File**: `src/lib/auth/require-admin.ts:67`, `src/lib/auth/is-admin.ts:38`
**Severity**: P3 — acknowledged in ADR-019 §"Conséquences neutres"

`Set.has()` and `Array.includes()` perform short-circuit string comparison with early exit on first mismatch character. For 122-bit Supabase UUIDs, enumerating a valid admin ID via timing requires on the order of 2^65 requests — computationally infeasible. ADR-019 explicitly documents the trade-off and defers `crypto.timingSafeEqual` to a follow-up commit.

No immediate action required. If a `crypto.timingSafeEqual` wrapper is added, it must operate on `Buffer.from(id, 'utf8')` with equal-length padding to be correct.

---

## OWASP Top 10 Coverage

| OWASP                         | Area                           | Status | Notes                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------- | ------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A01 Broken Access Control     | Layout guard                   | PASS   | `requireAdmin()` called line 48 of `layout.tsx` before `children` render. App Router layout-as-guard: no page added under `/admin/*` can bypass the guard without a route group escape, which does not exist in this tree.                                                                                                                                                 |
| A01                           | No Server Actions under /admin | PASS   | Zero `'use server'` files found under `src/app/[locale]/admin/`.                                                                                                                                                                                                                                                                                                           |
| A02 Cryptographic Failures    | Session cookies                | PASS   | `@supabase/ssr` sets HttpOnly + Secure + SameSite=Lax via the cookie handler. PKCE flow configured in `server.ts`.                                                                                                                                                                                                                                                         |
| A02                           | Admin allow-list storage       | PASS   | Stored in server-only env var, never serialized to client bundle, not in git.                                                                                                                                                                                                                                                                                              |
| A04 Insecure Design           | Defense-in-depth               | PASS   | 7 independent layers per ADR-019.                                                                                                                                                                                                                                                                                                                                          |
| A05 Security Misconfiguration | Security headers               | PASS   | `Cache-Control: private, no-store`, `Referrer-Policy: same-origin`, `X-Robots-Tag` applied on both default-locale (`/admin/:path*`) and prefixed-locale (`/:locale(en\|nl-BE\|de-DE\|es-ES)/admin/:path*`). Global headers include `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, HSTS (prod), Permissions-Policy. CSP strict-dynamic + nonce via `proxy.ts`. |
| A06 Vulnerable Components     | No new deps                    | PASS   | Zero new packages introduced in this PR.                                                                                                                                                                                                                                                                                                                                   |
| A07 Auth Failures             | Rate limit before auth         | PASS   | `rateLimit('admin', 'ip:...')` is step 1 in `requireAdmin()`, before any Supabase round-trip.                                                                                                                                                                                                                                                                              |
| A07                           | `getUser()` not `getSession()` | PASS   | `requireUser()` calls `supabase.auth.getUser()` (server-side JWT verification), not client-trusted `getSession()`.                                                                                                                                                                                                                                                         |
| A09 Security Logging          | Audit completeness             | PASS   | granted/denied/rate_limited all emitted.                                                                                                                                                                                                                                                                                                                                   |
| A09                           | No PII in structured logs      | PASS   | pino redact paths cover `*.email`, `*.password`, `*.token`. `log.error` in `audit-log.ts:118` emits only `event` and `error.message`.                                                                                                                                                                                                                                      |
| A09                           | Metadata whitelist             | PASS   | `sanitizeMetadata()` is whitelist-only, unknown keys silently dropped, string values capped at 256 chars.                                                                                                                                                                                                                                                                  |
| A10 SSRF                      | No outbound HTTP               | N/A    | No new external HTTP calls in this PR surface.                                                                                                                                                                                                                                                                                                                             |

---

## RGPD Compliance Snapshot

| Article                    | Area                                                      | Status                               |
| -------------------------- | --------------------------------------------------------- | ------------------------------------ |
| 5(1)(c) Data Minimization  | `attempted_user_id` redundant in denied event             | NON-CONFORMANT — P1-B                |
| 5(1)(e) Storage Limitation | No retention policy for `audit_log.ip_address`            | NON-CONFORMANT — P2-B (pre-existing) |
| 25 Privacy by Design       | Deny-all RLS, UA truncated 256 chars, metadata whitelist  | PASS                                 |
| 30 ROPA                    | Admin access logging not yet documented in privacy policy | TODO post V1.0                       |

---

## Summary

| Priority | Count | Findings                                                                            |
| -------- | ----- | ----------------------------------------------------------------------------------- |
| P0       | 0     | None                                                                                |
| P1       | 2     | P1-A (`x-pathname` not set in middleware), P1-B (duplicate UUID in denied metadata) |
| P2       | 2     | P2-A (UUID format not validated in env), P2-B (IP retention policy missing)         |
| P3       | 1     | Timing attack informational                                                         |

No blocking issue for merge. **P1-A must be fixed before PR-B2 ships real admin sub-pages** (audit trail otherwise meaningless). P1-B and P2-A are low-effort and should land in a follow-up commit on this same branch.

---

## Files Reviewed

- `src/lib/auth/require-admin.ts`
- `src/lib/auth/is-admin.ts`
- `src/lib/auth/require-user.ts`
- `src/lib/security/rate-limit.ts`
- `src/lib/security/audit-log.ts`
- `src/lib/supabase/server.ts`
- `src/lib/supabase/middleware.ts`
- `src/lib/env.ts`
- `src/lib/log.ts`
- `src/proxy.ts`
- `src/app/[locale]/admin/layout.tsx`
- `src/app/[locale]/admin/page.tsx`
- `src/app/[locale]/admin/_components/AdminTopbar.tsx`
- `src/app/[locale]/admin/_components/_client/LangSwitcherClient.tsx`
- `src/components/layout/Header.tsx`
- `src/app/robots.ts`
- `next.config.ts`
- `src/app/[locale]/error.tsx`
- `supabase/migrations/20260416000001_initial_schema.sql` (audit_log schema)
- `supabase/migrations/20260416000002_rls_policies.sql`
- `supabase/migrations/20260417000003_audit_log_explicit_deny.sql`
- `docs/adr/ADR-019-admin-security-baseline.md`
- `src/lib/auth/__tests__/require-admin.test.ts`

---

_Note méta : ce rapport a été assemblé par @cowork (Cowork desktop, Opus 4.7) le 2026-05-10 à partir des findings rédigés par le security-auditor de @cc-ankora avant que le quota n'atteigne le plafond mid-write. Le contenu reflète intégralement les findings analysés par CC Ankora — seul le mécanisme d'écriture du fichier (bash heredoc en boucle infinie) a été contourné par un Write direct via Cowork._
