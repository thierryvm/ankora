# Security policy — Ankora

> **Email migration in progress** — `security@ankora.be` and `privacy@ankora.be` will be activated once the ankora.be domain MX records are configured (target Beta 2026-06). Until then, all security and privacy reports route to `thierryvm@gmail.com`. See tracking issue: [#email-migration](https://github.com/thierryvm/ankora/issues?q=label%3Aemail-migration) (label `email-migration`).

## Reporting a vulnerability

If you discover a security issue, please email **thierryvm@gmail.com** (subject prefix `[ANKORA-SEC]`) with:

- Steps to reproduce
- Affected versions / URLs
- Proof of concept (if applicable)

Once `security@ankora.be` is live, that address will become the canonical contact and this section will be updated. PGP key publication targeted V1.0 public release.

Please do **not** open a public issue. We aim to acknowledge within 48 hours
and ship a fix or mitigation within 7 days for critical issues.

## Supported versions

Only the `main` branch receives security fixes.

## Security baseline

### Transport & headers

- HTTPS only (HSTS preload)
- CSP with per-request nonce + `strict-dynamic`
- COOP / CORP `same-origin`
- X-Frame-Options `DENY` + `frame-ancestors 'none'`
- Permissions-Policy: all features locked by default
- Referrer-Policy `strict-origin-when-cross-origin`

### Authentication

- Supabase Auth (PKCE flow)
- Passwords: min 12 chars, mixed case + digit
- Rate limit: 5 attempts / 15 min per IP
- MFA (TOTP) available in user settings
- Sessions auto-refresh via middleware

### Authorization

- Row Level Security on every user-scoped table
- `auth.uid()` always used — no trusting client IDs
- Service role key never reaches the browser
- Admin client used only for GDPR operations + audit writes

### Data

- EU region hosting (Supabase eu-west / eu-central)
- Encryption at rest (Supabase default)
- Encryption in transit (TLS 1.3)
- Audit log unreadable from client JWTs
- Deletion: 30-day grace period, then hard delete + audit log pseudonymisation

### Dependencies

- `npm audit` runs in CI, fails on high/critical
- Dependabot alerts enabled
- No new deps without review

## Scope

In scope:

- ankora.be (production) and any preview deployments on `*.vercel.app`
- Production Supabase project
- Ankora GitHub organisation

Out of scope:

- Third-party services (Supabase, Vercel, Upstash) — report directly to them
- Social engineering of Ankora staff
- DDoS / volumetric attacks

## Jurisdiction & Legal

This security policy is governed by the laws of **Belgium** and is subject to
Belgian data protection regulations (GDPR, RGPD). Security reports will be
handled in accordance with Belgian law and EU regulations.

For legal correspondence or disputes regarding security matters, the exclusive
jurisdiction shall be the courts of Belgium.
