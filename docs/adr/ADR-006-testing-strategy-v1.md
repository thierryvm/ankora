# ADR-006 — Testing strategy v1.0

- **Status** : Accepted
- **Date** : 2026-04-26
- **Deciders** : @thierry, @cowork
- **Tags** : `quality`, `testing`, `architecture`, `governance`
- **Glossaire des handles** (@cowork, @cc-design, @cc-ankora, @thierry) — voir source canonique : [`../design/trio-agents.md`](../design/trio-agents.md).

---

## Context and Problem Statement

Ankora est un cockpit financier personnel qui manipule des montants en euros, des projections cashflow, et des données utilisateur sensibles (RLS Supabase, GDPR strict). À J+12 semaines de la cible v1.0 publique, l'état des tests est :

- ✅ Vitest unit tests sur le domain (242 tests, couverture ≥ 90% lignes / ≥ 85% branches)
- ✅ Playwright E2E avec scope limité (smoke tests parcours critiques)
- ✅ Lighthouse CI (perf + a11y + SEO + best practices)
- ✅ Agents QA `.claude/agents/` (financial-formula-validator, rls-flow-tester, ui-auditor, dashboard-ux-auditor, admin-dashboard-auditor, etc.) — audits ponctuels pré-merge

Ce qui **manque** pour garantir la qualité bout-en-bout d'un produit financier consumer :

1. **Property-based testing** sur les calculs Decimal.js du domain (1000+ cas générés vs cas connus uniquement)
2. **Visual regression testing** : Playwright snapshots à 3 viewports × 2 thèmes sur chaque composant et chaque section dashboard
3. **Tests CRUD end-to-end avec Supabase test instance** : intégrité data flow enveloppes → provisions affectées → réserve libre → cashflow waterfall + health score
4. **Tests auth flows exhaustifs** : signup, login, logout, MFA TOTP, reset password, OAuth Google, session refresh, RLS cross-user
5. **Accessibilité automatisée route-by-route** : `axe-core` injecté dans chaque test Playwright (échec si violation WCAG AA)
6. **Mutation testing** : Stryker pour mesurer la qualité réelle des tests (90% de couverture ne garantit pas que les tests détectent les bugs)

Sans ces couches, on shippe un produit financier sur la confiance plutôt que sur la preuve, et on accumule une dette de test qui se paie de plus en plus cher à mesure que `src/` grandit. Le risque concret : une régression silencieuse sur un calcul de provision, une data leak RLS cross-user, un rendu cassé dark mode mobile détecté seulement par @thierry en prod. Tous ces risques sont évitables avec une stratégie phasée et budgetable.

## Decision Drivers

- **Intégrité financière non négociable** : tout montant affiché doit être prouvable mathématiquement, pas approximé. Les hallucinations math (décimales perdues, arrondis incorrects, signes inversés) sont inacceptables sur un produit qui gère le cashflow personnel d'utilisateurs.
- **Prévention de la régression visuelle** : 8 sections dashboard + 4 surfaces (Landing, User Dashboard, Onboarding, Admin) × 3 viewports × 2 thèmes = 48+ rendus à protéger. Un seul rendu cassé en prod = perte de confiance utilisateur.
- **Sécurité par construction** : auth flows + RLS testés exhaustivement, pas par échantillonnage. Une faille RLS qui laisse l'utilisateur A voir les enveloppes de l'utilisateur B = incident GDPR + perte de licence FSMA-compatible.
- **Accessibilité WCAG AA verifiable** : promesse publique sur la landing, doit être prouvable sur chaque route, pas auditée artisanalement.
- **Budget 0 €** : aucune dépendance payante. Tous les outils retenus doivent être open-source ou inclus dans la stack actuelle.
- **Compatibilité stack existante** : Vitest 4 + Playwright + Lighthouse CI déjà en place. Tout ajout doit s'intégrer sans casser le pipeline.
- **Phasage compatible avec roadmap v1.0** : ne doit pas bloquer PR-3 (design system) ni PR-2 (data layer). Démarrage fondations en parallèle, pas en série.
- **Gouvernance trio** : @cc-ankora exécute, @cowork définit les cibles et arbitre, @thierry valide les phases.

## Considered Options

### Option 1 — Continuer ad-hoc, ajouter des tests au cas par cas

Garder l'approche actuelle : Vitest + Playwright basique + Lighthouse + agents QA. Ajouter des tests au gré des PRs sans plan global ni objectifs de couverture par feature.

### Option 2 — Plan exhaustif phasé avec stratégie globale (CHOISIE)

Définir une matrice exhaustive feature × type de test, choisir une stack open-source complète, phaser l'implémentation en 6 phases T1-T6 alignées avec la roadmap v1.0, intégrer chaque phase au CI pipeline avec quality gates, gouverner via @cowork avec arbitrages explicites.

### Option 3 — Outsource via service externe (Cypress Cloud, BrowserStack, Percy.io)

Utiliser une plateforme SaaS pour les tests visuels, cross-browser, et la gestion des résultats. Plus rapide à mettre en place, mais paid (incompatible budget 0 € Phase 1) et crée une dépendance externe sur un fournisseur tiers.

## Decision Outcome

**Choix : Option 2 — Plan exhaustif phasé avec stratégie globale.**

Le plan opérationnel détaillé vit dans [`docs/testing-strategy.md`](../testing-strategy.md). Les 6 phases T1-T6 sont définies avec critères de succès mesurables, alignées sur la roadmap v1.0, et compatibles budget 0 €.

**Stack retenue (toutes open-source, aucune dépendance payante) :**

- **Vitest 4** (existant) — unit + integration tests sur `src/lib/domain/`
- **fast-check** (NEW) — property-based testing sur les fonctions Decimal.js financières
- **Playwright** (existant) — E2E + visual regression snapshots + auth flows
- **axe-core** (NEW, via `@axe-core/playwright`) — a11y WCAG AA automatisé route-by-route
- **Stryker Mutator** (NEW, via `@stryker-mutator/core` + `@stryker-mutator/vitest-runner`) — mutation testing
- **MSW (Mock Service Worker)** (NEW) — mocks Supabase pour tests intégration sans test instance permanente
- **Lighthouse CI** (existant) — perf + a11y + SEO + best practices baseline
- **Agents QA `.claude/agents/`** (existant) — audits qualitatifs pré-merge complémentaires

**Phasage en 6 vagues, alignées roadmap v1.0 :**

| Phase  | Périmètre                                                                            | Démarrage                      | Durée estimée |
| ------ | ------------------------------------------------------------------------------------ | ------------------------------ | ------------- |
| **T1** | fast-check sur `src/lib/domain/` + axe-core baseline routes existantes               | Immédiat (parallèle PR-3a/b/c) | 3-4 j         |
| **T2** | Playwright visual snapshots sur composants UI kit + sections dashboard               | Parallèle PR-3b/c              | 4-5 j         |
| **T3** | Tests CRUD intégration Supabase test instance (enveloppes, provisions, transactions) | Avant PR-2 (data layer)        | 5-7 j         |
| **T4** | Playwright auth flows exhaustifs (signup, login, MFA, OAuth, RLS cross-user)         | Avant PR-B1 (auth hardening)   | 4-5 j         |
| **T5** | Stryker mutation testing baseline + objectif mutation score ≥ 75% domain             | Avant Beta v1.0                | 3-4 j         |
| **T6** | Cross-browser (Chromium + Firefox + WebKit) + cross-device (Pixel, iPhone, iPad)     | Avant v1.0 publique            | 3-4 j         |

**Quality gates ajoutés au CI pipeline (cumulatifs par phase) :**

- T1 → fast-check property tests obligatoires sur tout nouveau fichier `src/lib/domain/*`
- T2 → Playwright snapshot diff ≤ 0.1% sur composants UI kit (auto-update via flag explicite uniquement)
- T3 → CRUD integration tests obligatoires sur tout endpoint Server Action / Route Handler nouveau
- T4 → Auth flow tests sur toute modification touchant `src/lib/supabase/` ou middleware
- T5 → Mutation score ≥ 75% domain bloque le merge sur main
- T6 → Smoke test cross-browser obligatoire avant chaque release candidate

**Gouvernance :**

- @cowork — définit les cibles de couverture par feature, arbitre les exclusions, valide les phases
- @cc-ankora — implémente les tests, maintient les snapshots, push les PR-T\*
- @thierry — valide chaque phase via merge des PR-T\*, intervient si arbitrage business

**Définition de DONE testing (par feature) :**

Une feature n'est DONE que si :

1. ✅ Unit tests Vitest sur les fonctions domain pures (couverture ≥ 90% lignes)
2. ✅ Property-based tests fast-check sur tout calcul financier
3. ✅ Integration tests CRUD avec Supabase test instance si data layer touché
4. ✅ Playwright E2E sur le parcours utilisateur principal
5. ✅ Visual snapshot Playwright sur les composants UI ajoutés/modifiés
6. ✅ axe-core pass WCAG AA sur les routes touchées
7. ✅ Mutation score ≥ 75% sur le code domain ajouté

## Consequences

### Positive

- Garantie mathématique sur les calculs financiers (zéro hallucination prouvable via fast-check)
- Détection automatique des régressions visuelles (snapshots Playwright)
- RLS Supabase testé exhaustivement (matrice user A vs user B sur chaque table sensible)
- WCAG AA prouvable route-by-route, pas seulement audité
- Mutation score = mesure objective de la qualité réelle des tests, pas juste de la couverture
- CI pipeline qui bloque les régressions avant merge sur `main`
- Confiance renforcée pour le launch v1.0 (preuve > confiance)
- Documentation claire pour onboarder de futurs contributeurs

### Negative

- Ajoute 5-6 dépendances dev (fast-check, axe-core, Stryker, MSW, etc.) — toutes open-source mais augmentent la surface npm
- Augmente la durée de la CI pipeline (estimation : +2-4 min selon les phases activées)
- Maintenance des snapshots visuels (faux positifs possibles sur petites modifications de design)
- Mutation testing est lent (~10-30 min sur tout le domain) — à exécuter en CI nocturne plutôt qu'à chaque PR
- Investissement en temps initial (~22-29 jours étalés sur 8-10 semaines) — mais étalé sur la roadmap, pas en bloc

### Risques résiduels et mitigations

| Risque                                                               | Mitigation                                                                                                 |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Snapshots Playwright fragiles (faux positifs sur diff anti-aliasing) | Threshold pixel diff configurable (`maxDiffPixelRatio: 0.001`), update workflow explicite                  |
| Stryker timeout sur gros domain                                      | Configuration incrémentale (mutation runs sur fichiers modifiés uniquement en PR), full run en CI nocturne |
| Test instance Supabase coûteuse                                      | Utiliser MSW pour la majorité des tests, Supabase test instance uniquement pour RLS critiques              |
| Maintenance des tests qui ralentit les PRs                           | Quality gates appliqués progressivement (warn d'abord, fail au merge ensuite)                              |
| Drift entre tests et implémentation                                  | Code review obligatoire incluant la couverture du diff dans le checklist DoD                               |

## More Information

- Plan opérationnel détaillé : [`docs/testing-strategy.md`](../testing-strategy.md)
- Issue GitHub parent : à créer (`[T] Testing strategy v1.0 — phased rollout`) après merge de cet ADR
- Sub-issues : T1 à T6 (créées au démarrage de chaque phase)
- ADRs liées :
  - [ADR-001](ADR-001-no-psd2.md) — No-PSD2 (impact : tests auth excluent tout flow PSD2)
  - [ADR-002](ADR-002-bucket-model.md) — Bucket model (impact : tests CRUD séparent réserve libre vs provisions affectées)
  - [ADR-004](ADR-004-structured-logger.md) — Logger structuré (impact : audit log testable via tests intégration)
  - [ADR-005](ADR-005-pr3a-anticipated-design-system.md) — PR-3a anticipated design system (impact : T2 visual snapshots démarre dès PR-3b composants disponibles)

Ce plan supersédera toute approche ad-hoc actuelle. Toute décision contradictoire ultérieure devra créer un ADR-XXX qui supersédera explicitement celui-ci.
