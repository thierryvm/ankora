# Workflow GitHub Ankora — standard entreprise

Document de référence pour tout le cycle issue → PR → merge → release, pensé comme dans une équipe pro malgré un développement solo. Cohérent avec `docs/ROADMAP.md`, `CONTRIBUTING.md`, et les slash commands Claude Code.

---

## 1. Vue d'ensemble du cycle

```
┌─────────────┐   ┌──────────────┐   ┌─────────────┐   ┌──────────┐   ┌─────────┐
│ Issue créée │ → │ PR ouverte   │ → │ Review + CI │ → │  Merge   │ → │ Release │
│ (labeled,   │   │ (auto-       │   │ (agents,    │   │ (squash) │   │ (tag,   │
│  milestoned)│   │  labeled)    │   │  lighthouse)│   │          │   │ changelog)│
└─────────────┘   └──────────────┘   └─────────────┘   └──────────┘   └─────────┘
       ↑                  ↑                  ↑                ↑              ↑
       |                  |                  |                |              |
  /pr-start           Claude Code         GitHub Actions    CODEOWNERS   release.yml
  crée l'issue        exécute le          auto-label +      approval      (futur)
  si absente          prompt              CI pipeline
```

---

## 2. Setup initial (à faire une fois)

### 2.1 Installer les labels

```powershell
pwsh .github/scripts/setup-labels.ps1
```

Crée / met à jour 50+ labels standardisés (type, status, area, pr-series, priority). Idempotent — peut être relancé.

### 2.2 Créer les milestones

```powershell
pwsh .github/scripts/setup-milestones.ps1
```

Crée 1 milestone par PR ROADMAP (PR-1bis, PR-2, PR-B1, PR-3, PR-F, PR-B2a, PR-B2b, PR-B2c, PR-B2d). Idempotent.

### 2.3 Protéger la branche `main`

Via GitHub UI → Settings → Branches → Add rule for `main` :

- ✅ Require a pull request before merging
- ✅ Require approvals: 1
- ✅ Dismiss stale pull request approvals when new commits are pushed
- ✅ Require review from Code Owners
- ✅ Require status checks to pass before merging
  - Selectionner `lint`, `typecheck`, `test`, `e2e`, `lighthouse`, `audit`
- ✅ Require conversation resolution before merging
- ✅ Require signed commits (optionnel mais recommandé)
- ✅ Require linear history
- ❌ Allow force pushes
- ❌ Allow deletions

Même chose pour `develop` avec moins de contraintes (1 approval, pas de CODEOWNERS).

### 2.4 Copier les slash commands Claude Code

Voir `docs/claude-slash-commands/README.md`.

---

## 3. Cycle d'une PR technique (du ROADMAP)

### 3.1 Démarrage

```bash
# Dans Claude Code terminal, dans le dossier ankora
/pr-next
```

Claude Code lit le ROADMAP, identifie la prochaine PR, propose de la lancer.

```
/pr-start PR-B1
```

Claude Code va :

1. Vérifier dans le ROADMAP que les prérequis sont mergés
2. Chercher si une issue GitHub existe avec le label `pr:PR-B1`
3. Si absente, proposer de la créer via `gh issue create --template pr-task.yml`
4. Lire le prompt `prompts/PR-B1-bug-reporting-mvp.md`
5. Produire un récap pré-exécution
6. **Attendre ton 'go'** avant de toucher au code

### 3.2 Branche et commits

Après ton 'go', Claude Code :

1. Crée la branche : `git checkout -b feature/pr-b1-bug-reporting` depuis `develop`
2. Exécute le prompt section par section
3. Commits conventional avec footer `Refs #{issue-number}` :

```
feat(bug-reporting): add supabase migration for bug_reports table

Refs #42
```

### 3.3 Push et ouverture de la PR

```
git push origin feature/pr-b1-bug-reporting
gh pr create --template pull_request_template.md --base develop
```

Claude Code remplit le template automatiquement :

- `Closes #42` (lie à l'issue)
- Résumé selon le prompt
- Checklist quality gates cochée (CI les confirmera)
- Checklist sécurité cochée selon les agents lancés
- Screenshots si UI
- Labels auto-appliqués par `.github/workflows/auto-label.yml`
- Milestone : `PR-B1 — Bug reporting MVP`

### 3.4 Review

Workflow `.github/workflows/ci.yml` lance :

- `lint`, `typecheck`, `test`, `e2e`, `lighthouse`, `npm audit`
- Sourcery (optionnel) — informative
- Vercel Preview — déploiement automatique pour test manuel

Reviewers :

- **CODEOWNERS** (`@thierryvm`) est auto-assigné
- Si tu reviewes tout seul, tu peux approuver ta propre PR côté `develop` (pas `main`)

### 3.5 Merge

- **Squash and merge** par défaut vers `develop` (historique propre, 1 feature = 1 commit)
- Le titre du squash reprend le titre de la PR (conventional)
- Suppression auto de la branche après merge

### 3.6 Post-merge

Claude Code :

- Met à jour `docs/ROADMAP.md` : passe la PR de 📋 à ✅
- Ferme l'issue (automatique via `Closes #N`)
- Ferme la milestone si toutes ses issues/PRs sont closes
- Produit `docs/prs/PR-B1-report.md` si pas déjà fait pendant l'exécution
- Rappelle les post-merge actions (migrations, env vars, secrets)

### 3.7 Release vers `main`

Quand un ensemble cohérent est accumulé sur `develop` :

```bash
git checkout -b release/v0.3.0 develop
# Update CHANGELOG.md + package.json version
git commit -m "chore(release): v0.3.0"
gh pr create --base main --head release/v0.3.0 --title "chore(release): v0.3.0"
```

Merge vers `main` → tag `v0.3.0` → déploiement Vercel prod.

---

## 4. Conventions de nommage

### 4.1 Branches

| Pattern                 | Usage                                             |
| ----------------------- | ------------------------------------------------- |
| `feature/pr-{X}-{slug}` | PR du ROADMAP (ex: `feature/pr-b1-bug-reporting`) |
| `feature/{slug}`        | Feature hors ROADMAP (après validation)           |
| `fix/{slug}`            | Correctif bug                                     |
| `hotfix/{slug}`         | Correctif critique depuis `main`                  |
| `chore/{slug}`          | Maintenance (deps, CI, docs)                      |
| `release/v{X.Y.Z}`      | Préparation release                               |

Le slug est en kebab-case, descriptif mais court : `pr-b1-bug-reporting` > `pr-b1-implement-bug-reporting-feature-with-admin-panel`.

### 4.2 Titres de PR (conventional commits)

```
<type>(<scope>): <short description>
```

Exemples :

```
feat(bug-reporting): add MVP with admin panel (PR-B1)
feat(i18n): extract auth + app + onboarding strings (PR-1bis)
fix(dashboard): donut gauge centering on mobile
chore(deps): bump @supabase/ssr to 0.8.0
```

### 4.3 Issues

Titres :

- `[PR-B1] Bug reporting MVP` — tracking issue ROADMAP
- `[bug] Export JSON truncates amounts above 10k EUR` — bug report
- `[feat] Categorize charges by tag` — feature request

---

## 5. Labels — comment on les utilise

### Un PR a typiquement 4 labels

1. **`pr:PR-X`** — appartenance à une série ROADMAP (auto, depuis le nom de branche)
2. **`type:*`** — type du changement (auto, depuis le titre)
3. **`area:*`** — zone de l'app (auto, depuis le nom de branche)
4. **`status:*`** — où on en est dans le cycle (auto au start, manuel ensuite)

### Labels manuels (à poser à la main quand pertinent)

- `priority:critical/high/medium/low` — pour la hiérarchisation
- `budget:paid-dep-proposed` — si la PR introduit une dépendance payante (requiert approval)
- `triage` — issue ou PR qui a besoin d'être triée
- `good-first-issue` — pour plus tard si des contributeurs arrivent
- `help-wanted` — je bloque dessus

### Labels qui ferment une issue

- `wontfix` — décision de ne pas implémenter
- `duplicate` — déjà tracé ailleurs (lien vers l'autre issue dans le commentaire de fermeture)

---

## 6. Milestones

1 milestone par PR du ROADMAP. Permet de visualiser la progression :

```
PR-1bis    ██████████ 100%  ✅ closed
PR-2       ████       40%   🚧 open
PR-B1      ░░░░       0%    ⏳ open
PR-3       ░░░░       0%    ⏳ open
```

Vue : `https://github.com/thierryvm/ankora/milestones`

---

## 7. Relation ROADMAP ↔ Issues ↔ PR ↔ Milestones

```
docs/ROADMAP.md                    GitHub
─────────────────                  ──────────────────────────────
| PR-B1 | 📋 prompt prêt  |    →   Issue #42 "[PR-B1] Bug reporting MVP"
|       |                 |           labels: [pr:PR-B1, type:pr-task, status:todo]
|       |                 |           milestone: PR-B1 — Bug reporting MVP
                                         │
                                         ▼
                                   PR #43 "feat(bug-reporting): add MVP (PR-B1)"
                                       Closes #42
                                       labels: [pr:PR-B1, type:feat, area:admin, status:review-needed]
                                       milestone: PR-B1 — Bug reporting MVP
                                       │
                                       ▼ merge
                                   docs/ROADMAP.md mis à jour :
                                   | PR-B1 | ✅ mergée |
                                   milestone PR-B1 fermée
                                   docs/prs/PR-B1-report.md créé
```

---

## 8. Workflows GitHub Actions

| Workflow                | Trigger               | Rôle                                          |
| ----------------------- | --------------------- | --------------------------------------------- |
| `ci.yml`                | push + PR             | lint, typecheck, test, e2e, lighthouse, audit |
| `auto-label.yml`        | PR open/edit          | applique auto les labels type/area/pr/status  |
| `release.yml` _(futur)_ | push sur `main` tagué | génère CHANGELOG, crée la release, déploie    |

---

## 9. Règles de commit

### 9.1 Format obligatoire

Conventional Commits — pas de flexibilité. Husky + commit-msg hook bloque les commits non conformes.

### 9.2 Footer

Toujours inclure la référence à l'issue :

```
feat(admin): add bug list page with filters

Implements the admin dashboard to triage bug reports submitted
via the new widget. Supports filtering by status and severity.

Refs #42
```

### 9.3 BREAKING CHANGE

Si un commit casse l'API publique (très rare en solo mais bon réflexe) :

```
feat(api)!: change ActionResult.error to errorCode

BREAKING CHANGE: the `error` field (FR string) is replaced by
a stable `errorCode` key. Consumers must update their error
handling to lookup the code in their i18n bundle.

Refs #55
```

---

## 10. Sécurité — ce qui ne passe pas review

- Tout commit introduisant un secret en clair (git-secrets + husky + détection par GitHub native)
- Toute PR modifiant `CODEOWNERS`, `.github/workflows/*`, `src/middleware.ts`, `src/lib/security/*`, `src/lib/env.ts` sans sign-off explicite via checklist PR
- Toute PR ajoutant une dépendance avec un audit `high` ou `critical`
- Toute migration Supabase sans RLS activé sur les nouvelles tables

---

## 11. Cheatsheet commandes quotidiennes

```bash
# Voir l'état
/pr-status                              # dans Claude Code
gh issue list --state open              # issues ouvertes
gh pr list                              # PRs ouvertes

# Créer une issue PR-task
gh issue create --template pr-task.yml

# Créer une issue bug
gh issue create --template bug_report.yml

# Ouvrir une PR
gh pr create --template pull_request_template.md --base develop

# Reviewer une PR
gh pr view {number}
gh pr checkout {number}                 # clone localement pour tester
gh pr review {number} --approve
gh pr review {number} --request-changes --body "..."

# Merger
gh pr merge {number} --squash --delete-branch

# Labels
gh label list
gh pr edit {number} --add-label "priority:high"

# Audit conformité
/pr-audit                               # dans Claude Code
```

---

## 12. Divergences acceptables pour du solo

Ce workflow est calibré entreprise. En solo, certaines étapes peuvent être allégées **tant que le projet est perso** :

- ✅ Tu peux approuver tes propres PRs vers `develop` (pas `main`)
- ✅ Tu peux squasher directement sans review externe
- ✅ Tu peux sauter la branche `release/*` pour des bump de version patch
- ❌ Tu ne peux **jamais** push direct sur `main`
- ❌ Tu ne peux **jamais** ignorer la CI qui échoue
- ❌ Tu ne peux **jamais** merger une PR introduisant une dépendance payante sans updater le ROADMAP

Dès qu'une autre personne contribue : tout le workflow strict s'applique (review externe obligatoire, pas d'auto-approval).
