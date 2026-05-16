# Ankora Security Audit Log

Append-only journal of security-relevant changes shipped to main. Each entry
references the PR + ADR + agent QA findings before/after, so the security
posture can be reconstructed at any point in time without scanning git
history.

---

## 2026-05-10 — PR-SEC-ADMIN baseline (admin route hardening)

**PR**: feat(sec-admin) branche `feat/sec-admin-hardening` (5 commits)
**ADR**: [ADR-019](./adr/ADR-019-admin-security-baseline.md)
**Trigger**: post-PR #159 (admin topbar consumer prod) — UX gap (lien manquant) + sécurité non durcie. `/admin` = première route ciblée par scanners automatisés.

### Surface protégée

`/[locale]/admin/*` — surface admin réservée fondateur (initialement @thierry). RBAC via allow-list `ANKORA_ADMIN_USER_IDS` (CSV de UUIDs Supabase, env server-only).

### Couches livrées (7)

| #   | Couche                                            | Fichiers                                                          |
| --- | ------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | RBAC fail-closed (`requireAdmin` + `isAdmin`)     | `src/lib/auth/{require-admin,is-admin}.ts`                        |
| 2   | Rate limit 10 req/min/IP (Upstash sliding window) | `src/lib/security/rate-limit.ts` (kind `admin`)                   |
| 3   | Audit log granulaire (3 events)                   | `src/lib/security/audit-log.ts`                                   |
| 4   | Headers HTTP defense-in-depth                     | `next.config.ts` (X-Robots-Tag + Cache-Control + Referrer-Policy) |
| 5   | `metadata.robots` layout-level                    | `src/app/[locale]/admin/layout.tsx`                               |
| 6   | `robots.txt` Disallow `/admin/`                   | `src/app/robots.ts`                                               |
| 7   | UX conditional nav link (`isAdmin()` SSR)         | `src/components/layout/Header.tsx` + 5 locales i18n               |

### Audit events ajoutés

- `admin.access.granted` — accès admin réussi (audit success path)
- `admin.access.denied` — auth réussie mais user pas dans allow-list
- `admin.access.rate_limited` — 10 req/min/IP exhausted

Metadata whitelist enrichie : `path`, `attempted_user_id`. Pas de PII (email, role, session token).

### Agents QA — scores avant/après

| Agent                     | Verdict                                           | Findings P0/P1/P2/P3      | Rapport                                                          |
| ------------------------- | ------------------------------------------------- | ------------------------- | ---------------------------------------------------------------- |
| `security-auditor`        | PASS_WITH_NOTES (1 fix appliqué post-audit)       | 0 P0 / 2 P1 / 2 P2 / 1 P3 | `docs/audits/2026-05-10-pr-sec-admin/security-auditor.md`        |
| `dashboard-ux-auditor`    | PASS_WITH_FINDINGS (1 fix appliqué, 2 différés)   | F1, F3✅, F4 (mobile)     | `docs/audits/2026-05-10-pr-sec-admin/dashboard-ux-auditor.md`    |
| `gdpr-compliance-auditor` | COMPLIANT_WITH_NOTES (1 P1 convergent fix, 2 P2)  | 1 P1✅ / 2 P2             | `docs/audits/2026-05-10-pr-sec-admin/gdpr-compliance-auditor.md` |
| `llm-security-auditor`    | NOT_APPLICABLE_V1 / BASELINE_DOCUMENTED_FOR_V1.5+ | 0 / surface IA = N/A      | `docs/audits/2026-05-10-pr-sec-admin/llm-security-auditor.md`    |

**Fixes appliqués post-audit (1 commit final)** :

- **P1-A security** : `proxy.ts` set `x-pathname` header → audit log enregistre vrai sub-route (préparation PR-B2)
- **P1-B security + P1 GDPR convergent** : retrait `attempted_user_id` de metadata (redondant avec `user_id` colonne + survivait à `executeDeletion()`)
- **F3 dashboard-ux** : `bg-amber-500 → amber-600` (WCAG SC 1.4.11 contrast 2.4:1 → 3.5:1)

**Findings différés (avec justification documentée)** :

- P2-A security : `ANKORA_ADMIN_USER_IDS` Zod UUID validation → fix dédié post-PR-SEC-ADMIN
- P2-B security + P2-A GDPR : retention policy `audit_log.ip_address` → pré-existant, à résoudre avant V1.0 publique
- P2-B GDPR : analytics Upstash rétention → privacy policy enrichment OU `analytics: false` sur kind admin
- F1 dashboard-ux : token amber non documenté → décision @cowork (token dédié vs réutilisation `--color-warning`)
- F4 dashboard-ux : admin link mobile drawer absent → différé (touche HeaderNav existant, risque régression > valeur PR scope)
- P3 security : timing attack UUID infeasible → noté en ADR-019, pas d'action

**`llm-security-auditor`** : agent IMPORTÉ depuis Terminal Learning (commit 861be8a). Registry pas refresh dans la session du dispatch — placeholder structuré écrit, vrai run à faire en session fraîche.

### Findings closed

| Finding (pre-PR)                                            | Closed by                      |
| ----------------------------------------------------------- | ------------------------------ |
| `/admin` accès non rate-limité                              | Couche 2 — Commit 4b31110      |
| Pas d'audit trail accès admin                               | Couche 3 — Commit 4b31110      |
| `/admin` indexable par crawlers (pas de noindex/robots.txt) | Couches 4+5+6 — Commit 5d9062a |
| `/admin` cacheable (CDN + browser)                          | Couche 4 — Commit 5d9062a      |
| URL admin leak via Referer outbound links                   | Couche 4 — Commit 5d9062a      |
| @thierry doit taper `/admin` manuellement (risque hardcode) | Couche 7 — Commit 7f858e3      |

### Findings différés (avec justification)

| Finding                                       | Justification                                                                           | Tracker                                                                   |
| --------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Constant-time UUID comparison                 | UUIDs 122 bits entropy → timing attack computationally infeasible                       | Si `security-auditor` agent flag, fix dédié avec `crypto.timingSafeEqual` |
| Middleware-level rate limit (proper HTTP 429) | Server Components ne peuvent pas émettre status custom — `notFound()` 404 acceptable V0 | TODO ADR-019 §différés                                                    |
| E2E full flow login admin → /admin            | Auth fixture admin Supabase (storageState seeded) pas en place côté repo                | Infra task séparée                                                        |
| RLS coverage automated audit                  | Pas de RPC `get_rls_coverage` côté DB                                                   | Script daily TODO ADR-019                                                 |
| `llm-security-auditor` baseline               | Agent absent `.claude/agents/`                                                          | À créer avant V1.5+ admin recommendations IA-powered                      |

---

## Notes méthodologiques

Cette doc est un journal append-only. Les sections sont datées par PR + ADR référencé. Un futur audit cross-projet (Ankora/Atlas/GetPostCraft) peut comparer les baselines.

Les scores agents QA "TBD" en post-PR seront remplis au moment du run agents avant merge — l'ADR documentera les findings et le score final dans le rapport de PR (`docs/prs/`).
