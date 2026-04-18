# Slash commands Claude Code pour Ankora

Ce dossier contient 4 commandes custom pour Claude Code terminal qui pilotent l'exécution des PR de manière reproductible.

## Installation

Claude Code lit les commandes depuis `.claude/commands/`. Les fichiers de ce dossier doivent y être copiés.

**PowerShell (Windows)** :

```powershell
cd F:\PROJECTS\Apps\ankora
New-Item -ItemType Directory -Force -Path .claude\commands | Out-Null
Copy-Item docs\claude-slash-commands\pr-status.md    .claude\commands\
Copy-Item docs\claude-slash-commands\pr-start.md     .claude\commands\
Copy-Item docs\claude-slash-commands\pr-next.md      .claude\commands\
Copy-Item docs\claude-slash-commands\pr-audit.md     .claude\commands\
```

**Bash (WSL / macOS / Linux)** :

```bash
cd ~/PROJECTS/Apps/ankora   # adapter le chemin
mkdir -p .claude/commands
cp docs/claude-slash-commands/pr-{status,start,next,audit}.md .claude/commands/
```

Après copie, redémarre Claude Code — les commandes seront disponibles via `/pr-status`, `/pr-start`, `/pr-next`, `/pr-audit`.

## Commandes disponibles

| Commande            | Description                                                       |
| ------------------- | ----------------------------------------------------------------- |
| `/pr-status`        | Affiche l'état actuel du projet (PR mergées, en cours, prochaine) |
| `/pr-next`          | Détermine automatiquement la prochaine PR à exécuter              |
| `/pr-start <PR-ID>` | Lance une PR en suivant strictement son prompt (avec garde-fous)  |
| `/pr-audit`         | Audit de conformité (budget 0 €, sécurité, cohérence ROADMAP)     |

## Workflow type

```
# Début de session
/pr-status           # voir où on en est
/pr-next             # confirme la prochaine PR
/pr-start PR-B1      # lance avec validation à chaque étape

# Pendant le dev
# ... Claude Code suit le prompt ...

# Avant merge
/pr-audit            # vérifie qu'aucune dépendance payante n'a été ajoutée
```

## Pourquoi ces commandes ?

Sans ces slash commands, chaque session CC doit être relancée avec un long prompt type "Lis le ROADMAP, trouve la prochaine PR, lis le prompt, vérifie les prérequis...". Avec, c'est `/pr-start PR-B1` et tout se fait automatiquement.

Les commandes **forcent** la lecture du ROADMAP et du prompt avant toute exécution — impossible pour Claude Code d'improviser ou de sauter une étape.
