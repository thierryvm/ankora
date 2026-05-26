# PR-BETA-3 — Capacité d'Épargne Réelle tryptique (ADR-009 amendement)

**Linear** : THI-267 — PR-BETA-3 Capacité tryptique ADR-009 amendement 09/05
**Branch** : `feat/pr-beta-3-capacite-tryptique-adr-009`
**Date** : 2026-05-26
**Pilote** : @cc-ankora (Claude Opus 4.7)
**Demandeur** : @thierry via @cowork prompt — ADR-009 amendement 2026-05-09 non implémenté en prod après reset stratégique 24/05.

---

## Hotfix #3 2026-05-26 (post-merge #185) — NEXT_REDIRECT swallowed

### Symptôme

Smoke prod @cowork (Chrome MCP) ~14:20, post-merge hotfix #1 (#185, commit `f239dc9`), a capturé en console client :

```
[ERROR] updateResteAVivreOverrideAction threw Error: NEXT_REDIRECT
    at o (https://ankora.be/_next/static/chunks/0fx9ag598bzmi.js:1:116726)
```

L'utilisateur restait sur le drawer avec un toast d'erreur générique au lieu d'être bouncé vers `/login`.

### Root cause

Hotfix #1 a ajouté un try/catch CLIENT autour de `await updateResteAVivreOverrideAction(...)` pour catcher les exceptions JS (network down). Ce try/catch **avale aussi le sentinel `NEXT_REDIRECT`** que Next.js utilise pour exécuter la navigation depuis un `redirect()` server-side. Quand `requireUserWithWorkspace()` détecte une session expirée et appelle `redirect('/login')` :

1. Server : redirect throws NEXT_REDIRECT, propage hors du try/catch server (`requireUserWithWorkspace` est volontairement hors du try/catch). ✅
2. Next.js sérialise la navigation sur le wire de la Server Action.
3. Client : `await updateResteAVivreOverrideAction(...)` re-throw `Error: NEXT_REDIRECT`.
4. Mon catch client l'attrape, log `console.error`, affiche `toast.error`. ❌

Référence Next.js : _"Internally, `redirect()` throws an error that gets handled by Next.js. Do NOT catch this error in your own code."_ (https://nextjs.org/docs/app/api-reference/functions/redirect)

### Fix livré

**1. Nouveau helper `src/lib/actions/next-control-flow.ts`** — détection multi-version (digest moderne + fallback message) du sentinel Next.js. Utilisable côté serveur et côté client.

**2. Server Action `updateResteAVivreOverrideAction`** — defense-in-depth : même si `requireUserWithWorkspace()` reste hors du try/catch, le catch outer re-throw maintenant tout `isNextControlFlowError(err)`. Couvre les cas où une future modif ajouterait un `redirect()`/`notFound()` à l'intérieur du try.

**3. Drawer client `AjusterResteAVivreDrawer`** — catch client re-throw les NEXT_REDIRECT/NEXT_NOT_FOUND. Toast ne fire jamais sur ces flux.

**4. Doc pattern** — `docs/patterns/server-actions-error-handling.md` enrichie d'une section **"🚨 Piège critique — NEXT_REDIRECT / NEXT_NOT_FOUND"** avec règle obligatoire.

### Tests

- `next-control-flow.test.ts` (nouveau, 5 cas) — digest, message fallback, non-Errors, non-Next errors
- `reste-a-vivre.test.ts` — 2 nouveaux tests : redirect FROM INSIDE le try/catch propage + NEXT_NOT_FOUND propage
- `AjusterResteAVivreDrawer.test.tsx` — 1 nouveau test : NEXT_REDIRECT bubble via `unhandledrejection`, toast jamais appelé

### Investigation séparée (out-of-scope hotfix)

Pourquoi `requireUserWithWorkspace()` redirect alors que la page SSR rend en 200 ? Hypothèses :

- Session token expiration timing entre rendu SSR et appel Server Action
- Cookie SameSite / Secure mismatch entre RSC fetch et action POST
- Bug latent dans `requireUserWithWorkspace` (auth.getUser refresh edge case)

À cadrer post-Beta. Le user actuel verra correctement `/login` une fois ce hotfix mergé, ce qui débloque l'usage.

### Smoke @cowork post-merge

Network tab attendu sur "Enregistrer" :

- **Si session valide** : POST `/app` → 200 JSON `{ok: true}` → toast success + drawer ferme + sub-stat refresh
- **Si session expirée** : POST `/app` → réponse navigation Next.js → user atterrit sur `/login` (pas de toast, pas de drawer ouvert)
- **Aucun 503** quelle que soit la branche

---

## Hotfix 2026-05-26 (post-merge) — Server Action 503 + Toast UX defensive

### Contexte

Smoke prod @cowork (Chrome MCP) ~13:00 sur `ankora.be/fr-BE/app` a capturé :

```
POST https://ankora.be/app           → 503  (Server Action call)
GET  https://ankora.be/app?_rsc=...  → 503
GET  https://ankora.be/?_rsc=...     → 503
```

Symptômes user : drawer "Ajuster ce mois" se ferme silencieusement, pas de toast, `reste_a_vivre_overrides` non persisté. À 13:34 le site répond 200 OK : transient Vercel infra (cold start / edge worker crash) déjà résolu côté infra, mais **code Ankora pas robuste face à ce type d'incident**.

### Challenge du diagnostic @cowork

Hypothèse @cowork "migration non appliquée" éliminée : `supabase migration list --linked` confirme `20260526000001` appliquée en prod. Le 503 ne vient pas d'une colonne manquante. Hypothèse @cowork "fail-open rate-limit doctrine" rejetée : action classe 3 (impact 5+ Server Actions), à arbitrer séparément avec @thierry — hors-scope hotfix.

### Hardening livré (utile dans TOUS les cas, pas seulement 503)

**Server Action `updateResteAVivreOverrideAction`** :

1. `requireUserWithWorkspace()` reste **hors du try/catch** — le `redirect('/login')` throws de Next.js doit propager (catcher avalerait l'auth bounce)
2. **Outer try/catch** autour du reste de l'action → toute exception non prévue (createClient crash, headers crash, etc.) devient `{ ok: false, errorCode: 'errors.settings.resteAVivreUpdateFailed' }` avec log + stack trace serveur
3. **`logAuditEvent` fire-and-forget** (`void logAuditEvent(...).catch(...)`) — un blip audit_log ne doit jamais undo une write user committée
4. **`revalidateDashboard()` dans try/catch local** — si revalidate fail APRÈS write, la DB est consistente, on log warning et on retourne ok

**Drawer client `AjusterResteAVivreDrawer`** :

1. **try/catch JS** autour de l'`await updateResteAVivreOverrideAction(...)` → exceptions JS (network down, action throws) → toast erreur générique + drawer reste ouvert
2. **Toast success** ajouté sur `{ ok: true }` (feedback positif "Reste à vivre ajusté")
3. **Drawer reste ouvert** sur toute erreur — user peut retry sans re-saisir
4. `console.error` (eslint-disabled) pour aider l'investigation devtools en cas d'exception

**i18n parity** (5 locales) :

- Nouvelles clés : `dashboard.capacite.drawer.success` + `errors.settings.resteAVivreUpdateFailed`
- Test parity étendu dans `CapaciteEpargneCard.test.tsx` (assert présence + non-vacuité)

**Documentation pattern** :

- `docs/patterns/server-actions-error-handling.md` (nouveau) — pattern fail-loud à appliquer à toute future Server Action

### Tests hotfix

`src/lib/actions/__tests__/reste-a-vivre.test.ts` — 4 nouveaux tests :

- `logAuditEvent` throws → action `{ ok: true }` (audit non-bloquant)
- `revalidateDashboard` throws → action `{ ok: true }` (revalidate non-bloquant)
- `createClient.from` throws → outer catch convertit en `{ ok: false }` (jamais 503)
- `redirect()` de `requireUserWithWorkspace` propage (auth bounce intact)

`src/components/dashboard/__tests__/AjusterResteAVivreDrawer.test.tsx` — 3 nouveaux tests :

- `{ ok: true }` → toast success + drawer close
- Action throws → toast error + drawer stays open + pas de `router.refresh`
- `{ ok: false, errorCode }` → toast message traduit (pas raw errorCode)

`e2e/dashboard-capacite-tryptique.spec.ts` — toast success assert + Toaster mount assert.

### Quality gates hotfix ✅

- `npm run lint` 0 err
- `npm run lint:use-server` ✅
- `npm run typecheck` 0 err
- `npm run test` **1288 passing** (+7 nouveaux)
- `npm run build` ✅

### Hors-scope hotfix (à discuter séparément si besoin)

- Doctrine `rateLimit` fail-open vs fail-closed prod — touche 5+ Server Actions, arbitrage sécurité dédié
- Profiling Vercel timeout — non nécessaire avec le defensive hardening
- Sentry wiring pour capture client-side throws — out-of-scope PR-BETA-3, ticket Linear séparé

### Smoke @thierry post-merge hotfix

1. Cockpit charge → sub-stats 662/500/162 (inchangé)
2. Tap "Ajuster ce mois" → drawer ouvre
3. Modifier 500 → 450 → Enregistrer
   - ✅ Toast vert "Reste à vivre ajusté pour ce mois"
   - ✅ Drawer ferme
   - ✅ Sub-stat affiche 450 + capacité passe à 212
4. Re-tap "Ajuster" → saisir 999999 (au-dessus du max 100k Zod)
   - ✅ Toast rouge erreur traduit (pas raw errorCode)
   - ✅ Drawer reste ouvert

---

## Pourquoi cette PR

ADR-009 amendement 2026-05-09 (validé @thierry, statut canonique) impose le passage du KPI "Capacité d'Épargne Réelle" d'un **waterfall opaque** (Revenus / Effort / Plafond → big number) à un **tryptique pédagogique 3 concepts** :

1. **Reste disponible** = Revenus − Effort financier lissé (avant la vie courante)
2. **Reste à vivre** = budget vie courante saisi par l'user (ajustable mois par mois — R-10)
3. **Capacité d'épargne réelle** = Reste disponible − Reste à vivre

C'est le **différenciateur NORTH_STAR n°1** d'Ankora. Aucun concurrent (Monarch, YNAB, Lunch Money, Linxo, Bankin') ne calcule cette valeur. Critique pour la Beta vendable.

---

## Scope livré

### 1. Migration SQL `workspace_settings`

`supabase/migrations/20260526000001_pr_beta_3_reste_a_vivre.sql` — ajoute :

- `reste_a_vivre_default numeric(12,2) NOT NULL DEFAULT 500.00`
- `reste_a_vivre_overrides jsonb NOT NULL DEFAULT '{}'`
- CHECK constraint `0 ≤ reste_a_vivre_default ≤ 100000` (cohérent avec Zod app-level)
- COMMENT sur chaque colonne avec la sémantique JSONB

Lookup runtime : `overrides[currentYYYYMM] ?? reste_a_vivre_default`. Pas de modif RLS — les policies table-level héritent automatiquement.

### 2. Domain `capaciteEpargneReelle()` étendu

`src/lib/domain/cockpit/capacite-epargne-reelle.ts` — expose désormais sur l'output :

- `resteDisponible: Decimal` (= revenus − effort)
- `resteAVivre: Decimal` (passthrough de l'input pour symétrie)
- `capacite: Decimal` (= resteDisponible − resteAVivre)
- Plus l'`effortFinancierLisse` et `isPositive` existants.

API publique : le param `plafondQuotidien` est renommé `resteAVivre`. Le type legacy `CapaciteEpargneReelleInputLegacy` est gardé pour back-compat pendant la transition (tests existants + call-sites en marge passent toujours).

### 3. Server Action `updateResteAVivreOverrideAction`

`src/lib/actions/reste-a-vivre.ts` — couche complète :

- `requireUserWithWorkspace()` (auth + workspace lookup)
- `rateLimit('mutation', user:${userId})` (Upstash sliding window)
- Zod schema `resteAVivreMonthOverrideSchema` (`monthYYYYMM` regex `\d{4}-(0[1-9]|1[0-2])`, `montant 0..100000`)
- Read-modify-write JSONB merge (préserve les overrides des autres mois)
- `logAuditEvent(WORKSPACE_RESTE_A_VIVRE_UPDATED, ctx, { period_yyyymm })` — **AUCUN montant** dans la metadata (PII-adjacent, même règle que `charge_payments` qui exclut `paid_amount`)
- `revalidateDashboard()` pour refresh server-side

Nouveau `AuditEvent.WORKSPACE_RESTE_A_VIVRE_UPDATED = 'workspace.reste_a_vivre_updated'` (constante TypeScript only, pas de migration DB car `audit_log.event_type` est `text` sans CHECK).

### 4. Refactor `CapaciteEpargneCard`

`src/components/dashboard/CapaciteEpargneCard.tsx` — refonte tryptique :

```
┌─────────────────────────────────────────────────┐
│ Capacité d'épargne réelle  [CheckCircle2]       │
│                                                 │
│ + 162 €  [Info-tooltip]                         │
│ « Tu peux mettre +162 € de côté ce mois en plus │
│   de tes virements automatiques. Tu décides     │
│   combien tu y mets vraiment. »                 │
│ ──────────────────────────────────────────────  │
│ Reste dispo  │ Reste à vivre │ Capacité épargne │
│  662 €       │  500 € [Adj]  │ + 162 €          │
└─────────────────────────────────────────────────┘
```

- Hero number + tooltip explicatif (au hover/focus, `aria-label` accessible)
- Lede pédagogique interpolé (`{amount}` signed) — anti-culpabilisation R-06 respectée
- 3 sub-stats `grid-cols-1 sm:grid-cols-3`
- Bouton "Ajuster ce mois" inline dans le sub-stat "Reste à vivre"
- **Waterfall PR-D3-bis supprimé** (redondant avec sub-stats + EffortFinancierCard voisine)

### 5. Composant `AjusterResteAVivreDrawer`

`src/components/dashboard/AjusterResteAVivreDrawer.tsx` — Client Component dédié :

- Slide-from-right desktop, full-screen mobile (`h-dvh` + `sm:max-w-md`)
- Reset draft state **synchroniquement** dans `openDrawer()` (pas dans un effet — react-hooks/set-state-in-effect satisfait)
- Input `inputMode="decimal"` accepte virgule décimale FR (`'425,50'` → `425.5`)
- **Helper text adaptatif** selon ratio resteAVivre/revenus :
  - `< 15 %` → "Estimation basse. Tu peux ajuster plus tard si besoin."
  - `> 50 %` → "Estimation haute. Ankora respecte ton budget — pas de jugement."
  - sinon → "Estimation cohérente avec un budget belge typique."
- ESC ferme, backdrop ferme, body scroll-lock pendant ouverture
- Toast d'erreur sur échec Server Action (`useActionErrorTranslator`)
- `router.refresh()` sur succès

### 6. Snapshot wiring

`src/lib/data/workspace-snapshot.ts` :

- SELECT enrichi de `reste_a_vivre_default, reste_a_vivre_overrides`
- Résolution `overrides[YYYY-MM] ?? default` côté snapshot (single round-trip, pas de query extra dans le page component)
- Champ `resteAVivre: number` ajouté à `WorkspaceSnapshot`
- `Math.max(0, …)` defensive sur la valeur finale (cohérent avec contrainte DB)

### 7. i18n parity 5 locales

Namespace `dashboard.capacite` étendu sur `fr-BE`, `en`, `nl-BE`, `de-DE`, `es-ES` :

- `subStats.{resteDisponible, resteAVivre, capaciteEpargne, ajusterCeMois}`
- `ledePositif` (interpolation `{amount}`)
- `ledeNegatif`
- `tooltip` (interpolation `{resteAVivre}`)
- `drawer.{title, inputLabel, inputHint, helperCoherent, helperBas, helperHaut, save, cancel, errorGeneric}`

Test parity exhaustif (assert présence + placeholders attendus) intégré au test file `CapaciteEpargneCard.test.tsx`.

---

## Tests

### Unitaires Vitest (1281 tests passent globalement, dont les nouveaux)

- `capacite-epargne-reelle.test.ts` — 6 nouveaux tests (resteDisponible exposé, persona @thierry, legacy alias back-compat, edge cases zero/negative, precision Decimal.js sur lissage)
- `reste-a-vivre.test.ts` (Server Action) — 14 tests : rate-limit, Zod validation (regex YYYYMM, négatif, > 100k, zéro OK), happy path (merge JSONB, premier override, row missing, audit log sans montant, revalidate), DB read/write failures
- `CapaciteEpargneCard.test.tsx` — réécriture complète : 3 sub-stats, fixture @thierry (662/500/162), trigger "Ajuster ce mois" rendered, lede interpolé, ledeNegatif sans culpabilisation, tooltip accessible, parity 5 locales
- `AjusterResteAVivreDrawer.test.tsx` — 14 tests : trigger, open state, prefill, helper adaptatif (coherent/bas/haut/fallback null), live update, submit flow (Server Action call, close on success, toast on failure, disabled when invalid, comma decimal), ESC dismiss

### E2E Playwright

- `dashboard-cockpit-bloc2.spec.ts` mis à jour (waterfall → sub-stats, `rose` → `text-danger`)
- `dashboard-capacite-tryptique.spec.ts` (nouveau) — 3 tests : fixture @thierry (3 sub-stats avec bonnes valeurs), drawer open + override persisté, mobile viewport 375×667 stack vertical

Les E2E sont gated par `adminClientOrNull()` (skip si pas de Supabase remote configuré — pattern repo standard).

---

## Quality gates ✅

```
npm run lint            ✅ 0 errors (6 warnings pré-existants)
npm run lint:use-server ✅ All files compliant
npm run typecheck       ✅ 0 errors
npm run test            ✅ 1281 tests passing (104 files)
npm run build           ✅ Production build OK
```

---

## Décisions techniques et arbitrages

| Sujet                             | Décision                                                                                               | Justification                                                                                                                                                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Signature `logAuditEvent`         | Vraie API repo `(event: AuditEventType, ctx, metadata?)` — pas la signature obsolète du prompt @cowork | Le pattern dans `settings.ts` et 16 autres call-sites le confirme. Le prompt @cowork avait une signature périmée                                                                                                                                       |
| Suppression du waterfall          | Retiré (pas conservé en expandable)                                                                    | Redondant : `Reste disponible = Revenus − Effort` est déjà le sub-stat #1 + la card `EffortFinancierCard` voisine montre le détail effort. Garder les deux noyait l'utilisateur. ADR-009 amendement file le tryptique en remplacement, pas en addition |
| Drawer dédié vs `EditDrawer` atom | Dédié (`AjusterResteAVivreDrawer.tsx`)                                                                 | L'atom `EditDrawer` ne modèle pas le helper text adaptatif par ratio — c'est un Field renderer générique. Forker l'atom serait pollution. Un seul cas d'usage justifie un composant dédié                                                              |
| Reset state du draft              | Synchrone dans `openDrawer()`, pas dans `useEffect`                                                    | React 19 + `react-hooks/set-state-in-effect` lint rule bloque l'effet. Le reset au moment du clic trigger est équivalent et idiomatique                                                                                                                |
| `resteAVivre` source              | `workspace_settings.reste_a_vivre_default` + overrides JSONB                                           | Le prompt @cowork le demande explicitement, séparé de `workspaces.vie_courante_monthly_transfer`. Concept distinct (budget vie courante ≠ montant transféré). Pour Thierry les deux valent 500€ donc UX identique pour lui                             |
| Audit metadata                    | `{ period_yyyymm }` seul, pas de montant                                                               | Doctrine repo : amounts = PII-adjacent en financial software. Même règle que `charge_payments` qui exclut `paid_amount`                                                                                                                                |
| Supabase types                    | Patch manuel + comment "until supabase:types is re-run"                                                | Pas d'accès local Supabase dans cette session. `npm run supabase:types` à relancer post-merge contre le projet remote                                                                                                                                  |
| Onboarding step 3 saisie initiale | **Hors-scope** PR-BETA-3                                                                               | Le prompt @cowork l'exclut explicitement (= PR-D5 onboarding séparée). Users existants ajusteront via bouton "Ajuster ce mois"                                                                                                                         |
| Compatibilité E2E existant        | Tests existants mis à jour                                                                             | Le test `dashboard-cockpit-bloc2.spec.ts` checkait `capacite-epargne-breakdown` (waterfall) + classe `rose` (déjà périmée depuis PR-D5). Patches correctifs inclus dans cette PR                                                                       |

---

## DoD 5/5 (à compléter post-merge)

1. ⏳ CI verts (Lint, Typecheck, Tests, E2E gated, Security, Build) — à valider sur la PR ouverte
2. ⏳ Sourcery silent sur dernier commit
3. ⏳ Reviews approved (humain @thierry)
4. ⏳ 0 conflit main
5. ✅ Rapport `docs/prs/PR-BETA-3-capacite-tryptique-report.md` (ce fichier)

---

## Notes pour @thierry (post-merge)

### Smoke iPhone à faire après merge

1. Login sur preview Vercel
2. Cockpit doit afficher 3 sub-stats (Reste dispo / Reste à vivre / Capacité épargne)
3. Pour Thierry : valeurs attendues **662 / 500 / 162** (si workspace cohérent avec les charges du persona)
4. Tap "Ajuster ce mois" → drawer slide-up sur iPhone
5. Modifier 500 → 450 → Enregistrer → la sub-stat "Reste à vivre" affiche 450 et "Capacité épargne" passe à 212
6. Re-tap "Ajuster" → re-modifier 450 → 500 → revient à 162

### Migration Supabase à appliquer

```bash
supabase db push --linked
# OU via SQL editor remote, le contenu de :
# supabase/migrations/20260526000001_pr_beta_3_reste_a_vivre.sql
```

Idempotent (`if not exists` sur les colonnes, CHECK constraint nommé donc retry-safe).

### Régénération types post-migration

```bash
npm run supabase:types
git diff src/lib/supabase/types.ts
```

Si le diff ne montre que le retrait des commentaires "PR-BETA-3 patched manually", c'est qu'on est sync. Sinon investiguer (probablement d'autres colonnes drift).

### Suivi backlog

- ❓ `/glossaire/capacite-epargne-reelle` — à vérifier s'il existe déjà ; sinon ticket Linear post-Beta (hors-scope PR-BETA-3)
- 📋 PR-D5 onboarding step 3 "saisie initiale reste à vivre" — Voie D séparée
- 📋 PR-D8 Simulateur d'Action couplage avec resteAVivre — Voie D séparée
- 📋 Historique 12 mois du KPI — v1.1 post-launch (cf. ADR-009 Risque 4)

---

## Files

### Nouveaux (7)

- `supabase/migrations/20260526000001_pr_beta_3_reste_a_vivre.sql`
- `src/lib/schemas/reste-a-vivre.ts`
- `src/lib/actions/reste-a-vivre.ts`
- `src/lib/actions/__tests__/reste-a-vivre.test.ts`
- `src/components/dashboard/AjusterResteAVivreDrawer.tsx`
- `src/components/dashboard/__tests__/AjusterResteAVivreDrawer.test.tsx`
- `e2e/dashboard-capacite-tryptique.spec.ts`

### Modifiés (10)

- `src/lib/domain/cockpit/capacite-epargne-reelle.ts` — exposition `resteDisponible` + renaming
- `src/lib/domain/cockpit/__tests__/capacite-epargne-reelle.test.ts` — +6 tests tryptique
- `src/lib/data/workspace-snapshot.ts` — SELECT + résolution `resteAVivre`
- `src/lib/security/audit-log.ts` — `WORKSPACE_RESTE_A_VIVRE_UPDATED` + `period_yyyymm` safe key
- `src/lib/supabase/types.ts` — patch manuel `workspace_settings` row/insert/update
- `src/components/dashboard/CapaciteEpargneCard.tsx` — refonte complète tryptique
- `src/components/dashboard/__tests__/CapaciteEpargneCard.test.tsx` — réécriture tests
- `src/app/[locale]/app/page.tsx` — call-site `CapaciteEpargneCard` (props renommées)
- `e2e/dashboard-cockpit-bloc2.spec.ts` — mise à jour waterfall → sub-stats, rose → danger
- `messages/{fr-BE,en,nl-BE,de-DE,es-ES}.json` — namespace `dashboard.capacite.*` étendu

### Auto-régénéré au build

- `public/llms-full.txt` — date stamp 2026-05-25 → 2026-05-26
