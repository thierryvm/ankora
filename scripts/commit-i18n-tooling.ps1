# ============================================================================
# Chore : Claude i18n tooling (skill + agent + slash command)
# À lancer depuis PowerShell dans F:\PROJECTS\Apps\ankora
# Prérequis : PR #34 (feat/i18n/operation-babel) mergée dans main
# ============================================================================

$ErrorActionPreference = 'Stop'
Set-Location F:\PROJECTS\Apps\ankora

Write-Host "== Étape 0 : clean locks + kill node zombies ==" -ForegroundColor Cyan
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
if (Test-Path .git\index.lock) { Remove-Item .git\index.lock -Force; Write-Host "  lock supprimé" }

Write-Host "`n== Étape 1 : sync main ==" -ForegroundColor Cyan
git fetch origin
git checkout main
git pull --ff-only origin main

Write-Host "`n== Étape 2 : branche chore/claude-i18n-tooling ==" -ForegroundColor Cyan
$exists = git branch --list chore/claude-i18n-tooling
if ($exists) {
    git checkout chore/claude-i18n-tooling
} else {
    git checkout -b chore/claude-i18n-tooling
}

Write-Host "`n== Étape 3 : staging des 3 fichiers i18n tooling ==" -ForegroundColor Cyan
git add `
  .claude/skills/i18n-translator/SKILL.md `
  .claude/agents/i18n-auditor.md `
  .claude/commands/i18n-audit.md

Write-Host "`n== Étape 4 : contrôle visuel ==" -ForegroundColor Cyan
git status --short
Write-Host ""
git diff --cached --stat

Write-Host "`n== Étape 5 : commit ==" -ForegroundColor Cyan
$msg = @"
chore(claude): add i18n tooling (skill + agent + slash command)

- .claude/skills/i18n-translator/SKILL.md: methodology for multi-locale work
- .claude/agents/i18n-auditor.md: audit-only agent (parity, placeholders, residuals, email-as-keyword)
- .claude/commands/i18n-audit.md: /i18n-audit slash command for quick CI-style checks

Self-contained tooling versioned with the repo so Claude Code sessions
share the same i18n contract as Cowork planning sessions.

Refs: post-Wave 1.5 Operation Babel
"@
git commit -m $msg

Write-Host "`n== Étape 6 : push + PR ==" -ForegroundColor Cyan
git push -u origin chore/claude-i18n-tooling

$prBody = @"
## Contexte
Post-Wave 1.5 Opération Babel. Durant la Wave, le skill i18n-translator vivait dans mon répertoire global Cowork (hors repo) — inaccessible à Claude Code Terminal sur Ankora.

Ce chore versionne la méthodologie i18n dans le repo pour que toutes les sessions (Cowork, Claude Code, agents spawned) partagent le même contrat.

## Changements
- **skill** ` .claude/skills/i18n-translator/SKILL.md ` : workflow 5 étapes, règles par locale, don't-translate, checklist livraison
- **agent** ` .claude/agents/i18n-auditor.md ` : auditeur read-only, vérifie parité clés / placeholders / résidus FR / pattern email-as-keyword / metadata locale-aware
- **slash command** ` /i18n-audit ` : audit rapide en 7 sections avec tableau synthèse

## Pas de code applicatif touché
Tout est dans ` .claude/ ` — aucune implication runtime, CI, ou sécurité.

## Risque résiduel
Nul. Tooling uniquement.
"@

gh pr create `
  --base main `
  --title "chore(claude): add i18n tooling (skill + agent + slash command)" `
  --body $prBody

Write-Host "`nDONE." -ForegroundColor Green
