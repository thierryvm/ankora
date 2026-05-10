# Mobile-iOS Findings Tracker — PR-D4-PHASE2-A §C6

**Date** : 2026-05-10
**Source** : `docs/prs/PR-D4-PHASE2-A-report.md` §C6 + `docs/audits/2026-05-09-pr-d4-phase2-a-mobile-ios-auditor.md`
**Sub-task C** : PR-D4 stabilization triage (chore/post-pr-d4-stabilization)

## Classification

Tous les findings P0/P1 sont **playground-scoped pour PR-D4-PHASE2-A** (atoms primitives consommés uniquement par les démos `/[locale]/design-playground/`). Ils deviennent **app-wide à partir de PR-D4-PHASE2-B (AppShell) et PR-D4-PHASE2-C/D5** (Surfaces user/admin).

→ Aucun escalade @thierry nécessaire (pas de P0 leak hors playground sur cette PR).

## Issues GitHub créées (10 au total)

### Sub-task B — Webkit hydration timing (1)

| #                                                      | Title                                                                   | Priority | Defer to |
| ------------------------------------------------------ | ----------------------------------------------------------------------- | -------- | -------- |
| [#148](https://github.com/thierryvm/ankora/issues/148) | e2e: cookies-consent + error-boundaries WebKit hydration timing pattern | p3       | dédiée   |

### Sub-task C — Mobile-iOS findings (9)

| #                                                      | Title                                                                                    | Priority | Defer to |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------- | -------- | -------- |
| [#149](https://github.com/thierryvm/ankora/issues/149) | BUG-iOS-011: iPhone SE landing overflow-x-clip regression                                | p2       | PR-D5    |
| [#150](https://github.com/thierryvm/ankora/issues/150) | [PR-D5] Drawer input font-size 14px triggers iOS Safari auto-zoom                        | p0       | PR-D5    |
| [#151](https://github.com/thierryvm/ankora/issues/151) | [PR-D5] Chip remove button 14×14 below Apple HIG 44×44 touch target                      | p0       | PR-D5    |
| [#152](https://github.com/thierryvm/ankora/issues/152) | [PR-D5] Drawer footer collides with iPhone X+ home indicator (no safe-area-inset-bottom) | p0       | PR-D5    |
| [#153](https://github.com/thierryvm/ankora/issues/153) | [PR-B] ThemeToggle sm/md sub-44×44 touch target                                          | p1       | PR-B     |
| [#154](https://github.com/thierryvm/ankora/issues/154) | [PR-D5] Tabs sm size effective tap height ~20px (sub-44×44)                              | p1       | PR-D5    |
| [#155](https://github.com/thierryvm/ankora/issues/155) | [PR-D5] ColorPicker swatches 28×28 sub-44×44 touch target                                | p1       | PR-D5    |
| [#156](https://github.com/thierryvm/ankora/issues/156) | [PR-D5] IconPicker tile height 36px sub-44×44                                            | p1       | PR-D5    |
| [#157](https://github.com/thierryvm/ankora/issues/157) | [PR-D5] Drawer close button 32×32 sub-44×44 (primary escape affordance)                  | p1       | PR-D5    |

## Labels créés en bonus

Pour cohérence convention (`area:*` + `priority:*` déjà utilisés pour `area:auth/dashboard/admin/...` + nouveau pattern `priority:*`) :

- `area:e2e` — End-to-end tests (Playwright)
- `area:mobile-ios` — Mobile iOS Safari WebKit
- `priority:p0` — Critical / blocker (rouge)
- `priority:p1` — High priority (orange)
- `priority:p2` — Medium priority (jaune)
- `priority:p3` — Low priority / nice-to-have (gris)

## Décision

- **Pas de code change Sub-task C** : juste tagging + référence cross-doc.
- **PR-B (AppShell)** : devra fixer #153 (ThemeToggle hit target) avant intégration header.
- **PR-D4-PHASE2-C / PR-D5** : devra fixer #150-152 + #154-157 + #149 avant merge cockpit + dashboard mobile UX.
- **Issue #148 (webkit hydration)** : PR dédiée séparée — root cause hunt > 30min, hors scope D4/D5.
