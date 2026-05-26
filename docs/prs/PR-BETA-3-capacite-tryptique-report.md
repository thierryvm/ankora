# PR-BETA-3 — Capacité d'Épargne Réelle tryptique (ADR-009 amendement)

**Linear** : THI-267 — PR-BETA-3 Capacité tryptique ADR-009 amendement 09/05
**Branch** : `feat/pr-beta-3-capacite-tryptique-adr-009`
**Date** : 2026-05-26
**Pilote** : @cc-ankora (Claude Opus 4.7)
**Demandeur** : @thierry via @cowork prompt — ADR-009 amendement 2026-05-09 non implémenté en prod après reset stratégique 24/05.

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
