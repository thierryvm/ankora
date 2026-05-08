# PR-B2 — Admin Live Data Bindings (zéro chiffre seed en production)

> **Verbatim @thierry verrouillé 2026-05-09** : _« le dashboard admin est mon outil de contrôle pour gérer l'application, elle doit être parfaitement fonctionnel et être branchée sur les vraies valeurs »_.

> **Position dans la roadmap** : après PR-D4 PHASE 2 (intégration React/Tailwind atoms + admin layout protégé). Bloque la release Beta — un admin sur seeds est inacceptable pour piloter Ankora en prod.

> **Modèle requis** : Opus 4.7 pinné. Tâche sécurité (auth admin + service_role keys + audit log) → **interdit downgrade Haiku/Sonnet**.

---

## Phase 0 — Model check

VÉRIFIER `.claude/settings.local.json` → `"model": "claude-opus-4-7"`. Sinon STOP.

---

## 1 · Contexte

Le panneau admin (`/[locale]/admin/**`) a été designé en Bloc E par @cc-design (Session #5) avec mockup statique. PR-D4 PHASE 2 a porté l'UI en React/Tailwind avec props `AdminDashboardData` typées. Cette PR-B2 vient **brancher les vraies sources** sur ces props.

### Pré-requis

- PR-D4 PHASE 2 mergée (atoms 1-12 + admin layout + helper `requireAdmin()` + types `AdminDashboardData`)
- Helper `largestRemainderRound.ts` en place (somme % toujours = 100)
- Atom `<SectionCard loadingState="...">` en place
- Variables d'env documentées dans `.env.example` (cf. §3)

---

## 2 · Scope strict

### À implémenter (in scope)

1. **4 server fetchers parallèles** dans `src/lib/admin/fetchers/` :
   - `fetchVercel.ts` — déploiement actif + statut
   - `fetchSupabase.ts` — DB/MAU/BW/Storage usage + signups + onboardings + drop-off + charges médiane
   - `fetchUpstash.ts` — commands count + quota
   - `fetchSentry.ts` — erreurs 24h + 1 ouvert
2. **2 fetchers analytics** :
   - `fetchVercelAnalytics.ts` — Top 5 sources + Pages les plus visitées
   - `fetchAdminRecommendations.ts` — table `admin_recommendations` (5 patterns rule-based)
3. **Aggregator** `fetchAdminData.ts` qui appelle les 6 fetchers en parallèle via `Promise.allSettled` et compose `AdminDashboardData` typé
4. **Cache Next.js** avec `fetch({ next: { revalidate: ... } })` selon le tableau §1 du brief PR-D4 PHASE 2 §L.1
5. **Failsafe** : si un fetcher échoue, retourner `null` + flag `loadingState: 'error'` pour la section concernée. Bannière UI "Source X indisponible". Aucun crash.
6. **Audit log** : toute consultation admin = 1 ligne `audit_log` avec `actor_id` + `action: 'admin.dashboard.view'` + timestamp
7. **Tests Vitest** : mock chaque API + assert le composant React reçoit les bonnes props
8. **Tests Playwright e2e** : viewport admin avec real-data + assert qu'aucun chiffre seed factice n'est rendu (regex sur `+12 signups · 30 derniers jours` ou autre seed reconnaissable)

### Hors scope (à reporter)

- Modification du design (déjà figé Bloc E + patches finalisation)
- Ajout de KPIs supplémentaires non spécifiés
- Refresh temps réel via WebSocket (V1.1)
- Notifications push admin (V1.2)

---

## 3 · Variables d'environnement

Ajouter dans `.env.example` + valider dans `src/lib/env.ts` Zod schema :

```bash
# Vercel REST API (read-only)
VERCEL_API_TOKEN=                    # https://vercel.com/account/tokens
VERCEL_PROJECT_ID=ankora             # ou ID numérique
VERCEL_TEAM_ID=                      # optionnel si compte perso

# Supabase Management API (read-only)
SUPABASE_MANAGEMENT_TOKEN=           # https://supabase.com/dashboard/account/tokens
SUPABASE_PROJECT_REF=                # déjà présent
SUPABASE_SERVICE_ROLE_KEY=           # déjà présent (pour RPC custom MAU/onboarding/drop-off)

# Upstash REST API
UPSTASH_REDIS_REST_URL=              # déjà présent
UPSTASH_REDIS_REST_TOKEN=            # déjà présent
UPSTASH_MANAGEMENT_API_TOKEN=        # https://console.upstash.com/account/api (pour usage stats)

# Sentry API (read-only)
SENTRY_API_TOKEN=                    # https://ankora.sentry.io/settings/account/api/auth-tokens (scope: project:read)
SENTRY_ORG_SLUG=ankora
SENTRY_PROJECT_SLUG=ankora-web

# Vercel Analytics API
# (utilise VERCEL_API_TOKEN ci-dessus, pas de token dédié)

# Admin RBAC
ADMIN_USER_IDS=                      # UUID Thierry (CSV pour multi-admin futur)
```

**Sécurité** : tous les tokens doivent être ajoutés dans Vercel env (Production + Preview), JAMAIS commités. Documenter dans `docs/operations/admin-data-sources.md`.

---

## 4 · Architecture

### Fichiers à créer

```
src/
  lib/
    admin/
      fetchers/
        fetchVercel.ts
        fetchSupabase.ts
        fetchUpstash.ts
        fetchSentry.ts
        fetchVercelAnalytics.ts
        fetchAdminRecommendations.ts
      fetchAdminData.ts          # aggregator
      types.ts                   # AdminDashboardData (déjà créé en PR-D4 PHASE 2, à enrichir)
    auth/
      requireAdmin.ts            # déjà créé en PR-D4 PHASE 2
  app/
    [locale]/
      admin/
        page.tsx                 # Server Component, await fetchAdminData() puis pass au composant
supabase/
  migrations/
    20260512_add_admin_recommendations.sql   # nouvelle table
    20260512_add_onboarding_events.sql       # tracking drop-off
```

### Pattern Server Component

```tsx
// src/app/[locale]/admin/page.tsx
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { fetchAdminData } from '@/lib/admin/fetchAdminData';
import { logAuditEvent } from '@/lib/security/audit-log';
import { AdminDashboard } from '@/components/admin/AdminDashboard';

export default async function AdminPage() {
  const { userId } = await requireAdmin();
  await logAuditEvent({ actor_id: userId, action: 'admin.dashboard.view' });
  const data = await fetchAdminData();
  return <AdminDashboard data={data} />;
}
```

---

## 5 · Tests obligatoires

### Vitest unit

- `fetchers/fetchVercel.test.ts` : mock `fetch` → assert parse correct + handle 401/500
- `fetchers/fetchSupabase.test.ts` : mock RPC + Management API → assert agrégation MAU/onboarding/drop-off
- `fetchers/fetchUpstash.test.ts` : idem
- `fetchers/fetchSentry.test.ts` : idem
- `fetchAdminData.test.ts` : mock les 6 fetchers, 1 fail → assert `loadingState.X = 'error'` + autres sections OK
- `largestRemainderRound.test.ts` : assert `[5,3,2,0,2]/12 → [42,25,17,0,16]` (somme = 100)

### Playwright e2e

- `e2e/admin-real-data.spec.ts` :
  - Login as admin (ADMIN_USER_IDS contient l'UUID test)
  - Navigate `/admin`
  - Assert le badge "Zone admin · réservée fondateur" est visible
  - Assert chaque KPI card a `data-loading-state="live"` (ou `stale`/`error` si API down en CI)
  - **Assert qu'AUCUN chiffre seed n'est rendu** : regex anti-seed sur `+12 signups · 30 derniers jours` (sauf si live data retourne par hasard 12)
- `e2e/admin-rbac.spec.ts` :
  - Login as non-admin user
  - Navigate `/admin` → assert redirect vers `/app`
  - Assert le sidebar nav user n'affiche PAS l'item "Admin"

---

## 6 · Définition de DONE (5 critères stricts)

1. ✅ Tous CI verts (lint, typecheck, test, e2e, security, build)
2. ✅ Sourcery silencieux sur DERNIER commit
3. ✅ Reviews humaines approuvées
4. ✅ Pas de conflit avec `develop`
5. ✅ Rapport final dans `docs/prs/PR-B2-report.md` avec :
   - Screenshots admin avec real data (1 par section)
   - Logs console showing 6 fetchers parallels OK
   - Coverage Vitest ≥ 90% sur `src/lib/admin/`
   - Playwright passing sur Chromium + WebKit
   - Liste des env vars ajoutées dans Vercel Production + Preview

**Refus de merge si** :

- Un seul chiffre seed visible dans le rendu prod
- Un secret leak dans les logs ou la network tab
- Un fetcher qui crash l'app au lieu de retourner null + bannière

---

## 7 · Risques & mitigations

| Risque                               | Niveau      | Mitigation                                                                                                     |
| ------------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------- |
| Tokens API leakés côté client        | 🔴 critique | TOUS les fetchers en Server Component uniquement, jamais de prop client. Audit `security-auditor` obligatoire. |
| API Vercel rate-limited              | 🟡 moyen    | Cache 60s minimum, retry exponential backoff sur 429                                                           |
| Sentry API change schema             | 🟡 moyen    | Validation Zod sur la response, fallback gracieux                                                              |
| Supabase RPC slow → timeout admin    | 🟡 moyen    | Index sur `auth.users.last_sign_in_at`, RPC `STABLE` + cache PostgREST                                         |
| Admin liste users → leak PII         | 🔴 critique | Anonymiser display_name côté serveur (premières 2 lettres + ID), "Voir la liste" → drawer pseudonymisé         |
| Audit log gonfle vite (1 ligne/view) | 🟢 bas      | Throttle 1 ligne / minute / admin (debounce serveur)                                                           |

---

## 8 · Ressources

- Vercel API : https://vercel.com/docs/rest-api
- Supabase Management : https://supabase.com/docs/reference/api
- Upstash Console API : https://upstash.com/docs/redis/features/restapi
- Sentry API : https://docs.sentry.io/api/
- Brief PR-D4 PHASE 2 §L (data bindings) : `prompts/PR-D4-PHASE2-cd3-integration.md`

---

## 9 · Coordonnées agents

- @thierry — décisions business (validation tokens API, scope KPI), valide merges
- @cowork — arbitrages techniques sur fetchers + cache strategy
- @cc-design — uniquement si retouche admin nécessaire (ne devrait pas — design figé)

---

**Push done ≠ task done.** Vérifier les 5 critères DoD avant de déclarer terminé. Si un fetcher est instable → STOP et remonter à @cowork avant merge.

**Fin du brief PR-B2.**
