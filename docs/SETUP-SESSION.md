# Setup session du 18 avril 2026 — checklist novice

Document temporaire pour piloter la première exécution du tooling GitHub.
À supprimer une fois terminé (voir §7).

---

## Avant de commencer — ouvre le terminal VSCode

Dans VSCode avec le projet Ankora ouvert :

- `Ctrl + ù` (ou `Ctrl + ö` selon clavier BE/FR) → ouvre le terminal intégré
- Ou : menu **Terminal → New Terminal**
- Vérifie que tu es dans `F:\PROJECTS\Apps\ankora` (affiché dans le prompt)
- Vérifie que le shell est **PowerShell 7** (pas CMD, pas Git Bash). Bandeau en bas à droite du terminal.

---

## 1. Vérifications préliminaires (aucun risque — lecture seule)

Colle ces commandes UNE PAR UNE. Regarde la sortie avant de passer à la suivante.

```powershell
# 1.1 — Branche active (doit dire "feat/i18n-socle")
git branch --show-current

# 1.2 — GitHub CLI authentifié ?
gh auth status
```

**Si `gh auth status` dit "not logged in"** :

```powershell
gh auth login
# → choisis : GitHub.com → HTTPS → Y (authenticate Git) → Login with browser
# → copie le code affiché, colle-le dans la fenêtre qui s'ouvre, autorise
```

```powershell
# 1.3 — Compte GitHub correct ?
gh api user --jq .login
# → doit renvoyer "thierryvm"
```

---

## 2. Nettoyage du dossier vide

```powershell
# Supprimer le dossier docs/claude-slash-commands/ qui est vide
if (Test-Path docs\claude-slash-commands) {
  Remove-Item docs\claude-slash-commands -Force -Recurse
  Write-Host "✓ Dossier supprimé" -ForegroundColor Green
} else {
  Write-Host "= Déjà absent" -ForegroundColor Gray
}
```

---

## 3. Créer la branche de tooling

```powershell
# 3.1 — Crée la branche chore/dev-tooling depuis le HEAD actuel
git checkout -b chore/dev-tooling

# 3.2 — Confirme qu'on est bien dessus
git branch --show-current
# → doit afficher "chore/dev-tooling"
```

**Important** : ton WIP i18n (messages/, prompts/, src/i18n/, etc.) reste intact dans le working tree. Il ne sera PAS committé sur cette branche. On le retrouvera sur feat/i18n-socle en étape 6.

---

## 4. Ajouter SEULEMENT les fichiers de tooling (pas l'i18n)

```powershell
# 4.1 — Staging ciblé
git add .gitignore
git add CLAUDE.md
git add docs/ROADMAP.md
git add .claude/commands/
git add .github/ISSUE_TEMPLATE/pr-task.yml
git add .github/labels.yml
git add .github/scripts/
git add .github/workflows/auto-label.yml
git add docs/claude-code-starter.md
git add docs/github-workflow.md
git add docs/SETUP-SESSION.md   # ce fichier-ci

# 4.2 — Vérifie le staging (doit contenir UNIQUEMENT les fichiers ci-dessus)
git diff --cached --stat

# 4.3 — Vérifie aussi qu'il ne reste pas de surprise
git status --short
```

Dans la sortie de `git status --short`, tu dois voir :

- En **vert** (A/M) : seulement les fichiers staged ci-dessus
- En **rouge** (??/M) : tout le reste (WIP i18n) — c'est normal, on ne le touche pas

**Si un fichier i18n s'est staged par erreur** :

```powershell
git reset HEAD -- <chemin/fichier>
```

---

## 5. Commit propre

```powershell
git commit -m "chore(tooling): PR orchestration system + budget 0 EUR rules

- Add .claude/commands/ slash commands (pr-status, pr-start, pr-next, pr-audit)
- Add .github/labels.yml (50+ labels) + setup-labels.ps1
- Add setup-milestones.ps1 (9 milestones aligned with ROADMAP)
- Add auto-label workflow (branch + title detection)
- Add pr-task issue template for ROADMAP PR tracking
- Add docs/github-workflow.md (enterprise workflow documentation)
- Add docs/claude-code-starter.md (CC session starter guide)
- CLAUDE.md: add orchestration rules + budget 0 EUR constraint
- ROADMAP.md: lock PR execution order, add PR-B1/B2/F scope
- Harden .gitignore (Claude Code runtime files)
"
```

Si le hook pre-commit se plaint (lint, format...), lance d'abord `npm run format` puis recommence.

---

## 6. Lancer les scripts de setup GitHub

Ces scripts tournent maintenant (avant le push) parce qu'ils sont **idempotents** : tu peux les relancer sans risque, ils ne doublonnent rien.

```powershell
# 6.1 — Créer les labels (50+ labels standardisés)
pwsh .github\scripts\setup-labels.ps1
# → sortie type : "+ label-name" (créé) ou "~ label-name" (mis à jour)

# 6.2 — Créer les milestones (1 par PR de la ROADMAP)
pwsh .github\scripts\setup-milestones.ps1
# → sortie type : "+ PR-1bis — i18n routes privées" ou "= PR-1bis (exists)"
```

**Si erreur "execution policy"** :

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
# Confirme avec Y
# Puis relance le script
```

---

## 7. Push + ouverture de la PR

```powershell
# 7.1 — Push de la branche
git push -u origin chore/dev-tooling

# 7.2 — Ouvre la PR via gh CLI
gh pr create `
  --title "chore(tooling): PR orchestration + budget 0 EUR" `
  --body "Ajoute tout le système d'orchestration des PR : slash commands Claude Code, labels, milestones, auto-label workflow, documentation workflow + starter Claude Code.`n`nPrépare le terrain pour PR-1bis, PR-2, PR-B1, PR-3, PR-F, PR-B2.`n`nVoir docs/github-workflow.md et docs/claude-code-starter.md." `
  --base main `
  --head chore/dev-tooling `
  --label "type:chore" `
  --label "area:ci"
```

→ Copie l'URL affichée et ouvre-la dans ton navigateur.

---

## 8. Activer la protection de la branche `main` (via GitHub web UI)

**Pas possible via `gh` CLI pour un repo gratuit + solo dev** → il faut passer par l'UI web.

1. Ouvre `https://github.com/thierryvm/ankora/settings/branches`
2. Clique **Add branch protection rule**
3. **Branch name pattern** : `main`
4. Coche :
   - [x] **Require a pull request before merging**
     - [x] Require approvals : `0` (solo dev — pas d'autre reviewer)
     - [x] Dismiss stale pull request approvals when new commits are pushed
   - [x] **Require status checks to pass before merging**
     - [x] Require branches to be up to date before merging
     - Ajoute les checks : `ci`, `typecheck`, `test`, `build` (selon ce qui existe dans `.github/workflows/ci.yml`)
   - [x] **Require conversation resolution before merging**
   - [x] **Require linear history** (force squash/rebase, empêche les merges fouilloirs)
   - [x] **Do not allow bypassing the above settings** (même toi ne peux pas bypasser)
5. Clique **Create**

---

## 9. Merger la PR chore/dev-tooling

Dans l'UI GitHub sur la page de ta PR :

1. Vérifie que les checks CI passent (attends le vert)
2. Clique **Squash and merge** (pas "Create a merge commit")
3. Confirme le message (garde le message de commit qu'on a écrit)
4. Clique **Confirm squash and merge**
5. Clique **Delete branch** (supprime `chore/dev-tooling` côté remote — propre)

---

## 10. Retour sur feat/i18n-socle + sync

```powershell
# 10.1 — Retour sur la branche i18n
git checkout feat/i18n-socle

# 10.2 — Suppression de la branche locale chore/dev-tooling (mergée)
git branch -D chore/dev-tooling

# 10.3 — Récupère main à jour
git fetch origin main
git merge origin/main
# → il y aura des conflits sur .gitignore / CLAUDE.md / docs/ROADMAP.md
# → VSCode ouvre les fichiers en conflit
# → dans ces 3 fichiers, tu veux garder la version de main (= celle qu'on vient de merger)
# → bouton "Accept Incoming" dans VSCode, ou résolution manuelle
# → puis git add + git commit

# 10.4 — Vérifie que le WIP i18n est toujours là
git status --short | head -30
# → tu dois voir toutes les modifs/nouveaux fichiers i18n
```

---

## 11. Supprimer CE fichier (setup terminé)

```powershell
git rm docs/SETUP-SESSION.md
git commit -m "chore: remove setup session doc"
```

Ce fichier est temporaire — une fois la session passée, il ne sert plus.

---

## 12. En cas de panique — ABORT propre

Si à n'importe quelle étape tu veux tout annuler :

```powershell
# Annule les modifications staged mais pas committed
git reset HEAD

# Annule la création de branche
git checkout feat/i18n-socle
git branch -D chore/dev-tooling  # marche seulement si pas de commit non mergé

# Si tu as déjà committé sur chore/dev-tooling mais pas encore pushé
git checkout chore/dev-tooling
git reset --soft HEAD~1  # enlève le commit, garde le staging
git reset HEAD            # enlève le staging, garde les fichiers

# Rien n'a été poussé → rien n'est publié → tu peux tout refaire
```

**Tant que tu n'as pas fait `git push`, tout est réversible localement.**

---

## Résumé ultra-compressé (si tu veux enchaîner sans lire le détail)

```powershell
# Dans F:\PROJECTS\Apps\ankora avec terminal PowerShell
gh auth status
if (Test-Path docs\claude-slash-commands) { Remove-Item docs\claude-slash-commands -Force -Recurse }
git checkout -b chore/dev-tooling
git add .gitignore CLAUDE.md docs/ROADMAP.md .claude/commands/ .github/ISSUE_TEMPLATE/pr-task.yml .github/labels.yml .github/scripts/ .github/workflows/auto-label.yml docs/claude-code-starter.md docs/github-workflow.md docs/SETUP-SESSION.md
git diff --cached --stat
# >>> STOP : regarde la sortie, confirme avec Claude avant de committer <<<
```

Fais-moi un screenshot ou copie-colle la sortie de `git diff --cached --stat` avant de committer — je valide que rien d'i18n ne s'est glissé dedans.
