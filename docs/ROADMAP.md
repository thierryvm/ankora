# Roadmap — Ankora

Dernière mise à jour : 2 mai 2026 — Série PR-3 complète mergée (PR-3a tokens/fonts, PR-3b atomic UI, PR-3c-1/2/3 landing fusion). Polish post-merge en cours sur `feat/hero-waterfall-3steps`. Prochaine décision stratégique @thierry : (A) lancer **PR-2 traductions NL/EN/ES/DE** (séquence ROADMAP nominale) OU (B) **Session Claude Design #3 pour Dashboard v3** (cf. handoff dormant A4 dans `90_Meta/cc-prompts-en-attente.md` du vault Athenaeum). Cf. [ADR-005](./adr/ADR-005-pr3a-anticipated-design-system.md) pour l'historique du re-séquencement PR-3.

## Cap v1.0 publique — Vision & Jalons (23 avril 2026)

**Source unique de vérité** : `docs/NORTH_STAR.md` (19 avril 2026). Ce document consolide la vision v1.0 publique, les 5 piliers parallélisables, les contraintes non négociables et les cibles mesurables.

### Trois jalons verrouillés

| Jalon     | Horizon      | Contenu minimal                                                                                    |
| --------- | ------------ | -------------------------------------------------------------------------------------------------- |
| **Alpha** | ~4 semaines  | Thierry + 2-3 proches, FR seul, auth + onboarding + CRUD + dashboard v3 + simulateur + MFA         |
| **Beta**  | ~8 semaines  | 5-10 testeurs, CGU/Privacy UE+BE 2026, GDPR export/delete, bug reporting live, Klaro!              |
| **v1.0**  | ~12 semaines | Signups ouverts ankora.be, FR + EN, AEO complet, Lighthouse 100, /roadmap publique, admin panel v1 |

### Cinq piliers parallélisables

- **A — Fondations & Hygiène** : ROADMAP sync, agents QA (10), CI gates (Sourcery, Lighthouse budget), branch protection
- **B — Product Excellence** : recherche concurrentielle (12 acteurs), mockups user dashboard v3, admin panel v1, design tokens finaux
- **C — Core Fonctionnel** : auth + MFA, onboarding 3 étapes, CRUD charges/dépenses, dashboard core, simulateur intégré, goals
- **D — Sécurité & Légal** : CGU/Privacy en langue user (BE 2026), Klaro! TCF v2.2, GDPR export/deletion, rate limiting, audit log
- **E — SEO/AEO/Perf** : schemas JSON-LD fintech, llms-full.txt, /roadmap publique, Lighthouse 100/100/100/100, Service Worker

Cowork pilote A+B+contenus D/E. CC Ankora pilote C+tech D/E. Thierry valide + merge.

---

## Agents QA Pilier A (10 au total)

Tous les agents résident dans `.claude/agents/` et sont trigger-driven. Chaque agent valide un domaine critique avant merge.

| #   | Agent                         | Domaine                           | Trigger                 | Gate            |
| --- | ----------------------------- | --------------------------------- | ----------------------- | --------------- |
| 1   | `security-auditor`            | Auth, middleware, RLS, headers    | touch auth/\*\*         | ✅ requis       |
| 2   | `rls-flow-tester`             | Supabase RLS + migrations         | touch migrations/\*\*   | ✅ requis       |
| 3   | `financial-formula-validator` | `src/lib/domain/`                 | touch domain/\*\*       | ✅ requis       |
| 4   | `ui-auditor`                  | WCAG 2.2 AA, mobile, Tailwind 4   | touch components/\*\*   | ✅ requis       |
| 5   | `lighthouse-auditor`          | Performance, a11y, BP, SEO        | pre-release only        | ✅ requis RC    |
| 6   | `seo-geo-auditor`             | SEO signals, entity consistency   | touch public pages      | ✅ requis       |
| 7   | `gdpr-compliance-auditor`     | PII, consent, export, deletion    | touch PII, auth, D-lang | ✅ requis       |
| 8   | `test-runner`                 | Vitest + Playwright               | post-change             | ✅ requis       |
| 9   | `dashboard-ux-auditor`        | User dashboard UX + design tokens | touch app/app/\*\*      | ✅ requis PR-3  |
| 10  | `admin-dashboard-auditor`     | Admin security, perf, a11y        | touch app/admin/\*\*    | ✅ requis PR-B2 |

**Note sur les triggers** : Les chemins documentés (ex. `touch auth/**`, `touch app/app/**`) définissent les cas d'usage _intentionnels_ pour chaque agent. L'invocation manuelle reste primaire pour la Phase 1. Une automatisation CI complète (détection de fichiers + dispatch d'agents) est une future amélioration Pilier A (Phase 2+).

---

## ⚠️ Contrainte transverse : Budget 0 €

Tant que Ankora n'a pas de revenus, **aucune dépendance payante n'est tolérée en production**. Ce principe couvre tous les PR de ce document et doit être validé pour toute nouvelle brique :

- Hosting : **Vercel Hobby** (gratuit, limites suffisantes pour un MVP personnel)
- Database + Auth + Storage : **Supabase Free** (500 Mo DB, 50 k MAU, 5 Go bandwidth, 1 Go storage)
- Rate limiting : **Upstash Free** (10 k commandes/jour)
- CI/CD : **GitHub Actions** (repo public = illimité)
- Monitoring applicatif : deux options acceptables tant qu'elles restent 0 € — (a) capteur maison intégré à Supabase (voir PR-B1), ou (b) **Sentry Developer free tier** (5 000 erreurs/mois, 10 k performance units, 50 replays, 1 user) via l'intégration native Vercel. Décision finale prise dans PR-B1 (voir §PR-B1 — décision Sentry vs capteur maison).
- Traductions : **IA locale via Claude Code** (utilise la session Claude de Thierry), jamais d'appel API payant. DeepL free tier accepté uniquement pour review ponctuelle, pas en build pipeline.
- IA produit : **aucun appel LLM côté serveur en Phase 1**. Phase 2 = BYOK (utilisateur fournit sa clé Anthropic/OpenRouter), Ankora ne facture jamais le compute. Confirmation Thierry 2026-04-18 : "pour la partie IA, on utilisera BYOK plus tard".
- Recommandations admin : **rule-based** (seuils, compteurs, regex), **pas de LLM** en Phase 1. Upgrade LLM possible en Phase 2 via la clé BYOK de l'utilisateur (pas Ankora qui facture).

Toute PR introduisant un service tiers facturé **doit d'abord obtenir validation explicite de Thierry**. Pas d'exception silencieuse.

---

## Ordre d'exécution des PR techniques

L'ordre ci-dessous est **verrouillé**. Il a été pensé pour que chaque PR débloque la suivante sans dette technique ni retouche arrière.

**Re-séquencement 2026-04-25** : PR-3 monolithique splittée en **PR-3a/b/c** ; PR-3a anticipée avant PR-2/PR-B1 comme socle architectural. Justification complète : [ADR-005](./adr/ADR-005-pr3a-anticipated-design-system.md).

| #   | PR                                                    | Statut                                                                                                                                                                                   | Bloquant pour | Raison d'être                                                                               |
| --- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------- |
| 1   | **PR-1 — Socle i18n next-intl**                       | ✅ mergée                                                                                                                                                                                | PR-1bis       | Route group `[locale]` + 5 locales                                                          |
| 2   | **PR-Q — OpenGraph statique**                         | ✅ mergée                                                                                                                                                                                | —             | 5 PNG 1200×630 générés via Playwright                                                       |
| 3   | **PR-1bis — Extraction i18n routes privées**          | ✅ mergée (a491297, 18 avril 2026)                                                                                                                                                       | PR-2          | Clés i18n pour auth + app + onboarding                                                      |
| 4   | **PR-3a — Design System socle (DS + tokens + fonts)** | ✅ mergée (rapport `docs/prs/PR-3a-tokens-fonts-skill-report.md`, 26 avril 2026)                                                                                                         | —             | Tokens canoniques, fonts, SKILL `ankora-design-system` — socle visuel livré                 |
| 5   | **PR-3b — Atomic UI kit**                             | ✅ mergée (PR #67, 24 avril 2026)                                                                                                                                                        | —             | `src/components/ui/` (Button, Card, Input, Badge…) + tests Vitest                           |
| 6   | **PR-3c — Landing fusion intelligente**               | ✅ mergée en 3 sous-PRs : #76 (PR-3c-1 foundation), #78 (PR-3c-2 MktNav+Hero), #82 (PR-3c-3 WhatIfDemo) — 27/28 avril 2026. Polish post-merge en cours sur `feat/hero-waterfall-3steps`. | —             | Fusion ossature TSX/RSC actuelle ↔ apports cc-design (hero waterfall, simulator, pricing)   |
| 7   | **PR-2 — Traductions NL/EN/ES/DE**                    | ⏳ en attente — débloquée par PR-3 mergée                                                                                                                                                | —             | Remplissage des 4 locales non-FR                                                            |
| 8   | **PR-B1 — Bug reporting MVP**                         | 📋 prompt prêt (`prompts/PR-B1-bug-reporting-mvp.md`) — exécutable en parallèle de PR-2                                                                                                  | —             | Capteur d'erreurs + widget avant QA lourde dashboard v3                                     |
| 9   | **PR Dashboard v3 (Pilier B/C)**                      | 📋 handoff dormant A4 (cf. `90_Meta/cc-prompts-en-attente.md` du vault Athenaeum) — prérequis : Session Claude Design #3                                                                 | —             | 8 sections obligatoires Monarch-level (cashflow waterfall, health score, timeline 6m, etc.) |
| 10  | **PR-F — Rétro-planning provisions**                  | 💡 idée                                                                                                                                                                                  | PR-B2         | Alertes J-N avant retrait d'épargne                                                         |
| 11  | **PR-B2 — Admin panel complet**                       | 💡 idée (post-MVP)                                                                                                                                                                       | —             | Dashboard santé + métriques + règles                                                        |

Signification des icônes : ✅ mergée · 🚧 en cours · ⏳ en attente d'un prérequis · 📋 prompt rédigé prêt à exécuter · 💡 idée cadrée mais pas encore de prompt.

### Pourquoi PR-3a avant PR-2 et PR-B1 ?

PR-3a livre les **tokens canoniques + fonts + SKILL `ankora-design-system`** sans toucher aux composants ni aux pages. Sans cela :

- **PR-2** traduirait des chaînes UI qui changeront visuellement en PR-3b/c (re-traduction inutile sur copies obsolètes)
- **PR-B1** construirait son widget bug-reporting sur des primitives `Button`/`Card`/`Modal` qu'il faudrait re-styler en PR-3b
- **PR-3b** travaillerait sur des tokens incohérents avec le DS final

PR-3a est un **socle architectural** (≤ 400 lignes, 0 régression UI possible) qui débloque proprement la suite.

### Pourquoi PR-B1 avant PR-3b/c ?

PR-3b (composants atomiques) et surtout PR-3c (Landing fusion) vont générer des bugs subtils de style/interaction/a11y. Si PR-B1 est en place **avant** PR-3b/c, chaque bug rencontré en QA génère un bundle markdown copiable en 2 clics vers Claude Code. Gain de temps majeur sur le debugging.

---

## Dettes post-PR-1bis (à solder avant PR-2)

Trois PRs atomiques enchaînées **dans cet ordre** pour éviter les conflits sur `messages/*.json` et les diffs Tailwind qui touchent partout. Chaque item fait l'objet d'une PR dédiée (pas de bundling).

- [x] **`chore(i18n): remove obsolete dashboard keys`** — mergée PR #20 (commit b13e52c, 18 avril 2026). 10 clés orphelines (`title`, `welcome`, `subtitle`, `emptyState`, `cards.*`) retirées sur 5 locales (−90 lignes).
- [x] **`feat(i18n): locale-aware formatters`** — mergée PR #21 (commit 4b5e045, 18 avril 2026). `src/lib/i18n/formatters.ts` avec `formatCurrency`, `formatDate`, `formatDateTime`, `formatMonth`, `formatNumber`, `formatPercent`. Cache Intl par locale. Migration complète : 8 fichiers (`page.tsx` dashboard, `deletion-status`, 4 `*Client.tsx`, `SettingsClient`) + suppression de `src/lib/format.ts`. Tests Vitest 20 cas sur 5 locales, coverage 100/100/95 lines/funcs/branches. **Conditionne le port des mockups v2** (affichage `1 234,50 €` en fr-BE vs `€1,234.50` en en).
- [x] **`chore(tailwind): migrate to canonical classes`** — **Verified compliant 2026-04-19** (audit zéro inline colors, repo déjà 100% tokens canoniques). Pas de migration nécessaire. Audit report sauvegardé : `docs/tailwind-canonical-audit.md`. Mergée PR #23.
- [x] **#61 — Aligner classes Tailwind legacy sur convention canonique** — `text-(--color-muted-foreground)` → `text-muted-foreground`. Les deux marchent en v4 mais la convention canonique est maintenant le standard (introducée dans Header refactor commit 354ad28). Alignement complet du codebase (38 fichiers, ~150 instances) — commit 1 du refactor/post-pr25-debts (2026-04-19).
- [x] **PR #27 — Code review cleanup + i18n parity** — Consolidation finale : CSP nonce, centralisation brand constants, extraction formatters i18n, alignement Tailwind, parité messages de-DE (6 clés placeholder). Mergée 2026-04-20 (581641d).

---

## Prochaine feature majeure

**Série PR-3 complète ✅ mergée** (PR-3a tokens/fonts, PR-3b atomic UI, PR-3c-1/2/3 landing fusion). Le Design System cc-design est intégré, la landing publique est en place, le polish Hero waterfall 3 étapes est en cours sur `feat/hero-waterfall-3steps`.

**Décision stratégique @thierry — 2 voies parallèles possibles** :

- **Voie A (séquence ROADMAP nominale)** — **PR-2 traductions NL/EN/ES/DE** : remplir les 4 locales non-FR maintenant que les copies UI sont stabilisées par PR-3c. Glossaire fintech multi-locale déjà rédigé (cf. tâche #113 completed). Préalable simple à débrider, débloque le jalon Beta multilingue.
- **Voie B (vision Pilier B Dashboard Excellence)** — **Session Claude Design #3 pour Dashboard v3** : produire les mockups de la surface stratégique (8 sections Monarch-level). Handoff dormant A4 prêt dans `90_Meta/cc-prompts-en-attente.md` (vault Athenaeum) — déclenchable une fois le brief design préparé par @cowork et le ZIP intégré dans `ankora-mockups/`.

**Recommandation @cowork** : Voie A en premier (1-2 semaines) pour solder la dette i18n côté landing avant qu'elle ne s'accumule sur Dashboard v3. Voie B suit naturellement avec brief design en parallèle pendant l'exécution PR-2. PR-B1 (bug reporting MVP) reste exécutable en intercalaire si besoin.

**À trancher @thierry** lors de la prochaine session synchrone.

## Backlog produit

- **Modèle enveloppes (ex-buckets)** : 3 ADRs fondateurs en rédaction côté Cowork — (a) no-PSD2, (b) bucket-model, (c) notifications-system. Les ADRs doivent être mergés dans `docs/adr/` avant d'engager PR-3 ou PR-F, car ils conditionnent l'architecture de données.

---

## Phase 0 — Bootstrap (terminée)

- [x] Choix du nom + vérification domaines
- [x] Bootstrap Next.js 16 + TypeScript strict + Tailwind 4
- [x] Headers sécurité A+ (CSP nonce, HSTS, COOP, Permissions-Policy)
- [x] Couche domaine pure (budget, provision, simulation, balance) testée
- [x] Migrations Supabase + RLS complètes
- [x] `.claude/agents/` (10 QA agents — 7 bootstrap + dashboard-ux-auditor + admin-dashboard-auditor)
- [x] CI GitHub Actions (lint + typecheck + test + e2e + lighthouse + audit)
- [x] Husky pre-commit + commit-msg
- [x] PWA manifest + llms.txt + sitemap + robots
- [x] Logo + favicon + icônes PWA

---

## Phase 1 — MVP (en cours)

Objectif : cockpit personnel utilisable par Thierry, ses enfants et amis.

### Bloc i18n + visuels (en cours)

- [x] PR-1 — socle i18n next-intl + route group `[locale]` + 5 locales
- [x] PR-Q — OpenGraph statique 5 locales
- [x] PR-1bis — extraction i18n routes privées (mergée dans a491297, 18 avril 2026)
  - Batch A : routes publiques locale-aware (landing, FAQ, legal, offline, onboarding) + `LocaleSwitcher` + `ScrollToTop` + middleware i18n
  - Batch B : routes privées (auth + app) migrées avec `generateMetadata` via `getTranslations`, server actions locale-aware, Zod i18n-friendly
  - Tests : parity sync des 4 stubs non-FR + E2E skip GDPR banner sur mobile emulations (Pixel 7 + iPhone 14, flaky tap dispatch)
  - Hygiène : `.gitignore` durci (`design-mockup-*.html`, `.claude/settings.local.json`, `prompts/`)
- [x] **PR-3a — Design System socle** (tokens + fonts + SKILL `ankora-design-system`) — mergée 26 avril 2026 (rapport `docs/prs/PR-3a-tokens-fonts-skill-report.md`)
- [x] **PR-3b — Atomic UI kit** (`src/components/ui/` + tests Vitest) — mergée PR #67, 24 avril 2026
- [x] **PR-3c — Landing fusion intelligente** — split en 3 sous-PRs ✅ mergées : #76 PR-3c-1 (foundation), #78 PR-3c-2 (MktNav+Hero), #82 PR-3c-3 (WhatIfDemo). Polish hero-waterfall en cours sur `feat/hero-waterfall-3steps`.
- [ ] PR-2 — traductions NL-BE / EN / ES-ES / DE-DE (glossaire doc déjà écrit) — **prochaine recommandée**
- [ ] PR-B1 — Bug reporting MVP (voir §PR-B1 ci-dessous) — exécutable en parallèle

### Bloc fonctionnel produit

- [ ] Auth Supabase : signup, login, reset, MFA
- [ ] Onboarding 3 étapes (nom espace, revenus, première charge)
- [ ] CRUD charges fixes + catégories
- [ ] CRUD dépenses variables
- [ ] Dashboard : provisions mensuelles, santé, transfert suggéré, factures du mois
- [ ] Simulateur what-if (annuler / négocier)
- [ ] Export GDPR (JSON)
- [ ] Suppression compte GDPR (grace 30j + cron)
- [ ] Consentement cookies (banner granulaire)
- [ ] Pages légales : CGU, Privacy, Cookies, FAQ
- [ ] Service Worker offline-first pour les pages publiques
- [ ] Lighthouse 100/100/100/100 (mobile + desktop)
- [ ] Tests e2e Playwright sur les parcours critiques

---

## PR-B1 — Bug reporting MVP (cadre, prompt à produire)

**Objectif** : donner à Thierry (et plus tard aux users) un moyen simple de signaler un bug technique ou UX, avec capture automatique du contexte, pour générer un rapport directement exploitable par Claude Code.

**Contraintes** :

- Budget 0 € strict — Sentry est **possible** sous son Developer free tier (voir arbitrage ci-dessous), LogRocket / Bugsnag / Datadog restent exclus (pas de free tier viable)
- Fonctionne sur mobile iOS/Android PWA + desktop Mac/Windows/Linux PWA, sans API native
- RGPD compliant : consentement explicite à chaque envoi, scrub auto des PII (email, montants), pas de mots de passe / tokens / cookies

### Décision à prendre dans PR-B1 : Sentry vs capteur maison

Deux options viables 0 € — à trancher avant de produire le prompt PR-B1.

**Option A — Sentry Developer free tier + intégration Vercel**

| Critère            | Verdict                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Coût               | 0 € (plan Developer : 5 k erreurs/mois, 10 k perf units, 50 replays, 1 seat)                                                    |
| Installation       | `@sentry/nextjs` + intégration Vercel (env vars auto, source maps upload auto) — ~30 min                                        |
| Qualité capture    | Excellente : stack traces propres, session replay, breadcrumbs, release tracking                                                |
| RGPD               | Sentry propose EU data residency (`de.sentry.io`), mais reste un tiers qui voit les stack traces + fragments DOM                |
| Vendor lock-in     | Moyen — si Sentry change ses conditions free tier, migration nécessaire                                                         |
| Admin panel        | Les bugs restent chez Sentry, on expose un lien vers leur dashboard depuis `/app/admin` (pas d'export bundle Claude Code natif) |
| Widget manuel user | À construire quand même (Sentry User Feedback existe mais limité)                                                               |

**Option B — Capteur maison Supabase-native**

| Critère            | Verdict                                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Coût               | 0 € (utilise Supabase free déjà en place)                                                                                         |
| Installation       | ~600 lignes à écrire — 1 PR complète                                                                                              |
| Qualité capture    | Bonne si bien fait (Error Boundary + window.onerror + ring buffer) — pas de session replay en V1                                  |
| RGPD               | Parfait : zéro données sortent de l'infra Ankora, tout reste EU Supabase                                                          |
| Vendor lock-in     | Aucun                                                                                                                             |
| Admin panel        | **Intégré nativement** : bugs dans table `bug_reports`, bouton "Bundle Claude Code" + "Créer GitHub Issue" fait partie de l'admin |
| Widget manuel user | Natif, sur-mesure                                                                                                                 |

**Recommandation** : **Option B pour V1** si on accepte l'effort de dev initial, parce qu'elle s'intègre parfaitement dans la vision PR-B2 (admin panel complet avec bundle Claude Code, moteur de règles sur les mêmes données, etc.) et garde l'architecture 100 % owned. Sentry reste un **plan B** à 30 min d'installation si jamais PR-B1 traîne et qu'on a besoin de capter les erreurs de PR-3 en urgence — rien n'empêche les deux de cohabiter (Sentry pour les erreurs techniques fines, capteur maison pour les reports users + feedback UX).

**Scope MVP** :

- Error Boundary React global + `window.onerror` + `unhandledrejection` + ring buffer 20 dernières actions user
- Widget bug flottant (icône discrète bas-droite) + raccourci `Ctrl+Shift+B`
- Modal avec : description libre, niveau de sévérité, screenshot optionnel via `html2canvas` (ou équivalent Canvas API)
- Server Action → table Supabase `bug_reports` (RLS : user voit les siens, admin voit tout)
- Page admin minimaliste `/app/admin/bugs` avec liste + filtres + bouton **Exporter bundle Claude Code** (`.md` copiable) et bouton **Créer issue GitHub** (via API, token serveur)
- i18n 5 langues (clés à caler avec PR-2)
- Doc user : `/help/signaler-un-bug`
- Doc admin : `docs/admin/bug-triage.md`

**Estimation** : ~10 fichiers, ~600 lignes, 1 session Claude Code.

---

## PR-F — Rétro-planning provisions (cadre, post-PR-3)

**Objectif** : anticiper les retraits depuis l'épargne vers le compte courant à l'approche des échéances de factures provisionnées.

**Principe** : quand l'utilisateur envoie une provision `P` vers son compte épargne pour la charge `C`, le système enregistre `C.next_due_date` et déclenche des alertes :

- J-7 : "Dans 7 jours, la facture `C` arrive à échéance — prévois de rapatrier `P` vers ton compte courant"
- J-3 : rappel plus urgent
- J-0 : "Échéance aujourd'hui"

**Implémentation envisagée** :

- Nouvelle colonne `provisions_movements.charge_id` (FK vers `charges.id`)
- Nouvelle colonne `charges.next_due_date`
- Job quotidien (pg_cron Supabase ou cron Vercel) qui scanne et génère les notifications
- Canal V1 : in-app (table `notifications`) — V2 : push PWA / email

**Estimation** : ~15 fichiers, migration DB + domaine + UI alerts.

---

## PR-B2 — Admin panel complet (anticipation architecture, post-MVP)

**But stratégique** : même si on ne construit PR-B2 qu'après avoir de vrais users, on **prévoit la structure dès maintenant** pour que PR-B1 plante déjà les bonnes fondations (schéma DB, namespace de routes admin, hooks audit).

### Sections prévues (chacune = PR dédiée à terme)

| ID     | Section                 | Sources de données                             | Moteur                   |
| ------ | ----------------------- | ---------------------------------------------- | ------------------------ |
| PR-B2a | Santé technique         | `bug_reports`, audit log, Supabase metrics API | Rules                    |
| PR-B2b | Santé produit / UX      | `audit_log` (events), funnels onboarding       | Rules                    |
| PR-B2c | Marketing & acquisition | Supabase auth events, referrer                 | Rules                    |
| PR-B2d | Recommandations         | Agrégation des 3 précédentes                   | **Rule-based** (pas LLM) |

### Moteur de recommandations — rule-based (0 € au lieu de LLM)

Principe : au lieu de faire tourner un LLM coûteux pour "détecter les patterns et suggérer des améliorations", on écrit des **règles déterministes** qui cherchent des signaux précis. Exemples :

- `SI count(bug_reports WHERE component = X AND created_at > now()-7d) >= 5 ALORS recommande "Composant X instable — 5+ reports cette semaine"`
- `SI taux_complétion_onboarding_step_2 < 60% ALORS recommande "Étape 2 de l'onboarding → taux d'abandon élevé, revoir le wording"`
- `SI p95_latency_server_action > 500ms ALORS recommande "Server Actions lentes → audit DB queries"`
- `SI signups_suspects (même domaine email + 10 en 1h) ALORS recommande "Anti-abuse : investiguer X@domaine.tld"`

Avantages vs LLM :

- **0 € de coût**
- **0 hallucination** — une règle se déclenche ou ne se déclenche pas
- **Testable** — chaque règle = un test Vitest
- **Debuggable** — tu vois exactement pourquoi une reco s'affiche

Implémentation : `src/lib/admin/rules/` — chaque règle exporte `{ id, label, query, severity, action }`. Un seul cron ou un bouton "Rafraîchir" calcule toutes les règles. Un futur upgrade LLM pourra s'intégrer en Phase 2 BYOK si besoin.

### Fondations à poser DÈS PR-B1 pour PR-B2

- Table `bug_reports` avec colonnes `component`, `severity`, `user_id`, `route`, `viewport`, `locale`, `user_agent`, `created_at`
- Namespace route `/app/admin/**` avec garde `requireAdmin()` (user id = Thierry pour l'instant)
- Hook `logProductEvent(event, metadata)` qui append à `audit_log` — servira aussi pour PR-B2b
- Migration DB prête à accueillir futures tables `admin_rules`, `admin_notifications`

---

## Phase 2 — Pots partagés + IA BYOK

- Pots partagés inter-utilisateurs (invitation par email, rôles viewer/editor)
- Anthropic SDK + OpenRouter : **l'utilisateur fournit sa clé**, Ankora relaye
  - Suggestions de négociation
  - Détection d'abonnements dormants
  - Résumé mensuel personnalisé
- Import CSV / OFX (pas de PSD2)
- Notifications push (factures à venir)
- Moteur de recommandations admin : option **upgrade LLM** via la clé BYOK de Thierry (pas Ankora qui facture)

---

## Phase 3 — Produit complet

- Agrégation multi-devises
- Tableau de bord annuel + rapports téléchargeables (PDF)
- Suggestions d'épargne sans conseil (ex: livret A/LDDS = informationnel uniquement)
- Version mobile native via Expo (si la PWA montre des limites)
- Tarification payante (plan pro : multi-espaces, IA inclus, support prioritaire) — le moment où Ankora peut **enfin** engager des coûts d'infra

---

## Tâches post-lancement — Infrastructure domaine

Une fois le MVP en production public (fin Phase 1), les alias `privacy@ankora.be` et `security@ankora.be` doivent être câblés sur le domaine.

- [ ] Configurer MX ankora.be + alias `privacy@ankora.be`, `security@ankora.be`, `contact@ankora.be`, `conduct@ankora.be`
- [x] Migrer contacts dans les 5 locales (fichiers `messages/{en,fr-BE,nl-BE,es-ES,de-DE}.json`) — déjà en `ankora.be`
- [x] Aligner `README.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `.github/ISSUE_TEMPLATE/*` sur `ankora.be` (20 avr 2026)
- [ ] Mettre à jour `SECURITY.md` : remplacer le TODO temporaire par `privacy@ankora.be` une fois la MX active
- [ ] Mettre à jour `LICENSE` et `NOTICE` si références à `*@ankora.eu`
- [ ] Page Privacy section "Responsable de traitement" : confirmer adresse postale + contact email belge

**État actuel (avril 2026)** : tous les contacts unifiés sur `thierryvm@gmail.com` en attente de config MX domaine. Les références repo pointent désormais toutes vers `ankora.be`.

---

## Hors scope (définitif)

- Agrégation PSD2 (coût + régulation)
- Déclaration fiscale automatisée
- Conseil en placement personnalisé (FSMA)
- Comptabilité en partie double pour entreprises
- Dépendances payantes tant que Phase 3 n'est pas atteinte (voir §Budget 0 €)
