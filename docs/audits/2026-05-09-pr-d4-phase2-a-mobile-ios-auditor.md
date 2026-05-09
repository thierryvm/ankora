# Mobile iOS Auditor — PR-D4-PHASE2-A (2026-05-09)

**Branch:** `feat/atoms-tasks-6-18` (HEAD 4214281)
**Auditor:** mobile-ios-auditor (Safari iOS WebKit + Apple HIG)
**Verdict:** PASS_WITH_FINDINGS
**Counts:** P0: 3 | P1: 5

## P0 — iOS-critical (touch target + safe-area + auto-zoom)

| #        | File:line                     | Finding                                                                                                                                                                                                                                                   |
| -------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0-1** | `atoms.css:359` (.drw-input)  | `font-size: 14px` triggers Safari iOS auto-zoom on focus. **Fix** : `@media (max-width: 700px) { .drw-input { font-size: 16px; } }` ou base 16px.                                                                                                         |
| **P0-2** | `atoms.css:163` (.atm-chip-x) | `width:14px; height:14px` — 3× sous Apple HIG 44×44 minimum. Removable Chips intappable iPhone. **Fix** : `padding: 15px; margin: -15px` (visual unchanged, hit area 44×44).                                                                              |
| **P0-3** | `atoms.css:648` (.drw-footer) | Pas de `padding-bottom: env(safe-area-inset-bottom)`. Boutons "Enregistrer/Annuler" entrent en collision avec home indicator iPhone X+. **Fix** : `padding-bottom: max(14px, env(safe-area-inset-bottom))` + retirer `position: sticky` (flexbox suffit). |

## P1 — iOS-high (touch targets sub-44px)

| #    | File:line                               | Finding                                                                                                |
| ---- | --------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| P1-1 | `atoms.css:919-922` ThemeToggle         | `--sm: 28×28` + `--md: 36×36` < 44×44. Header consumer doit utiliser `lg` ou ajouter padding           |
| P1-2 | `atoms.css:855-857` Tabs `--sm`         | Effective tap height ~20px (line-height 12 + padding 4×2). Fix : `min-height: 36px` (sm) / `44px` (md) |
| P1-3 | `atoms.css:756-757` ColorPicker swatch  | 28×28 < 44. Fix : `min-width/height: 36px` ou `padding: 4px; box-sizing: content-box`                  |
| P1-4 | `atoms.css:793-794` IconPicker tile     | `height: 36px` < 44. Fix : `min-height: 44px`                                                          |
| P1-5 | `atoms.css:467-470` Drawer close button | 32×32 < 44 (primary escape affordance). Fix : `min-width/height: 44px`                                 |

## NOTE — JS bug pan-platform

**`Tabs.tsx:106`** — Missing space in className concat : `${isActive ? 'is-active' : ''}` → `atm-tabs-tabis-active` invalide → active tab CSS jamais appliqué. **Pattern identique au bug Drawer** Task 16. **FIXED inline cette session** (commit suivant Tabs).

## Other notable

- **PWA iOS** : `public/manifest.webmanifest` absent ; `apple-touch-icon.png` au mauvais path ; `apple-mobile-web-app-capable` meta absent. → Hors scope atoms PR-A, à tracker pour PR-B.
- **LangSwitcher dropdown close-outside** : `mousedown` sur Safari iOS peut ne pas fire sur éléments non-interactive (`<div>`, `<main>`). Fix : ajouter `touchstart` listener.
- **`-webkit-tap-highlight-color: transparent`** absent globalement → tap flash gray par défaut. Cosmetic.

## Decisions PR-A vs PR-B

**Reportés à PR-B/PR-D5** (atoms PR-A out of scope mobile fix) :

- P0-1 (drw-input font-size) — corriger en PR-B intégration AppShell
- P0-2 (chip-x touch target) — corriger en PR-D5 dashboard cockpit Surfaces 2/3 où Chips sont consommés
- P0-3 (drawer footer safe-area) — corriger en PR-B / PR-D5
- P1-1 → P1-5 (touch targets) — corriger en PR-B intégration finale

**Tracker dans rapport DoD §Concerns + briefs PR-B/PR-D5.**

## Verdict

PASS_WITH_FINDINGS — atoms PR-A merge-safe en tant que primitives. Aucun fix mobile inline pour cette PR (out of scope, doit être consolidé en PR-B/PR-D5 avec testing iPhone réel).
