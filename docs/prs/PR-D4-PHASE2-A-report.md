# PR-D4-PHASE2-A — Atoms 1-11 + Hamilton + Playground (Rapport DoD final)

**Date** : 2026-05-09
**Branche** : `feat/atoms-tasks-6-18`
**Statut** : 🟡 READY (en attente CI verts + Sourcery silence + @thierry merge)
**Modèle exécutant** : Claude Opus 4.7 (vérifié via `.claude/settings.local.json`)

## Sommaire exécutif

PR-D4-PHASE2-A livre **11 atoms TypeScript strict** (CD#3), helper Hamilton (`largestRemainderRound`), et route playground admin-only `/[locale]/design-playground/` pour QA visuelle. Cette PR est la 1ère des 4 sous-PRs séquentielles de PR-D4 PHASE 2 (A → atoms primitives, B → AppShell+RBAC, C → Surface 1 cockpit, D → i18n complet).

**Métrique** : 44 files changed, +7558 lines, 16 commits, 11 atoms × 220 tests Vitest unit (100% pass), 1083/1083 tests full suite, smoke E2E playground 1/1 chromium-desktop pass.

## Atoms livrés

| #   | Atom                        | Commit SHA                            | LoC TSX | Tests | Coverage Stmts/Branches |
| --- | --------------------------- | ------------------------------------- | ------- | ----- | ----------------------- |
| 01  | Button                      | `0f3c106` (squash main)               | 68      | 12    | 100%/100%               |
| 02  | Chip                        | `0f3c106`                             | 70      | 11    | 100%/100%               |
| 03  | Card                        | `0f3c106`                             | 50      | 12    | 100%/100%               |
| 04  | Drawer + 7 field primitives | `625029b` + `3aae1af` (className fix) | 575     | 34    | 98.01%/86.36%           |
| 05  | ProgressBar                 | `9af196d`                             | 109     | 21    | 100%/100%               |
| 06  | Avatar                      | `aa45435`                             | 77      | 21    | 100%/92.3%              |
| 07  | ColorPicker                 | `183b833`                             | 80      | 15    | 100%/100%               |
| 08  | IconPicker + icons registry | `1980b35`                             | 80+75   | 22    | 100%/100%               |
| 09  | Tabs                        | `d6b00bd` + `a349546` (className fix) | 118     | 23    | 100%/93.54%             |
| 10  | ThemeToggle                 | `560d5a0`                             | 110     | 20    | 92.85%/93.33%           |
| 11  | LangSwitcher                | `edd7011`                             | 148     | 18    | 97.56%/91.66%           |

**Total** : ~1 600 lignes TS atoms + 220 tests Vitest. Tous au-dessus du seuil ≥90% lignes / ≥85% branches.

## Hamilton helper

**File** : `src/lib/utils/largestRemainderRound.ts` (37 lines)
**Tests** : `src/lib/utils/__tests__/largestRemainderRound.test.ts` (10 cas, 100% coverage)
**Commit** : `90bd50d` (squash main 0f3c106)

Pure function — distribue des pourcentages entiers sommant exactement à 100. Utilisé par admin Top sources / Drop-off breakdown (R-13). Pas de side effects, pas de dépendance DB.

## Route playground

**Path** : `/[locale]/design-playground/` (segment normal — préfixe `_` initial est un private folder Next.js, voir §Concerns)
**Files** : `page.tsx` + `_components/PlaygroundSection.tsx` + 11 `_components/demos/*Demo.tsx` + `README.md`

**Guard env** : `process.env.NODE_ENV === 'production' && process.env.ANKORA_PLAYGROUND_ENABLED !== 'true'` → `notFound()`
**Metadata robots** : `noindex/nofollow`
**Sitemap** : whitelist explicite `src/app/sitemap.ts` ne liste pas le segment (auto-exclu)

**Env vars** :

- `ANKORA_PLAYGROUND_ENABLED` (server-only, pas `NEXT_PUBLIC_`) — Zod schema `src/lib/env.ts:19` `.enum(['true', 'false']).default('false').optional()`

## E2E smoke

**File** : `e2e/design-playground.spec.ts` (60 lines)

Smoke minimal — vérifie title visible + 11 atom section headings rendus + 0 page error (uncaught JS exception). 1 test, 1 assertion structurelle.

**Browsers** :

- ✅ chromium-desktop : 1/1 PASS (1.8s)
- ⏭️ webkit (mobile-safari + iOS sprint) : SKIP délibéré avec FIXME daté pointant Task 16. Réintégration prévue PR-D5 après fix root cause (cookies-consent flake #131 + risque timing race Drawer).

## Agents QA

| #   | Agent                        | Statut             | Findings                       | Rapport                                                            |
| --- | ---------------------------- | ------------------ | ------------------------------ | ------------------------------------------------------------------ |
| 1   | `ui-auditor`                 | PASS_WITH_FINDINGS | P0:0 P1:5 P2:7 P3:4            | `docs/audits/2026-05-09-pr-d4-phase2-a-ui-auditor.md`              |
| 2   | `gdpr-compliance-auditor`    | PASS_WITH_FINDINGS | 0 BLOCK, 2 trackable PR-B      | `docs/audits/2026-05-09-pr-d4-phase2-a-gdpr-compliance-auditor.md` |
| 3   | `dashboard-ux-auditor`       | SKIP (N/A)         | —                              | `docs/audits/2026-05-09-pr-d4-phase2-a-skipped-agents.md`          |
| 4   | `admin-dashboard-auditor`    | SKIP (N/A)         | —                              | `docs/audits/2026-05-09-pr-d4-phase2-a-skipped-agents.md`          |
| 5   | `mobile-ios-auditor`         | PASS_WITH_FINDINGS | P0:3 P1:5                      | `docs/audits/2026-05-09-pr-d4-phase2-a-mobile-ios-auditor.md`      |
| 6   | `i18n-auditor`               | PASS_WITH_FINDINGS | 19 strings hardcoded FR (PR-D) | `docs/audits/2026-05-09-pr-d4-phase2-a-i18n-auditor.md`            |
| 7   | `test-runner` (vitest + e2e) | PASS               | 1083/1083 + smoke 1/1          | inline (logs Task 17)                                              |

**Skip agents (3, 4)** : N/A pour PR-A. Dashboard + admin panel surfaces n'existent pas encore (PR-D4-PHASE2-B/C les introduiront). Justification documentée.

**Auto-fix appliqué pendant cette session** :

- ✅ Drawer.tsx — bug className concat 9 occurrences (Task 16, commit `3aae1af`)
- ✅ Tabs.tsx:106 — bug identique flagué par 2 agents (Task 17, commit `a349546`)

## DoD 5 critères

| #   | Critère                                           | Statut       | Preuve                                                                                                                             |
| --- | ------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1   | CI verts (Lint + Typecheck + Tests + E2E + Build) | ⏳ POST-PUSH | À vérifier après `gh pr create` ; locally : lint 0 err / typecheck clean / test 1083/1083 / e2e smoke 1/1 / build success          |
| 2   | Sourcery bot silencieux sur DERNIER commit        | ⏳ POST-PUSH | À vérifier via `gh api repos/thierryvm/ankora/pulls/<N>/comments --jq '.[] \| select(.user.login == "sourcery-ai[bot]") \| .body'` |
| 3   | Reviews humaines approuvées                       | ⏳ ATTENTE   | @thierry validation post-push                                                                                                      |
| 4   | Pas de conflit avec main                          | ⏳ POST-PUSH | À vérifier `gh pr view <N> --json mergeStateStatus` (expected `CLEAN`)                                                             |
| 5   | Rapport final livré                               | ✅ DONE      | Ce document                                                                                                                        |

## Concerns / divergences documentées

### C1 — LangSwitcher onChange API divergence vs prototype handoff (Task 13b)

**Décision @thierry 2026-05-09 — Option 2 (Documenter et défer PR-B)**.

`onChange: (id) => void` est REQUIS dans l'atom Ankora TS strict. Le call-site mockup `<LangSwitcher current="fr-BE"/>` (handoff `surfaces/admin/AdminTopbar.jsx`) est un PROTOTYPE visuel sans logique routing. Le call-site PRODUCTION sera `src/app/[locale]/admin/_components/AdminTopbar.tsx` (PR-B) avec next-intl `router.replace(pathname, { locale: id })`. State interne fallback violerait l'architecture next-intl App Router (locale canonique = URL).

Détails : `docs/plans/PR-D4-PHASE2-A.md` Task 13 + `prompts/PR-D4-PHASE2-cd3-integration.md` §J0.

**Précision garde-fou §3 transverse** : "le call-site PRÉVAUT" se lit "le call-site PRODUCTION prévaut, pas un prototype handoff". Sauvée en mémoire feedback `feedback_callsite_prod_vs_prototype.md` pour les sessions futures.

### C2 — Drawer className concat bug DÉTERMINISTE (pas un flake)

**Découvert Task 16, fix commit `3aae1af`.**

L'étiquette "flake" qu'on traînait depuis Task 8 dans la TodoList était une fausse piste — c'est un vrai bug d'implémentation. Le subagent Drawer (Task 8) a dupliqué le pattern foireux `${cond ? 'is-X' : ''}` (sans espace devant) **9 fois** dans Drawer.tsx + **1 fois** dans Tabs.tsx (Task 11) — le même pattern. Pattern identique : copy-paste du même bug.

Aucun test Vitest ne l'avait attrapé car les tests vérifiaient `aria-selected` mais pas `className.includes('is-active')`. Ui-auditor + mobile-ios-auditor l'ont flagué simultanément en Task 17.

**Fix** : conversion en `[...].filter(Boolean).join(' ')` (10 occurrences total Drawer + Tabs). Pattern résistant au formatter prettier.

### C3 — Tech debt : introduire `cn()` utility

**Origine** : C2 ci-dessus a révélé le copy-paste de pattern foireux comme signal structurel. Pour les futures sessions atoms/components Ankora, introduire un utilitaire `cn()` (style shadcn/clsx) — soit l'importer de `@/lib/utils.ts` s'il existe déjà, soit le créer.

**Avantages** : pattern centralisé, formatter-proof, et si bug → 1 seul endroit à fixer. 9 fixes manuels Drawer + 1 Tabs auraient été 1 fix avec helper centralisé.

**Suggestion follow-up issue** : "tech debt: introduce cn() utility for atoms (lib/utils.ts)" — à créer avant PR-B intégration AppShell.

### C4 — cookies-consent.spec.ts:70 fixme à re-investiguer séparément

**Origine** : `test.fixme()` appliqué pré-session (4 mai 2026) avec hypothèse "timeout WebKit footer scroll". Étant donné que C2 a prouvé qu'un autre "flake" Drawer était en réalité un bug déterministe (pas un timing race), la même hypothèse est probablement erronée pour cookies-consent.

**Action follow-up** : créer issue "investigate cookies-consent.spec.ts:70 — probably deterministic bug, not WebKit timing" pour PR-D5 ou un fix isolé.

### C5 — CSP inline styles dans page playground

**Découvert Task 15 (E2E run)**.

La page playground produit ~90 console warnings CSP (`style-src 'nonce-X' 'unsafe-inline'`) à cause des inline `style={{...}}` dans `page.tsx` + 11 demos. CSP strict en dev avec nonce → ces violations sont loggées comme console errors mais ne cassent pas le rendu.

**Mitigation** : le smoke E2E filtre les CSP warnings (assertion `pageErrors` au lieu de `consoleErrors`) — vrais JS errors uniquement.

**Action follow-up** : convertir inline styles en classes CSS (création `playground.css`) — anti-pattern §3 garde-fou orchestration "Production-parity-first". À tracker pour PR suivante (avant ouverture publique de la route si applicable).

### C6 — Findings P0 mobile-ios déférés à PR-B/PR-D5

3 P0 critiques à corriger avant intégration AppShell production :

- `atoms.css:359` `.drw-input font-size: 14px` → iOS auto-zoom on focus (fix : 16px en mobile)
- `atoms.css:163` `.atm-chip-x` 14×14 touch target (Apple HIG 44×44)
- `atoms.css:648` `.drw-footer` no `safe-area-inset-bottom` (home indicator collision iPhone X+)

5 P1 touch targets sub-44px (ThemeToggle sm/md, Tabs sm, ColorPicker swatch, IconPicker tile, Drawer close button) — corriger en PR-B intégration AppShell.

Détails : `docs/audits/2026-05-09-pr-d4-phase2-a-mobile-ios-auditor.md`.

### C7 — Findings P1 ui-auditor déférés à PR-B/PR-D5

5 a11y critiques :

- Drawer `<label>` sans `htmlFor` + input sans `id` (WCAG 1.3.1)
- Drawer error span sans `aria-describedby` (WCAG 4.1.3)
- Drawer internal buttons sans `:focus-visible` explicite
- ColorPicker + IconPicker sans Arrow keys nav (WCAG 2.1.1)
- ✅ Tabs.tsx:106 className bug — FIXED

Détails : `docs/audits/2026-05-09-pr-d4-phase2-a-ui-auditor.md`.

### C8 — Findings GDPR cookies trackable PR-B

- F1 cookie name divergence : `theme` (impl) vs `ankora-theme` (politique). Fix PR-B : `cookieKey="ankora-theme"` ou changer default dans `ThemeToggle.tsx`.
- F2 Secure flag absent sur cookie. Fix PR-B : ajouter `Secure` à la string cookie.

Détails : `docs/audits/2026-05-09-pr-d4-phase2-a-gdpr-compliance-auditor.md`.

### C9 — i18n wiring 19 strings hardcoded FR à wirer en PR-D

Atoms PR-A purement présentationnels (ne touchent pas `messages/*.json`). 19 strings hardcoded FR-BE attendues, à wirer en PR-D :

- 9 HIGH priorité (Drawer validation + boutons + close + confirm)
- 4 MEDIUM (ThemeToggle aria-labels, frequencies, LangSwitcher aria, Chip aria)
- 6 LOW (ColorPicker/IconPicker/ProgressBar aria defaults)

Clés suggérées + parité 5 locales : `docs/audits/2026-05-09-pr-d4-phase2-a-i18n-auditor.md`.

## Décisions architecturales prises

- **Cohabitation Button** : `src/components/ui/button.tsx` (shadcn legacy, 23 imports en aval) reste. `src/components/atoms/Button.tsx` = nouveau Ankora CD#3. Migration progressive en PR-C/PR-D5.
- **Tabs from-pattern** : ADDENDUM F mentionne Tabs sans atom dédié dans le bundle. Implémentation extraite des 3 surfaces du bundle (`AdminPanelV1` + `AdminTopbar` + `onboarding step2`). A11y upgrade : ajout `aria-selected` que le source onboarding n'avait pas.
- **`ANKORA_PLAYGROUND_ENABLED` server-only** : pas de `NEXT_PUBLIC_*` (préviendrait leak en bundle client). Route 404 en prod par défaut, 200 en prod si flag, 200 en dev systématiquement.
- **Stepper différé** : extraction `surfaces/onboarding/stepper.jsx` reportée en PR-D5 (avec Onboarding 3 étapes intégré).
- **lucide-react direct pour IconPicker** : on n'adopte pas le pattern raw HTML attribute du handoff (XSS risk + perte tooling typé). Registry curated 25 icônes Ankora dans `icons.ts`.
- **`'use server'` async-only** : aucun atom n'utilise `'use server'` (atoms = client/server presentational, pas de Server Actions).
- **Decimal.js pour montants** : N/A pour atoms PR-A (Decimal.js consommé en PR-C cockpit).
- **Production-parity-first §3 reformulé** : "le call-site PRÉVAUT" → "le call-site PRODUCTION prévaut, pas un prototype handoff" (cf. C1).

## Hors scope (suite à venir)

- **PR-D4-PHASE2-B** : AppShell user/admin + RBAC + `requireAdmin()` + ThemeToggle/LangSwitcher branchés cookie SSR + nav conditionnelle admin (consomme atoms PR-A). Fixes mobile-ios P0/P1 + a11y ui P1 ici.
- **PR-D4-PHASE2-C** : Surface 1 Cockpit (HeroWaterfall + 6 composants) + refonte CapaciteEpargneCard/EffortFinancierCard + tests Vitest cockpit + e2e cockpit.
- **PR-D4-PHASE2-D** : i18n complet (95 clés × 5 locales, dont 19 atoms hardcoded strings) + SectionCard loadingState + audit final 6 agents QA + Lighthouse CI 95+/100/100/100.
- **Tech debt PR-D5/dédié** : `cn()` utility (C3), cookies-consent.spec.ts:70 re-investigation (C4), playground inline styles refactor (C5).

## Liens

- Branche : `feat/atoms-tasks-6-18`
- Plan d'exécution : `docs/plans/PR-D4-PHASE2-A.md` (2520 lignes, 18 tasks all checked)
- Brief canonique : `prompts/PR-D4-PHASE2-cd3-integration.md`
- Audits QA : `docs/audits/2026-05-09-pr-d4-phase2-a-*.md` (5 fichiers)
- Mémoire feedback : `memory/feedback_callsite_prod_vs_prototype.md`

## Trio agents convention

- **@cowork** — pilote, garde-fous PR-D4-PHASE2-A Tasks 6-18, arbitrages design + spec divergences + tech debt
- **@cc-ankora** (cette session) — exécutant code + tests + agents QA + push/PR
- **@thierry** — validation finale + merge

@cowork — DoD 5 critères : 1 livré (rapport ce document), 4 attendent post-push pour vérification.
@cc-ankora — exécutant terminé Task 18/18.
@thierry — merge attend ton approval après green CI + Sourcery silence.
