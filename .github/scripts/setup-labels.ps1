# Ankora — sync GitHub labels from .github/labels.yml
# Requires: gh CLI authenticated (gh auth login)
# Usage: pwsh .github/scripts/setup-labels.ps1

$ErrorActionPreference = 'Stop'

$repo = gh repo view --json nameWithOwner -q .nameWithOwner
Write-Host "Target repo: $repo" -ForegroundColor Cyan

# Parse labels.yml (simple YAML — no nested lists)
$labelsFile = Join-Path $PSScriptRoot '..\labels.yml'
if (-not (Test-Path $labelsFile)) {
  Write-Error "labels.yml not found at $labelsFile"
  exit 1
}

$labels = @()
$current = $null
Get-Content $labelsFile | ForEach-Object {
  $line = $_.TrimEnd()
  if ($line -match '^- name:\s*["'']?(.+?)["'']?$') {
    if ($current) { $labels += $current }
    $current = @{ name = $matches[1]; color = ''; description = '' }
  } elseif ($line -match '^\s+color:\s*["'']?(.+?)["'']?$' -and $current) {
    $current.color = $matches[1]
  } elseif ($line -match '^\s+description:\s*["'']?(.+?)["'']?$' -and $current) {
    $current.description = $matches[1]
  }
}
if ($current) { $labels += $current }

Write-Host "Found $($labels.Count) labels to sync" -ForegroundColor Cyan

# Fetch existing labels once
$existing = gh label list --json name --limit 200 | ConvertFrom-Json | ForEach-Object { $_.name }
$existingSet = @{}
foreach ($n in $existing) { $existingSet[$n] = $true }

$created = 0
$updated = 0

foreach ($lbl in $labels) {
  $name = $lbl.name
  $color = $lbl.color
  $desc = $lbl.description

  if ($existingSet.ContainsKey($name)) {
    gh label edit $name --color $color --description $desc | Out-Null
    Write-Host "  ~ $name" -ForegroundColor Yellow
    $updated++
  } else {
    gh label create $name --color $color --description $desc | Out-Null
    Write-Host "  + $name" -ForegroundColor Green
    $created++
  }
}

Write-Host "" -ForegroundColor White
Write-Host "Done. $created created, $updated updated." -ForegroundColor Cyan
