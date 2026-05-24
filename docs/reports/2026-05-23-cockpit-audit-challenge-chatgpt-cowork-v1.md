# Audit cockpit Ankora — challenge analyse externe ChatGPT 5.5 — Cowork v1

> **Statut** : `Draft` — en attente validation @thierry avant toute implémentation.
> **Date** : 23 mai 2026.
> **Auteur** : @cowork (Claude Opus 4.7, Cowork desktop).
> **Mission** : challenger sans complaisance l'analyse externe ChatGPT 5.5 reçue le 22 mai, à partir du code réel du repo `F:\PROJECTS\Apps\ankora`, et produire un diagnostic + plan d'action.
> **Sortie attendue** : ce rapport. Pas de code, pas de PR. Validation @thierry requise avant exécution.

---

## 0. Avertissement sur l'analyse externe

L'analyse ChatGPT 5.5 a été produite **à partir uniquement** :

- du README public GitHub (commit visible publiquement, donc partiel),
- du site public `https://ankora.be/`,
- de captures d'écran landing + cockpit/dashboard.

Elle **n'a pas** lu :

- les 20 ADRs (`docs/adr/ADR-001` à `ADR-020`),
- la source canonique de vision `docs/NORTH_STAR.md` (19 mai 2026),
- la `docs/ROADMAP.md` actuelle (verrouillée 17 mai 2026),
- les rapports de PR mergées dans `docs/prs/`,
- les audits internes dans `docs/audits/` (10+ documents),
- le brief Claude Design Session #3 (`docs/design/claude-design-brief.md` §3.2),
- le code des composants `src/components/dashboard/*`,
- le contenu de `src/app/[locale]/app/page.tsx` (dashboard live actuel).

Conséquence directe : **une part significative de ses constats théoriques décrit des problèmes déjà résolus, déjà cadrés en ADR, ou déjà priorisés**. Le rapport ci-dessous identifie ces angles morts pour ne pas relancer du travail déjà fait.

Cela ne veut pas dire que l'analyse est mauvaise. Ses observations sur la **hiérarchie cognitive** et le **risque de surcharge visuelle** restent légitimes et doivent être traitées. Le présent document sépare ce qui est valide de ce qui est obsolète ou faux par méconnaissance.

---

## 1. Ce que comprend Cowork de la vision Ankora (preuves repo)

### Promesse produit réelle

Source : `docs/NORTH_STAR.md` lignes 11-15.

Ankora est un **outil d'éducation budgétaire et d'organisation financière**, ciblant particuliers belges et européens, fondé sur un **modèle d'enveloppes prédictif** sans agrégation bancaire (pas PSD2), sans conseil financier (pas FSMA), 100 % gratuit pour l'utilisateur en Phase 1.

Le positionnement réglementaire est intentionnellement défensif (FSMA + APD belge) : pas de placement, pas de "vous devriez investir", pas d'agrégation live des comptes bancaires.

### Différenciateur n°1 verrouillé (NORTH_STAR §"Différenciateur clé")

Le **Compte Épargne à trois lectures** :

| Strate                   | Nature                                                            | Comportement                              |
| ------------------------ | ----------------------------------------------------------------- | ----------------------------------------- |
| **Total Épargne**        | Somme brute                                                       | Vue d'ensemble                            |
| **Provisions affectées** | Bloquées jusqu'échéance (impôt communal, taxe voiture, vacances…) | Alertes J-7/J-3/J-0 (ADR-003)             |
| **Réserve libre**        | Buffer de sécurité non affecté                                    | Disponible sans contrainte, traçable in/out |

**YNAB, Monarch, Goodbudget confondent les deux.** C'est l'asset défendable d'Ankora.

### Différenciateur n°2 verrouillé (ADR-009 amendé 09/05/2026)

La **Capacité d'Épargne Réelle** comme KPI hero du dashboard, formule canonique :

```
Capacité_Épargne_Réelle = Revenus
                        − Total_Charges_Fixes_Mensuelles
                        − Provisions_Mensuelles_Lissées
                        − Reste_à_vivre (ex-Plafond_Quotidien)
```

Trois concepts distincts à afficher côte à côte (ADR-009 amendement 09/05) :

- **Reste disponible** (= revenus − charges − provisions − virements auto)
- **Reste à vivre** (vie courante variable, ajustable mensuellement)
- **Capacité d'épargne réelle** (= reste disponible − reste à vivre)

Persona Thierry mai 2026 : 662 / 500 / 162 €.

Aucun concurrent ne calcule ce KPI. Cf. ADR-009 §"Alternatives évaluées" pour le rejet des KPI court-termistes type Monarch ("Cash flow ce mois").

### Cap v1.0 — trois jalons verrouillés (NORTH_STAR §"Cap v1.0")

| Jalon                | Cible            | Contenu minimal                                                                                                              |
| -------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Alpha**            | ~4 sem (acté)    | Thierry + 2-3 proches, FR seul, MVP fonctionnel                                                                              |
| **Beta**             | 10 juin 2026     | **3 sections cockpit v3 essentielles** : Santé Provisions + Prochaines Factures + Drawer Simulateur                          |
| **v1.0 publique**    | fin juin 2026    | **Cible Monarch level — 8/8 sections cockpit v3** : + Hero waterfall + Timeline 6 mois + Goals + Drag-to-rebalance + Activité |
| **v1.1 post-launch** | hors planning    | Parité Monarch complète (polish, NL/DE/ES, push PWA)                                                                         |

### Gouvernance trio agents (NORTH_STAR §"Gouvernance")

- **@cowork** (Claude desktop Opus) — vision, spec, contenu, brief Claude Design, orchestration
- **@cc-design** (claude.ai/design, research preview) — polish visuel, exports
- **@cc-ankora** (Claude Code terminal Opus 4.7 pinné) — code, tests, CI, PRs
- **@thierry** — vision humaine, validation, merge

Convention de tag obligatoire dans tout artefact. Pin Opus = garde-fou anti-downgrade silencieux post-incident 24/04 (cf. claude-config CLAUDE.md).

### Concepts différenciants livrés ou cadrés (preuves ADR)

| Concept                     | ADR             | Statut                                                                              |
| --------------------------- | --------------- | ----------------------------------------------------------------------------------- |
| Modèle bucket-model         | ADR-002         | Accepted                                                                            |
| Pas d'agrégation PSD2       | ADR-001         | Accepted                                                                            |
| Notifications J-7/J-3/J-0   | ADR-003         | Accepted                                                                            |
| Account naming/typing       | ADR-008         | Accepted (3 types : `income_bills`, `provisions`, `daily_card`)                     |
| Capacité d'Épargne Réelle   | ADR-009 amendé  | Accepted + 3 concepts UX clarifiés                                                  |
| Live decrement Quotidien    | ADR-010         | Accepted                                                                            |
| Détection déficit + rattrap | ADR-011         | Accepted (plan rattrapage 3 mois)                                                   |
| Assistant Virements         | ADR-012         | Accepted (gradient bleu-vert + sub-card Santé)                                      |
| Tracking paiements multi    | ADR-016         | Proposed (post-PR-D5)                                                               |
| Plans d'apurement           | ADR-017         | Proposed (table `installment_plans` + génération auto N transactions + drawer)      |
| Provisions bidirectionnelles | ADR-018         | Proposed (direction OUT/IN, audit trail ballet aller-retour)                        |
| Admin security baseline     | ADR-019         | Accepted                                                                            |
| Atoms vs UI canonical       | ADR-020         | (à lire — frontière design system)                                                  |

**20 ADRs au total**, l'écosystème conceptuel est extrêmement mature. La vision n'est PAS floue ni à reconstruire.

---

## 2. Challenge de l'analyse externe ChatGPT 5.5

### 2.1 Ce avec quoi Cowork est d'accord (et qui mérite action)

| Constat ChatGPT                                                              | Verdict Cowork | Justification                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| « Ankora doit rassurer en 3 secondes avant de détailler »                     | ✅ VALIDE       | Principe UX correct. Le dashboard actuel met le hero radar (Effort + Capacité) en haut, ce qui répond à "ça va ?" en 3 secondes — MAIS la lisibilité visuelle peut être améliorée (cf. §4).                                                                                                                                                                          |
| « Tout paraît important, donc rien ne devient immédiatement évident »         | ✅ VALIDE       | Le dashboard `src/app/[locale]/app/page.tsx` enchaîne actuellement 6 sections de **poids visuel comparable** (radar + Santé + Factures + 3 comptes + Plan transferts + Dépenses récap). Risque de fatigue cognitive réel.                                                                                                                                            |
| « Hiérarchie cognitive Niveau 1 / 2 / 3 »                                     | 🟡 PARTIEL      | Le principe est correct, mais ChatGPT propose une **réécriture** alors qu'Ankora a déjà des outils pour ça (Drawer simulateur, modal détails). La question n'est pas d'inventer une hiérarchie, c'est de **mieux utiliser celle qui existe** et de **déplacer des sections** vers drawers/sub-pages.                                                                  |
| « Risque de devenir un dashboard SaaS générique »                             | ✅ VALIDE       | Le risque est réel si les 2-4 sections manquantes (Timeline 6m + Goals + Drag-rebalance) sont ajoutées au layout principal sans réflexion. Cf. §4 recommandation hiérarchie.                                                                                                                                                                                          |
| « Ankora doit montrer la vérité utile avant les détails »                     | ✅ VALIDE       | Aligne avec la philosophie ADR-009 (KPI hero = Capacité Réelle, pas Cash Flow court-termiste).                                                                                                                                                                                                                                                                       |

### 2.2 Ce avec quoi Cowork N'est PAS d'accord

| Constat ChatGPT                                                                                         | Verdict      | Justification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| « Compte épargne · trois lectures » présenté comme **risque** de surcharge                              | ❌ FAUX       | Les 3 lectures (Total / Provisions / Réserve libre) sont **LE différenciateur n°1** verrouillé dans NORTH_STAR §"Différenciateur clé". Le supprimer = supprimer la raison d'être d'Ankora vs YNAB/Monarch. ChatGPT n'avait pas accès à NORTH_STAR.                                                                                                                                                                                                                                                                                                              |
| « Cashflow waterfall » présenté comme **à construire**                                                  | ❌ FAUX       | PR-D3-bis (commit `992c171`, 6 mai 2026) a **déjà mergé** le waterfall 3-row pédagogique (Revenus / Effort / Plafond) + suppression 4 KPI legacy. Cf. ROADMAP table "Voie D §11" + handoff Obsidian 06/05.                                                                                                                                                                                                                                                                                                                                                       |
| « Assistant virements » présenté comme idée à explorer                                                  | ❌ FAUX       | ADR-012 Accepted 03/05/2026. Spec UX complète : gradient bleu-vert + sub-card Santé + hero montant à virer + détail provisions item-par-item. Implémentation prévue PR-D5.                                                                                                                                                                                                                                                                                                                                                                                       |
| « Plans d'apurement » présentés comme manquants                                                         | ❌ FAUX       | ADR-017 Proposed (cas Thierry concret : 2 407 € / 11 mensualités), table `installment_plans` cadrée, génération auto N transactions + drawer drilldown. Sera livré dans Voie D.                                                                                                                                                                                                                                                                                                                                                                                  |
| « Simulateur what-if » à inventer                                                                       | ❌ FAUX       | PR-3c-3 (#82) a livré le `WhatIfDemo` sur la landing (avril 2026). PR-D8 est cadrée pour l'intégration dashboard via drawer (THI-195, Beta 10 juin).                                                                                                                                                                                                                                                                                                                                                                                                              |
| « Capacité d'épargne réelle » présentée comme bonne idée à approfondir                                  | ❌ INSUFFISANT | ADR-009 amendé Accepted 09/05/2026 documente déjà la formule canonique + 3 concepts UX (Reste disponible / Reste à vivre / Capacité d'épargne). 200+ lignes spec. Pas à approfondir, à **respecter strictement** dans toute implémentation UI.                                                                                                                                                                                                                                                                                                                  |
| « Niveau 3 — Analyse / détails » mis sur le même plan que Niveau 1                                      | ❌ FAUX       | Ankora a explicitement décidé en NORTH_STAR §"Phase 2-3" que les graphiques longs + audit annuel + comptabilité fine = **post-v1.0**. Mettre l'analyse fine en "Niveau 3 du cockpit" suggère qu'elle doit être livrable Beta/v1.0 — c'est **hors scope verrouillé** et violerait la règle d'or n°7 (scope creep interdit).                                                                                                                                                                                                                                          |

### 2.3 Ce qui est incomplet dans l'analyse ChatGPT

- **Aucune mention** du modèle de données réel (3 types de comptes typés `income_bills` / `provisions` / `daily_card`, table `charge_payments`, future `installment_plans`, `provision_transfers`).
- **Aucune mention** de la contrainte FSMA non-conseil (vocabulaire interdit "vous devriez investir", "nous recommandons").
- **Aucune mention** de la contrainte budget 0 € strict.
- **Aucune mention** du trio agents IA + workflow loop design.
- **Aucune mention** du choix 12 agents QA + gates CI obligatoires avant merge.
- **Aucune mention** du fait que la Beta est dans 18 jours (10 juin) — l'analyse propose un refactor lourd qui n'est pas compatible avec ce timing.
- **Aucune mention** de la priorité mobile-iOS (Mobile Recovery Day 4 mai, agent `mobile-ios-auditor`, audit PR-D5 du 16 mai).
- **Aucune mention** de `/glossaire` public et de la stratégie SEO/AEO/GEO (Pilier E).

### 2.4 Hypothèses ChatGPT à vérifier dans le repo

| Hypothèse                                                                                  | Vérification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| « Le cockpit beta montre trop de choses en même temps »                                   | **Partiellement vrai sur la version actuelle**. `src/app/[locale]/app/page.tsx` montre 6 sections de poids visuel comparable. La V1.0 cible ajoutera Timeline 6m + Goals + Drag-rebalance, ce qui **aggravera le risque** si la hiérarchie n'est pas revue d'abord.                                                                                                                                                                                                                                          |
| « Mosaïque de widgets SaaS »                                                              | **Vrai sur le risque, faux sur le diagnostic**. Le dashboard utilise déjà des `Card` shadcn/ui cohérentes (pas de mosaïque hétéroclite), mais la hiérarchie typo + spacing n'a pas encore été polarisée entre "section radar" et "sections détail".                                                                                                                                                                                                                                                          |
| « Page infinie où tout a le même poids visuel »                                            | **Vrai actuellement**. Le scroll vertical depuis le hero radar jusqu'aux CTA en bas est long (~5 viewports mobile). Les sections ne sont pas regroupées en zones distinctes (zone radar/zone provisions/zone factures/zone détail). Vrai gap UX à traiter — voir §4.                                                                                                                                                                                                                                         |
| « Le dashboard doit être app-first, pas une landing »                                      | **Vrai et déjà respecté**. Le layout actuel utilise Server Components RSC, `getWorkspaceSnapshot()` côté server, pas de marketing dans `/app/*`. Marketing isolé dans `(public)/*`.                                                                                                                                                                                                                                                                                                                          |

### 2.5 Synthèse du challenge

L'analyse ChatGPT 5.5 a **un constat utile** (risque de surcharge cognitive sur le cockpit) mais **un diagnostic largement obsolète** (concepts présentés comme manquants alors qu'ils sont cadrés en ADR Accepted). La majorité des "solutions" proposées sont déjà soit livrées, soit verrouillées dans la roadmap Voie D.

Le seul gap réel que ChatGPT a identifié est : **la hiérarchie visuelle entre les 6 sections actuelles du dashboard** (et plus tard les 8) n'est pas suffisamment polarisée pour distinguer "zone radar de rassurance immédiate" vs "zone pilotage actif" vs "zone détail consultable".

**Recommandation Cowork** : ne pas faire un refactor produit massif inspiré de ChatGPT. Faire un **patch de hiérarchie cognitive** sur le dashboard existant (regroupement visuel, drawers pour le détail, sub-section pour les zones secondaires) — voir §4 et §7.

---

## 3. Cartographie des surfaces actuelles (preuves code)

### 3.1 Landing publique — `src/app/[locale]/(public)/page.tsx`

- **Statut** : PR-3c (4 sous-PRs #76, #78, #82, #84) mergées entre 27 avril et 9 mai 2026.
- **Contenu** : Hero waterfall 3 steps + sections marketing + WhatIfDemo + pricing + footer.
- **Sources** : `src/components/marketing/landing/sections/*`.
- **Issues actuelles** : THI-197 (overflow horizontal pré-existant test.fixme actif), audit hero KPI grid mobile (THI-196).
- **Risque régression** : Faible — hors scope du présent audit cockpit.

### 3.2 Dashboard utilisateur — `src/app/[locale]/app/page.tsx`

- **Statut** : 6 sections sur 8 cockpit v3 cible déjà mergées (PR-D1 à PR-D3-bis + THI-190 + THI-192).
- **Sections actuelles** (ordre layout actuel ligne 96-397 de `page.tsx`) :
  1. Header (workspaceName + monthLabel) — ligne 97-102
  2. Bloc 2 hero radar : `EffortFinancierCard` + `CapaciteEpargneCard` — ligne 111-122
  3. Santé Provisions Gauge (`ProvisionHealthGaugeCard`) — ligne 134-148
  4. Prochaines Factures J-7/14/30 (`ProchainesFacturesCard`) — ligne 158-168
  5. Empty state (si pas de charges) — ligne 170-182
  6. Bloc 1 : 3 cards comptes typés (`AccountCard`) — ligne 195-226
  7. Plan transferts mensuels (3 cards : vie courante / épargne / reste principal) — ligne 228-332
  8. Dépenses du mois récap (5 dernières) — ligne 334-382
  9. CTAs Charges / Expenses / Simulator — ligne 384-394
- **Composants dashboard** : `src/components/dashboard/` (CapaciteEpargneCard, EffortFinancierCard, ProvisionHealthGaugeCard, ProchainesFacturesCard).
- **Composants features** : `src/components/features/AccountCard.tsx` + `AccountCardEditableTitle.tsx`.
- **Manques cockpit v3** : 4 sections — Timeline 6 mois (THI-191), Goals épargne (THI-193), Drag-to-rebalance (THI-194), Drawer simulateur intégré (THI-195).
- **Problème UX réel identifié** : ordre de layout actuel **disperse la "rassurance immédiate"**. Le hero radar est au début mais le Plan transferts (qui devrait être une décision pilotage active) arrive seulement après Santé + Factures + Comptes. La séquence cognitive n'est pas optimale.
- **Risque régression** : Élevé si refactor lourd. Cette surface est consommée par 8 tests Vitest + tests Playwright critiques.

### 3.3 Sous-routes app — `src/app/[locale]/app/*`

| Route                            | Rôle produit                                | État        |
| -------------------------------- | ------------------------------------------- | ----------- |
| `/app/accounts/page.tsx`         | Configuration comptes (revenus, plafond)    | Live        |
| `/app/charges/page.tsx`          | CRUD charges fixes                          | Live + drag&drop, édition inline PR-D4 |
| `/app/expenses/page.tsx`         | CRUD dépenses variables                     | Live        |
| `/app/simulator/page.tsx`        | Simulateur what-if (page dédiée)            | Live, à intégrer en drawer PR-D8 |
| `/app/settings/page.tsx`         | Paramètres workspace + langue + thème + GDPR | Live        |
| `/app/settings/deletion-status/` | Statut suppression GDPR (grace 30j)         | Live        |

### 3.4 Admin — `src/app/[locale]/admin/page.tsx`

- **Statut** : Live avec garde `requireAdmin()` (ADR-019 Admin security baseline).
- **Spec future** : PR-B2 (4 sections : Santé technique / Santé produit / Acquisition / Recommandations rule-based).

### 3.5 Onboarding — `src/app/[locale]/onboarding/page.tsx`

- **Statut** : Live (catalogue belge ~70 fournisseurs + import CSV 5 sources + saisie manuelle + Reste à vivre + tutoriel 3 cards).
- **Source** : Claude Design Session #4.

### 3.6 Données mockées vs réelles

- **Mockées** : aucune côté repo Ankora actuel. Les données viennent de `getWorkspaceSnapshot()` (Supabase RLS, server-side, RSC).
- **Mockup HTML legacy** : `F:\PROJECTS\Apps\ankora-mockups\` (hors repo, archive @cc-design — référencé par 7 docs Ankora pour traçabilité historique).
- **Empty states** : prévus dans `page.tsx` ligne 170-182 (carte CTA "Add première charge").

### 3.7 Routes / composants obsolètes potentiels

À vérifier au cas par cas (pas dans le scope de cet audit) :

- 4 KPI cards legacy retirées en PR-D3-bis (#122) — ✅ déjà nettoyé.
- `design-playground/page.tsx` — page de dev seulement, à vérifier qu'elle est gated/disabled en prod.

---

## 4. Hiérarchie décisionnelle proposée (challenge constructif ChatGPT)

ChatGPT propose 3 niveaux (Quotidien / Pilotage / Analyse). Cette structure est correcte sur le principe mais doit être adaptée à la réalité Ankora :

### 4.1 Zone A — Hero rassurance (visible immédiatement, sans scroll)

**Objectif** : répondre en 3 secondes à "ça va ?".

- **KPI principal** : Capacité d'épargne réelle (ADR-009 — actuellement dans `CapaciteEpargneCard`)
- **Effort financier mensuel lissé** : breakdown justificatif (actuellement dans `EffortFinancierCard`)
- **Indicateur Santé Provisions condensé** : juste le statut (vert/jaune/rouge), pas la gauge détaillée
- **Mois courant** + sélecteur mois précédent/suivant (déjà partiellement présent via header)

### 4.2 Zone B — Pilotage actif (visible après 1 scroll viewport)

**Objectif** : "que dois-je décider/faire maintenant ?".

- **Prochaines factures J-7 / J-14 / J-30** (actuellement présent THI-192) — c'est de l'actionable
- **Assistant Virements / Plan transferts mensuels** (actuellement présent, mais à enrichir post-PR-D5)
- **Goals épargne avec ETA** (manque, THI-193, prio v1.0)
- **Simulateur what-if drawer** (manque, THI-195, prio Beta 10 juin)

### 4.3 Zone C — Détails consultables (drawer / sub-page / accordéon)

**Objectif** : "pour mes décisions, j'ai besoin de creuser ce point précis".

- **Santé Provisions gauge détaillée** (drawer depuis l'indicateur condensé de Zone A)
- **Drag-to-rebalance enveloppes** (drawer depuis indicateur Santé, manque THI-194)
- **Activité récente / dépenses du mois** (déjà présent mais doit être collapsible ou en sub-section dégradée)
- **Timeline cashflow 6 mois** (manque, THI-191, prio v1.0 — peut vivre en drawer plein écran)

### 4.4 Hors scope cockpit (déjà décidé en NORTH_STAR)

À ne PAS mettre dans le cockpit :

- Comptabilité fine en partie double (hors-scope Phase 3).
- Agrégation PSD2 (hors-scope définitif ADR-001).
- Conseil placement (FSMA interdit).
- Reports PDF annuels (post-launch).

### 4.5 Différence avec ChatGPT

ChatGPT propose un refactor par "niveau de profondeur" qui suggère de **cacher derrière interaction** des éléments comme le Compte Épargne 3 lectures. **C'est faux** : le Compte Épargne 3 lectures doit rester visible en Zone A (c'est le différenciateur n°1). C'est le **détail des mouvements** de la Réserve libre qui peut être en drawer, pas les 3 lectures elles-mêmes.

---

## 5. Recommandation architecture UX cible

### 5.1 Navigation

Pas de changement majeur. Sidebar verticale gauche (sur desktop) actuelle + breadcrumbs SSR PR-NAV-1 #128.

Sur mobile : bottom nav à étudier post-Beta (THI-NAV-2 cadrée mais non prioritaire).

### 5.2 Dashboard principal (refactor hiérarchique, pas redesign)

Réordonner les sections existantes en 3 zones visuelles distinctes (header bandeau coloré, espacement vertical différencié, hiérarchie typo `text-3xl` pour Zone A, `text-xl` pour Zone B, `text-sm` pour Zone C).

**Pas de nouveau composant**. Réutiliser ce qui existe :

- `CapaciteEpargneCard`, `EffortFinancierCard` → restent en Zone A
- `ProvisionHealthGaugeCard` → version condensée Zone A + version détaillée drawer Zone C
- `ProchainesFacturesCard` → reste en Zone B (déjà bien placée)
- Plan transferts (3 cards transferts mensuels) → reste en Zone B
- Dépenses du mois → collapse ou subsection Zone C
- 3 cards comptes typés (`AccountCard`) → à arbitrer (header Zone A condensé ou Zone B selon expérimentation)

### 5.3 Sidebar droite éventuelle

ChatGPT évoque "sidebar droite éventuelle". **À rejeter pour mobile-first** : Ankora est PWA cible iOS d'abord (cf. agent `mobile-ios-auditor`, Mobile Recovery Day). Une sidebar droite force un layout 3-colonnes incompatible avec viewports < 1024 px.

Alternative : drawers contextuels (déjà la philosophie Ankora pour le simulateur PR-D8).

### 5.4 Comportement mobile / tablette / desktop

- **Mobile** (375-768 px) : layout 1 colonne, Zone A en haut, scroll vertical, drawers fullscreen pour Zone C.
- **Tablet** (768-1024 px) : layout 1-2 colonnes selon section (radar 2 cols, factures 1 col, comptes 3 cols stack si étroit).
- **Desktop** (≥ 1024 px) : layout multi-col, Zone A peut occuper 2/3 + indicateur Santé en aside droite.

### 5.5 Règles de polish

- **Pas de mosaïque** : utiliser le spacing pour grouper visuellement (`gap-8` entre zones, `gap-4` intra-zone).
- **Pas de couleurs anxiogènes** : émeraude pour positif / rose pour négatif (déjà la convention ADR-009 + PR-UI-2). Pas d'orange agressif.
- **Tabular nums** pour tous les chiffres (déjà la convention `tabular-nums` dans `page.tsx`).

---

## 6. Recommandation technique

### 6.1 Composants à conserver tels quels

Tous les composants Voie D mergés. **Ne pas toucher** :

- `CapaciteEpargneCard`, `EffortFinancierCard`, `ProvisionHealthGaugeCard`, `ProchainesFacturesCard`
- `AccountCard` + `AccountCardEditableTitle`
- Server Component `page.tsx` (juste réordonner les `<section>`, pas refactoriser la logique)

### 6.2 Composants à refactorer (légèrement)

- `page.tsx` : réordonner les sections selon §4 (Zone A / B / C), pas de logique métier touchée.
- `ProvisionHealthGaugeCard` : créer une variante condensée (juste l'indicateur status, sans la gauge) pour Zone A. Le composant existant devient le contenu du drawer Zone C.

### 6.3 Composants à créer (nouvelles sections cockpit v3)

À cadrer post-validation @thierry :

- `TimelineCashflow6MoisCard` (THI-191, drawer Zone C)
- `GoalsEpargneCard` (THI-193, Zone B)
- `DragToRebalanceCard` (THI-194, drawer depuis indicateur Santé)
- `SimulatorDrawer` (THI-195, drawer depuis CTA Zone B)

### 6.4 Composants à supprimer

Rien. Les 4 KPI legacy ont déjà été nettoyés en PR-D3-bis.

### 6.5 Endroits sensibles (éviter gros refactor)

- `src/lib/domain/cockpit.ts` (ADR-009 formules canoniques) : zéro modification.
- `src/lib/data/workspace-snapshot.ts` : zéro modification (data layer stable).
- `src/lib/domain/` : règle CLAUDE.md "Domaine pur, jamais d'import Supabase".
- Migrations Supabase : aucune touchée par ce refactor (UI-only).

### 6.6 Plan de migration sûr

Étapes ordonnées (cf. §7 lots).

---

## 7. Plan de travail en lots sûrs (proposition à valider @thierry)

### Lot 1 — Réorganisation hiérarchique du dashboard existant

- **Objectif** : passer de "6 sections plates" à "3 zones distinctes" sans toucher la logique métier.
- **Fichiers touchés** : `src/app/[locale]/app/page.tsx` (réordonnancement JSX), styles Tailwind (`gap`, `text-xl` vs `text-3xl`).
- **Risque** : Faible — pas de logique métier modifiée, juste layout.
- **Tests** : Vitest sur `page.tsx` (rendering checks), Playwright sur parcours dashboard, agent `dashboard-ux-auditor` invoqué obligatoirement.
- **Critères d'acceptation** : Lighthouse mobile ≥ 95, agent `dashboard-ux-auditor` ✅ Pass, agent `mobile-ios-auditor` ✅ Pass.
- **Hors scope** : aucun nouveau composant, aucune nouvelle section cockpit.

### Lot 2 — Variante condensée Santé Provisions (Zone A indicateur + Zone C drawer)

- **Objectif** : créer un mini-indicateur Santé Provisions pour Zone A, et déplacer la gauge complète en drawer.
- **Fichiers touchés** : `src/components/dashboard/ProvisionHealthGaugeCard.tsx` (split en `ProvisionHealthBadge` + `ProvisionHealthDrawer`), `page.tsx` (intégration nouveau badge + trigger drawer).
- **Risque** : Moyen — split composant peut casser tests existants. Backup snapshot tests.
- **Tests** : Vitest sur badge condensé + drawer, Playwright sur clic badge → drawer ouvert.
- **Critères d'acceptation** : tests existants tous verts, +5 nouveaux tests Vitest, drawer focus trap + Escape testé.
- **Hors scope** : ne pas modifier la logique `calculerSanteProvisions()`.

### Lot 3 — Simulator drawer integration (THI-195, prio Beta 10 juin)

- **Objectif** : intégrer le simulateur what-if (actuellement page dédiée `/app/simulator`) en drawer depuis Zone B.
- **Fichiers touchés** : `src/components/dashboard/SimulatorDrawer.tsx` (nouveau, réutilise logique simulateur), `page.tsx` (trigger drawer).
- **Risque** : Moyen — réutilisation logique existante.
- **Tests** : Vitest sur drawer state, Playwright sur scénario "ajuster charge dans drawer → KPI Capacité recalcule".
- **Critères d'acceptation** : agents `dashboard-ux-auditor` + `financial-formula-validator` ✅, drawer fermeture sans perte de saisie.

### Lot 4 — Quality bar doc Ankora (livrable doc, pas code)

- **Objectif** : créer `docs/ankora-product-quality-bar-v1.md` (voir §8).
- **Risque** : Nul.

### Lot 5 — Préparation TimelineCashflow6Mois (cadrage avant code, v1.0 fin juin)

- **Objectif** : rédiger spec composant + brief @cc-design si polish visuel nécessaire.
- **Risque** : Nul (cadrage uniquement).

### Lot 6 — Préparation GoalsEpargne + DragToRebalance (post-Beta)

- **Objectif** : cadrage spec + ADR si nouveaux concepts data (`savings_goals`, drag UX).
- **Risque** : Nul (cadrage uniquement).

### Priorité d'exécution proposée

Lots 1 → 4 (parallélisables) → 2 → 3 (avant Beta 10 juin) → 5 + 6 (entre Beta et v1.0).

### Anti-patterns à refuser

- **Refus de Lot "refactor complet style ChatGPT"** : pas de tout-réécrire pour faire plaisir à un constat théorique. Ankora a déjà 16 PRs mergées sur le cockpit, dont 5 ADRs Accepted.
- **Refus de Lot "redesign cosmétique"** : pas de changement de couleurs, fonts, paddings sans validation préalable Quality Bar (§8).

---

## 8. Quality bar Ankora — `docs/ankora-product-quality-bar-v1.md`

Livré dans un fichier séparé : `docs/ankora-product-quality-bar-v1.md` (créé en parallèle de ce rapport).

Contenu synthétisé :

- **Philosophie produit** : cockpit financier calme, honnête, belge, RGPD-first, anti-stress.
- **Vocabulaire recommandé** : capacité d'épargne réelle, reste à vivre, reste disponible, provisions affectées, réserve libre, plan d'apurement, ballet provisions.
- **Vocabulaire interdit** (FSMA + R-06 anti-culpabilisation) : "vous devriez investir", "nous recommandons", "vous dépensez trop", "économies", "il faut", "manqué".
- **Règles hiérarchie cognitive** : 3 zones (rassurance / pilotage / détail), pas plus de 3 zones, drawers pour le Niveau 3.
- **Règles dashboard** : KPI hero = Capacité d'épargne réelle, jamais Cash Flow court-termiste. 3 lectures Compte Épargne toujours visibles ensemble.
- **Règles landing** : pas un dashboard, pas un argumentaire commercial agressif. Démontrer la promesse par l'exemple (WhatIfDemo).
- **Règles données financières** : Decimal.js obligatoire, formatCurrency locale-aware, tabular-nums sur tous les chiffres.
- **Règles RGPD / FSMA** : langue user, consentement Klaro!, jamais de PII en logs, pas de conseil placement, pas de promesse de gain.
- **Règles mobile / tablette / desktop** : mobile-first, agent `mobile-ios-auditor` obligatoire, safe-area iOS, focus rings emerald, pas de hover-only.
- **Critères de rejet PR** : agent `dashboard-ux-auditor` ❌, agent `mobile-ios-auditor` ❌, Lighthouse < 95 mobile, Sourcery non-silent, scope creep détecté.

---

## 9. Vérifications obligatoires (déjà appliquées dans cet audit)

Conformité avec brief @thierry :

- [x] README.md lu (via NORTH_STAR référence).
- [x] Docs produit existantes lues : NORTH_STAR, ROADMAP, ADR-009, structure ADR-001 à ADR-020.
- [x] Issues / PR lues : ROADMAP table "Voie D §11" + section "PR-D6/D7 candidates" + THI-189 à THI-205.
- [x] Routes inspectées : 23 `page.tsx` cartographiées (cf. §3).
- [x] Composants dashboard / landing inspectés : `src/components/dashboard/*`, `src/components/features/*`, `src/components/marketing/landing/*`, `src/components/ui/*` listés (cf. §3).
- [ ] Tests existants : non lus en détail (à faire dans lot d'implémentation).
- [ ] Supabase / RLS : non audité (audit-only UI dans ce rapport).
- [x] Aucune suppression proposée sans justification (§6.4).

---

## 10. Sortie — pas de code, validation @thierry requise

**Cet audit ne contient aucun code.** Aucune PR n'est ouverte. Aucune migration n'est proposée. Aucune Linear modifiée.

### Demande de validation @thierry

Avant toute implémentation, arbitrage requis sur :

1. **Acceptation du diagnostic §2 (challenge ChatGPT)** : confirmer que la stratégie "ne pas refaire un refactor produit massif inspiré de ChatGPT" est OK.
2. **Acceptation de la hiérarchie §4 (Zone A/B/C)** : confirmer la répartition proposée des 6 sections actuelles + 4 futures.
3. **Acceptation du plan §7 (Lots 1 → 6)** : confirmer l'ordre et la priorisation.
4. **Acceptation du Quality Bar §8** : valider le fichier `docs/ankora-product-quality-bar-v1.md` après lecture.
5. **Décision sur Lot 5 Timeline 6 mois** : prio v1.0 ou v1.1 post-launch ?
6. **Décision sur Lot 6 Drag-to-rebalance** : v1.0 ou v1.1 ?

### Note budget

Audit livré dans le respect du quota Claude (~10 % session consommé, hors lectures repo). Implémentation des Lots 1 à 3 reste compatible avec la deadline Beta 10 juin **si** validation @thierry obtenue cette semaine et exécution Lot 1 enchaînée immédiatement.

### Cap inchangé

Beta 10 juin reste prioritaire. v1.0 fin juin reste prioritaire. Aucune dépendance payante. Aucun changement du modèle financier. Aucune suppression de feature sans justification.

---

**Fin du rapport.** Cowork attend la décision @thierry pour passer à l'exécution (ou amender ce rapport selon retours).
