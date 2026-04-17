# Changelog

All notable changes to Ankora are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Phase 2 MVP — complete end-to-end scope (auth, onboarding, dashboard, settings, PWA, GDPR).

## [0.2.0] — 2026-04-17

### Added

- **Authentication** — signup / login / password reset / OAuth callback.
- **MFA** — TOTP enrollment + verification + unenroll (Google Authenticator compatible).
- **Onboarding** — 3-step wizard (workspace, first charge, first source).
- **Dashboard** — CRUD for charges, sources, categories, budgets.
- **Domain layer** — pure financial calculations with Decimal.js (provision, budget, simulation, balance).
- **Settings** — profile editing, MFA management, session list, GDPR export, account deletion with 30-day grace.
- **PWA** — service worker, offline fallback, manifest, installable icons.
- **GDPR** — consent banner, data export (art. 20), deletion flow (art. 17), audit log with pseudonymisation.
- **Security** — CSP with per-request nonce, HSTS preload, rate-limit multi-bucket (auth/api/mutation/export), audit events.
- **Tests** — 77 Vitest unit tests, 15 Playwright e2e scenarios across Chromium + WebKit.
- **CI** — GitHub Actions pipeline (lint, typecheck, vitest, playwright, lighthouse, npm audit).
- **Docs** — README SEO/GEO-friendly, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, issue/PR templates.

### Security

- CSP with `strict-dynamic` and per-request nonce (nanoid).
- X-Frame-Options `DENY` + `frame-ancestors 'none'`.
- HSTS preload (2 years).
- Rate-limit fail-open graceful fallback when Upstash Redis env is missing (dev only, warns in prod).
- Open-redirect protection on `/auth/callback` `next` param.
- Zod validation on every Server Action (no trusting client IDs).
- Generic error messages on auth actions (no Supabase error leakage).

### Privacy

- Analytics opt-in only (Vercel Analytics disabled until consent).
- Audit log unreadable from client JWTs (revoked from `anon` and `authenticated`).
- Audit metadata sanitised via whitelist before persistence.
- Account deletion pseudonymises audit log rows instead of deleting them (art. 17(3)(b)).

## [0.1.0] — 2026-04-16

### Added

- Initial project scaffold (Next.js 16, TypeScript strict, Tailwind 4, Supabase).
- Base UI — layout, branding, theme tokens, cookie banner, landing, marketing pages, FAQ, legal pages.
- Initial Supabase schema with Row Level Security on all tables.
