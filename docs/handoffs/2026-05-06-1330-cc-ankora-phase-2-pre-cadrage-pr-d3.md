# Phase 2 — Pré-cadrage PR-D3 + audit (Mission 1) — Rapport @cc-ankora → @cowork

- **Date** : 2026-05-06 13:30 (UTC+2)
- **Mission** : 1, 3, 4 livrées. Mission 2 (THI-122) à statuer (cf. §10).
- **Auteur** : @cc-ankora (Opus 4.7, claude-opus-4-7)
- **Modèle vérifié** : ✅ Opus 4.7 (Phase 0 OK)
- **Scope respecté** : ZÉRO modif `src/`. Working tree propre hors artefact prebuild.
- **Branche de travail** : aucune.

---

## TL;DR pour @cowork (90 secondes)

1. **Excellente nouvelle** : les 2 modules domain `effortFinancierLisse` et `capaciteEpargneReelle` sont **livrés et largement testés** par PR-D1 #94. PR-D3 = pure intégration UI, scope court (~1-2 jours).
2. **`plafondQuotidien` source résolue** : utiliser `snapshot.vieCouranteMonthlyTransfer` (colonne `workspaces.vie_courante_monthly_transfer` existante). Aucune migration nécessaire pour PR-D3.
3. **⚠️ Ordre PR-D2 vs PR-D3** : la spec canonique exige PR-D2 (3 cards comptes typés + renommage) AVANT PR-D3, mais le prompt sprint @cowork dit "PR-D3 démarre lundi 12 mai". Le snapshot expose déjà `accounts[].accountType` et `displayName` (livré PR-D1) → **PR-D3 est techniquement possible sans PR-D2**. À arbitrer @cowork.
4. **CI main verte localement** ✅. Ce baseline ne dit rien du blocker E2E iPhone SE Phase 1 (toujours rouge en CI cloud, BUG-iOS-011 #116 post-Voie D, accepté).
5. **3 incohérences ROADMAP** flaggées pour @cowork (sans modif).
6. **Mission 2 (THI-122)** : prêt à embarquer si tu confirmes — audit montre que c'est un bon investissement bandwidth (1 demi-journée propre, indépendant de Voie D, débloque UX prod en cas d'erreur user).

---

## Mission 1A — Fichiers à toucher PR-D3 (inventaire exhaustif)

### Fichiers à CRÉER (4)

| Fichier                                                           | Type   | Notes                                                                               |
| ----------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------- |
| `src/components/dashboard/EffortFinancierCard.tsx`                | RSC    | Card radar avec breakdown `Charges fixes / Provisions lissées`                      |
| `src/components/dashboard/CapaciteEpargneCard.tsx`                | RSC    | Card hero (`text-success` si ≥ 0, `text-danger` si < 0) + glow + message contextuel |
| `src/components/dashboard/__tests__/EffortFinancierCard.test.tsx` | Vitest | Test rendu Decimal → string FR-BE/EN, breakdown, edge cases (0, neg)                |
| `src/components/dashboard/__tests__/CapaciteEpargneCard.test.tsx` | Vitest | Test variantes positive/négative/zéro, glow, message contextuel                     |

### Fichiers à MODIFIER (5)

| Fichier                                                | Modif                                                                                                                                                                                                                             |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/[locale]/app/page.tsx`                        | Refactor section KPI : remplacer 4 cards actuelles (`provisionsMonthly`, `health`, `suggestedTransfer`, `billsMonth`) par les 2 cards radar Voie D **OU** garder en sus avec restructuration visuelle (à arbitrer cc-design CD#3) |
| `src/lib/data/workspace-snapshot.ts`                   | Ajouter mapping `Charge → CockpitCharge` (helper exportable) — le snapshot expose déjà `charges`, `monthlyIncome`, `vieCouranteMonthlyTransfer`. Pas de nouvelle query DB.                                                        |
| `messages/fr-BE.json`                                  | +6 nouvelles clés sous `app.dashboard.cockpit.*` (cf. §1A bis ci-dessous)                                                                                                                                                         |
| `messages/en.json`                                     | +6 clés équivalentes EN (parité obligatoire i18n-auditor)                                                                                                                                                                         |
| `e2e/dashboard-cockpit.spec.ts` (nouveau OU extension) | Smoke test parcours user "voit Capacité Réelle ≥ 0 et Effort Lissé"                                                                                                                                                               |

### i18n — clés à ajouter (M1A bis)

```jsonc
// messages/fr-BE.json — sous "app.dashboard"
"cockpit": {
  "effortLisseTitle": "Effort financier lissé",
  "effortLisseHint": "Charges fixes {fixes} + provisions {provisions}",
  "capaciteReelleTitle": "Capacité d'épargne réelle",
  "capaciteReellePositive": "C'est ton vrai reste à vivre chaque mois, sans surprise.",
  "capaciteReelleNegative": "Attention, ton train de vie global dépasse tes revenus.",
  "capaciteReelleZero": "Tu es à l'équilibre exact ce mois-ci."
}
```

EN équivalent : `effortLisseTitle: "Smoothed financial effort"`, `capaciteReelleTitle: "Real savings capacity"`, etc.

> **Glossaire à maintenir dans `90_Meta/glossary-ankora.md`** (vault Athenaeum) — termes techniques différenciateurs de la concurrence. À enrichir par @cowork avant livraison PR-D3 pour cohérence trilingue post-launch.

### Fichiers à NE PAS toucher (vérification)

- `src/lib/domain/cockpit/*` — déjà livré PR-D1, intouchable.
- `supabase/migrations/*` — aucune migration nécessaire pour PR-D3 (vérifié §1B).
- `src/lib/domain/types.ts` (legacy) — tant que PR-D-final n'est pas planifié.

---

## Mission 1B — Source `plafondQuotidien` (FLAG résolu)

### Spec canonique (vault Athenaeum)

`C:\Users\thier\iCloudDrive\iCloud~md~obsidian\Athenaeum\10_Projects\ankora\specs\dashboard-cockpit-vraie-vision-2026-05-03.md` §"Bloc 1 — 3 cards comptes" :

> | `daily_card` | violet | CreditCard | "Carte Quotidien" | **Input `plafondQuotidien` éditable** |

Et §"Capacité d'Épargne Réelle" :

```
margeNetteLissee = revenus - effortFinancierLisse - plafondQuotidien
```

### Code actuel (lecture confirmée)

| Élément                | Localisation                                                            | État                                     |
| ---------------------- | ----------------------------------------------------------------------- | ---------------------------------------- |
| Colonne DB             | `workspaces.vie_courante_monthly_transfer` (migration `20260417000004`) | ✅ existe, contrainte `>= 0`             |
| Snapshot exposé        | `WorkspaceSnapshot.vieCouranteMonthlyTransfer: number \| null`          | ✅ exposé via `workspace-snapshot.ts:58` |
| Server Action écriture | `src/lib/actions/account.ts` (probable, non-vérifié dans cet audit)     | À confirmer                              |

### Décision recommandée pour PR-D3

**Utiliser `snapshot.vieCouranteMonthlyTransfer` directement** comme `plafondQuotidien` :

```ts
const plafondQuotidien = money(snapshot.vieCouranteMonthlyTransfer ?? 0);
```

Si `null` (workspace pas onboardé sur le plafond) → afficher la card avec message d'onboarding ou capacité = revenus − effort, et CTA "Définir mon plafond quotidien".

**Pas de migration ni nouvelle colonne pour PR-D3.** Le renaming sémantique `vie_courante_monthly_transfer → daily_card_cap` peut suivre dans une PR cleanup post-Voie D (ADR-009 le permet, juste convention de nommage).

### ⚠️ Risque ordre PR-D2 → PR-D3 (à arbitrer @cowork)

La spec canonique impose PR-D2 (3 cards comptes typés + renommage inline) AVANT PR-D3 (Effort + Capacité). Mais :

- Le snapshot expose déjà `accounts[].accountType` (`income_bills` / `provisions` / `daily_card`) et `displayName` — **PR-D1 #94 a livré le data model nécessaire**.
- L'input éditable `plafondQuotidien` sur la card daily_card (PR-D2) **n'est pas requis** pour PR-D3 stricto sensu (juste lire la valeur existante).

**Deux options** :

1. **Skip PR-D2, foncer sur PR-D3 dès lundi 12 mai** — cohérent avec ton prompt sprint. Risque : la card daily_card actuelle ne montre pas le plafond éditable, l'utilisateur peut se demander "comment je règle ça ?". Mitigation : ajouter un mini-CTA "Régler le plafond quotidien" pointant vers `/app/accounts` (settings existante).
2. **Insérer PR-D2 avant PR-D3 (1-2 j)** — strictement aligné avec spec. Démarrage PR-D3 décalé à ~14-15 mai. Risque deadline.

**Recommandation @cc-ankora** : option 1, avec ticket Linear post-PR-D3 pour réintroduire le plafond éditable inline dans PR-D2 (parallélisable avec PR-D4).

---

## Mission 1C — Coverage modules cockpit (PR-D3 cibles)

### Inventaire tests existants

| Module                       | Test file                                   | Cas couverts                                                                                                                                                                                  |
| ---------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `effort-financier-lisse.ts`  | `__tests__/effort-financier-lisse.test.ts`  | 11 cas : 3 fonctions exportées, fixtures Dashlane @thierry réelle, précision Decimal `53/12`, inactives ignorées                                                                              |
| `capacite-epargne-reelle.ts` | `__tests__/capacite-epargne-reelle.test.ts` | **14 cas** : revenus=0, charges vides, plafond>revenus, capacite=0 (`isPositive: true`), mix complet, Decimal precision (`12 × 53/12 = 53`), inactives, breakdown effort séparé, early signup |

### Évaluation qualitative ≥ 90 %

Lignes des modules :

- `effort-financier-lisse.ts` : 39 lignes utiles, **3 fonctions** (`totalChargesMensuelles`, `provisionsMensuellesLissees`, `effortFinancierLisse`) — toutes testées ≥ 3 cas chacune.
- `capacite-epargne-reelle.ts` : 43 lignes utiles, **1 fonction** (`capaciteEpargneReelle`) — testée 14 fois sur l'ensemble du flux.

Tous les **cas limites du prompt @cowork** (revenus = 0 / charges vides / montants négatifs / decimals précis) sont couverts. **Verdict pré-PR-D3 : coverage estimée ≥ 95 %** sur ces 2 modules. Mesure formelle à valider en début PR-D3 via `npm run test:coverage` filtré (sortie globale courante diluée par modules cockpit non-testés type `notifications`/`previsions`).

### Cas de tests manquants (suggestion non-blocker)

Aucun trou critique pour PR-D3. À considérer en PR-D4+ :

- Charges avec `payment_months` non-canonique (ex: `[2, 11]` annual exotique) → vérifier que le lissage reste `amount/12` indépendamment des mois.
- Très nombreux items (> 50 charges) → bench performance.

---

## Mission 1D — Risques d'intégration PR-D3

### RLS Supabase (lecture)

Tables impactées par PR-D3 (lecture only) :

| Table                | RLS | Couvert par                                                                          |
| -------------------- | --- | ------------------------------------------------------------------------------------ |
| `workspaces`         | ✅  | Migrations `20260416000002_rls_policies.sql` + `20260417000001_rls_completeness.sql` |
| `workspace_settings` | ✅  | idem (`settings_editor_insert` + select scoped to membership)                        |
| `workspace_members`  | ✅  | idem (`members_owner_*`)                                                             |
| `accounts`           | ✅  | idem                                                                                 |
| `charges`            | ✅  | idem (vérifié indirectement via PR-D1 #94 `rls-flow-tester` agent)                   |

PR-C1 (#88) a explicitement audité et fixé le data flow Server Actions / revalidatePath. **Pas de risque RLS spécifique pour PR-D3** puisque PR-D3 ne fait que lire le snapshot existant + appliquer 2 calculs purs en RSC.

### Performance

- **Aucune query DB additionnelle** : `getWorkspaceSnapshot()` lit déjà charges + workspaces + accounts + settings + monthlyExpenses en `Promise.all` (5 queries parallèles, déjà optimisées PR-C1).
- **Memoization** : pas nécessaire — le calcul `effortFinancierLisse(charges)` sur 10-30 charges actives = négligeable (microseconde).
- **Cache** : Server Component default cache via Next.js. Mutation flow couvert par `revalidatePath` (PR-C1 fix).

### i18n

- Clés cockpit absentes (vérifié via `messages/{fr-BE,en}.json`) — **6 clés à ajouter** (cf. §1A bis).
- Termes "cockpit", "provisions", "réserve libre" déjà présents → cohérent avec voca existant.
- `i18n-auditor` agent doit valider la parité FR-BE / EN avant merge PR-D3.

### Mapping `Charge → CockpitCharge` (gap à combler dans PR-D3)

Le snapshot expose `Charge[]` (legacy type) avec `dueMonth: number` (singular). Le module cockpit attend `CockpitCharge[]` avec `paymentMonths: readonly number[]` (sorted ascending).

**Migration `20260503000002_pr_d1_charges_enrichments.sql` est appliquée** (`payment_months smallint[]` + backfill `set payment_months = array[due_month]`), mais :

- Le SELECT dans `workspace-snapshot.ts:122` ne lit PAS encore `payment_months` ni `payment_day`.
- Le type `Charge` (`src/lib/domain/types.ts`) n'expose pas `paymentMonths` ni `paymentDay`.

**Action PR-D3** : étendre le SELECT du snapshot pour inclure `payment_months` + `payment_day`, et créer un helper d'adaptation :

```ts
// src/lib/data/workspace-snapshot.ts
export function toCockpitCharges(charges: Charge[]): CockpitCharge[] {
  return charges.map((c) => ({
    id: c.id,
    label: c.label,
    amount: c.amount, // déjà Decimal via money()
    frequency: c.frequency,
    paymentMonths: c.paymentMonths, // depuis le SELECT enrichi
    paymentDay: c.paymentDay,
    isActive: c.isActive,
  }));
}
```

**Note** : pour `effortFinancierLisse` et `capaciteEpargneReelle` strict, seuls `amount`, `frequency`, `isActive` sont consommés. Donc même un stub `paymentMonths: [c.dueMonth ?? 1]`, `paymentDay: 1` fonctionnerait — mais autant lire les vraies colonnes maintenant pour ne pas créer de dette pour PR-D4 (toggle paye qui consomme `payment_day` pour les notifications).

### Risques identifiés (synthèse)

| #   | Risque                                                            | Sévérité | Mitigation                                                        |
| --- | ----------------------------------------------------------------- | -------- | ----------------------------------------------------------------- |
| 1   | Ordre PR-D2 vs PR-D3 (cf. §1B)                                    | medium   | Skip PR-D2 OK avec mini-CTA. Ticket Linear pour input éditable.   |
| 2   | Snapshot ne lit pas encore `payment_months[]`                     | low      | Étendre SELECT + helper `toCockpitCharges()` dans PR-D3 (~30 min) |
| 3   | i18n parité FR-BE / EN à maintenir                                | low      | `i18n-auditor` agent obligatoire avant merge                      |
| 4   | Decimal → string formatting (FR-BE `123,45 €` vs EN `€123.45`)    | low      | `formatCurrency(value, locale)` déjà robuste (PR-1bis #21)        |
| 5   | Capacité = 0 doit être positive (test `isPositive: true` couvert) | none     | Edge case déjà testé ligne 109-117 du test                        |

---

## Mission 3 — Incohérences ROADMAP.md (flag, pas de modif)

### Trouvailles

1. **Ligne 3** : `Dernière mise à jour : 2 mai 2026` — obsolète. PR-C2a #89 (3 mai), PR-D1 #94 (3 mai), PR-QA-1a/b/c (4 mai), PR-1c-1 #111 (4 mai), gitignore @cowork 81f671e (6 mai) postérieurs. **Bump à `6 mai 2026`** dans la prochaine sync ROADMAP.
2. **Ligne 91** (tableau "Ordre d'exécution des PR techniques") : statut Voie D `📋 spec canonique livrée 3 mai 2026 (...), 5 ADRs (008-012) en `Proposed`` — **incohérent** avec la section Voie D plus bas (`✅ 5 ADRs Accepted (008-012) — validés 2026-05-03`). Bump le statut tableau à `📋 5 ADRs Accepted, démarrage PR-D3 lundi 12 mai`.
3. **Ligne 167** : `1. ✅ **5 ADRs Accepted** (008-012)` — déjà correct. Le prompt @cowork mentionnait cette ligne comme fausse mais elle est à jour. Probable confusion sur les numéros de ligne.
4. **Lignes 86-94** : tableau ordre PR-3a/b/c shows "Polish post-merge en cours sur `feat/hero-waterfall-3steps`" — cette branche n'existe plus localement (Phase 1 @cc-ankora cleanup) et probablement plus sur remote (`feat/cc-design-handoff-v1` aussi orpheline). État polish à confirmer.

### Action recommandée @cowork

Sync ROADMAP.md dans une mini-PR `chore/roadmap-sync-2026-05-06` avec les 4 fixes ci-dessus + (optionnel) un §"Phase 2 hygiène + pré-cadrage Voie D — 6 mai 2026" qui résume les rapports `cc-handoffs/` Phase 1 et 2.

---

## Mission 4 — CI verte main confirmée

### Local (@thierry Windows 11 Pro, Node v22)

| Check                     | Résultat                                                    |
| ------------------------- | ----------------------------------------------------------- |
| `npm run lint`            | ✅ 0 erreur, 3 warnings préexistants (coverage + glossaire) |
| `npm run lint:use-server` | ✅ All `use server` files contain only async exports        |
| `npm run typecheck`       | ✅ 0 erreur                                                 |
| `npm run test` (Vitest)   | ✅ exit code 0                                              |
| `npm run build`           | ✅ exit code 0, build complet                               |

### CI cloud (rappel Phase 1)

- Lint + Typecheck + Unit Tests ✅
- Security audit ✅
- Lighthouse CI ✅
- Playwright E2E ❌ (BUG-iOS-011 #116 — overflow horizontal iPhone SE 18px sur landing). **Status accepté post-Voie D selon décision @cowork.** Pas un blocker Phase 2.

---

## Side-notes hygiène (hors scope strict)

1. **`.claude/settings.local.json` désormais NON-IGNORÉ** (commit @cowork 81f671e a supprimé ce pattern). Risque : commit accidentel du model pinning local + autres settings sensibles user. **Suggestion** : ré-ajouter dans `.gitignore` si non-intentionnel. Si intentionnel : migrer le pinning Opus 4.7 vers `.claude/settings.json` (committed, partagé entre agents) plutôt que `.local.json`.
2. **`prompts/` désormais NON-IGNORÉ** (idem, supprimé du gitignore). Ce dossier est listé dans CLAUDE.md projet ligne `prompts/PR-{X}-…md`. Devrait peut-être être committed pour traçabilité ? À arbitrer @cowork.
3. **`docs/ROADMAP.md` flag fantôme** : `git status` initial montrait `M docs/ROADMAP.md` sans diff content (drift d'index). Résolu par `git update-index --really-refresh`. Pas une vraie modif.
4. **`public/llms-full.txt`** : artefact `prebuild` régénéré à chaque build local. Reflète la date du jour. À chaque session @cc-ankora qui exécute `npm run build`, ce fichier sera M dans le WT. Sans impact (CI build le régénère).

---

## Mission 2 — THI-122 Page 404 brandée + error boundary

### Statut

**Pas démarrée.** Mission 1 a consommé un bandwidth honnête (lecture spec 700 lignes + 4 fichiers domain + RLS + i18n + ROADMAP + audit fichiers).

### Recommandation

**Foncer sur Mission 2 en Phase 2 bis** (cette semaine encore, branche `feat/thi-122-404-error-boundary`) si tu confirmes. Estimation : ~3-4 h propres, indépendant Voie D, valeur UX prod immédiate.

### Pré-cadrage Mission 2 (préparé)

#### Fichiers à créer

```
src/app/[locale]/not-found.tsx        ← page 404 brandée Ankora
src/app/[locale]/error.tsx            ← Error Boundary global (Client Component)
src/app/[locale]/global-error.tsx     ← Error Boundary niveau root (capture les errors du layout)
src/app/[locale]/__tests__/not-found.test.tsx
src/app/[locale]/__tests__/error.test.tsx
e2e/error-boundaries.spec.ts          ← smoke 404 + error trigger
```

#### Design tokens à utiliser

- Couleur principale : `bg-background` + `text-foreground`
- Accent : `text-primary` (teal Ankora) ou `text-warning` (selon ton)
- Typo : `font-display` (Fraunces) pour le titre, `font-sans` (Inter) pour body
- Bouton : composant `Button` shadcn/ui avec variant `default`

#### i18n keys

```jsonc
"errors": {
  "notFound": {
    "title": "Page introuvable",
    "description": "Cette page n'existe pas ou a été déplacée. Reviens à ton cockpit pour continuer.",
    "ctaHome": "Retour à l'accueil",
    "ctaCockpit": "Aller au cockpit"
  },
  "boundary": {
    "title": "Quelque chose s'est cassé",
    "description": "Une erreur inattendue s'est produite. Tes données sont en sécurité.",
    "ctaRetry": "Réessayer",
    "ctaHome": "Retour à l'accueil"
  }
}
```

EN équivalent.

#### Posture senior anticipée

- Pas de scope creep : 404 + 2 niveaux error boundary (`error.tsx` route-level + `global-error.tsx` root). Pas de page 500 séparée (Next 16 ne l'utilise pas pour App Router).
- `error.tsx` doit être Client Component (`'use client'`) avec props `{ error, reset }`.
- `global-error.tsx` doit re-render `<html>` et `<body>` (contrainte App Router).
- Ne pas exposer `error.message` brut (PII / stack trace) — afficher un libellé i18n générique + log côté serveur via `log.error()`.
- Tests Vitest co-localisés + smoke E2E "navigation vers `/not-existing` → page 404 brandée".
- Agents QA : `ui-auditor`, `i18n-auditor`, `gdpr-compliance-auditor` (vérif pas de leak PII dans error UI).

### Question @cowork pour décision Mission 2

Tu valides le **GO Mission 2 cette semaine** (branche dédiée + PR isolée) ?

- ✅ GO → je démarre Mission 2 dans la foulée, rapport séparé à la fin.
- ⏸ HOLD → je m'arrête là, j'attends mockups CD#3 et le démarrage PR-D3 lundi 12 mai.

---

## DoD Phase 2 Mission 1

| Critère                                                      | État                                   |
| ------------------------------------------------------------ | -------------------------------------- |
| 1. Rapport Mission 1 livré dans `cc-handoffs/2026-05-06-...` | ✅ ce fichier                          |
| 2. Mission 2 démarrée OU statuée                             | ✅ statuée — décision @cowork attendue |
| 3. CI verte main confirmée localement                        | ✅ §4                                  |
| 4. Pas de modif `src/`                                       | ✅ git diff stat propre                |

```
git diff --stat (post-mission) :
 public/llms-full.txt | 2 +-
```

→ Aucune modif `src/`. Seul artefact `prebuild` régénéré (cf. §side-notes).

---

## Actions @cowork demandées

- [ ] **Décision** ordre PR-D2 vs PR-D3 (recommandation @cc-ankora : skip PR-D2, foncer PR-D3 lundi 12 mai)
- [ ] **GO/HOLD Mission 2 (THI-122)** cette semaine
- [ ] **Sync ROADMAP.md** (4 incohérences §3 ci-dessus)
- [ ] **Statuer `.claude/settings.local.json`** + `prompts/` non-ignorés (regression depuis 81f671e ?)
- [ ] **Glossary trilingue** : créer/enrichir `90_Meta/glossary-ankora.md` (vault Athenaeum) avec termes `Effort financier lissé`, `Capacité d'épargne réelle`, `Plafond quotidien`, `Assistant Virements` avant lock-in PR-D3 i18n.

## Pour @thierry (validation post-mission)

- Pré-cadrage PR-D3 livré : feu vert pour démarrage lundi 12 mai sans investigation préalable.
- Mission 2 (THI-122) en standby — j'attends ton OK ou celui de @cowork pour embarquer.

---

**Push done ≠ task done.** Pas de PR cette mission. Rapport livré pour validation @thierry post-mission, conforme prompt @cowork Phase 2.

— @cc-ankora (Opus 4.7) · 2026-05-06 13:30 UTC+2
