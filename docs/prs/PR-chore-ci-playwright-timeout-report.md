# PR chore(ci) — Bump Playwright E2E timeout 20 → 30 min

> **Type** : `chore(ci)` — modification GitHub Actions workflow dédiée.
> **Doctrine** : post-Cowork — modif `.github/workflows/` interdite en PR feature, donc PR isolée obligatoire.
> **Diff** : 1 ligne (`.github/workflows/ci.yml:53`), 1 caractère (`20` → `30`).
> **Plan-reviewer** : ✅ APPROVED sans réserve (Opus, 2026-05-28).

---

## Evidence — 3 runs Playwright E2E cancelled au timeout 20 min sur 24h

Données collectées via `gh run view <id> --json jobs` (durée job = `completedAt - startedAt` en secondes).

| Run           | Contexte                                                 | Date UTC               | Durée job `e2e`        | Conclusion                  |
| ------------- | -------------------------------------------------------- | ---------------------- | ---------------------- | --------------------------- |
| `26535966710` | PR #189 (`chore/post-cowork-doctrine`)                   | 2026-05-27 20:43→20:50 | **470 s (7 m 50 s)**   | ✅ success — baseline saine |
| `26568360173` | PR #191 (`hotfix/pr-beta-3-503-fix`)                     | 2026-05-28 10:10→10:30 | **1215 s (20 m 15 s)** | ❌ cancelled — timeout      |
| `26571169232` | PR #193 (`chore/security-function-grants-and-audit-log`) | 2026-05-28 11:13→11:33 | **1216 s (20 m 16 s)** | ❌ cancelled — timeout      |
| `26587024730` | Push `main` `f596d17` post-merge #193                    | 2026-05-28 16:15→16:36 | **1217 s (20 m 17 s)** | ❌ cancelled — timeout      |

Précision narrative : le prompt initial évoquait « 3 PRs consécutives ». Factuellement, ce sont **2 PRs (#191, #193) + 1 push `main` post-merge** = 3 runs CI Playwright cancelled, tous **exactement à ~20 m** = plafond `timeout-minutes: 20` du job. Aucune n'a été interrompue par la concurrence `cancel-in-progress` (les 3 runs étaient seuls sur leur SHA respectif).

Cause racine probable : ralentissement transverse des runners GitHub Actions ce mois — l'étape `npx playwright install --with-deps chromium webkit` (téléchargement des binaires Chromium + WebKit + libs système APT) dépasse la fenêtre de 20 minutes alors qu'elle prenait < 10 minutes en mai. Le code Ankora n'est pas en cause (baseline #188 historique à ~7 min 21 s, #189 à 7 m 50 s).

## Justification du choix 30 minutes

| Option              | Marge vs baseline (~7 m 50 s) | Risque résiduel                                                                   | Coût additionnel CI                                     |
| ------------------- | ----------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 25 min              | ×3.2                          | Encore tangent si runner GHA continue à se dégrader                               | Nul sur runs sains (le timeout est un plafond)          |
| **30 min (retenu)** | **×3.8**                      | Marge confortable pour absorber un runner très lent sans verrouiller indéfiniment | Nul sur runs sains                                      |
| 40 min              | ×5.1                          | Excessif — risque de masquer un vrai problème de scope (tests qui gonflent)       | Nul sur runs sains, mais incident plus tardif si dérive |

**Choix retenu : 30 min.** Le plafond ne change pas le coût des runs sains (CI s'arrête quand le job finit, pas au timeout). Mais sur un mois GHA documenté lent, le coût d'un run cancelled à 25 m serait pire que celui d'un run sain qui finit à 12 m. 30 min absorbe l'incertitude sans relâcher la discipline.

Aucun autre job impacté : `quality` (10 m), `security` (5 m), `lighthouse` (15 m, gated `push main`) restent inchangés. `lighthouse` n'a aucune dépendance avec `e2e` (Lighthouse audit la prod déployée, pas la build CI).

## Quality gates locaux (avant push)

| Gate                      | Résultat                                           |
| ------------------------- | -------------------------------------------------- |
| `npm run lint`            | ✅ 0 erreur (6 warnings pré-existants, hors scope) |
| `npm run lint:use-server` | ✅ all async-only                                  |
| `npm run typecheck`       | ✅ 0 erreur                                        |
| `npm run test -- --run`   | ✅ 107 files / 1337 tests passés (20.17 s)         |
| `npm run build`           | ✅ Next.js build terminé                           |

## TODO post-merge (note plan-reviewer)

Si la prochaine run Playwright E2E (sur cette PR ou la suivante) **dépasse 25 minutes**, c'est le signal pour ouvrir une PR dédiée :

1. **Cache Playwright** : ajouter `actions/cache@v4` sur le dossier binaires Playwright (`~/.cache/ms-playwright`) keyé par version Playwright + OS — évite le re-téléchargement Chromium/WebKit à chaque run.
2. **Investigation runner GHA** : ouvrir un ticket GitHub support si le ralentissement persiste, ou évaluer un runner self-hosted si le coût bouge.

**Ne pas re-bumper le timeout à 40 m** sans cette investigation — la réponse correcte à un infra qui se dégrade structurellement est l'optimisation, pas l'extension du plafond.

## DoD canonique (5 critères)

1. CI verte sur cette PR — preuve par l'usage que la fenêtre 30 m absorbe le run actuel.
2. Sourcery silent — YAML + MD only, skip attendu.
3. Pas de conflit `main`.
4. `mergeStateStatus` CLEAN.
5. Rapport livré (ce fichier).

## Hors scope (explicite)

- ❌ Aucune optimisation Playwright (cache, parallélisation, sharding).
- ❌ Aucune modif des autres `timeout-minutes`.
- ❌ Aucune modif des scripts test, des configs Playwright, ou du code applicatif.
