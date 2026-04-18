# Ankora — create GitHub milestones for each ROADMAP PR
# Requires: gh CLI authenticated
# Usage: pwsh .github/scripts/setup-milestones.ps1

$ErrorActionPreference = 'Stop'

$repo = gh repo view --json nameWithOwner -q .nameWithOwner
Write-Host "Target repo: $repo" -ForegroundColor Cyan

$milestones = @(
  @{ title = 'PR-1bis — i18n routes privées';  description = 'Extraction i18n auth + app + onboarding. Prompt: prompts/PR-1bis-i18n-app.md' }
  @{ title = 'PR-2 — Traductions NL/EN/ES/DE'; description = 'Traductions des 4 locales non-FR. Prompt: prompts/PR-2-glossary-and-strategy.md' }
  @{ title = 'PR-B1 — Bug reporting MVP';      description = 'Capteur bugs + admin panel embryonnaire. Prompt: prompts/PR-B1-bug-reporting-mvp.md' }
  @{ title = 'PR-3 — Port mockups React';      description = 'Remplacement UI par design tokens + shadcn/ui. Prompt: prompts/PR-3-port-mockups-react.md' }
  @{ title = 'PR-F — Rétro-planning provisions'; description = 'Alertes J-N avant retrait d''épargne. Prompt: à produire' }
  @{ title = 'PR-B2a — Admin santé technique'; description = 'Partie 1/4 de l''admin panel complet.' }
  @{ title = 'PR-B2b — Admin santé produit';   description = 'Partie 2/4 de l''admin panel complet.' }
  @{ title = 'PR-B2c — Admin marketing';       description = 'Partie 3/4 de l''admin panel complet.' }
  @{ title = 'PR-B2d — Admin recommandations'; description = 'Partie 4/4 — moteur de règles (pas LLM).' }
)

# Fetch existing milestones once
$existing = gh api "repos/$repo/milestones" --paginate | ConvertFrom-Json | ForEach-Object { $_.title }
$existingSet = @{}
foreach ($t in $existing) { $existingSet[$t] = $true }

$created = 0
$skipped = 0

foreach ($m in $milestones) {
  if ($existingSet.ContainsKey($m.title)) {
    Write-Host "  = $($m.title) (exists)" -ForegroundColor Gray
    $skipped++
  } else {
    gh api --method POST "repos/$repo/milestones" `
      -f title="$($m.title)" `
      -f description="$($m.description)" `
      -f state='open' | Out-Null
    Write-Host "  + $($m.title)" -ForegroundColor Green
    $created++
  }
}

Write-Host "" -ForegroundColor White
Write-Host "Done. $created created, $skipped already existed." -ForegroundColor Cyan
