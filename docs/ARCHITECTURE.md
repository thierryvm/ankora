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
- `admin.ts#createServiceRoleClient` — service role, **sans cookies** et **scellé** via
  l'option `accessToken` : tout l'espace `.auth` refuse, donc aucune session ne peut lui
  être attachée après coup. Usage strict : audit, export GDPR. Le prédécesseur vivait dans
  `server.ts` et lisait les cookies de la requête ; toute session présente dégradait le
  client en rôle `authenticated` (H3, issue #192, mesuré le 26 juillet 2026)
- `admin.ts#createServiceRoleAdminClient` — variante **non scellée**, uniquement pour
  l'API admin GoTrue (`auth.admin.deleteUser`). Un seul appelant légitime : `gdpr/deletion.ts`
- `middleware.ts` — refresh session à chaque requête

### 4. `src/lib/security/`

- `rate-limit.ts` — Upstash sliding window (auth: 5/15min, mutations: 20/min, export: 3/h)
- `audit-log.ts` — append-only, whitelist de métadonnées pour éviter PII

### 5. `src/lib/gdpr/`

- `consent.ts` — enregistrement + lecture des consentements granulaires
- `export.ts` — bundle JSON complet de l'utilisateur
- `deletion.ts` — demande (grace 14j) + exécution (cascade + pseudonymisation audit)

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
3. `createServiceRoleClient()` (service role — bypass RLS)
4. Lecture parallèle de toutes les tables de l'utilisateur
5. `logAuditEvent(GDPR_EXPORT_COMPLETED, ...)`
6. Retour : JSON à télécharger en client (header `Content-Disposition: attachment`)

## Flux critique : suppression GDPR

> Décidé dans [ADR-024](adr/ADR-024-file-de-suppression-de-compte.md). Cette section
> décrivait jusqu'au 27 juillet 2026 un flux qui n'existait pas — deux e-mails jamais
> envoyés, une suppression de workspaces retirée depuis, et un statut `completed`
> inatteignable. Réécrite sur ce que le code fait.

1. `requestDeletion(userId)` → insert dans `deletion_requests`, `scheduled_for = now + 14j`
   (ADR-023 : 30j tombait au bord exact du délai légal d'un mois de l'art. 12(3) — un run
   en échec et on était hors délai). Une demande déjà en vol renvoie l'échéance
   **existante** : l'index unique partiel n'en autorise qu'une active par personne.
2. **Aucun e-mail.** L'application n'en envoie pas (ADR-023 §2) : l'annulation se fait
   depuis `/app/settings/deletion-status`, tant que la demande est `pending`.
3. Cron quotidien — **route Vercel, pas Edge Function** — livré en PR-B :
   - `claim_pending_deletions(25)` passe les lignes dues de `pending` à `processing`,
     et remet en file celles qu'un run précédent a laissées bloquées plus d'une heure.
   - Pseudonymise `audit_log` : `user_id`, `ip_address`, `user_agent` → NULL.
     **0 ligne est un succès** — un compte peut légitimement n'avoir aucun événement.
   - `supabase.auth.admin.deleteUser(userId)`. La cascade depuis `auth.users` fait le
     reste, `workspaces` compris : **pas de suppression explicite**, elle était redondante.
     Un « user not found » compte comme un succès, sinon la ligne devient une pilule
     empoisonnée réclamée et échouée chaque jour.
4. **La demande n'est jamais marquée `completed`** : `deletion_requests.user_id` cascade
   depuis `public.users`, donc la ligne disparaît avec le compte. `status='completed'` est
   accepté par la contrainte et ne sera jamais écrit.
5. **Ce qui survit** : `auth.audit_log_entries` conserve l'e-mail en clair et l'IP, sans
   clé étrangère vers `auth.users` — écart art. 17 mesuré, issue #278. Les lignes
   d'`audit_log` écrites avec `user_id: null` (rate-limit, reset de mot de passe) portent
   une IP qu'aucun `.eq('user_id', …)` ne peut atteindre.

## Décisions clés

- **PWA plutôt que Tauri** en Phase 1 : pas de build desktop à maintenir, installation native via "Ajouter à l'écran d'accueil".
- **Workspaces préparés pour Phase 2** : le modèle `workspace_members` existe déjà mais reste invisible en Phase 1 (1 seul owner).
- **Pas d'IA en Phase 1** : fiabilité + coût. Phase 2 = BYOK (Anthropic / OpenRouter) — l'utilisateur fournit sa clé, Ankora ne facture pas le compute.
- **Décimal.js obligatoire** : on ne stocke jamais un montant en `number`. Tout passe par `Money = Decimal`.
- **CSP nonce + strict-dynamic** : pas de `unsafe-inline`, pas de `unsafe-eval`.
