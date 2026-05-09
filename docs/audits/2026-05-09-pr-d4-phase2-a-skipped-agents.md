# Agents QA SKIPPED — PR-D4-PHASE2-A (2026-05-09)

Per garde-fou orchestration §13, deux agents sont N/A pour cette PR. Documentation explicite des raisons :

## dashboard-ux-auditor — N/A

**Raison** : PR-D4-PHASE2-A livre les 11 atoms primitifs + Hamilton helper + route playground interne dev-only. **Aucun dashboard utilisateur** (`src/app/[locale]/app/**`) n'est touché par cette PR.

Le dashboard cockpit complet (Surface 1 HeroWaterfall + 6 composants) est livré en **PR-D4-PHASE2-C**. C'est à ce moment-là que `dashboard-ux-auditor` devra être lancé pour valider :

- Hierarchie visuelle Hero waterfall
- Discoverability des actions
- Patterns de feedback Monarch-level
- Cohérence ADR-009 (3 concepts UX Reste disponible / Reste à vivre / Capacité d'épargne réelle)

## admin-dashboard-auditor — N/A

**Raison** : Cette PR ne touche pas l'admin panel (`src/app/[locale]/admin/**`). Les atoms ThemeToggle + LangSwitcher seront _consommés_ par `AdminTopbar` en PR-D4-PHASE2-B (AppShell + RBAC), mais aucun admin component n'est créé/modifié dans PR-A.

L'audit admin sera fait en **PR-D4-PHASE2-B** au moment où :

- `requireAdmin()` helper RBAC est créé
- Nav conditionnelle `isAdmin` est wirée
- Admin panel V1 est intégré (Santé technique + Santé produit + Acquisition + Recommandations)

## Decision

Ces 2 skips sont consignés dans le rapport DoD final §Agents QA exécutés. Aucune régression d'audit possible puisque les surfaces concernées n'existent pas encore dans cette PR.
