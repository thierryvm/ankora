# Testing strategy Ankora — Plan opérationnel v1.0

> **Statut** : Accepted (2026-04-26 par @thierry + @cowork)
> **Source canonique de la décision** : [`docs/adr/ADR-006-testing-strategy-v1.md`](adr/ADR-006-testing-strategy-v1.md)
> **Glossaire des handles** (@cowork, @cc-design, @cc-ankora, @thierry) — voir [`docs/design/trio-agents.md`](design/trio-agents.md)

Ce document est le **plan opérationnel** détaillé qui complète l'ADR-006. Il décrit la matrice exhaustive de couverture, les choix d'outils par catégorie, le phasage T1-T6, l'intégration CI, et les checklists par feature.

---

## 1. Objectifs mesurables

Tout le plan est dimensionné pour atteindre les cibles suivantes avant launch v1.0 publique :

| Catégorie                                   | Cible v1.0                                               | Outil principal                       |
| ------------------------------------------- | -------------------------------------------------------- | ------------------------------------- |
| Couverture lignes domain                    | ≥ 90%                                                    | Vitest 4                              |
| Couverture branches domain                  | ≥ 85%                                                    | Vitest 4                              |
| Couverture lignes lib (non-domain)          | ≥ 75%                                                    | Vitest 4                              |
| Property-based tests sur calculs financiers | 100% des fonctions Decimal.js publiques                  | fast-check                            |
| Mutation score domain                       | ≥ 75%                                                    | Stryker Mutator                       |
| Visual regression snapshots                 | 100% composants UI kit + 8 sections dashboard            | Playwright                            |
| WCAG 2.1 AA                                 | 100% routes                                              | axe-core via Playwright               |
| Auth flows E2E                              | 100% (signup, login, logout, MFA, OAuth, RLS cross-user) | Playwright + Supabase test instance   |
| CRUD intégration                            | 100% Server Actions + Route Handlers                     | Vitest + MSW + Supabase test instance |
| Cross-browser smoke                         | Chromium + Firefox + WebKit                              | Playwright                            |
| Cross-device smoke                          | Pixel 7, iPhone 14, iPad mini                            | Playwright device emulation           |
| Lighthouse perf                             | ≥ 95                                                     | Lighthouse CI                         |
| Lighthouse a11y                             | 100                                                      | Lighthouse CI                         |
| Lighthouse BP                               | 100                                                      | Lighthouse CI                         |
| Lighthouse SEO                              | 100                                                      | Lighthouse CI                         |

---

## 2. Audit de l'existant (avril 2026)

### Ce qui existe et fonctionne

- **Vitest 4** : 242 unit tests passent, couverture domain ≥ 90% lignes, ≥ 85% branches (mesurée via `npm run test:coverage`)
- **Playwright** : E2E pipeline actif en CI, scope limité aux smoke tests parcours critiques (signup happy path, login happy path, dashboard load)
- **Lighthouse CI** : `npm run lhci` exécuté avant release candidates, baseline ≥ 95 perf / 100 a11y/BP/SEO sur la home et la landing
- **Husky + lint-staged** : pre-commit hooks (Prettier + ESLint --fix)
- **Agents QA `.claude/agents/`** : 8 agents (security-auditor, rls-flow-tester, financial-formula-validator, ui-auditor, lighthouse-auditor, seo-geo-auditor, gdpr-compliance-auditor, test-runner) + 2 nouveaux (dashboard-ux-auditor, admin-dashboard-auditor)
- **CI pipeline GitHub Actions** : Lint + Typecheck + Tests + Security audit + Sourcery + Vercel preview + Lighthouse (conditionnel) + Playwright (conditionnel)

### Trous critiques identifiés

1. **Aucun test property-based** sur les calculs financiers Decimal.js. Risque : hallucination math sur des combos non anticipés (montants extrêmes, dates aux limites de mois, devises avec arrondis spécifiques).
2. **Aucune visual regression** : Lighthouse ne capture pas le rendu pixel-par-pixel. Risque : régression visuelle silencieuse détectée seulement par @thierry en prod.
3. **Tests CRUD partiels** : services domain testés en isolation, mais pas le flow complet `Server Action → Zod → service → Supabase → audit log`.
4. **Auth flows sous-testés** : seulement smoke happy path login/signup. Pas de MFA, pas de reset password, pas de RLS cross-user, pas de session refresh.
5. **A11y pas automatisée par route** : Lighthouse audite quelques routes, pas chaque page authentifiée.
6. **Mutation testing absent** : 90% de couverture ≠ 90% de qualité de tests. Pas de mesure objective de la capacité des tests à détecter les bugs.
7. **Pas de cross-browser** : Playwright actuellement sur Chromium uniquement.

---

## 3. Stack outils retenue (toutes open-source, budget 0 €)

### Tests fonctionnels

- **[Vitest 4](https://vitest.dev/)** (existant) — Unit + integration tests. Stack actuelle, à renforcer via les phases T1-T3.
- **[fast-check](https://github.com/dubzzz/fast-check)** (NEW) — Property-based testing. Génère des centaines/milliers de cas pour vérifier des invariants. Idéal pour Decimal.js (`forall montants, dates → ankoraSum(montants) === expectedSum`).

### Tests E2E + Visual

- **[Playwright](https://playwright.dev/)** (existant) — E2E + auth flows + visual regression snapshots. Tout en un.
- **[@axe-core/playwright](https://github.com/dequelabs/axe-core-npm/tree/develop/packages/playwright)** (NEW) — A11y WCAG AA auto via injection axe dans chaque test Playwright.

### Tests CRUD intégration

- **[MSW (Mock Service Worker)](https://mswjs.io/)** (NEW) — Mocks HTTP au niveau réseau, idéal pour mocker Supabase REST sans test instance permanente.
- **Supabase test instance locale** (existant via Docker) — Pour tests RLS critiques uniquement (le reste mocké via MSW).

### Mutation testing

- **[Stryker Mutator](https://stryker-mutator.io/)** (NEW) — Mute le code, vérifie que les tests échouent. Mesure la qualité réelle des tests, pas juste la couverture.

### Performance + qualité globale

- **[Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci)** (existant) — Perf + a11y baseline + SEO + best practices.

### Qualitatif (audits ponctuels)

- **Agents QA `.claude/agents/`** (existant) — 10 agents spécialisés, exécutés pré-merge selon le scope de la PR.

---

## 4. Matrice de couverture par feature

Pour chaque feature, les types de tests obligatoires sont marqués ✅ et les optionnels avec `(?)`.

| Feature                                                                           | Unit | Property | Integration | E2E | Visual | A11y | Mutation |
| --------------------------------------------------------------------------------- | ---- | -------- | ----------- | --- | ------ | ---- | -------- |
| **Calculs Decimal.js domain** (provisions, réserve libre, cashflow, health score) | ✅   | ✅       | ✅          | (?) | —      | —    | ✅       |
| **Onboarding 3 étapes**                                                           | ✅   | —        | ✅          | ✅  | ✅     | ✅   | (?)      |
| **CRUD enveloppes**                                                               | ✅   | (?)      | ✅          | ✅  | ✅     | ✅   | ✅       |
| **CRUD provisions affectées**                                                     | ✅   | ✅       | ✅          | ✅  | ✅     | ✅   | ✅       |
| **CRUD transactions**                                                             | ✅   | (?)      | ✅          | ✅  | ✅     | ✅   | ✅       |
| **Cashflow waterfall hero**                                                       | ✅   | ✅       | ✅          | ✅  | ✅     | ✅   | ✅       |
| **Health score gauge**                                                            | ✅   | ✅       | ✅          | ✅  | ✅     | ✅   | ✅       |
| **Timeline 6 mois prédictive**                                                    | ✅   | ✅       | ✅          | ✅  | ✅     | ✅   | ✅       |
| **Simulateur what-if**                                                            | ✅   | ✅       | ✅          | ✅  | ✅     | ✅   | ✅       |
| **Goals épargne ETA**                                                             | ✅   | ✅       | ✅          | ✅  | ✅     | ✅   | (?)      |
| **Auth signup**                                                                   | (?)  | —        | ✅          | ✅  | ✅     | ✅   | —        |
| **Auth login**                                                                    | (?)  | —        | ✅          | ✅  | ✅     | ✅   | —        |
| **Auth logout + session**                                                         | (?)  | —        | ✅          | ✅  | —      | ✅   | —        |
| **MFA TOTP setup + login**                                                        | (?)  | —        | ✅          | ✅  | ✅     | ✅   | —        |
| **Reset password**                                                                | (?)  | —        | ✅          | ✅  | ✅     | ✅   | —        |
| **OAuth Google**                                                                  | —    | —        | ✅          | ✅  | ✅     | ✅   | —        |
| **RLS cross-user**                                                                | —    | —        | ✅          | ✅  | —      | —    | ✅       |
| **GDPR export**                                                                   | ✅   | —        | ✅          | ✅  | ✅     | ✅   | (?)      |
| **GDPR deletion**                                                                 | ✅   | —        | ✅          | ✅  | ✅     | ✅   | (?)      |
| **Audit log emission**                                                            | ✅   | —        | ✅          | (?) | —      | —    | ✅       |
| **Rate limiting**                                                                 | ✅   | (?)      | ✅          | ✅  | —      | —    | ✅       |
| **Admin dashboard**                                                               | (?)  | —        | ✅          | ✅  | ✅     | ✅   | —        |
| **Landing page**                                                                  | —    | —        | —           | ✅  | ✅     | ✅   | —        |
| **404 page custom**                                                               | —    | —        | —           | ✅  | ✅     | ✅   | —        |
| **Cookie consent (Klaro!)**                                                       | —    | —        | (?)         | ✅  | ✅     | ✅   | —        |
| **i18n FR/EN switching**                                                          | ✅   | —        | ✅          | ✅  | ✅     | ✅   | —        |

---

## 5. Phases T1-T6

### Phase T1 — Fondations critiques (immédiat, parallèle PR-3a/b/c)

**Démarrage** : dès merge de l'ADR-006 + ce document
**Durée estimée** : 3-4 jours
**Owner** : @cc-ankora exécute, @cowork valide

**Objectifs :**

- Installer fast-check (`npm install --save-dev fast-check`)
- Migrer tous les tests Vitest existants sur `src/lib/domain/*` vers du property-based testing là où pertinent (calculs financiers, formatters, validators)
- Installer @axe-core/playwright (`npm install --save-dev @axe-core/playwright`)
- Ajouter axe-core dans tous les tests Playwright existants (1 ligne par test : `await injectAxe(page); await checkA11y(page);`)
- Créer un helper Playwright `expectA11yPass(page)` réutilisable

**Livrables :**

- 1 PR `feat(test): T1 — fast-check property tests + axe-core baseline` ouvrant les tests sur `src/lib/domain/`
- Mise à jour `package.json` (devDependencies + nouveaux scripts npm)
- Mise à jour CI : `npm run test:property` ajouté au pipeline Lint+Typecheck+Tests
- Documentation : `docs/testing/property-based-recipes.md` (5-10 patterns réutilisables)

**Critères de succès :**

- ✅ ≥ 80% des fonctions publiques de `src/lib/domain/` ont au moins 1 property test
- ✅ axe-core pass sur la home, landing, login, dashboard (au minimum)
- ✅ CI pipeline passe en < +60 secondes vs baseline actuelle

### Phase T2 — Visual regression (parallèle PR-3b/c)

**Démarrage** : après merge PR-3a (tokens + fonts + SKILL)
**Durée estimée** : 4-5 jours
**Owner** : @cc-ankora exécute, @cowork valide les snapshots de référence

**Objectifs :**

- Activer Playwright `toHaveScreenshot()` sur tous les composants UI kit livrés en PR-3b
- Couvrir les 8 sections dashboard à 3 viewports (375px, 768px, 1440px) × 2 thèmes (light, dark)
- Établir les snapshots de référence (commit + revue @cowork avant merge)
- Configurer threshold pixel diff (`maxDiffPixelRatio: 0.001`)
- Workflow d'update explicite : flag `--update-snapshots` requis, jamais auto

**Livrables :**

- 1 PR `feat(test): T2 — visual regression snapshots UI kit + dashboard sections`
- Folder `tests/visual/` avec organisation par composant et par section
- Documentation : `docs/testing/visual-snapshots-workflow.md` (workflow update + review process)
- CI : nouveau job `Playwright Visual` avec artefacts diff téléchargeables

**Critères de succès :**

- ✅ 100% composants UI kit ont au moins 1 snapshot
- ✅ 100% sections dashboard couvertes 3 viewports × 2 thèmes
- ✅ Aucun faux positif sur 5 PRs consécutives sans modification visuelle

### Phase T3 — Tests CRUD intégration (avant PR-2 data layer)

**Démarrage** : après merge PR-3 complète
**Durée estimée** : 5-7 jours
**Owner** : @cc-ankora exécute, @cowork valide les scénarios

**Objectifs :**

- Configurer MSW pour mocker Supabase REST côté Vitest
- Configurer Supabase test instance Docker pour tests RLS critiques
- Couvrir 100% Server Actions + Route Handlers d'Ankora
- Tests scénarios E2E avec données réalistes (création enveloppe → ajout transaction → vérif cohérence cashflow + health score)
- Tests cas limites : montants négatifs (interdits), montants extrêmes (limites Decimal.js), dates aux limites de mois, transactions concurrentes

**Livrables :**

- 1 PR `feat(test): T3 — CRUD integration tests with MSW + Supabase test instance`
- Folder `tests/integration/` avec organisation par feature
- Helper MSW `tests/integration/setup-msw.ts` (mock Supabase responses réalistes)
- Helper Supabase test instance `tests/integration/setup-supabase.ts` (RLS scenarios)
- Documentation : `docs/testing/integration-recipes.md`

**Critères de succès :**

- ✅ 100% Server Actions ont test CRUD intégration
- ✅ 100% Route Handlers ont test CRUD intégration
- ✅ Scénarios RLS cross-user couverts (user A ne peut pas read/write les données de user B)

### Phase T4 — Auth flows exhaustifs (avant PR-B1 auth hardening)

**Démarrage** : après merge PR-3 complète
**Durée estimée** : 4-5 jours
**Owner** : @cc-ankora exécute, @cowork valide les scénarios sécurité

**Objectifs :**

- Playwright tests E2E sur signup happy path + 5 cas d'erreur
- Login : happy path + bad password + locked account + expired session
- MFA TOTP : setup, validation, login post-MFA, recovery codes
- Reset password : request, email link, set new password, login
- OAuth Google : flow complet sur instance Supabase test
- RLS cross-user : tests automatisés création de 2 users, vérif isolation données
- Session refresh : tests expiration + refresh transparent

**Livrables :**

- 1 PR `feat(test): T4 — auth flows E2E exhaustifs`
- Folder `tests/auth/` avec 1 fichier par flow
- Helper `tests/auth/test-users.ts` (factory de users de test isolés)
- Documentation : `docs/testing/auth-flows-checklist.md`

**Critères de succès :**

- ✅ 100% des auth flows ont test E2E happy + cas d'erreur principaux
- ✅ RLS cross-user testée systématiquement (matrice 2 users × 5 tables sensibles)
- ✅ MFA testée bout-en-bout (setup + login + recovery)

### Phase T5 — Mutation testing (avant Beta)

**Démarrage** : après merge T1-T4
**Durée estimée** : 3-4 jours
**Owner** : @cc-ankora exécute, @cowork valide les seuils

**Objectifs :**

- Installer Stryker (`@stryker-mutator/core` + `@stryker-mutator/vitest-runner`)
- Configurer Stryker pour `src/lib/domain/` en priorité (focus calculs financiers)
- Établir baseline mutation score domain
- Définir threshold de mutation score (objectif ≥ 75% domain pour bloquer le merge)
- Optimiser : runs incrémentaux en PR (fichiers modifiés uniquement), full run nightly

**Livrables :**

- 1 PR `feat(test): T5 — Stryker mutation testing baseline`
- `stryker.conf.json` configuré avec scope domain + thresholds
- CI nightly job : `Stryker Mutation Testing (full)` avec rapport HTML artefact
- CI PR job : `Stryker Mutation Testing (incremental)` sur fichiers modifiés
- Documentation : `docs/testing/mutation-testing-guide.md`

**Critères de succès :**

- ✅ Baseline mutation score domain ≥ 75%
- ✅ Tout fichier domain ajouté/modifié doit maintenir mutation score ≥ 75%
- ✅ Run incremental PR < 5 minutes

### Phase T6 — Cross-browser + cross-device (avant v1.0 publique)

**Démarrage** : ~2 semaines avant cible v1.0 publique
**Durée estimée** : 3-4 jours
**Owner** : @cc-ankora exécute, @cowork valide

**Objectifs :**

- Étendre Playwright config à Chromium + Firefox + WebKit
- Smoke tests cross-browser sur 5 parcours critiques (signup, login, dashboard load, CRUD enveloppe, simulateur what-if)
- Cross-device : Pixel 7, iPhone 14, iPad mini via Playwright device emulation
- Bonus : tests sur Safari iOS via BrowserStack open-source tier (si dispo, sinon skip)

**Livrables :**

- 1 PR `feat(test): T6 — cross-browser + cross-device smoke matrix`
- Mise à jour `playwright.config.ts` (3 browsers + 3 devices)
- CI smoke matrix job (parallèle, ~10 min total)
- Documentation : `docs/testing/cross-browser-matrix.md`

**Critères de succès :**

- ✅ 5 parcours critiques pass sur Chromium + Firefox + WebKit
- ✅ 5 parcours critiques pass sur Pixel + iPhone + iPad
- ✅ Aucune régression cross-browser détectée

---

## 6. Intégration CI pipeline

### État actuel CI (à compléter par phase)

```
PR ouverte sur main →
  ├── Auto-label PRs                              [existant]
  ├── Lint + Typecheck + Unit Tests               [existant, +T1 property tests]
  ├── Security audit (npm audit + custom)         [existant]
  ├── Sourcery review                             [existant]
  ├── Sourcery Gate (check-sourcery-resolved)     [existant, post-fix workflow bug]
  ├── Vercel preview                              [existant]
  ├── Vercel Preview Comments                     [existant]
  ├── Playwright E2E (smoke)                      [existant, +T2 visual + T4 auth]
  ├── Playwright Visual                           [T2 NEW]
  ├── Playwright A11y (axe-core)                  [T1 NEW]
  ├── Stryker Mutation (incremental)              [T5 NEW]
  └── Lighthouse CI                               [existant, conditionnel release candidate]

Nightly (cron) →
  └── Stryker Mutation Testing (full)             [T5 NEW]
```

### Quality gates par phase (cumulatifs)

- **T1 merge ready** : property tests pass + axe-core pass sur routes existantes
- **T2 merge ready** : visual snapshots pass (diff ≤ 0.1%)
- **T3 merge ready** : CRUD integration tests pass + RLS scenarios pass
- **T4 merge ready** : auth flows E2E pass
- **T5 merge ready** : mutation score ≥ 75% domain
- **T6 merge ready** : cross-browser smoke pass

### Performance budget CI

Cible totale : ≤ 12 min sur PR standard, ≤ 25 min sur PR data layer (avec intégration). Si dépassé, parallélisation des jobs ou optimisation des runs incrémentaux.

---

## 7. Gouvernance trio

### Rôles

- **@cowork** : définit la stratégie globale, arbitre les exclusions de couverture (si feature explicitement marquée hors scope tests), valide les snapshots visuels de référence avant merge, valide les scénarios sécurité avant T4
- **@cc-ankora** : implémente les tests, ouvre les PR-T1 à T6, maintient les snapshots, gère les faux positifs, documente les recettes
- **@cc-design** : aucun rôle direct sur les tests, mais les exports Claude Design doivent passer la matrice T2 visual avant intégration définitive
- **@thierry** : valide chaque phase via merge, intervient sur arbitrages business (faut-il vraiment tester X ?), priorise en cas de conflit avec roadmap features

### Loop de collaboration

1. @cowork définit la cible de couverture pour la feature
2. @cc-ankora propose un plan de tests (matrice + estimation effort)
3. @cowork valide ou ajuste
4. @cc-ankora implémente sur branche dédiée `feat/test-<feature>`
5. @cc-ankora ouvre PR avec rapport de couverture + agents QA
6. @cowork relit la PR (cas couverts, snapshots de référence, scénarios sécurité)
7. @thierry merge

### Définition de DONE testing par feature

Une feature est DONE testing si toutes les cases ✅ de la matrice §4 sont cochées. Toute exclusion (case marquée ❌ ou skipped) doit être documentée explicitement avec justification @cowork dans le rapport PR.

---

## 8. Anti-patterns à éviter

- ❌ **Snapshots visuels updated en masse sans review** — chaque update doit être justifié et reviewé par @cowork
- ❌ **Tests qui mockent tout** — un test qui ne touche jamais le vrai code domain n'a aucune valeur
- ❌ **Property tests sans invariants clairs** — fast-check génère 1000 cas, mais sans propriété claire à vérifier, c'est juste du bruit
- ❌ **Mutation score gaming** — ajouter des assertions triviales pour booster le score sans améliorer la qualité
- ❌ **Tests E2E pour ce qui pourrait être unit** — règle de la pyramide : unit > integration > E2E
- ❌ **Skipper axe-core "parce que c'est juste un fix mineur"** — l'a11y se construit, ne se rajoute jamais après coup
- ❌ **Tests RLS qui n'utilisent qu'un seul user** — toujours tester avec au moins 2 users distincts pour valider l'isolation

---

## 9. Backlog tests "nice to have" (post-v1.0)

- Performance regression testing (Sitespeed.io ou équivalent)
- Chaos engineering (simulation Supabase down, Upstash rate limit reached, etc.)
- Contract testing si Ankora expose une API publique post-v1.0
- Tests de charge sur les endpoints publics (k6 open-source)
- Penetration testing externe (avant v2.0)

Ces items ne sont pas dans le scope v1.0 mais sont notés pour ne pas être perdus.

---

## 10. Maintenance et évolution de ce document

Ce plan est un document vivant. Toute évolution majeure (nouvelle phase, modification des cibles, ajout d'outil) doit :

1. Être proposée par @cowork ou @cc-ankora dans une issue GitHub `[Testing strategy] Proposal: …`
2. Être discutée et validée par @thierry
3. Être tracée via un nouveau ADR si elle modifie ADR-006 ou via un commit dédié sur ce fichier sinon
4. Être communiquée explicitement aux 3 agents trio

Versionnage informel : la date dans le header de l'ADR-006 fait foi de la version active.
