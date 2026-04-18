---
description: Lance l'exécution d'une PR en suivant strictement son prompt. Usage — /pr-start PR-B1
argument-hint: <PR-ID> (ex: PR-B1, PR-3, PR-1bis)
---

Argument reçu : `$ARGUMENTS`

## Étape 1 — Vérifier le ROADMAP

Lis `docs/ROADMAP.md` §"Ordre d'exécution des PR techniques".

- Confirme que la PR `$ARGUMENTS` existe dans le tableau.
- Vérifie que **toutes les PR en amont** (colonne gauche) sont marquées ✅ mergée.
- Si une PR amont n'est pas mergée : **STOP**, affiche à Thierry :
  > "⚠️ `$ARGUMENTS` ne peut pas démarrer : `PR-X` n'est pas encore mergée (prérequis). Veux-tu que je lance `PR-X` à la place ?"
  > Puis attends sa réponse.

## Étape 2 — Charger le prompt

Lis `prompts/$ARGUMENTS-*.md` (glob sur le préfixe).

- Si 0 fichier match : affiche "Prompt introuvable pour `$ARGUMENTS`. Fichiers disponibles dans `prompts/` : …" et stoppe.
- Si plusieurs match : liste-les et demande à Thierry de clarifier.

## Étape 3 — Vérifier l'issue GitHub liée

Cherche dans les issues GitHub ouvertes (via `gh issue list --label "pr:$ARGUMENTS" --state open`) :

- Si aucune issue : propose d'en créer une avec `gh issue create --template pr-task.md` avant de continuer
- Si 1+ issue : note son numéro pour référence dans les commits (`Closes #N`)

## Étape 4 — Synthèse pré-exécution

Avant d'écrire une seule ligne de code, produis un récap concis à Thierry :

1. **PR** : nom + ID
2. **Issue GitHub liée** : numéro + titre
3. **Branche Git** : nom proposé (ex: `feature/pr-b1-bug-reporting`)
4. **Prérequis vérifiés** : liste cochée
5. **Scope** : combien de fichiers créés / modifiés (compter depuis le prompt)
6. **Dépendances npm ajoutées** : liste
7. **Migrations Supabase** : oui/non + fichier(s)
8. **Quality gates** : liste des commandes qui doivent passer
9. **Estimation effort** : nombre de commits attendus
10. **Risques identifiés** : liste courte

Termine par : "Prêt à exécuter. Valide avec 'go' pour commencer, ou dis-moi ce que tu veux ajuster."

**Attends le 'go' explicite de Thierry avant de toucher un seul fichier.**

## Étape 5 — Exécution stricte

Une fois le 'go' reçu :

- Crée la branche Git : `git checkout -b feature/pr-$ARGUMENTS-{slug}` depuis `develop`
- Respecte l'ordre des sections du prompt (§1, §2, …)
- Commits conventional selon la liste §"Commits attendus" du prompt
- Chaque commit inclut `Refs #{issue-number}` en footer
- **Jamais** de scope creep : si un besoin émerge, demande avant d'agir
- Lance les agents `.claude/agents/` quand leur domaine est touché (cf. `CLAUDE.md` §Workflow agents)

## Étape 6 — Rapport final + Pull Request

1. Produis `docs/prs/$ARGUMENTS-report.md` selon le template du prompt (§Rapport final attendu)
2. Mets à jour `docs/ROADMAP.md` : passe la PR de 📋 à ✅ dans le tableau d'ordre d'exécution
3. Push la branche : `git push origin feature/pr-$ARGUMENTS-{slug}`
4. Ouvre la PR via `gh pr create --template pull_request_template.md --base develop --title "{conventional title}"` en remplissant les sections
5. Lie la PR à l'issue : "Closes #{issue-number}" dans le body
6. Applique les labels : `pr:$ARGUMENTS`, `status:review-needed`, `type:{feat|fix|refactor}`
7. Assigne la milestone : `{PR-X}-release`

Termine en affichant l'URL de la PR à Thierry.
