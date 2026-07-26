# Phase 1 hygiène + audit Voie D — Rapport @cc-ankora → @cowork

- **Date** : 2026-05-06 12:26 (UTC+2)
- **Mission** : préparation sprint Voie D (PR-D3+, démarrage 12 mai)
- **Auteur** : @cc-ankora (Opus 4.7, claude-opus-4-7)
- **Modèle vérifié** : ✅ Opus 4.7 (Phase 0 OK)
- **Scope respecté** : zéro modif `src/`, uniquement git hygiene + audit lecture seule + ce rapport
- **Branche de travail** : aucune (actions sur `main`, suppression branches locales)

---

## 1. Cleanup branches WIP locales — DONE

Procédure CLAUDE.md cleanup appliquée : `git fetch --prune origin` puis `git branch -d` (safe), fallback `git branch -D` après cross-check `gh pr list`.

### Branches supprimées (5)

| Branche                                 | ahead | behind | PR cross-check                                       | Méthode | Verdict                                               |
| --------------------------------------- | ----- | ------ | ---------------------------------------------------- | ------- | ----------------------------------------------------- |
| `chore/license`                         | 0     | 73     | indirect `chore/license-metadata` #18 ✅ merged      | `-d`    | 0 commits unique → safe sans force                    |
| `chore/lighthouse-seo-threshold-adjust` | 2     | 44     | exact match #42 ✅ merged                            | `-D`    | Squash merge — commits aplatis, safe à forcer         |
| `feat/pr-2a-de-de-placeholders`         | 1     | 57     | exact match #28 ✅ merged                            | `-D`    | Squash merge — commit aplati, safe à forcer           |
| `hotfix/use-server-exports-login`       | 3     | 50     | #37 CLOSED, fix repris dans #38 ✅ merged (`-clean`) | `-D`    | Travail abandonné puis repris sur autre branche, safe |
| `chore/claude-i18n-tooling`             | 3     | 50     | exact match #36 ❌ CLOSED (jamais merged)            | `-D`    | Abandon volontaire formel via PR closed, safe         |

Output exact :

```
Deleted branch chore/license (was 5cf544b).
Deleted branch chore/lighthouse-seo-threshold-adjust (was 3576fe0).
Deleted branch feat/pr-2a-de-de-placeholders (was 26e10f2).
Deleted branch hotfix/use-server-exports-login (was dab16bf).
Deleted branch chore/claude-i18n-tooling (was 4a15178).
```

### Branche PRÉSERVÉE — flag @thierry

`chore/roadmap-sync-2026-05-02` (2 ahead, 19 behind) — **PR #85 CLOSED** (jamais merged).

Commits ahead non présents sur `main` (vérifiés via `git merge-base --is-ancestor`) :

- `07e58c9 refactor(landing): align Num colour API across the 3 waterfall steps (Sourcery #2)`
- `07b7802 feat(landing): simplify hero waterfall to 3 canonical steps`

**Pourquoi pas supprimée** : posture senior CLAUDE.md → "branches WIP avec travail UNIQUE non-mergé : FLAG avant suppression". Le hero waterfall canonical 3-steps a peut-être été repris dans PR-3c-3 #82 (`WhatIfDemo simulator`) ou via une autre PR ultérieure, mais je n'ai pas la preuve formelle.

**Action @thierry demandée** : confirmer abandon volontaire (et autoriser `git branch -D chore/roadmap-sync-2026-05-02`) OU récupérer les commits dans une nouvelle branche si le travail reste pertinent.

### État final local

```
* main                          cf67a18 [origin/main]
  chore/roadmap-sync-2026-05-02 07e58c9 [origin/chore/roadmap-sync-2026-05-02]  ← à arbitrer
```

---

## 2. Audit branches REMOTE (lecture seule) — DONE

Toutes les branches remote restantes hors `main` ont leur PR soit mergée soit closed. **Aucune n'est plus active.**

| Remote                                       | PR cross-check           | État      | Recommandation                                                                 |
| -------------------------------------------- | ------------------------ | --------- | ------------------------------------------------------------------------------ |
| `origin/chore/claude-i18n-tooling`           | #36 CLOSED (abandon)     | orpheline | **Supprimer** — `git push origin --delete chore/claude-i18n-tooling`           |
| `origin/chore/deps-security-update-may-2026` | #92 ✅ MERGED 2026-05-03 | orpheline | **Supprimer** — `git push origin --delete chore/deps-security-update-may-2026` |
| `origin/chore/roadmap-sync-2026-05-02`       | #85 CLOSED               | orpheline | **Arbitrer @thierry** (cf. §1, idem branche locale)                            |
| `origin/feat/cc-design-handoff-v1`           | #57, #62, #67 ✅ MERGED  | orpheline | **Supprimer** — `git push origin --delete feat/cc-design-handoff-v1`           |
| `origin/hotfix/use-server-exports-login`     | #37 CLOSED (fix repris)  | orpheline | **Supprimer** — `git push origin --delete hotfix/use-server-exports-login`     |

**Note** : `git fetch --prune` n'a rien purgé localement → GitHub n'a pas auto-supprimé ces branches au merge/close (probable absence de "Automatically delete head branches" dans repo settings, à activer pour éviter ce drift à l'avenir).

**Action @thierry demandée** : valider la suppression des 4 remotes orphelines + arbitrer `chore/roadmap-sync-2026-05-02`. Scope strict du prompt : pas de delete remote depuis @cc-ankora, donc je flag uniquement.

---

## 3. Investigation `public/llms-full.txt` — DONE

**Verdict** : artefact de build local, pas une modif manuelle.

`package.json:14` :

```json
"prebuild": "node scripts/build-llms-full.mjs"
```

À chaque `npm run build`, le script regénère le fichier avec la date du jour. Le diff initial `2026-05-03 → 2026-05-04` venait d'un build local précédent. Mon propre `npm run build` baseline a re-bumpé à `2026-05-06`. Le diff actuel sera écrasé au prochain build CI.

**Décision** : **laisser tel quel, pas de commit, pas de restore.** Le build CI sur la prochaine PR régénère et commit automatiquement (ou ne commit pas — à vérifier dans l'étape `prebuild` du workflow CI). **Pas un blocker.**

> ⚠️ **Side-note hors-scope** : `.gitignore` apparaît aussi modifié (`M .gitignore`) avec ajout de patterns (`design-mockup-*.html`, `.claude/settings.local.json`, `prompts/`, `.playwright-mcp/`, `/screenshots/`, `/*.png`, `/*.jpg`). Diff non causé par mes commandes (lint/typecheck/test/build sont read-only sur ce fichier). Probable carry-over d'une session précédente non-commitée. **Action @thierry demandée** : commiter cette amélioration .gitignore dans un mini-PR `chore/gitignore-update`, ou restore si non pertinent.

---

## 4. État CI/CD baseline — ⚠️ BLOCKER FLAGGÉ

### Local (machine @thierry, Windows 11 Pro, Node v22 via npm)

| Check                     | Résultat                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `npm run lint`            | ✅ 0 erreur, 3 warnings (2 dans `coverage/` artefacts ignorables, 1 préexistant `glossaire/page.tsx:20 'locale' unused`) |
| `npm run lint:use-server` | ✅ All `use server` files contain only async exports                                                                     |
| `npm run typecheck`       | ✅ 0 erreur (tsc silencieux)                                                                                             |
| `npm run test` (Vitest)   | ✅ exit code 0                                                                                                           |
| `npm run build`           | ✅ exit code 0, build complet                                                                                            |

**→ Local sain.**

### CI GitHub Actions (push main, run 25338236619, sha `cf67a18`)

| Job                           | Conclusion     |
| ----------------------------- | -------------- |
| Lint + Typecheck + Unit Tests | ✅ success     |
| Security audit                | ✅ success     |
| Lighthouse CI                 | ✅ success     |
| **Playwright E2E**            | ❌ **failure** |

### ⚠️ BLOCKER — régression test E2E

Test échoué :

```
[iPhone SE] › e2e/mobile-ios/landing.spec.ts:15:7
  › Landing — iPhone Safari WebKit (PR-QA-1b)
  › no horizontal overflow on the entire landing page

Error: iPhone SE: window.scrollX moved from 0 to 18 after scrollBy({left: 100})
       — page is horizontally scrollable, the user-facing overflow guard is broken
       Expected: 0
       Received: 18
```

**Stats** : 1 failed, 134 passed, 82 skipped (3 retries tous en échec).

**Origine** : la PR-QA-1c-1 #111 (cf67a18) a justement été mergée pour fix l'overflow guard html + body. Le test suite `mobile-ios` ajouté en PR-QA-1b #106 détecte que **le fix ne suffit pas** sur iPhone SE — il reste 18px d'overflow horizontal sur la landing.

**Diagnostic à confirmer (lecture brute, pas implémenté ici)** :

- Le guard `html, body { overflow-x: clip }` (ou équivalent) ne capte peut-être pas un descendant en `position: absolute/fixed` qui dépasse.
- Possible cause : un composant landing (waterfall ? hero ?) avec `min-width:` plus large que viewport iPhone SE (320px ou 375px).
- Le test scroll `scrollBy({left: 100})` détecte 18px de scroll horizontal même après le fix CSS.

**Action @cowork demandée** :

1. **Décision** : ouvrir un PR-QA-1c-2 follow-up pour fix réel iPhone SE overflow OU temporairement désactiver `landing.spec.ts:15` avec un TODO + Linear ticket.
2. **Investigation** : envoyer @cc-ankora sur diagnostic ciblé (browser DevTools mobile preview iPhone SE 320×568) — ou utiliser agent `mobile-ios-auditor` que tu as introduit en PR-QA-1a #105.
3. **Posture senior** : la branche `main` ship en CI rouge non-bloquante depuis 2026-05-04 19:14, ce qui érode le signal "DoD = CI verte". À adresser dans le sprint Voie D (priorité haute mais non-blocker pour démarrer PR-D3 lundi 12 mai).

**Note hors-scope mais utile** : 2 runs sur 3 derniers pushs main sont rouges (cf67a18 + 48ba779), et il y a un warning Node 20 deprecation à anticiper (échéance Sept 2026, agir avant Juin 2026 idéalement).

---

## 5. Mini-audit domain code Voie D — DONE

**Excellente nouvelle** : PR-D1 #94 (mergée 2026-05-03) a déjà livré **les 7 modules domain cockpit** dont les 2 modules clés pour PR-D3.

### Inventaire `src/lib/domain/cockpit/`

```
assistant-virements.ts        ← suggestions transferts auto
capacite-epargne-reelle.ts   ← KPI hero PR-D3 ✅ disponible
effort-financier-lisse.ts     ← KPI hero PR-D3 ✅ disponible
notifications.ts              ← alertes contextuelles
previsions.ts                 ← timeline 6 mois (PR-D5+)
sante-provisions.ts           ← jauge health (PR-D4 health score)
simulateur.ts                 ← what-if drawer (PR-D6 simulateur)
types.ts                      ← CockpitCharge, CockpitFrequency
index.ts                      ← barrel export
__tests__/                    ← 7 fichiers de tests (1 par module)
```

### Formule ADR-009 implémentée (lecture confirmée)

`effortFinancierLisse(charges)` :

```ts
// Σ charges mensuelles + Σ provisions mensuelles lissées
//   annual / 12, semiannual / 6, quarterly / 3, monthly = 0 (déjà compté)
```

`capaciteEpargneReelle({ revenus, charges, plafondQuotidien })` :

```ts
// revenus - effortFinancierLisse - plafondQuotidien
// retourne { effortFinancierLisse, capacite, isPositive }
// pas de clamping, no-throw → UI gère le négatif
```

**Précision Decimal.js conservée**, rounding = responsabilité UI. Tests co-localisés dans `__tests__/`.

### Fichiers à toucher pour PR-D3 (estimation)

| Fichier                                                  | Action          | Complexité |
| -------------------------------------------------------- | --------------- | ---------- |
| `src/app/[locale]/app/page.tsx`                          | refactor hero   | medium     |
| `src/components/features/CockpitHero.tsx` (nouveau)      | nouveau         | medium     |
| `src/lib/data/workspace-snapshot.ts`                     | adaptation type | low        |
| `messages/fr-BE.json` + `messages/en.json`               | nouvelles clés  | low        |
| `src/components/features/__tests__/CockpitHero.test.tsx` | nouveau         | medium     |
| Lecture seule : `src/lib/domain/cockpit/*` (déjà OK)     | aucune          | -          |

**Pas de migration DB nécessaire** — modules domain consomment du Decimal pur.

### Compat snapshot ↔ CockpitCharge

Vérifié : `workspace-snapshot.ts:12` importe déjà `AccountType` depuis `@/lib/domain/cockpit/types`. Le snapshot expose `charges`, `monthlyIncome`, `vieCouranteMonthlyTransfer`, `accounts` typés. **PR-D3 aura essentiellement à mapper `snapshot.charges → readonly CockpitCharge[]`** — vérifier si la conversion est triviale ou si un adapter est requis (lecture rapide non-effectuée pour rester read-only).

### Risques d'intégration identifiés pour PR-D3

1. **Définition `plafondQuotidien`** — terme ADR-009 absent du snapshot tel quel. À clarifier @cowork : équivalent `vieCouranteMonthlyTransfer` ? Ou nouveau champ workspace ? Si nouveau champ → migration DB nécessaire (revoit l'estimation low).
2. **Mapping `snapshot.charges → CockpitCharge[]`** — vérifier si les champs `frequency` (annual/semiannual/quarterly/monthly) du schema Zod correspondent exactement à `CockpitFrequency`. À auditer en début de PR-D3.
3. **i18n** — nouvelles clés FR/EN pour hero ("Effort lissé", "Capacité réelle", tooltips, signe négatif). Un lot trivial pour `i18n-translator` skill.
4. **Tests UI** — composant Hero doit être testé Vitest co-localisé + assertion sur formatage Decimal → string FR-BE (`123,45 €` vs EN `€123.45`).
5. **Coverage cible 90%** — non mesurée (`test:coverage` non lancé pour rester rapide). À mesurer en début de PR-D3 pour confirmer baseline.

---

## 6. DoD Phase 1 — récapitulatif

| Critère                                      | État                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| 1. Branches WIP locales obsolètes supprimées | ✅ 5 supprimées, 1 préservée pour flag                                   |
| 2. Investigation branches remote livrée      | ✅ 4 à supprimer + 1 à arbitrer (recommandations livrées, pas exécutées) |
| 3. `public/llms-full.txt` status résolu      | ✅ artefact build, laissé en place                                       |
| 4. Mini-audit domain code livré              | ✅ §5 ci-dessus                                                          |
| 5. État CI/CD/Vercel confirmé                | ⚠️ Local ✅ / CI E2E ❌ — blocker flaggé                                 |
| 6. Pas de modif `src/`                       | ✅ vérification git diff finale OK                                       |

```
git diff --stat (working tree post-mission) :
 .gitignore           | 17 +++++++++++-
 public/llms-full.txt |  2 +-
```

→ Aucune modif `src/`. `.gitignore` carry-over pré-existant (cf. §3 side-note), `llms-full.txt` artefact build (cf. §3).

---

## 7. Actions @thierry demandées (résumé checklist)

- [ ] Valider suppression branche locale `chore/roadmap-sync-2026-05-02` (et son remote)
- [ ] Valider suppression 4 remotes orphelines (`chore/claude-i18n-tooling`, `chore/deps-security-update-may-2026`, `feat/cc-design-handoff-v1`, `hotfix/use-server-exports-login`)
- [ ] Activer "Automatically delete head branches" dans GitHub repo settings (préventif)
- [ ] Statuer sur `.gitignore` carry-over (commit dans mini-PR `chore/gitignore-update` ou restore)
- [ ] **PRIORITÉ HAUTE** — décider follow-up CI E2E iPhone SE overflow (PR-QA-1c-2 ou skip temporaire avec Linear ticket)

## 8. Pour @cowork

- Modules cockpit Voie D **déjà disponibles** → PR-D3 = surface d'intégration UI uniquement, scope plus court qu'estimé.
- Bloquant CI E2E à **adresser avant démarrage PR-D3** (12 mai) sinon DoD Voie D commence sur signal CI déjà rouge.
- ADR-009 a un terme `plafondQuotidien` non mappé sur le snapshot actuel — à clarifier dans la session de validation ADRs en cours.

---

**Push done ≠ task done.** Pas de squash merge ici (pas de PR ouverte). Ce rapport est livré pour validation @thierry post-mission, conformément au prompt @cowork.

— @cc-ankora (Opus 4.7) · 2026-05-06 12:26 UTC+2
