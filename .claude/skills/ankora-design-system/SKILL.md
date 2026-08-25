# Ankora Design System — skill

When a Claude Code agent is handed this folder as a skill, follow these rules before generating any Ankora UI.

## 0. CRITICAL BRAND CONSTRAINT — NO PSD2

Ankora is **NOT a bank aggregator.** It does NOT use PSD2, AIS, or any banking API. All data is **MANUALLY entered by the user**. Never generate UI that suggests:

- Bank connection / "connect your accounts" / "relier ta banque"
- Transaction sync / import / read-only bank access / lecture seule
- IBAN pickers showing real BE/FR IBANs as accounts the user links
- Bank logos (BNP, KBC, Belfius, Revolut, N26…) as connection options
- Aggregation / agrégation / agrégateur copy

This is **non-negotiable** — it's a regulatory choice, part of the FSMA-compliant positioning. When a screen needs to reassure the user about data handling, use: _"Saisie manuelle · données hébergées en Belgique"_ or _"Ankora ne se connecte à aucune banque."_

**Phase 1 pricing constraint** — Ankora is 100% free during Phase 1 (budget 0€ strict, founder regulatory situation). Never ship pricing tiers or paid plans until this constraint lifts. The "Gratuit pendant la Phase 1" block on the landing is the only correct pricing surface.

## 1. Load the tokens, always

- Import `colors_and_type.css` at the top of every new HTML/CSS file. **Do not redefine colors, radii, shadows, or type scale.** Every component reads from the tokens declared there.
- **Neither theme is "the default" — the OS decides.** With no stored preference, `ThemeBootScript.tsx` reads `prefers-color-scheme` and sets or removes `data-theme="dark"` on `<html>`. In the stylesheet the LIGHT set is the base (declared in `@theme`) and dark is the override block; that asymmetry is why the paper scope below is light-only. Never hard-code a hex value for a neutral. _(Corrected 8 Aug 2026 — this line previously said dark was the default, which sends the reader looking for a dark base that does not exist.)_

### Scope patterns — four, and they are not peers

`globals.css` defines variables in four places: `@theme` (light base + scales), `[data-theme='dark']` (theme override), `[data-accent='admin']` (teal → brass pigment swap), and `.mkt-paper` with its `body:has(…)` companion (marketing surface, light theme only — ADR-039).

- The paper scope remaps six semantic variables to paper/ink pigments so components keep ONE vocabulary on both surfaces. Never write a paper pigment directly; write the semantic token and let the surface decide.
- **There is deliberately no `.app-surface` counterpart.** `:root` IS the product identity; the paper class is a departure from it, not a sibling. Do not add a symmetric scope to "balance" them.
- Ratios are computed, never copied — but only the pairs marked ✅ in [`docs/design/token-usage.md`](../../../docs/design/token-usage.md) §4 are guarded. `src/app/__tests__/contrast-ratios.test.ts` recalculates those from the stylesheet and fails under 4.5:1; the ⬜ rows are documentation and nothing watches them. Saying "every pair" is what let that table drift in the first place.
- **In the Ankora Next.js context** (PR-3a integration, 2026-04-25): tokens live in `src/app/globals.css` via `@import 'tailwindcss'` + `@theme {}` block. The `colors_and_type.css` and `ui_kits/_shared/shell.css` references in this SKILL refer to the original ZIP source — adapt paths when generating Ankora Next.js code.

### Browser support baseline

Modern CSS features used by this design system:

- `color-mix(in oklab, ...)` — Chrome 111+ (March 2023), Safari 16.2+ (December 2022), Firefox 113+ (May 2023)
- `backdrop-filter: blur(...) saturate(...)` — universal modern support
- `@media (prefers-reduced-transparency: reduce)` — Chrome 116+, Safari 17+, Firefox 113+

**Baseline accepted by @cowork (2026-04-25)**: Chrome 111+ / Safari 16.2+ / Firefox 113+ (~3 years of universal support at v1.0 launch). Older browsers see graceful degradation: `.glass` becomes transparent (background fallback to `var(--color-card)`), text remains readable, no broken layout. If v1.0 launch targets older browsers, add explicit fallbacks in PR-3b.

## 2. Accent rule is non-negotiable

- **User-facing surfaces** (product cockpit, marketing, onboarding, mobile app) → **teal** (default token set).
- **Admin-facing surfaces** (operator console, internal tools) → **laiton nautique** (brass) via `data-accent="admin"` on the root. One pigment, two contexts: fresh brass `#d4a017` on dark (AAA 7.93:1), aged brass `#8b6914` on light (AA 5.09:1). Same grammar, same story, different patina.
- Do not introduce a third accent. If you need to differentiate a third surface, change layout or density, not color.

## 3. Typography

- Inter for all UI, ramp 400/500/600/700. Never italic.
- Fraunces only for hero/display moments ≥ 28px. Never body.
- JetBrains Mono for every number — use `font-variant-numeric: tabular-nums` always.
- Headings ≥ 32px get `letter-spacing: -0.02em`.

## 4. Voice (FR-first, tutoiement)

- French is the canonical language. Use `tu / ton / tes`, never `vous`.
- Sentence case everywhere. No emoji in UI (footer `🇧🇪` only).

### 4.1 Vocabulaire recommandé (concepts différenciants verrouillés)

Source de vérité : **[ADR-035](../../../docs/adr/ADR-035-vocabulaire-des-quatre-chiffres.md)** pour les quatre chiffres du cockpit, puis [`docs/ankora-product-quality-bar-v1.md`](../../../docs/ankora-product-quality-bar-v1.md) §1 + NORTH_STAR pour le reste.

> ⚠️ **Corrigé le 2026-07-29 (chantier 2).** Cette section recommandait encore
> « Capacité d'épargne réelle », « Reste à vivre » et « Reste disponible » —
> les trois mots que **ADR-035 a bannis** au chantier 1. Le §11 fixe l'ordre de
> priorité (NORTH_STAR > ADR > Quality Bar > ce SKILL), donc l'ADR l'emportait
> déjà ; mais un skill qui les recommande les réintroduit mécaniquement à la
> prochaine session qui le lit sans lire l'ADR. Aligné ci-dessous.

#### Les quatre chiffres du cockpit — source de vérité ADR-035

Aucune clé i18n ne doit introduire un cinquième nom.

| Nom affiché (fr-BE) | Nom de code                    | Formule                                                            |
| ------------------- | ------------------------------ | ------------------------------------------------------------------ |
| **Il te reste**     | `ilTeReste`                    | `resteDisponible − depensesDuMois` — chiffre-héros, **temps réel** |
| **Budget du mois**  | `resteDisponible` _(inchangé)_ | `revenus − chargesFixes − provisionsLissees − engagementsMensuels` |
| **Dépensé ce mois** | `depensesDuMois`               | `Σ expenses.amount` sur le mois de référence                       |
| **Épargne estimée** | `epargneEstimee`               | projection du rythme ; `null` avant le 7ᵉ jour                     |

**« Il te reste » est une phrase, pas un terme, et c'est délibéré** : un
chiffre-héros répond à une question (« je peux dépenser ces 60 € ? »). Couleur :
encre neutre par défaut, `--color-danger` si négatif, **jamais de vert**.

#### Autres concepts, inchangés

- **Compte épargne · trois lectures** (NORTH_STAR) — Total Épargne / Provisions affectées / Réserve libre. Différenciateur n°1, jamais réduire à un montant unique.
- **Provisions affectées** + **Réserve libre** — distinction obligatoire. Provisions = argent fléché pour facture future (taxe, vacances). Réserve = buffer libre sans contrainte.
- **Effort financier mensuel** — total charges fixes mensuelles + provisions mensuelles lissées. Reste valide : c'est un total de sorties, pas un des quatre chiffres affichés.
- **Lissage** — différenciateur Ankora vs YNAB/Monarch. Provisions mensualisées pour absorber les factures annuelles (taxe voiture 25 €/mois × 12 = 300 € au 28/05).
- **Plan d'apurement** (ADR-017, table `installment_plans`) — échelonnement d'une dette (ex : 2 407 € / 11 mensualités). Génération auto N transactions pending.
- **Assistant Virements** (ADR-012) — sub-section dashboard qui suggère le montant à virer ce mois + détail provisions item-par-item. Gradient bleu-vert + sub-card Santé.
- **Ballet provisions** (ADR-018) — aller-retour bidirectionnel compte courant ↔ épargne, audit trail OUT (mensualisation) / IN (rapatriement avant échéance).
- **Live decrement** (ADR-010) — « Il te reste » descend quand on saisit une dépense. Le nombre **TICKE** (digit roll), jamais cross-fade. Implémenté par `components/dashboard/HeroAmount.tsx` ; l'optimisme passe par `lib/expenses/optimistic-spend.ts`, qui publie une **figure absolue** et non un delta (un delta produisait une frame fausse — voir le fichier).
- **Détection déficit + rattrapage** (ADR-011) — plan de rattrapage sur 3 mois si déficit Provisions détecté.
- **Santé Provisions** (THI-190) — gauge condensée vert/jaune/rouge du statut Provisions.
- **Prochaines factures J-7 / J-14 / J-30** (THI-192, PR #173) — bucket overdue inclus.
- **Cashflow waterfall** — visualisation Revenus → Effort lissé → **Budget du mois** → Dépensé → **Il te reste**. (Le 3ᵉ palier s'appelait « Plafond » ; l'enveloppe budgétaire a disparu avec ADR-035.)
- **Courbe du mois** (`components/dashboard/MonthCurve.tsx` + `month-curve-geometry.ts`) — cumul des dépenses jour par jour, repère de rythme à `joursEcoules / joursDuMois`, projection de fin de mois en pointillé. Elle ne demande **aucune saisie** : c'est ce qui la rend supérieure à une enveloppe. Verdict en mots, jamais en flèche. **Un seul niveau d'alarme par écran** : dépasser le budget prend `--color-danger`, aller plus vite que le mois prend `--color-warning` — c'est un fait, pas une alarme. Elle ne dit jamais « tu dépenses trop » (R-06). Son tracé se termine sur le « Dépensé ce mois » **reçu**, jamais sur la somme de la série (règle 10). _(Remplace `PaceBar.tsx`, supprimé en #451 — retiré de cette liste le 25 août 2026, même motif que « Pricing » au §10 : une prescription qui nomme un fichier absent envoie écrire du code contre un patron introuvable. La barre plafonnait son remplissage, donc un dépassement de 300 % ressemblait à 1 % ; l'échelle de la courbe s'ouvre.)_
- **Primitive `<Sheet>`** (ADR-037, `components/primitives/Sheet.tsx`) — **le seul** panneau modal. Ne jamais réécrire `Escape`, le piège de focus ou le verrou de défilement : un test échoue sur tout nouveau fichier qui le fait.

Glossaire complet (formes verrouillées + flexions admises) : [`docs/i18n-glossary.md`](../../../docs/i18n-glossary.md).

### 4.2 Vocabulaire interdit (instant reject)

Source : [`docs/ankora-product-quality-bar-v1.md`](../../../docs/ankora-product-quality-bar-v1.md) §2.

**Interdit FSMA (réglementaire — non négociable)** :

- _"vous devriez investir"_, _"nous recommandons d'investir"_, _"placez vos économies"_
- _"conseil financier"_, _"conseiller en placement"_, _"placement conseillé"_, _"rendement garanti"_, _"plus-value garantie"_
- Toute formulation suggérant une promesse de gain ou un conseil personnalisé d'investissement

**Interdit R-06 anti-culpabilisation (doctrine produit verrouillée)** :

- _"tu dépenses trop"_ / _"vous dépensez trop"_
- _"il faut économiser"_ / _"vous devriez économiser"_
- _"tu as manqué ton objectif"_ / _"vous avez manqué votre objectif"_
- _"mauvais comportement budgétaire"_
- _"tu n'es pas raisonnable"_ / _"vous n'êtes pas raisonnable"_

**Interdit marketing trompeur** :

- _"le seul outil qui…"_, _"la meilleure app de…"_
- _"économisez X € par mois"_ (impossible à garantir)
- _"sans effort"_, _"automatiquement"_ (Ankora demande de la saisie, c'est assumé)
- _"IA prédictive avancée"_, _"machine learning"_ (Phase 1 = règles déterministes)

**Interdit jargon corporate** :

- _"burn rate"_, _"runway"_, _"cash flow management"_, _"ROI"_, _"TCO"_, _"EBITDA"_ (jamais en UI)
- _"cash flow"_ nu (préférer _"trésorerie"_ ou _"argent disponible"_)

**Interdit vocabulaire générique faiblard** : `savings`, `budget générique`, `forecast`, `nous recommandons`. Préférer les concepts différenciants Ankora (cf. §4.1).

## 5. Icons

- `lucide-react` only, stroke 1.5, sizes 14/16/18/20/24. If a glyph is missing, draw at stroke 1.5 in a 24×24 viewBox to match.
- Never use unicode arrows/checks as decoration.
- In these preview files the Lucide-matching subset lives in `ui_kits/_shared/icons.jsx` — extend it there if you need a new glyph.

## 6. Components

- Reuse `.btn / .btn-primary / .btn-secondary / .btn-outline / .btn-ghost`, `.card`, `.glass`, `.input`, `.label`, `.badge`, `.num`, `.micro` from `ui_kits/_shared/shell.css`. These compile from the tokens — never restyle them with ad-hoc CSS.
- Liquid Glass surfaces are **multi-layer**: blur + `color-mix` tint + inset edge highlight + `prefers-reduced-transparency` opaque fallback. Single-layer `backdrop-filter` is rejected.

## 7. Motion

- Durations: 120/200/320ms. Easing: `var(--ease-spring)` — never `linear`, never `ease`.
- Respect `prefers-reduced-motion` on every animation. The token stylesheet wires this globally; don't override it.
- Number changes should tick (digit roll), never cross-fade.

## 8. Forbidden (instant reject)

- Bento grids of equal cards · emoji icons · `$` signs · historic bar charts · hardcoded hex outside `colors_and_type.css` · Rocket Money / Nubank / N26 aesthetic cues · copy suggesting investment advice · AI-generated hero illustrations · gradient-heavy backgrounds · **any PSD2 / bank-picker / IBAN-import UI** · paid pricing tiers (v1.0 is free only).

## 9. When the user asks for a new screen

1. Pick the right accent (user → teal, admin → laiton).
2. Start from the nearest existing **React component** in `src/components/` (cf. §10) and extend — don't fork the tokens.
3. **Numbers use `font-variant-numeric: tabular-nums`** (Tailwind utility `tabular-nums`). Source of truth in `src/app/[locale]/app/page.tsx` (e.g. line 267 stat blocks). The legacy `.num` class from the mockup ZIP is **deprecated**.
4. Status pills pick one of `.badge-{paid,scheduled,action,received,manual}` (composed via `class-variance-authority` in `src/components/ui/`).
5. Surface privacy/consent copy — Ankora is manual-entry only: _"Saisie manuelle · données hébergées en Belgique · export RGPD à tout moment."_ Never mention PSD2.
6. If you need a new component shape, add it to `src/components/ui/` or `src/components/features/` with Tailwind v4 `@theme` tokens — never restyle existing primitives ad-hoc.

## 10. Surfaces overview — production React components

> ⚠️ **Source de vérité production**, pas les mockups d'archive. Les anciens dossiers `ui_kits/user_dashboard/`, `ui_kits/admin_dashboard/`, `ui_kits/landing_page/`, `ui_kits/onboarding/` vivent désormais dans `ankora-mockups/` (HORS repo, archive @cc-design). Le code ci-dessous est ce qui rend en production sur `ankora.be`.

- **Landing marketing** — `src/components/marketing/landing/sections/*` (Hero, Principles, Feature, WhatIfDemo, WhatIfDemoClient, FAQ, FooterCTA, MktNav, MktFooter). Composé dans `src/app/[locale]/(public)/page.tsx`. _(« Pricing » retiré de cette liste le 8 août 2026 : le composant a été supprimé en #307 — la liste périmée renvoyait le lecteur sur une section inexistante, et §0 rappelle qu'aucune surface tarifaire ne doit exister en Phase 1.)_
- **Dashboard user (cockpit)** — `src/app/[locale]/app/page.tsx` orchestre les surfaces, qui rendent via `src/components/dashboard/*` (SituationDuMoisHero + HeroAmount + MonthCurve + StatusChip + AllocationBar, ProvisionHealthGaugeCard, ProchainesFacturesCard) + `src/components/features/AccountCard.tsx` (compte épargne · trois lectures). Hero « Situation du mois » : chiffre-héros **« Il te reste »** en temps réel + ancre « Budget du mois » + courbe du mois, puis la cascade (ADR-035). Santé Provisions (THI-190), Prochaines factures (THI-192), Assistant Virements (ADR-012). _(`PaceBar` retiré le 25 août 2026 — supprimé en #451.)_ ⚠️ **Cette liste est refaite en bloc par la PR 3-bis** du plan cockpit, quand les PR 2a/2b/3 auront fini d'invalider `ProvisionHealthGaugeCard` et `ProchainesFacturesCard` ; ici on ne retire que ce qui est **déjà** faux.
- **Saisie de dépense** — `src/components/expenses/AddExpenseSheet.tsx`, ouvert par le ⊕ central de `BottomTabBar`. **2 taps depuis n'importe quel écran** ; toute modification qui ajoute un champ obligatoire casse ce contrat. Les figures du mois sont assemblées une seule fois par `lib/data/month-situation.ts` — ne pas recopier l'assemblage, les deux surfaces se contrediraient.
- **Admin panel** — `src/app/[locale]/admin/page.tsx` (RBAC `requireAdmin()` côté serveur). Bloc E sections : Santé technique, Santé produit, Acquisition, Recommandations rule-based. ⚠️ Vertical slice complet en branche **`feat/pr-b2-mock-vertical-slice`** (paused volontaire post-Beta).
- **Onboarding** — `src/app/[locale]/onboarding/page.tsx` + `OnboardingWizard.tsx`. 3 étapes : structure compte → starter envelopes → provisions annuelles. Manual-entry only, jamais d'interface PSD2.
- **Header / Nav** — `src/components/layout/Header.tsx` (Server Component) + `HeaderNav.tsx` (Client + drawer mobile via Portal stacking-context fix PR #171, scroll-lock iOS PR #176).
- **LocaleSwitcher** — `src/components/layout/LocaleSwitcher.tsx`. Visible v1.0 = FR + EN seul. NL/DE/ES en backlog v1.1.

## 11. Sources de vérité doctrine (à lire AVANT toute UI)

Ces documents ont **priorité absolue** sur ce skill en cas de conflit. Ordre de priorité : NORTH_STAR > ADR > Quality Bar > ce SKILL.

- [`docs/NORTH_STAR.md`](../../../docs/NORTH_STAR.md) — vision + cap v1.0 publique (12 semaines depuis 23/04/2026) + 5 piliers + 9 contraintes non négociables + cibles mesurables.
- [`docs/ankora-product-quality-bar-v1.md`](../../../docs/ankora-product-quality-bar-v1.md) — référence unique décisions produit / UX / contenu jusqu'à v1.0. Vocabulaire recommandé + interdit + règles hiérarchie cognitive. **Créé 23/05/2026 par @cowork**.
- [`docs/adr/ADR-008-*`](../../../docs/adr/) — Compte épargne · trois lectures (différenciateur n°1).
- **[`docs/adr/ADR-035-vocabulaire-des-quatre-chiffres.md`](../../../docs/adr/ADR-035-vocabulaire-des-quatre-chiffres.md) — LE glossaire du cockpit. À lire avant toute UI qui affiche un montant.** Amende ADR-009 : la capacité d'épargne cesse d'être un chiffre d'interface, et l'enveloppe budgétaire disparaît entièrement.
- [`docs/adr/ADR-036-token-warning-9a3412.md`](../../../docs/adr/ADR-036-token-warning-9a3412.md) — `--color-warning` doit passer AA **et** rester séparé du laiton admin. Deux critères, deux assertions calculées.
- [`docs/adr/ADR-037-primitive-sheet.md`](../../../docs/adr/ADR-037-primitive-sheet.md) — la primitive `<Sheet>` unique, et pourquoi pas Radix.
- [`docs/adr/ADR-009-capacite-epargne-reelle.md`](../../../docs/adr/) — **amendé par ADR-035**, à ne plus citer seul.
- [`docs/adr/ADR-010-*`](../../../docs/adr/) — Live decrement (`useOptimistic`).
- [`docs/adr/ADR-011-*`](../../../docs/adr/) — Détection déficit + rattrapage 3 mois.
- [`docs/adr/ADR-012-assistant-virements.md`](../../../docs/adr/) — Assistant Virements (gradient bleu-vert).
- [`docs/adr/ADR-017-plans-apurement.md`](../../../docs/adr/) — Plans d'apurement (table `installment_plans`).
- [`docs/adr/ADR-018-provisions-bidirectionnelles-audit-trail.md`](../../../docs/adr/) — Ballet provisions OUT/IN.
- [`docs/i18n-glossary.md`](../../../docs/i18n-glossary.md) — termes verrouillés (Ankora, cockpit, lissage, provisions, etc.) + don't-translate list.

## 12. Agents QA visuels obligatoires (avant merge)

Toute PR qui modifie une surface UI doit passer l'agent QA dédié AVANT merge :

- **`dashboard-ux-auditor`** (`.claude/agents/dashboard-ux-auditor.md`) — toute modification de `src/app/[locale]/app/**` ou `src/components/dashboard/*`. Vérifie cohérence avec NORTH_STAR (Dashboard Excellence non négociable, niveau Monarch Money, 8 sections cockpit v3 obligatoires).
- **`admin-dashboard-auditor`** (`.claude/agents/admin-dashboard-auditor.md`) — toute modification de `src/app/[locale]/admin/**`. Vérifie RBAC `requireAdmin()` côté serveur + 4 sections admin obligatoires.
- **`ui-auditor`** — audit générique mobile-first WCAG 2.2 AA, viewport Chromium. Toute PR UI.
- **`mobile-ios-auditor`** — toute modif layout / nav / forms / dashboard mobile / drawer / theme toggle. Procédure manuelle iPhone réelle : [`docs/runbooks/dev-on-iphone.md`](../../../docs/runbooks/dev-on-iphone.md).
- **`i18n-auditor`** — toute édition `messages/*.json`, `src/i18n/`, ou Server Components avec `getTranslations`/`useTranslations`.
- **`lighthouse-auditor`** — avant release candidate.

Voir [`CLAUDE.md` §"Workflow agents"](../../../CLAUDE.md) pour la liste complète des 13 agents QA Ankora + leurs scopes respectifs.
