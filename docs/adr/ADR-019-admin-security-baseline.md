# ADR-019 — Admin route security baseline (defense-in-depth multi-couches)

- **Statut** : Accepted
- **Date** : 2026-05-10
- **Auteur** : @cowork (brief PR-SEC-ADMIN), @cc-ankora (implémentation)
- **Deciders** : Thierry vanmeeteren (Product Owner), @cowork (Architecture), @cc-ankora (Implémentation)
- **Tags** : `security`, `admin`, `rbac`, `audit`, `rate-limit`, `headers`
- **Portée** : V1.0 publique (PR-SEC-ADMIN, post-PR #159 admin topbar)
- **En lien avec** :
  - PR #147 (atoms ThemeToggle + LangSwitcher) — atomes consommés par AdminTopbar
  - PR #159 (PR-B AdminTopbar consumer prod) — surface admin minimale
  - `CLAUDE.md` projet §"Choix techniques lockés" → "Admin auth : `requireAdmin()` basé sur `user_id` Thierry initialement"

---

## Contexte & problème

PR #159 a livré la surface admin minimale (layout + topbar + RBAC `requireAdmin()` simple allow-list). Deux gaps post-merge identifiés par @thierry :

1. **UX** : pas de lien visible depuis la nav user pour accéder à `/admin`. @thierry doit taper l'URL manuellement → mauvais réflexe (pourrait commit un lien hardcodé un jour).
2. **Sécurité** : la route est protégée par `require-admin.ts` (allow-list UIDs), mais aucun durcissement défensif au-delà de la check basique. Surface attaque non documentée, pas d'audit log, pas de rate limit, pas de noindex, pas de stress test.

`/admin` est la **première route que tout scanner automatisé tente**. Ankora doit s'y attendre dès maintenant, pas après la V1.0 publique fin juin.

Les 2 gaps sont liés : ajouter un lien admin sans durcir la sécurité = élargir la surface tout en restant fragile. Faisons les 2 ensemble (PR-SEC-ADMIN, 5 commits scope-séparés).

---

## Décision

**Multi-couches defense-in-depth sur `/[locale]/admin/*`** — chaque couche est indépendante et fail-closed. Un attaquant doit ignorer simultanément TOUTES les couches pour pénétrer.

### Couche 1 — RBAC fail-closed

`src/lib/auth/{require-admin,is-admin}.ts` :

- `requireAdmin()` (route guard) : `requireUser()` puis check `user.id ∈ ANKORA_ADMIN_USER_IDS` → redirect `/login` ou `/app` selon résultat. Throws via Next.js navigation (NEXT_REDIRECT).
- `isAdmin()` (soft check) : retourne `boolean`, fail-closed sur erreur Supabase, utilisé pour conditional rendering UI (lien admin dans nav, futurs gates conditional).

Allow-list via env var server-only (`ANKORA_ADMIN_USER_IDS`, CSV de UUIDs Supabase). Fail-closed : empty allow-list → toujours `false` (pas de magical "everyone is admin").

### Couche 2 — Rate limit (Upstash sliding window)

Nouveau kind `admin` dans `src/lib/security/rate-limit.ts` : **10 req/min/IP**. Appliqué **avant** auth check pour choke scan volume avant de payer le Supabase round-trip.

Choix mono-tier vs bi-tier :

- Brief initial : 10 req/min/IP authentifiés + 5 req/min/IP non-authentifiés.
- Décision : **mono-tier 10 req/min** uniformément. Distinguer auth/non-auth ajoute complexité sans valeur sécu — un scanner non-authentifié est de toute façon bloqué par `requireUser` downstream, le rate limit choke juste le volume des tentatives.

Sur exhaustion → `notFound()` (404) plutôt que 429 (Server Components ne peuvent pas émettre status code custom directement). Le 404 masque aussi la route entière des scanners. Future PR peut déplacer le rate limit dans `middleware.ts` pour proper 429 avec `Retry-After`.

### Couche 3 — Audit log granulaire

3 nouveaux events dans `src/lib/security/audit-log.ts` :

- `admin.access.granted` (success path)
- `admin.access.denied` (auth réussie mais pas dans allow-list)
- `admin.access.rate_limited` (10 req/min/IP exhausted)

Metadata whitelist enrichie : `path`, `attempted_user_id`. Pas de PII (email, role, session token).

Audit log non-bloquant : `logAuditEvent` swallow DB errors → ne lock pas @thierry hors admin sur défaut Supabase.

### Couche 4 — Headers HTTP defense-in-depth

`next.config.ts` headers route-specific `/admin/:path*` (default-locale + chaque locale prefixé) :

- `X-Robots-Tag: noindex, nofollow, noarchive, nocache` (hard stop indexing même si meta tag loupé par scraper)
- `Cache-Control: private, no-store, max-age=0` (no CDN cache, no browser cache → admin page jamais servi stale)
- `Referrer-Policy: same-origin` (tighter que global, prévient leak admin URL via Referer outbound)

CSP `frame-ancestors 'none'` est déjà enforced globalement par middleware nonce-based CSP — non dupliqué pour éviter drift.

### Couche 5 — `metadata.robots` layout-level

`src/app/[locale]/admin/layout.tsx` exporte `metadata` avec `robots: { index: false, follow: false, nocache: true, googleBot }`. Propage à toute child page sans override.

### Couche 6 — `robots.txt` Disallow

`src/app/robots.ts` : ajout `/admin/` au disallow base + per-locale (`/en/admin/`, `/nl-BE/admin/`, etc.). Stoppe les bien-comportés crawlers avant probe.

### Couche 7 — UX conditional nav link

`src/components/layout/Header.tsx` (variant='app' uniquement) appelle `await isAdmin()` avant render. Si admin → render `<Link href="/admin">` avec aria-label dédié + dot amber subtil. Skip pour marketing variant (pages publiques).

i18n parité 5 locales : ajout `nav.admin` + `nav.adminAriaLabel` dans fr-BE/nl-BE/en/de-DE/es-ES.

---

## Alternatives écartées

| Alternative                                     | Raison du rejet                                                                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Cloudflare WAF middleware                       | Overkill V1, ajoute dépendance externe + coût mensuel (budget 0 € contrainte CLAUDE.md projet)                                             |
| Auth0 OAuth                                     | Cloud SaaS contredit la stack actuelle Supabase (pas de bénéfice net pour V1)                                                              |
| Hardcoder admin user IDs dans code              | Fuite git history + nécessite redeploy pour rotation. Env var permet rotation sans rebuild.                                                |
| Server Action `setAdminPreference()` pour theme | Non pertinent dans cette ADR (ThemeToggle écrit cookie côté client + lit SSR via root layout, déjà fonctionnel cf. PR-D4-PHASE2-A Task 12) |
| Bi-tier rate limit (auth/non-auth)              | Complexité sans valeur — un scanner non-auth bloqué par `requireUser` downstream                                                           |
| HTTP 429 sur rate limit                         | Server Components ne peuvent pas émettre status custom direct — `notFound()` (404) acceptable, future PR middleware peut faire mieux       |

---

## Conséquences

### Positives

- **Surface attaque réduite** : 7 couches indépendantes, attaquant doit toutes les contourner
- **Traçabilité audit** : chaque accès admin (granted/denied/rate-limited) est append-only en DB pour investigation post-incident
- **UX maintenue** : @thierry voit le lien admin dans sa nav, pas besoin de mémoriser l'URL ni de commit hardcodé
- **i18n parité préservée** : 5 locales synchronisées (FR-BE/NL-BE/EN/DE/ES)
- **Anticipation V1.5+** : la baseline est posée pour quand l'admin recevra des recommandations IA-powered (`llm-security-auditor` audit anticipé pour cross-checker)

### Négatives / trade-offs

- **404 au lieu de 429 sur rate limit** : utilisateur légitime n'apprend pas pourquoi. Mitigation : doc utilisateur + future PR middleware.
- **Audit log non-bloquant** : si Supabase audit log fail transient, accès admin granted sans trace. Trade-off accepté (admin lockout pire que log gap ponctuel).
- **Empty allow-list dénie tout** : config doit être correcte sinon @thierry est lock-out de son propre admin. Mitigation : env var validée Vercel preview + prod, doc `.env.example` claire.

### Conséquences neutres

- Brief mentionnait "constant-time string compare" pour user_id (timing attacks). Non implémenté en V0 car UUIDs Supabase ont 122 bits d'entropy → timing attack pour deviner UUID computationally infeasible. Si `security-auditor` agent flag, fix en commit séparé avec `crypto.timingSafeEqual`.

---

## Plan de validation

1. ✅ 5 commits PR-SEC-ADMIN landed (12811a3 → 7f858e3 + commit ADR + commit doc)
2. Agents QA obligatoires avant merge (cf. brief PR-SEC-ADMIN §Agents) :
   - `security-auditor` — OWASP A01 + A02 + A07 + A09 ✓ (rapport `docs/audits/2026-05-10-pr-sec-admin-security.md`)
   - `dashboard-ux-auditor` — UX du lien admin (commit 4)
   - `gdpr-compliance-auditor` — audit log no PII excessive
   - `llm-security-auditor` — **NON DISPONIBLE** côté Ankora (`.claude/agents/` n'inclut pas cet agent). Baseline anticipée V1.5+ documentée ici comme TODO.
3. Quality gates standard (lint + typecheck + tests + e2e + build) tous verts.
4. CI verts post-push.

---

## TODO différés

- **`llm-security-auditor` agent setup** : créer l'agent dans `.claude/agents/` avant intégration recommandations IA-powered admin (V1.5+). Couche 6 stress test défenses futures.
- **Middleware-level rate limit** : déplacer le rate limit `/admin/*` dans `middleware.ts` pour émettre proper HTTP 429 + `Retry-After` header.
- **E2E full flow login admin → /admin** : nécessite fixture auth admin (storageState seeded admin Supabase user). Infra task séparée.
- **RLS coverage check automatique** : script daily qui audite `pg_policies` vs `information_schema.tables` pour détecter tables user-scoped sans RLS policies.
