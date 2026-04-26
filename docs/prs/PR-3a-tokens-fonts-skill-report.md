# PR-3a — Design System socle (tokens + fonts + SKILL) — Rapport @cc-ankora

**Date** : 25 avril 2026
**Branche** : `feat/cc-design-handoff-v1`
**Issue parent** : [#58](https://github.com/thierryvm/ankora/issues/58)
**Sous-issue couverte** : [#59](https://github.com/thierryvm/ankora/issues/59)
**ADR de référence** : [ADR-005](../adr/ADR-005-pr3a-anticipated-design-system.md)

---

## Contexte

Première sous-PR du splitting de PR-3 décidé dans ADR-005. Livre **uniquement le socle architectural** :

- SKILL `ankora-design-system` installé dans `.claude/skills/ankora-design-system/SKILL.md`
- Tokens canoniques de `colors_and_type.css` (livré par @cc-design) intégrés dans `src/app/globals.css`
- 3 fonts variables (Inter, Fraunces, JetBrains Mono) déposées dans `public/fonts/` avec déclarations `@font-face` self-hosted

**Aucun composant ni page touchés** — garantit qu'elle ne peut PAS casser l'UI existante (garde-fou non négociable n°1 ADR-005).

**Source ZIP** : `F:\PROJECTS\Apps\ankora-mockups\design-exports\Ankora Design System.zip` (2.5 MB, livré 2026-04-25 par @cc-design session #1).

**Pré-analyse ZIP** : voir rapport posté dans le chat trio @cc-ankora avant démarrage. Le diff tokens prod ↔ export et les 3 arbitrages préventifs @cowork (PSD2 exclusion, public/ overlap, 8 TSX hors scope) y sont documentés.

---

## Scope appliqué

### Ce que PR-3a fait

- [x] Extraction filtrée du ZIP dans `F:\PROJECTS\Apps\ankora-mockups\design-exports\unpacked-v1\` (Option A — exclusion `*psd2*` à la source via `unzip -x`)
- [x] Vérification : aucun fichier matchant `*psd2*` ou `*open-banking*` dans `unpacked-v1/` (`find -iname "*psd2*"` → 0 hit)
- [x] Installation SKILL dans `.claude/skills/ankora-design-system/SKILL.md` (5.6 KB, identique au ZIP)
- [x] Tokens canoniques migrés dans `src/app/globals.css` (diff documenté ci-dessous, +246 / -27 lignes)
- [x] 3 fonts `.ttf` copiées dans `public/fonts/` avec md5 vérifiés contre le ZIP source
- [x] `@font-face` déclarations ajoutées en tête de `globals.css` (avant `@theme {}`)
- [x] Test Vitest snapshot des tokens créé (`src/app/__tests__/globals-tokens.test.ts`, 168 lignes, 68 assertions)

### Ce que PR-3a NE FAIT PAS (garde-fous non négociables ADR-005)

- ❌ Aucun composant React touché (réservé PR-3b — issue #60)
- ❌ Aucune page App Router touchée (réservée PR-3c — issue #61)
- ❌ Aucun test E2E ajouté/modifié
- ❌ Aucun import des `messages/*.json` du ZIP (inspiration uniquement, cf. directive @cowork)
- ❌ Aucun CSS arbitraire `bg-[#xxx]` introduit
- ❌ Aucune dépendance npm ajoutée au `package.json`

---

## Diff tokens documenté

### Tokens **identiques** entre prod et export — aucune action

Le fichier `colors_and_type.css` du ZIP a explicitement été lifted 1:1 depuis `src/app/globals.css` (ligne 3 du fichier source). Donc :

- Brand palette teal `--color-brand-{50…950}` ✅ inchangée
- Neutrals light + dark (`--color-{background, foreground, muted, muted-foreground, border, card, surface-soft, surface-muted}`) ✅ inchangés
- `--color-brand-text*`, `--color-brand-surface*` ✅ inchangés
- `--color-success: #059669`, `--color-danger: #dc2626` ✅ inchangés
- Radius `{sm, md, lg, xl, 2xl}` ✅ équivalents

### Tokens **changés** (laiton verrouillé — décision @thierry du 2026-04-24)

| Token                               | Prod actuel (amber)    | Export laiton (cc-design)  |
| ----------------------------------- | ---------------------- | -------------------------- |
| `--color-accent-50`                 | `#fffbeb`              | `#fefce8`                  |
| `--color-accent-100`                | `#fef3c7`              | `#fef9c3`                  |
| `--color-accent-400`                | `#fbbf24`              | **`#d4a017`** (anchor)     |
| `--color-accent-500`                | `#f59e0b`              | `#a88914`                  |
| `--color-accent-600`                | `#d97706`              | `#8b6914`                  |
| `--color-accent-700`                | `#b45309`              | `#713f12`                  |
| `--color-accent-text`               | `#b45309`              | `#8b6914` (AA WCAG 5.09:1) |
| `--color-accent-text-strong`        | `#92400e`              | `#713f12`                  |
| `--color-accent-text` (dark)        | `#fbbf24`              | `#d4a017` (AAA 7.93:1)     |
| `--color-accent-text-strong` (dark) | `#fde68a`              | `#fde047`                  |
| `--color-accent-surface*` (dark)    | `rgba(245,158,11,...)` | `rgb(212 160 23 / ...)`    |

### Tokens **nouveaux** ajoutés

- `--color-accent-{200, 300, 800, 900}` (extension échelle laiton)
- `--color-info: #0284c7`
- `--font-display: 'Fraunces', ..., serif`
- `--font-mono` updaté avec `'JetBrains Mono'` en tête + fallback system
- `--font-sans` updaté avec `'Inter'` explicite (avant : `var(--font-sans)` sans famille déclarée)
- Type scale semantic complet : `--text-{display-1, display-2, h1, h2, h3, h4, body, body-lg, small, micro, num-xl, num-lg, num-md}`
- `--tracking-tight: -0.02em`, `--tracking-micro: 0.08em`
- `--radius-xs: 0.25rem`, `--radius-full: 9999px`
- `--shadow-{xs, sm, md, lg}` (light + dark inset variants)
- `--dur-{micro, default, structural}`, `--ease-spring`, `--ease-out`

### Composants CSS **nouveaux** (post-`@theme`)

- `[data-accent='admin']` flip — remap brand\* → laiton sur scope admin
- `.ankora-atmosphere` — body radial gradient (dark only)
- `.glass` Liquid Glass primitive multi-layer + fallback `prefers-reduced-transparency`
- Body presets : `h1-h4`, `.h1-.h4`, `.display-1`, `.display-2`, `.num*`, `.num-accent`
- Helpers texte : `.eyebrow`, `.micro`, `.t-primary`, `.t-secondary`, `.t-muted`
- `code, .mono` font helper

### Décision @cowork explicite — rejet alignement `--color-warning` sur laiton

Lors de la pré-analyse, j'avais proposé d'aligner `--color-warning: #d97706` sur le laiton patiné `#8b6914` (cohérent avec le verrouillage accent). **@cowork a rejeté ce point** pour préserver la sémantique UX universelle :

- amber = signal warning universel (toast warning lisible immédiatement)
- laiton = accent de marque (différenciation Ankora vs Revolut/N26)
- aligner les deux créerait une confusion cognitive (warning vs admin pigment)

**Résultat** : `--color-warning: #d97706` **inchangé**. Commentaire explicite ajouté dans `globals.css` pour traçabilité future. Cf. ligne dédiée du fichier.

---

## Fonts installées

| Fichier                      | Taille | Famille CSS      | Weights couverts | `@font-face` ligne globals.css |
| ---------------------------- | ------ | ---------------- | ---------------- | ------------------------------ |
| `Inter-Variable.ttf`         | 880 KB | `Inter`          | 100-900          | L6-15                          |
| `Fraunces-Variable.ttf`      | 304 KB | `Fraunces`       | 100-900          | L16-25                         |
| `JetBrainsMono-Variable.ttf` | 300 KB | `JetBrains Mono` | 100-800          | L26-35                         |

**Stratégie loading** :

- `font-display: swap` sur les 3 (cohérent avec `fonts.css` du ZIP @cc-design)
- Path public : `/fonts/{Inter,Fraunces,JetBrainsMono}-Variable.ttf`
- Fallback system corrects dans `--font-sans/display/mono` (cf. décision @cowork "pas de FOUT")
- **Préload** non implémenté en PR-3a (pas de page touchée). À considérer en PR-3c quand la Landing utilisera vraiment ces fonts (`<link rel="preload" as="font">` dans `app/layout.tsx`).

---

## SKILL `ankora-design-system`

- **Path final** : `.claude/skills/ankora-design-system/SKILL.md`
- **Taille** : 5659 octets (5.6 KB), identique au ZIP source
- **Détection automatique** : confirmée — la skill apparaît dans la liste système `Available skills` dès la session suivant l'install (vu live pendant cette session)
- **Section 0 NO-PSD2** : ✅ présente en haut, comme prévu
- **Triggers couverts** dans le contenu : enveloppes, provisions affectées, réserve libre, lissage, prédictif, cockpit, laiton, simulateur, what-if
- **Bloc Phase 1 pricing constraint** : ✅ présent
- **Voice FR-first / tutoiement** : ✅ documenté
- **Section 8 Forbidden** : ✅ aligné avec `design-principles-2026.md §8`

---

## Tests

### Local — tous verts

| Commande                                                         | Résultat                                                                      |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `npm run test`                                                   | ✅ **242 tests passent** (19 fichiers, 0 régression)                          |
| `npm run test -- --run src/app/__tests__/globals-tokens.test.ts` | ✅ **68 assertions passent** sur le nouveau fichier (1.56s)                   |
| `npm run lint:use-server`                                        | ✅ Clean ("All 'use server' files contain only async exports")                |
| `npm run typecheck`                                              | ✅ Clean                                                                      |
| `npm run lint`                                                   | ✅ 0 erreur (1 warning préexistant dans `glossaire/page.tsx` non lié à PR-3a) |

### Test ajouté — `src/app/__tests__/globals-tokens.test.ts` (168 lignes, 68 assertions)

Stratégie : lire `globals.css` en string, asserter la présence de chaque token critique via regex. Plus léger que `getComputedStyle()` jsdom (flaky avec Tailwind v4 `@theme {}`), plus robuste qu'un snapshot test (qui casserait à chaque reformat Prettier).

Couverture :

- Brand palette teal (11 shades testés)
- Accent palette laiton (10 shades testés + verrouillage `#d4a017` et `#8b6914` explicites)
- Semantic status (warning explicitement `#d97706`, success/danger/info)
- Typography families (Inter / Fraunces / JetBrains Mono avec fallbacks)
- Type scale (13 tokens semantic)
- Radius (7 sizes)
- Elevation (4 levels)
- Motion (3 durations + 2 easings)
- Tracking (2 helpers)
- 3 `@font-face` (familles + paths `/fonts/` + `font-display: swap`)
- `[data-accent='admin']` flip primitive
- `.glass` Liquid Glass multi-layer + fallback `prefers-reduced-transparency`
- 5 helper classes (`.eyebrow`, `.micro`, `.t-*`)

---

## Agents QA

| Agent                     | Verdict                        | Notes                                                                                                                                                        |
| ------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `security-auditor`        | ✅ **PASS**                    | 0 secret hardcodé, CSP intact (`font-src 'self' data:` strict), 0 dépendance npm ajoutée, fonts self-hosted (pas de fetch tiers)                             |
| `gdpr-compliance-auditor` | ✅ **COMPLIANT**               | Fonts self-hosted = 0 fuite IP utilisateur vers Google Fonts CDN, 0 nouvelle PII, 0 cookie modifié, articles 5/7/15-22/25 RGPD : conformes ou hors périmètre |
| `test-runner`             | ✅ Implicite (242 tests verts) | Validation manuelle via `npm run test`                                                                                                                       |
| `lighthouse-auditor`      | N/A                            | Pas applicable — aucune surface visuelle modifiée                                                                                                            |
| `ui-auditor`              | N/A                            | Pas applicable — aucun composant modifié                                                                                                                     |

### 2 findings low non-bloquants à transmettre à @cowork

#### Finding 1 (security-auditor, low) — SKILL.md référence des chemins ZIP non présents dans le repo

Lignes 20 et 46 du SKILL.md mentionnent `colors_and_type.css` et `ui_kits/_shared/shell.css` comme fichiers à importer. Ces chemins existent dans le ZIP mais **pas dans le repo Ankora** (les tokens vivent dans `src/app/globals.css` via `@import 'tailwindcss'`).

**Risque** : un agent CC qui lirait ce SKILL sans contexte repo pourrait générer du code avec imports invalides.

**Recommandation** : action différée à PR-3b ou PR-3c — ajouter une note dans la section 1 du SKILL adaptant les paths au contexte Next.js Ankora. Pas un bloqueur pour PR-3a (le SKILL est livré tel quel par @cc-design, on garde la fidélité ZIP source). À arbitrer par @cowork.

#### Finding 2 (security-auditor, low) — double `url()` identique dans chaque `@font-face`

`globals.css` lignes 11-12, 20-21, 28-29 : chaque `@font-face` déclare deux `src` identiques (`truetype-variations` puis `truetype`) pointant vers le même fichier .ttf. Le second est superflu (les deux formats sont résolus par le même fichier .ttf).

**Risque** : 0 sécurité, 0 perf significative, juste dette CSS mineure.

**Recommandation** : laissé tel quel en PR-3a (cohérent avec `fonts.css` original de @cc-design). Si @cowork préfère cleanup, je peux retirer les `format('truetype')` redondants en mini-fix.

---

## Définition de DONE

| Critère                                                                                          | Statut                                                                     |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Lint + typecheck verts                                                                           | ✅                                                                         |
| `npm run lint:use-server` clean                                                                  | ✅                                                                         |
| Tests Vitest 100 % pass (242, +68 nouveaux)                                                      | ✅                                                                         |
| Pre-commit hook OK (Prettier appliqué automatiquement par Husky)                                 | À confirmer au commit                                                      |
| CI verte sur la branche                                                                          | À confirmer après push                                                     |
| Sourcery silencieux sur HEAD                                                                     | À confirmer après push                                                     |
| Pas de conflit avec main                                                                         | À confirmer (branche partie du main post-#57 squash)                       |
| Diff tokens documenté                                                                            | ✅ (cette section)                                                         |
| Rapport @thierry / @cowork livré                                                                 | ✅ (ce fichier)                                                            |
| Review @thierry approuvée                                                                        | À confirmer post-CI                                                        |
| PR mergée                                                                                        | À confirmer                                                                |
| Test live confirmé : nouvelles sessions Claude Code voient le SKILL `ankora-design-system` actif | ✅ déjà validé pendant cette session (skill détectée dans system reminder) |

---

## Rapport @thierry / @cowork (template PR description)

### Vérifications effectuées

- [x] ZIP extrait avec exclusion stricte `*psd2*` (Option A — filtrage à la source)
- [x] SKILL.md installé dans `.claude/skills/ankora-design-system/` + détection live confirmée
- [x] Tokens migrés dans `globals.css` (diff documenté section "Diff tokens")
- [x] Fonts .ttf placées dans `public/fonts/` + `@font-face` déclarés (md5 vérifiés)
- [x] `@theme {}` Tailwind v4 wrap respecté
- [x] `--color-warning` reste amber (décision @cowork rejet laiton)
- [x] Aucun composant ni page touchés (garde-fou ADR-005 #1)
- [x] Aucune dépendance npm ajoutée
- [x] Test Vitest 68 assertions (168 lignes)
- [x] 242 tests Vitest verts au total
- [x] Lint, typecheck, lint:use-server clean
- [x] Agents QA : security PASS + gdpr COMPLIANT
- [ ] CI verte (à confirmer après push)
- [ ] Sourcery silencieux (à confirmer après push)
- [ ] Review @thierry approuvée

### Bugs réels détectés en pré-analyse vs export @cc-design

Aucun bug bloquant. 2 findings low (cf. section "Agents QA" → 2 findings low non-bloquants).

### Estimations vs réalisé

- **Estimation effort** : ~2-3h (tokens + fonts + SKILL + tests + agents QA + rapport)
- **Réalisé** : ~1h30 (extraction filtrée 5min, install SKILL 2min, edit globals.css 20min, fonts 5min, test Vitest 25min, agents QA en parallèle 10min, rapport 20min)
- **Écart** : -50% sous estimation (pré-analyse en amont a énormément accéléré, et @cc-design a livré du matériel propre sans ambiguïté)

---

## Notes pour PR-3b (issue #60)

Préparer pour PR-3b :

1. Ajouter dans `package.json` :
   - `@radix-ui/react-slot`
   - `@radix-ui/react-label`
   - `@radix-ui/react-select`
   - `class-variance-authority` (cva)
2. Vérifier ou créer `src/lib/utils.ts` avec `cn()` helper (clsx + tailwind-merge)
3. Updater `AnkoraLogo.tsx` lors de la migration : `#F59E0B` → `#d4a017` (laiton)
4. Adapter SKILL section 1 (paths `colors_and_type.css` → `src/app/globals.css` Ankora — Finding 1 sécurité)
5. Migrer les 8 TSX du ZIP avec tests Vitest co-located
6. Source : `F:\PROJECTS\Apps\ankora-mockups\design-exports\unpacked-v1\src\components\` (8 fichiers, 533 lignes total)

---

## Étapes suivantes (workflow trio)

1. ⏳ Push branche + PR ouverte avec `Closes #59`
2. ⏳ CI verte + Sourcery silent
3. ⏳ Review @thierry approuvée
4. ⏳ Merge PR-3a sur main
5. ⏳ @thierry valide explicitement le démarrage PR-3b (issue #60)
6. ⏳ @cowork update `claude-design-brief.md` pour rendre l'exclusion PSD2 explicite (backlog @cowork mentionné)
7. ⏳ @cowork update `design-principles-2026.md §6` pour documenter la séparation `--color-warning` ↔ laiton (backlog @cowork)
