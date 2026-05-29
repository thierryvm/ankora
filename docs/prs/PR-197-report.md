# PR #197 — `ci(e2e): migrate to official Playwright container (v1.59.1-noble)`

> **Type** : `ci(e2e)` — migration GitHub Actions workflow dédiée (1 fichier).
> **Branche** : `ci/e2e-playwright-container` (depuis `main`)
> **Commit** : `547eb02`
> **Modèle** : Opus 4.8 (Phase 0 ✅ — upgrade, non downgrade)
> **Doctrine post-Cowork** : `spec-translator` → `plan-reviewer` ✅ APPROVED (1 round)
> **Supersède** : PR #196 (`chore/ci-playwright-cache`, **fermée**, NO-GO empirique)

---

## Contexte — #196 NO-GO confirmé empiriquement

L'approche `actions/cache@v4` + retry/timeout (3×12m bash natif) ne résout pas le hang sur `cdn.playwright.dev` / `apt-get`. Le hang est **structurel**, pas transient. Et le post-step `actions/cache@v4` cache-save ne s'exécute jamais car le job meurt avant d'atteindre la fin du dernier step utilisateur.

| Run                                                                         | Commit    | Stratégie                             | Durée     | Conclusion                       |
| --------------------------------------------------------------------------- | --------- | ------------------------------------- | --------- | -------------------------------- |
| [26594675820](https://github.com/thierryvm/ankora/actions/runs/26594675820) | `824c4b7` | cache `actions/cache@v4` seul         | **30 m**  | ❌ CANCELLED (timeout-job)       |
| [26605442562](https://github.com/thierryvm/ankora/actions/runs/26605442562) | `846dd80` | cache + retry 3×12m + timeout-job 45m | **~38 m** | ❌ FAILURE (3 retries exhausted) |

Conclusion : `npm run e2e` jamais atteint sur aucun des 2 runs. Cache jamais sauvé. Cercle vicieux.

---

## Solution — container Playwright officiel

Image cible : `mcr.microsoft.com/playwright:v1.59.1-noble`

- Chromium + WebKit + dépendances système **préinstallés dans l'image Docker** → zéro download CDN, zéro `apt-get`, **hang structurellement impossible**.
- Tag `v1.59.1` match exact `@playwright/test` résolu dans `package-lock.json` (vérifié via `node -p "require('@playwright/test/package.json').version"`).
- Distro `noble` = Ubuntu 24.04 LTS (aligné `ubuntu-latest` actuel, glibc moderne).
- Image publique Microsoft signée → budget 0 € respecté.

### Décisions architecturales (plan-reviewer en dur)

| Axe              | Valeur retenue                                                | Rationale                                                                                                                                    |
| ---------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Node version** | `setup-node@v4 node:24 cache:npm` **conservé dans container** | Override Node 22 embarqué par l'image. Cohérence Node 24 cross-jobs + respect `engines: { "node": "24.x" }` de `package.json`. Surcoût ~5 s. |
| **Tag image**    | `v1.59.1-noble` (préfixe `v`)                                 | Format officiel Microsoft. Noble = Ubuntu 24.04 LTS.                                                                                         |
| **Timeout-job**  | **30 min** (inchangé `main`)                                  | Container élimine l'install (~10-15 m hung sur #196). Build+e2e seuls = 6 m 43 s observés → 30 m couvre 4.5× la marge.                       |

---

## Diff appliqué — `.github/workflows/ci.yml`

**+6 lignes ajoutées** (commentaire de traçabilité + directive `container:`) **− 1 ligne supprimée** (step install obsolète).

```diff
   e2e:
     name: Playwright E2E
     runs-on: ubuntu-latest
+    # Pre-baked Playwright browsers eliminate the cdn.playwright.dev install
+    # hang observed in PR #196 (runs 26594675820 cache-only CANCELLED 30m,
+    # 26605442562 retry 3×12m FAILURE 38m). Image tag MUST match the
+    # @playwright/test version resolved in package-lock.json (currently 1.59.1).
+    container:
+      image: mcr.microsoft.com/playwright:v1.59.1-noble
     timeout-minutes: 30
     needs: quality
     env:
       ...
       - run: npm ci
-      - run: npx playwright install --with-deps chromium webkit
       - run: npm run build
       - name: Start server
         run: npm run start &
```

Tous les autres steps (checkout, setup-node node 24, npm ci, build, start server, wait-on, npm run e2e, upload-artifact) **inchangés**.

---

## Preuves CI — run #422 (commit `547eb02`)

Run [`26641226908`](https://github.com/thierryvm/ankora/actions/runs/26641226908), event `pull_request`, 2026-05-29 13:52 UTC.

| Job                                       | Durée                              | Conclusion                          |
| ----------------------------------------- | ---------------------------------- | ----------------------------------- |
| Lint + Typecheck + Unit Tests (`quality`) | **1 m 52 s** (13:52:09 → 13:54:01) | ✅ SUCCESS                          |
| Security audit                            | **27 s** (13:52:09 → 13:52:36)     | ✅ SUCCESS                          |
| **Playwright E2E (container)**            | **6 m 43 s** (13:54:04 → 14:00:47) | ✅ **SUCCESS**                      |
| Sourcery Gate (`check-sourcery-resolved`) | —                                  | ✅ SUCCESS                          |
| Lighthouse CI                             | —                                  | ⚪ SKIPPED (gated `push main` only) |
| Vercel deploy                             | —                                  | ✅ SUCCESS                          |

**Tests Playwright** (rapporté par @cowork sur logs) : **201 passed / 143 skipped**, durée tests bruts ~5.2 min sur 6 m 43 s job (≈ 1 m 30 s overhead = image pull + setup-node + `npm ci` + `npm run build` + start server + `wait-on tcp:3000`). Artifact `playwright-report` généré (342 KB).

**Wall clock total CI** : 8 m 43 s (run.createdAt 13:52:05 → last check completed 14:00:47).

### Comparaison avant/après

| Métrique                              | #196 retry (`846dd80`)        | #197 container (`547eb02`)               | Δ        |
| ------------------------------------- | ----------------------------- | ---------------------------------------- | -------- |
| Conclusion job `e2e`                  | ❌ FAILURE                    | ✅ SUCCESS                               | —        |
| Durée job `e2e`                       | ~38 m (3×12m retry exhausted) | **6 m 43 s**                             | **÷5.7** |
| `npm run e2e` atteint                 | ❌ jamais                     | ✅ oui (201 passed / 143 skipped)        | —        |
| Cache `~/.cache/ms-playwright` créé   | ❌ jamais                     | n/a (cache supprimé, container pré-baké) | —        |
| Étapes d'install Playwright dans logs | Hang ×3                       | **AUCUNE** (image pré-bakée)             | —        |

---

## Critère opérationnel — DoD GO/NO-GO container

**GO container fonctionne** (preuves structurelles depuis le diff mergé + run #422 SUCCESS) :

- ✅ Directive `container:` présente dans `ci.yml` L55-56 → GHA exécute forcément un step initial `Initialize containers` (implicite à l'usage de `container:`).
- ✅ Step `npx playwright install --with-deps chromium webkit` **supprimée du YAML** → impossible qu'elle apparaisse dans les logs (preuve structurelle, pas observationnelle).
- ✅ Job `e2e` SUCCESS en 6 m 43 s sans aucun step d'install Playwright (vs ~38 m hang sur #196).
- ✅ `npm run e2e` atteint et 201 tests passés.

Critère opérationnel **GO**.

---

## DoD canonique (5 critères)

| #   | Critère                                                                 | Statut | Preuve                                                                                                                  |
| --- | ----------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | Tous les checks CI verts (Lint, Typecheck, Tests, E2E, Security, Build) | ✅     | Run [26641226908](https://github.com/thierryvm/ankora/actions/runs/26641226908) — quality + security + e2e tous SUCCESS |
| 2   | Sourcery silencieux sur dernier commit                                  | ✅     | `gh api repos/thierryvm/ankora/pulls/197/comments` → 0 commentaire inline. Voir note Sourcery ci-dessous                |
| 3   | Reviews humaines approuvées et résolues                                 | ⏳     | En attente review @thierry pour merge (CC Ankora ne merge pas — doctrine)                                               |
| 4   | Pas de conflit avec `main`                                              | ✅     | `mergeStateStatus: CLEAN`, `mergeable: MERGEABLE`                                                                       |
| 5   | Rapport livré avec preuve de chaque critère                             | ✅     | Ce fichier                                                                                                              |

**Note Sourcery** : la PR #197 contient une review Sourcery `state: COMMENTED` au body suivant :

> Sorry @thierryvm, you have reached your weekly rate limit of 500000 diff characters. Please try again later or upgrade to continue using Sourcery.

Ce n'est **pas** une review `CHANGES_REQUESTED` ni un commentaire inline sur le diff. C'est un message d'information sur le quota hebdomadaire Sourcery (free tier) → **non bloquant pour la DoD**. La review Sourcery effective est `SKIPPED` (chore CI YAML, sans surprise).

---

## Post-merge — actions de suivi

1. **@thierry merge #197** (CC Ankora ne merge pas, doctrine).
2. **Cleanup branches** (procédure CLAUDE.md Ankora §"Cleanup branches locales") :
   ```bash
   git fetch --prune origin
   git push origin --delete chore/ci-playwright-cache
   # puis localement :
   git branch -d ci/e2e-playwright-container || git branch -D ci/e2e-playwright-container
   git branch -D chore/ci-playwright-cache
   ```
3. **Observation 1er run sur `main`** : confirmer que `Initialize containers` apparaît dans les logs, image pull ~60-90 s premier coup puis cache GHA réutilisé.

### Suivi indépendant — `.claude/settings.local.json` (HORS PR #197)

Pin model `claude-opus-4-7` désaligné de la session active Opus 4.8. À aligner dans une **PR `chore(claude)` dédiée** (banned item #3 : `settings.local.json` ne se modifie pas dans une PR feature/infra). Non bloquant pour cette PR.

### Suivi à observer si flake apparaît plus tard

- **`wait-on tcp:3000`** : si Next.js 16 bind sur `127.0.0.1` au lieu de `0.0.0.0` dans le container et que `wait-on` flake → patch `npm run start -- -H 0.0.0.0` dans une PR de suivi (pas préemptive ici, déjà OK sur run #422).
- **Bump version Playwright** : si `package.json` passe à `^1.60.x` ou plus, le tag image `mcr.microsoft.com/playwright:v1.59.1-noble` devra suivre (le commentaire YAML L51-54 documente cette contrainte).

---

## Hors scope (explicite, banned items respectés)

- ❌ `.claude/settings.local.json` (banned #3)
- ❌ `.husky/` (banned #3)
- ❌ Autres workflows GHA (`label.yml`, `sourcery-gate.yml`)
- ❌ `package.json`, `package-lock.json`
- ❌ `playwright.config.ts`, scripts test
- ❌ Code applicatif `src/`
- ❌ Migrations Supabase
- ❌ Dépendances tierces (action GitHub, npm)

---

## Gouvernance — workflow doctrine respecté

1. ✅ Phase 0 model check (Opus 4.8, upgrade non downgrade)
2. ✅ Code verify before prescribe : version Playwright lue, main HEAD vérifié, 2 runs CI #196 confirmés
3. ✅ `spec-translator` invoqué (spec Phase 0 + Scope + DoD)
4. ✅ `plan-reviewer` invoqué → ✅ APPROVED en 1 round (arbitrages A/B/C en dur)
5. ✅ Aucun code écrit avant verdict APPROVED
6. ✅ Scope chirurgical : 1 fichier, 1 directive ajoutée, 1 step supprimée, +6/−1 lignes
7. ✅ Banned items #1–#5 vérifiés à chaque step
8. ✅ #196 fermée (pas mergée) avec commentaire de bascule pointant #197

---

## Verdict CC Ankora

**DoD GO pour merge** sur 4/5 critères automatiques (1, 2, 4, 5). Critère 3 = approval @thierry, en attente.

Sur `547eb02` :

- ✅ Run CI #422 SUCCESS complet (8 m 43 s wall clock, 6 m 43 s job e2e, 201 tests passés)
- ✅ Diff `+6 / −1` chirurgical conforme au plan APPROVED
- ✅ Sourcery 0 commentaire inline (rate limit info ≠ blocker)
- ✅ `mergeStateStatus: CLEAN`
- ✅ Comparaison empirique #196 vs #197 = ÷5.7 sur durée e2e, NO-GO→GO sur conclusion

**Rappel doctrine `push done ≠ task done`** : la PR est **prête à merger côté CC Ankora**. La DONE finale dépend de l'approval @thierry + merge + observation 1er run sur `main` post-merge (preuve que le container fonctionne aussi hors contexte PR).
