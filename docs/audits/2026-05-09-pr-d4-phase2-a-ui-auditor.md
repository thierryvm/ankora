# UI Audit — PR-D4-PHASE2-A atoms (2026-05-09)

**Branch:** `feat/atoms-tasks-6-18` (HEAD 4214281)
**Auditor:** ui-auditor (WCAG 2.2 AA + Tailwind 4 tokens)
**Verdict:** PASS_WITH_FINDINGS
**Counts:** P0: 0 | P1: 5 | P2: 7 | P3: 4

## Summary

11 atoms solides : focus rings cohérents (`var(--color-brand-600)`), tokens correctement utilisés, `prefers-reduced-motion` global respecté, semantic HTML majoritairement correct. 5 P1 a11y à corriger avant intégration prod.

## P1 — A11y critical

| #    | File:line                           | Issue                                                                                                                                                                                                                           |
| ---- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1-1 | `Drawer.tsx:108`                    | `<label>` sans `htmlFor`/`id` sur input — screen readers ne peuvent pas associer (WCAG 1.3.1, 4.1.2)                                                                                                                            |
| P1-2 | `Drawer.tsx:108-114`                | Error span pas lié via `aria-describedby` — erreurs invisibles AT (WCAG 4.1.3)                                                                                                                                                  |
| P1-3 | `atoms.css` `.drw-*-btn`            | Pas de `:focus-visible` explicite sur boutons internes Drawer (Save/Cancel/Delete/seg/cat)                                                                                                                                      |
| P1-4 | `Tabs.tsx:106`                      | **Bug déterministe** — `${isActive ? 'is-active' : ''}` sans espace → classe `atm-tabs-tabis-active` invalide. Active styling cassé. **Pattern identique au bug Drawer Task 16.** ✅ FIXED dans cette session (commit suivant). |
| P1-5 | `ColorPicker.tsx`, `IconPicker.tsx` | `role="radiogroup"` sans Arrow keys handler — keyboard nav cassée (WCAG 2.1.1). Pattern existe dans `Tabs.tsx`, à factoriser en hook `useRovingTabIndex`.                                                                       |

## P2 — A11y high / theme

| #    | File:line               | Issue                                                                                    |
| ---- | ----------------------- | ---------------------------------------------------------------------------------------- |
| P2-1 | `Drawer.tsx:358+`       | Pas de focus trap complet — Tab peut s'échapper du dialog modal                          |
| P2-2 | `Drawer.tsx:528`        | `aria-hidden={!open}` sur root avec children focusables = anti-pattern. Utiliser `inert` |
| P2-3 | `atoms.css:676`         | `.drw-btn-primary { color: #042f2e }` hardcoded — utiliser `var(--color-brand-950)`      |
| P2-4 | `atoms.css:66, 94, 702` | `color: #fff` hardcoded sur primary/destructive — utiliser token sémantique              |
| P2-5 | `atoms.css:919-922`     | ThemeToggle `--sm: 28×28`, `--md: 36×36` — touch target < 44×44 (WCAG 2.5.8)             |
| P2-6 | `atoms.css:153-166`     | `.atm-chip-x` 14×14 — touch target way < 44×44 (WCAG 2.5.5)                              |
| P2-7 | `LangSwitcher.tsx`      | Listbox sans Arrow/Home/End nav (WCAG 2.1.1)                                             |

## P3 — Semantic / responsive / theme

| #    | File:line           | Issue                                                                     |
| ---- | ------------------- | ------------------------------------------------------------------------- |
| P3-1 | `Card.tsx:43`       | Card title hardcoded `<h3>` — devrait accepter `headingLevel` prop        |
| P3-2 | `page.tsx:47-48`    | Inline `style` objects au lieu de tokens Tailwind                         |
| P3-3 | `atoms.css:727`     | Drawer mobile `top: 8px` — manque `env(safe-area-inset-top)` compensation |
| P3-4 | `atoms.css:725-726` | `border-radius: 14px` hardcoded — utiliser `var(--radius-xl)`             |

## Token hygiene

Hardcoded values to fix:

- `#fff` x3 → `white` ou token sémantique (lignes 66, 94, 702)
- `#042f2e` → `var(--color-brand-950)` (ligne 676)
- `14px` border-radius → `var(--radius-xl)` (ligne 725-726)

Tous les autres `var(--color-*)` corrects. Dark theme parity OK (tokens redéclarés sous `[data-theme='dark']`).

## Decisions PR-D4-PHASE2-A

- **P1-4 Tabs bug** : FIXED inline cette session (pattern array.filter.join, identique fix Drawer Task 16).
- **P1-1, P1-2, P1-3, P1-5, P2-_, P3-_** : déférés en PR-B/PR-D5 (hors scope atoms PR-A, à tracker dans rapport DoD §Concerns).
- **Tech debt connexe** : introduire utilitaire `cn()` style shadcn/clsx dans `lib/utils.ts` pour éviter la duplication des patterns className concat (root cause du bug Tabs+Drawer).
