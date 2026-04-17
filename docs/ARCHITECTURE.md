# Architecture — Ankora

## Vue d'ensemble

Ankora est une **PWA Next.js** (SSR + Server Components) adossée à **Supabase** (Postgres + Auth + RLS).
L'architecture suit une séparation stricte entre **domaine pur** (calculs financiers) et **couche infrastructure** (Supabase, Upstash, Next.js).

```
┌────────────────────────────────────────────────────┐
│                    Navigateur                      │
│  ┌─────────────────────────────────────────────┐   │
│  │  Next.js client (PWA installable)           │   │
│  │  - React 19 Server Components + Actions     │   │
│  │  - Tailwind 4 + shadcn/ui                   │   │
│  │  - Supabase browser client (auth persist)   │   │
│  └─────────────────────────────────────────────┘   │
└───────────────────┬────────────────────────────────┘
                    │ HTTPS + CSP nonce + HSTS
                    ▼
┌────────────────────────────────────────────────────┐
│            Vercel Edge (middleware)                │
│  - Nonce CSP par requête + headers sécurité        │
│  - Refresh session Supabase (cookies SSR)          │
│  - Rate limiting Upstash (auth + mutations)        │
└───────────────────┬────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────────────┐
│          Next.js server (Vercel Functions)         │
│  - Server Components / Server Actions              │
│  - Couche domaine pure (src/lib/domain)            │
│  - Couche GDPR (src/lib/gdpr)                      │
│  - Couche sécurité (rate-limit, audit)             │
└───────────────────┬────────────────────────────────┘
                    │ RLS-scoped queries
                    ▼
┌────────────────────────────────────────────────────┐
│              Supabase (EU region)                  │
│  - Postgres (RLS everywhere)                       │
│  - Auth (PKCE, MFA)                                │
│  - Storage (avatars, exports JSON)                 │
│  - Edge Functions (export bundler, delete cron)    │
└────────────────────────────────────────────────────┘
```

## Couches

### 1. `src/lib/domain/`

Services financiers **purs**. Zéro dépendance à Supabase, Next.js, ou DOM. Tout calcul passe par `decimal.js` pour éviter les erreurs IEEE-754.

- `budget.ts` — lissage, provisions mensuelles, factures dues
- `provision.ts` — santé du fond de provisions, plan de rattrapage, buffer de sécurité
- `simulation.ts` — what-if (annulation / négociation / ajout)
- `balance.ts` — agrégation dépenses + budget restant

Testé à ≥ 90% (Vitest). Aucun autre code n'importe depuis le domaine que pour en consommer le résultat.

### 2. `src/lib/schemas/`

Schémas **Zod** — source unique de vérité pour les types de formulaires + validations serveur. Chaque Server Action parse ici avant toute logique.

### 3. `src/lib/supabase/`

- `client.ts` — navigateur, session PKCE persistée
- `server.ts` — Server Components / Actions, session depuis cookies
- `server.ts#createAdminClient` — service role (usage strict : GDPR export, deletion, audit)
- `middleware.ts` — refresh session à chaque requête

### 4. `src/lib/security/`

- `rate-limit.ts` — Upstash sliding window (auth: 5/15min, mutations: 20/min, export: 3/h)
- `audit-log.ts` — append-only, whitelist de métadonnées pour éviter PII

### 5. `src/lib/gdpr/`

- `consent.ts` — enregistrement + lecture des consentements granulaires
- `export.ts` — bundle JSON complet de l'utilisateur
- `deletion.ts` — demande (grace 30j) + exécution (cascade + pseudonymisation audit)

### 6. `src/app/`

- `(marketing)/` — pages publiques (landing, pricing, faq, legal/\*)
- `(auth)/` — login, signup, callback, password reset
- `app/` — dashboard privé (protégé par `requireUser()` dans layout)

## Flux critique : création d'une charge

1. Formulaire `<ChargeForm>` — RHF + zodResolver avec `chargeInputSchema`
2. Submit → Server Action `createCharge(input)` :
   - `rateLimit('mutation', userId)` → si échoue → erreur 429
   - `chargeInputSchema.parse(input)` → rejette si invalide
   - `const supabase = await createClient()` (RLS activée, scope user)
   - `supabase.from('charges').insert({ ...input, workspace_id, created_by: userId })`
   - `logAuditEvent(CHARGE_CREATED, { userId, workspaceId }, { resource_id: chargeId })`
3. Redirection + revalidation SSR de `/app/charges`

## Flux critique : export GDPR

1. Bouton "Télécharger mes données" → Server Action `requestExport()`
2. `rateLimit('export', userId)` → 3/heure max
3. `createAdminClient()` (service role — bypass RLS)
4. Lecture parallèle de toutes les tables de l'utilisateur
5. `logAuditEvent(GDPR_EXPORT_COMPLETED, ...)`
6. Retour : JSON à télécharger en client (header `Content-Disposition: attachment`)

## Flux critique : suppression GDPR

1. `requestDeletion(userId)` → insert dans `deletion_requests` avec `scheduled_for = now + 30j`
2. Email envoyé à l'utilisateur (option : annulation en 1 clic pendant 30j)
3. Cron (Edge Function) : chaque jour, traite les requêtes dont `scheduled_for <= now` :
   - Pseudonymise `audit_log` (user_id → NULL)
   - Delete cascade `workspaces` → charges/expenses/categories/consents
   - `supabase.auth.admin.deleteUser(userId)`
   - Marque la requête `completed`
4. Email de confirmation à l'adresse (qui sera invalidée juste après).

## Décisions clés

- **PWA plutôt que Tauri** en Phase 1 : pas de build desktop à maintenir, installation native via "Ajouter à l'écran d'accueil".
- **Workspaces préparés pour Phase 2** : le modèle `workspace_members` existe déjà mais reste invisible en Phase 1 (1 seul owner).
- **Pas d'IA en Phase 1** : fiabilité + coût. Phase 2 = BYOK (Anthropic / OpenRouter) — l'utilisateur fournit sa clé, Ankora ne facture pas le compute.
- **Décimal.js obligatoire** : on ne stocke jamais un montant en `number`. Tout passe par `Money = Decimal`.
- **CSP nonce + strict-dynamic** : pas de `unsafe-inline`, pas de `unsafe-eval`.
