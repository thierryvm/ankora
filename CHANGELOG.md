# Changelog

All notable changes to Ankora are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Phase 2 MVP — complete end-to-end scope (auth, onboarding, dashboard, settings, PWA, GDPR).

### 2026-05-23 — PR-FIX-DRAWER mobile bugs (THI-250 + THI-251)

- **THI-250 fix(nav)** — drawer mobile: iOS-robust scroll lock via `position: fixed` + scrollY save/restore (pattern Stripe/Linear/Notion). The previous `document.body.style.overflow = 'hidden'` lock was silently ignored by WebKit on iOS — the page behind the overlay kept scrolling on swipe. Symptom flagged on iPhone real device + PWA standalone during smoke test 2026-05-19 post-merge of PR #173 + PR #174. 3 new Vitest specs + 3 new Playwright Chromium-mobile specs guard the contract (open pins body, close restores body + window.scrollY, Escape works too).
- **THI-251 fix(nav)** — drawer mobile: `pt-[env(safe-area-inset-top)]` on the drawer wrapper aside so the close X button is no longer rendered behind the iPhone status bar (notch / dynamic island) in PWA standalone mode. The site already declared `viewport-fit=cover` in `[locale]/layout.tsx`; the drawer was missed because it lives inside a Portal child of `<body>` (PR #171) and didn't inherit the sticky header's inset. 1 new Vitest spec + 1 new Playwright spec assert the utility class is applied.

### 2026-05-09 — Clôture session marathon : design Ankora V1.0 entièrement figé

- **Bloc E Session #5 Admin Panel V1 livré et validé** (Claude Design) : 4 sections complètes (Santé technique avec Upstash 84% + Sentry 3 erreurs / Santé produit MAU + Drop-off / Acquisition Top 5 sources + sparkline 12 signups 30j / Recommandations rule-based 5 patterns avec `pattern_id` traçables). R-02 FSMA-safe affiché explicitement en eyebrow « pattern engine · pas de LLM (R-02) ». R-06 anti-culpabilisation exemplaire sur reco rouge : « besoin d'un coup de pouce pour boucler son mois — pas d'un mail commercial » → voix Ankora à l'état pur, à utiliser comme template pour toutes les futures recos.
- **Patch finalisation Bloc E** rédigé dans `outputs/patch-bloc-e-admin-finalisation.md` : 4 ajustements ciblés à appliquer via @cc-design — (1) recolorisation sémantique des signaux pour fixer thème clair monochrome laiton (icône warning « Signal santé rouge » → `--color-danger`, trophy « Premier objectif Matelas atteint » → `--color-success`, sparkline + titres sections → `--color-brand-500` teal, laiton conservé pour Upstash 84% et Drop-off uniquement), (2) atom 10 ThemeToggle light/dark dans header admin (parité dashboard user), (3) atom 11 LangSwitcher FR-BE/EN dans header admin (next-intl pattern), (4) RBAC visible (badge sticky « Zone admin · réservée fondateur » + nav conditionnelle `isAdmin` qui n'affiche l'item « Admin » que pour Thierry + helper `requireAdmin()` server-side basé sur `ADMIN_USER_IDS` env var + footer disclaimer « Données admin · accès restreint · audit log activé »).
- **ADR-017 Plans d'apurement** rédigé dans `docs/adr/ADR-017-plans-apurement.md`, statut `Proposed`. Table `installment_plans` avec FK workspace_id/account_id/category_id + champs total_amount/installments_count/installment_amount_std/installment_amount_final (ajustement dernière échéance) + payment_day/start_date/end_date GENERATED + direction enum out/in + paused_until + RLS workspace-scoped. Lien `transactions.installment_plan_id` + `installment_index` ON DELETE CASCADE. Server Action `createInstallmentPlan(input)` avec génération auto N transactions pré-créées status pending + audit log. UI Surface 1 livré Bloc B, drawer drilldown avec actions Modifier/Supprimer livré Patch 2. 4 alternatives évaluées (rejetées) + plan PR-D5 + 5 risques + 5 métriques succès + 5 cas d'usage typiques (apurement fiscal Thierry 2 407 €/11×, plan accordé fournisseur énergie 600 €/6×, restitution trop-perçu fiscal direction in, paiement étalé d'amende).
- **ADR-018 Provisions bidirectionnelles audit trail** rédigé dans `docs/adr/ADR-018-provisions-bidirectionnelles-audit-trail.md`, statut `Proposed`. Capture le verbatim Thierry : « les montants qui partent vers compte de lissage, reviennent toujours vers compte courant pour payer la bonne facture au bon moment ». Table `provision_transfers` (raffinement ADR-002 sans dupliquer les soldes — FK 1-1 vers `account_transfers` ON DELETE CASCADE) + direction enum out (mensualisation) / in (rapatriement avant échéance) + recurring_template_id + provision_cycle_year + settlement_transaction_id + installment_plan_id (lien rare ADR-017) + RLS workspace-scoped. Invariants comptables : OUT cumulés ≥ IN cumulés par cycle, cycle clos = 1 settlement, ADR-002 préservé (zéro double-comptage). UI onglet Mouvements CompteEpargne livré Bloc B + drawer drilldown par cycle + tooltip pédagogique « L'argent ne disparaît pas — il attend que la facture tombe » + notif J-3 in-app + ajustement manuel R-10 + mode « cycle rompu » R-06 anti-culpa 3 chemins. 4 cycles seedés Thierry mai 2026 (Taxe voiture 25 €/mois × 12 → 300 € au 28/05 actif, Taxe poubelle 120 € + Taxe égout 55 € + Dashlane 53 € clôturés en mars/avril). 4 alternatives évaluées + plan PR-D5 + 5 risques + 5 métriques succès.
- **Brief PR-D4 PHASE 2 enrichi** dans `prompts/PR-D4-PHASE2-cd3-integration.md` (ADDENDUM 2026-05-09 sections A→K) : 11 atoms total (au lieu de 8 — ajout Tabs + ThemeToggle + LangSwitcher), ADR-009 amend impact direct HeroWaterfall + SignauxCard avec décomposition pédagogique 662/500/162 €, R-14 audit i18n FR-BE 100% obligatoire avant merge, R-13 préparation `included_services` jsonb, ADR-017 stub Surface 1 Plans d'apurement avec drawer, ADR-018 stub onglet Mouvements CompteEpargne, RBAC admin complet (helper `requireAdmin()` + layout admin protégé + nav conditionnelle sidebar user + badge sticky + footer disclaimer + audit log obligatoire), bug CSS résiduel CompteEpargne (#203), ~25 clés i18n additionnelles, 4 tests Vitest + 2 e2e additionnels, table garde-fous R-01 à R-14.

### 2026-05-09 (matin) — Marathon Bloc D Onboarding + Bloc E Admin + ADR-009 amendé + R-13/R-14

- **ADR-009 amendé** dans `docs/adr/ADR-009-capacite-epargne-reelle.md` avec section "Amendement 2026-05-09" : clarification du wording UX en 3 concepts distincts (Reste disponible / Reste à vivre / Capacité d'épargne réelle). La formule mathématique reste identique, mais le KPI affiché doit être 162 €/mois (pas 662) pour Thierry mai 2026 (= 662 reste disponible − 500 reste à vivre estimé). Workspace_settings reçoit `reste_a_vivre_default` + `reste_a_vivre_overrides` JSONB pour ajustements mensuels (R-10).
- **Bloc D Session #4 Onboarding livré** (Claude Design) : 7 fichiers (`surfaces/onboarding/index.html` + `onboarding.css` + `providers.js` ~70 fournisseurs catalogue belge + 90+ clés i18n FR-BE + `stepper.jsx` + `step1.jsx` + `step2.jsx` 3 voies catalogue/import/saisie + `step3.jsx`). Showroom 3 étapes côte à côte + parcours interactif Live. Audit R-06 anti-culpabilisation explicite (helpers RAV neutres aux 3 ratios, signal rouge formulé "reprendre le contrôle, pas se culpabiliser").
- **Bloc E Session #5 Admin Panel V1** brief envoyé à Claude Design (4 sections : Santé technique Vercel/Supabase/Upstash/Sentry, Santé produit Signups/Onboardings/MAU/Drop-off, Acquisition Top 5 sources, Recommandations rule-based). Layout grid 2x2 desktop / onglets mobile. R-01 FSMA-safe + R-02 budget 0€ + R-06 anti-culpa + R-07 mobile-first + R-14 i18n FR-BE 100%.
- **7 micro-fixes consolidés** appliqués post-Bloc B : delta wrapping `+ 13,8 %`, narration "Ton année" Option A FSMA-safe, Plans d'apurement multi-plans (Plan accordé énergie 600 €/6× ajouté) + boutons Modifier/Supprimer dans drawer, bug CSS ProgressBar split AFFECTÉES/LIBRE (jonction nette pixel-perfect), Capacité d'épargne réelle 162 € avec sub-stats Reste à vivre 500 € ajustable, persona Thierry tension financière micro-copy, Assistant Virements seeds remplacés par "Mois calme" (vraies données mai 2026).
- **R-13 services bundlés enrichie** (`_regles-decisions-critiques.md` Obsidian) : 2 cas confirmés chez Thierry → Orange 89 €/mois inclut Netflix + Assurance auto 150 €/mois est un PACK (auto + habitation + incendie + familiale). Implication critique : pas d'invention de "Mutuelle annuelle 848 €" ni "Assurance habitation 420 €" dans les seeds — tout est mensualisé.
- **R-14 nouvelle règle UI 100 % FR-BE** ajoutée : tout texte d'interface en français de Belgique, sauf termes consacrés universels (IBAN, EUR, OK, PIN, Email).
- **Profil financier Thierry consolidé** dans `_donnees-thierry/profil-financier.md` (Obsidian) : 3 concepts détaillés, vraie liste annuelles confirmée (Taxe poubelle 120 € + Taxe égout 55 € + Dashlane 53 € + Taxe voiture 300 €), souhait épargne addit explicite ~100 €/mois, contexte persona "0 € sorties par manque d'argent" (à respecter en UX, jamais culpabiliser).

### 2026-05-08 — Session Claude Design #3 close + ADR-016 + Brief PR-D4 PHASE 2

- **Hero waterfall pivoté en Option C bidirectionnel** : abandon du waterfall classique (cascade descendante avec barres négatives suspendues) au profit d'un layout **bidirectionnel ancré sur baseline 0** (positives MONTENT au-dessus, négatives DESCENDENT en-dessous). Plus consumer-friendly et pédagogique.
- **8 atoms livrés** par Claude Design dans `_shared/atoms/` côté projet design : Button, Chip, Card, Drawer (EditDrawer single source of truth), ProgressBar, Avatar/Icon, ColorPicker, IconPicker. Aucune nouvelle dépendance npm requise pour l'intégration.
- **4 surfaces complètes** : Dashboard cockpit (avec hero Option C + Compte Épargne 3 lectures + Bloc 4 Signaux + Activité + Année + Objectifs), Charges fixes enrichie (21 charges 8 catégories), Dépenses, Catégories (drag-to-reorder + soft-delete vers "Autres" `is_system` protégée).
- **Mini-fix doublon 630 €** : suppression de la chip teal flottante en bas-droite du hero, conservation du label triple-ligne au-dessus de la barre Reste (Reste disponible / + 630 € / + 87 € vs. mars).
- **ADR-016 — Tracking paiements multi-sources** rédigé dans `docs/adr/ADR-016-tracking-paiements-multi-sources.md`, statut `Proposed`. Décision : Option 2+3 hybride (récurrents pré-déclarés + saisies ponctuelles + présomption automatique J+3 désactivable + import CSV 5 sources Coda/Notion/Excel/Sheets/Airtable). Catalogue belge 28 fournisseurs (mutuelles, banques, telco, énergie, assurances, abonnements digitaux). Strict mode opt-in. Sanitize CSV injection OWASP. Notif in-app uniquement V1 (budget 0 €), email V1.1 post-MRR. Mobile UX tap-drawer 3 actions.
- **Brief PR-D4 PHASE 2** prêt-à-coller dans `prompts/PR-D4-PHASE2-cd3-integration.md` (intégration React/Tailwind des 8 atoms + Surface 1 cockpit complète). 11 sections incluant pseudocode SVG hero waterfall + helpers `topRoundedPath` / `botRoundedPath` + i18n FR-BE ~80 clés listées + Définition de DONE 5 critères stricts.

### Documentation

- Note Obsidian wrap-up de session : `Athenaeum/10_Projects/ankora/cowork-handoffs/2026-05-08-fin-session-cd3-option-c-validee-tracking-paiements.md`
- Tri des doublons côté projet design : `user_dashboard/` V1 obsolète archivé dans `_archive_v1/user_dashboard/` (traçabilité préservée, pas de suppression destructive).

## [0.2.0] — 2026-04-17

### Added

- **Authentication** — signup / login / password reset / OAuth callback.
- **MFA** — TOTP enrollment + verification + unenroll (Google Authenticator compatible).
- **Onboarding** — 3-step wizard (workspace, first charge, first source).
- **Dashboard** — CRUD for charges, sources, categories, budgets.
- **Domain layer** — pure financial calculations with Decimal.js (provision, budget, simulation, balance).
- **Settings** — profile editing, MFA management, session list, GDPR export, account deletion with 30-day grace.
- **PWA** — service worker, offline fallback, manifest, installable icons.
- **GDPR** — consent banner, data export (art. 20), deletion flow (art. 17), audit log with pseudonymisation.
- **Security** — CSP with per-request nonce, HSTS preload, rate-limit multi-bucket (auth/api/mutation/export), audit events.
- **Tests** — 77 Vitest unit tests, 15 Playwright e2e scenarios across Chromium + WebKit.
- **CI** — GitHub Actions pipeline (lint, typecheck, vitest, playwright, lighthouse, npm audit).
- **Docs** — README SEO/GEO-friendly, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, issue/PR templates.

### Security

- CSP with `strict-dynamic` and per-request nonce (nanoid).
- X-Frame-Options `DENY` + `frame-ancestors 'none'`.
- HSTS preload (2 years).
- Rate-limit fail-open graceful fallback when Upstash Redis env is missing (dev only, warns in prod).
- Open-redirect protection on `/auth/callback` `next` param.
- Zod validation on every Server Action (no trusting client IDs).
- Generic error messages on auth actions (no Supabase error leakage).

### Privacy

- Analytics opt-in only (Vercel Analytics disabled until consent).
- Audit log unreadable from client JWTs (revoked from `anon` and `authenticated`).
- Audit metadata sanitised via whitelist before persistence.
- Account deletion pseudonymises audit log rows instead of deleting them (art. 17(3)(b)).

## [0.1.0] — 2026-04-16

### Added

- Initial project scaffold (Next.js 16, TypeScript strict, Tailwind 4, Supabase).
- Base UI — layout, branding, theme tokens, cookie banner, landing, marketing pages, FAQ, legal pages.
- Initial Supabase schema with Row Level Security on all tables.
