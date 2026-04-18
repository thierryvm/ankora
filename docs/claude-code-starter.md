# Starter prompt Claude Code — Ankora

Document à garder sous la main. Contient :

1. Le setup à faire une fois
2. Le prompt d'ouverture à coller au début de chaque session Claude Code
3. Les commandes fréquentes
4. Les règles de déblocage quand CC part en vrille

---

## 1. Setup à faire UNE fois

### 1.1 Installer les slash commands

```powershell
cd F:\PROJECTS\Apps\ankora
New-Item -ItemType Directory -Force -Path .claude\commands | Out-Null
Copy-Item docs\claude-slash-commands\pr-status.md    .claude\commands\
Copy-Item docs\claude-slash-commands\pr-start.md     .claude\commands\
Copy-Item docs\claude-slash-commands\pr-next.md      .claude\commands\
Copy-Item docs\claude-slash-commands\pr-audit.md     .claude\commands\
```

### 1.2 Configurer GitHub

```powershell
# Labels (50+ labels standardisés)
pwsh .github\scripts\setup-labels.ps1

# Milestones (1 par PR ROADMAP)
pwsh .github\scripts\setup-milestones.ps1
```

Vérifie ensuite que `gh auth status` est OK. Si pas connecté : `gh auth login`.

### 1.3 Activer la protection de branche `main`

Suivre `docs/github-workflow.md` §2.3.

---

## 2. Prompt d'ouverture — à coller au début de CHAQUE session CC

```
Lis CLAUDE.md puis docs/ROADMAP.md.

Confirme-moi en une phrase :
1. Position actuelle dans la séquence PR
2. Prochaine PR à lancer
3. Un blocker éventuel

Ne fais rien d'autre tant que je n'ai pas validé.
```

**Pourquoi ce prompt ?** Il force CC à charger tout le contexte projet (règles, ordre, contraintes budget) avant de toucher quoi que ce soit. Sans ça, CC pourrait improviser selon ses connaissances génériques.

---

## 3. Flow de travail type

### 3.1 Démarrer une nouvelle PR

```
/pr-next
```

→ CC te dit quelle est la prochaine PR selon ROADMAP.

```
/pr-start PR-B1
```

→ CC :

1. Vérifie les prérequis
2. Cherche / crée l'issue GitHub
3. Lit le prompt complet
4. Produit un récap pré-exécution
5. Attend ton 'go'

Tu valides avec simplement :

```
go
```

### 3.2 Pendant l'exécution

CC suit le prompt section par section. Si une question émerge :

- CC doit **stopper et demander** (règle CLAUDE.md §Orchestration)
- Si CC avance sans demander alors qu'il devrait → interromps avec :

```
Stop. Relis le prompt PR-{X}-*.md — tu es en train de sortir du scope déclaré. Cite-moi la section exacte du prompt qui autorise ce que tu es en train de faire.
```

### 3.3 Avant de pousser

```
/pr-audit
```

→ CC vérifie :

- Aucune dépendance payante ajoutée
- ROADMAP à jour
- Pas de `any` / `@ts-ignore`
- RLS activée sur nouvelles tables
- Env vars cohérentes entre `.env.example` et `src/lib/env.ts`
- Branche Git propre

### 3.4 Fin de PR

CC va :

- Produire `docs/prs/PR-{X}-report.md`
- Mettre à jour `docs/ROADMAP.md`
- Push la branche
- Ouvrir la PR avec template rempli
- Appliquer les labels
- Assigner la milestone

Tu n'as qu'à reviewer et merger.

---

## 4. Phrases de déblocage quand CC part en vrille

### "CC m'a sorti un truc hors scope"

```
Stop. Je reviewe ce que tu viens de faire. Liste-moi :
1. Les fichiers que tu as touchés dans les 5 derniers tool calls
2. Pour chacun, la ligne du prompt PR-{X} qui l'autorise
3. Les fichiers qui NE devraient PAS être touchés selon §1.4 "Fichiers à NE PAS toucher"

Ne modifie rien tant que je n'ai pas validé.
```

### "CC invente une solution au lieu de suivre le mockup"

```
Stop. Le prompt PR-3 §0 dit "Les 3 fichiers HTML sont la source de vérité". Tu es en train d'inventer. Relis le mockup et réécris selon ce qui est dans le HTML — pas selon ton style par défaut.
```

### "CC propose une dépendance payante en douce"

```
Stop. Tu viens d'ajouter {X} à package.json. Vérifie dans docs/ROADMAP.md §"Contrainte transverse : Budget 0 €" si c'est autorisé. Si ce n'est pas explicitement dans la liste autorisée, retire-le et propose une alternative 0 €.
```

### "CC oublie l'i18n et hardcode du FR"

```
Stop. Selon CLAUDE.md §Règles de code item 7, tous les messages UI sont en FR dans messages/fr-BE.json avec clés typées. Là tu as hardcodé "{chaîne}". Extrait-la dans les 5 locales et utilise t('…').
```

### "CC m'a fait un scope creep genre 'tant qu'on y est, je refactore aussi…'"

```
NON. Le scope de cette PR est strictement listé dans le prompt §1. Annule le refactor. S'il est pertinent, ouvre une issue GitHub avec le template pr-task et on le planifiera.
```

### "CC veut sauter un test parce que 'c'est trivial'"

```
Les quality gates du prompt (§0) sont bloquantes, pas décoratives. Aucun test n'est optionnel. Écris le test manquant.
```

### "CC veut merger sans le rapport final"

```
Le prompt demande explicitement un rapport docs/prs/PR-{X}-report.md (§17). Produis-le avant la PR — sinon le /pr-audit va échouer.
```

---

## 5. Commandes GitHub utiles (en dehors de CC)

```bash
# Vue d'ensemble
gh repo view --web                             # ouvre dans le browser
gh issue list --state open --label "pr:PR-B1"  # issues d'une PR
gh pr list --state open                        # PRs ouvertes
gh pr status                                   # mes PRs assignées

# Création rapide
gh issue create --template pr-task.yml         # issue PR-task
gh issue create --template bug_report.yml      # issue bug

# Review
gh pr view {N} --web                           # ouvre la PR dans le browser
gh pr checkout {N}                             # checkout local pour test
gh pr diff {N}                                 # voir le diff en terminal

# Merge (après review)
gh pr merge {N} --squash --delete-branch

# Emergency
gh pr close {N} --comment "Closing — out of scope, see #42"
```

---

## 6. Astuce gain de temps

Crée un alias PowerShell dans ton profil (`$PROFILE`) :

```powershell
function ankora {
  cd F:\PROJECTS\Apps\ankora
  claude-code .
}
```

Ensuite : `ankora` depuis n'importe où te met dans le projet et lance CC directement.

---

## 7. Si tu veux abandonner une PR en cours

CC a commencé une PR mais tu changes d'avis :

```bash
# Dans le terminal (en dehors de CC)
git checkout develop
git branch -D feature/pr-b1-bug-reporting        # supprime la branche locale
gh pr close {N} --comment "Postponed, see ROADMAP.md update"
gh issue close {M} --comment "Postponed"
```

Puis mets à jour `docs/ROADMAP.md` manuellement pour retirer le statut 🚧.

---

## 8. Résumé ultra-compressé (si tu n'as lu que ça)

1. **Début de session** : colle le prompt §2
2. **Nouvelle PR** : `/pr-start PR-X` → valide avec `go`
3. **Avant push** : `/pr-audit`
4. **CC déraille** : utilise les phrases §4
5. **En cas de doute** : relis `docs/ROADMAP.md` et `CLAUDE.md`

Le ROADMAP et le CLAUDE.md projet font loi. Les prompts PR-X sont le détail d'exécution. Les slash commands sont des raccourcis. Les templates GitHub formalisent le versioning.

Tout le reste, c'est du contexte.
