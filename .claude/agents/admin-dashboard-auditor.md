---
name: admin-dashboard-auditor
description: |
  Audits admin dashboard for security enforcement, data accuracy, query performance, and accessibility.
  Triggered on changes to admin pages, components, and migrations touching admin roles.
---

# Admin Dashboard Auditor

## Triggers

Run this agent after modifications to:

- `src/app/[locale]/app/admin/**` (admin pages and layouts)
- `src/lib/admin/**` (admin utilities, services, hooks)
- `supabase/migrations/*` (schema changes affecting admin tables or RLS)

## Mission

Verify that the admin dashboard **enforces access control rigorously, maintains data precision under concurrent load, delivers fast queries with indexed lookups, and meets WCAG 2.2 AA accessibility standards**. Prevent unauthorized data exposure and performance regressions that could compromise incident response.

## Checklist (≥12 points verified)

### Security & Authorization

- [ ] **requireAdmin() enforced** — every admin page/handler calls `requireAdmin()` before rendering or accessing sensitive data
- [ ] **RLS policies active** — admin tables have row-level security policies; no direct `select *` without `current_user_id()` checks
- [ ] **No hardcoded user IDs** — admin routes accept `user_id` from query params only if explicitly validated via Zod + session
- [ ] **Audit logging present** — sensitive actions (data export, config change, user deletion) emit `logAuditEvent()` with actor + timestamp
- [ ] **Rate limiting on write** — admin mutations (update, delete) pass through `rateLimit()` to prevent mass actions

### Data Integrity & Performance

- [ ] **Query performance** — EXPLAIN ANALYZE on all admin queries shows ≤ 10ms p95 for fetch operations; joins indexed
- [ ] **Concurrent writes safe** — no race conditions when multiple admins update same resource (use optimistic locking or advisory locks)
- [ ] **Data freshness** — stale data detection (e.g., modal shows "data updated 2m ago" if >1m old; refresh button present)
- [ ] **Pagination present** — tables with >100 rows have cursor-based or limit/offset pagination (no `select *` on large tables)
- [ ] **No N+1 queries** — admin dashboards batch-load related data (users, events, errors) in single query or use `dataloader` pattern

### UI & Accessibility

- [ ] **Responsive design** — admin layout works on mobile + tablet + desktop (not just desktop-first assumption)
- [ ] **Keyboard navigation** — all controls keyboard-accessible (no mouse-only data table interaction, focus indicators visible)
- [ ] **Color contrast** — text ≥ 4.5:1 on small text, ≥ 3:1 on large; chart colors distinguishable for colorblind (not red-only)
- [ ] **ARIA labels** — tables have role="table" / role="grid", headers aria-sort, status indicators have aria-live regions
- [ ] **Loading + error states** — skeleton loaders or spinners during data fetch; error messages clear + actionable ("retry", "contact support")

### Dashboard-Specific Elements

- [ ] **Tech Health section** — uptime indicator, error rate graph, p50/p95/p99 latency, top 10 errors 7d, CI build status (GitHub API)
- [ ] **Product Health section** — DAU/WAU/MAU sparklines, retention cohorts (1/7/30d), onboarding funnel (step 1 → complete), feature heatmap (charges, expenses, simulator)
- [ ] **Acquisition section** — signup trend 7d/30d, top referrers, UTM breakdown, conversion "first workspace created" rate
- [ ] **Rule-based alerts** — contextualized recommendations ("Step 3 onboarding drop 23%", "Error form-charge ×40 this week", "15 signups same domain 1h")

## Report Format

### GO (pass all checks)

```
✅ Admin dashboard audit PASSED
- All 12+ checklist items verified
- requireAdmin() enforced on all routes
- No N+1 queries detected
- WCAG 2.2 AA compliance confirmed
```

### NO-GO (fail ≥1 item)

```
❌ Admin dashboard audit FAILED

Failures:
- [ ] Point 1: /app/admin/users missing requireAdmin() guard
- [ ] Point 8: /api/admin/metrics query N+1 (loads users in loop instead of batch)
- [ ] Point 12: Mobile layout breaks on tablet — charts overflow

Next: fix the 3 failures, then re-run audit.
```

## Notes

- **EXPLAIN ANALYZE**: For any query in admin, run `EXPLAIN ANALYZE SELECT...` in psql to verify indexing and execution time.
- **Audit log retention**: Admin actions logged to `audit_log` table (append-only, 90-day retention minimum).
- **Concurrent safety**: Use Supabase's advisory locks (`pg_advisory_lock`) or row versioning (`updated_at` optimistic locking) when multiple admins can modify the same row.
- **Data export format**: Admin exports to JSON must validate PII redaction (no secrets, no passwords, no raw tokens).
