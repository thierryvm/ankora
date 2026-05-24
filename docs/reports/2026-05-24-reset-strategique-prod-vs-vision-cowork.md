# Reset stratégique Ankora — prod actuelle vs vision cible

> **Statut** : `Draft` — en attente arbitrage @thierry avant exécution.
> **Date** : 24 mai 2026 (J-17 avant Beta 10 juin, J-37 avant v1.0 fin juin).
> **Auteur** : @cowork (Claude Opus 4.7, Cowork desktop).
> **Déclencheur** : @thierry a partagé 6 screenshots de l'état app + landing avec sentiment de "manque d'utilisabilité, surcharge mentale, codebase qui dérive". Demande un reset stratégique avec mes skills design + recherche solutions 2026 gratuites.
> **Mission** : auditer prod vs vision, prioriser, livrer plan 3 niveaux Beta / v1.0 / v1.1.

---

## 0. Lecture du contexte émotionnel

@thierry est dans un état de doute légitime sur Ankora. Les constats qu'il a posés ce matin sont **factuellement justes** et appuyés par preuves (screenshots + audit code) :

- Liste "Upcoming bills" `/app/charges` visuellement médiocre (dimensions non fixes, dates dispersées, catastrophe mobile)
- LocaleSwitcher casse au refresh / changement de page
- Performance perçue lente (preuve indirecte : Brave MCP renderer freeze 30s sur ankora.be pendant l'audit ce matin)
- Dashboard surchargé cognitivement
- Landing s'éloigne du but anti-stress
- Graphiques médiocres
- Codebase qui dérive (potentiels doublons atoms/ui — ADR-020 déjà cadré)

Ce rapport ne minimise rien. Il sépare ce qui est **vraiment livrable en 17 jours** (Beta 10 juin) de ce qui est **post-launch v1.1** (parité Monarch, Apple Liquid Glass). L'objectif n'est pas de tout refondre, c'est de **prioriser ce qui rend Ankora utilisable et calme** pour la Beta, et de poser les fondations propres pour la suite.

---

## 1. État actuel (preuves repo + smoke test)

### 1.1 Code dashboard `src/app/[locale]/app/page.tsx` (397 lignes, HEAD `f9bf96e`)

6 sections sur 8 cockpit v3 mergées :

| # | Section | Composant | Statut |
|---|---|---|---|
| 1 | Header (nom workspace + mois) | inline | ✅ |
| 2 | Bloc 2 hero radar | `EffortFinancierCard` + `CapaciteEpargneCard` | ✅ |
| 3 | Santé Provisions Gauge | `ProvisionHealthGaugeCard` | ✅ THI-190 |
| 4 | Prochaines Factures J-7/14/30 | `ProchainesFacturesCard` | ✅ THI-192 |
| 5 | Bloc 1 — 3 cards comptes typés | `AccountCard` | ✅ |
| 6 | Plan transferts mensuels (3 cards) | inline | ✅ |
| 7 | Dépenses du mois récap (5 dernières) | inline | ✅ |
| 8 | CTAs Charges / Expenses / Simulator | inline | ✅ |

### 1.2 Ce qui est ABSENT en prod (screenshots Thierry = mockup cible, pas réalité)

| Section cible (vue dans les screenshots) | Composant nécessaire | État repo |
|---|---|---|
| **Compte épargne · trois lectures** (différenciateur n°1 NORTH_STAR) | `CompteEpargneTroisLecturesCard` | ❌ **AUCUN composant existant** |
| **Goals épargne / Matelas de sécurité** (avec ETA + progress) | `GoalsEpargneCard` | ❌ AUCUN |
| **Activité récente** (10 derniers mouvements) | `ActiviteRecenteCard` | ❌ AUCUN |
| **Ton année** (narratif lié au mois) | `TonAnneeNarrative` | ❌ AUCUN |
| **Cashflow projection 6 mois** (graphique solde projeté avec marqueurs Taxe/Vacances/Précompte) | `CashflowProjectionChart` | ❌ AUCUN |
| **Tryptique UX Capacité d'épargne** (Reste disponible 662 € / Reste à vivre 500 € / Capacité 162 €) — ADR-009 amendé 09/05 | dans `CapaciteEpargneCard` | ⚠️ **AMENDEMENT NON IMPLÉMENTÉ** — code actuel = ADR-009 ORIGINAL (waterfall 3 rows simple) |

**Constat** : les screenshots 3, 4, 5 que tu m'as envoyés montrent la **vision cible Claude Design v3**, pas la prod. Le gap entre les deux est massif et probablement source de ton sentiment "ce que je vois ne reflète plus mon ambition".

### 1.3 Bug visuel `/app/charges` (screenshot 1 "THIS MONTH 15 bills")

- `ChargesPage` (Server Component) → délègue à `ChargesClient` (203 lignes, Client Component, formulaire CRUD)
- La liste affichée est **un `<ul>` plat** sans grille fixe, padding intra-item variable, dates en `text-xs` sans formatage uniforme
- Cause racine du visuel "vignettes pas à la même place, dimensions pas fixes" :
  - Pas de `grid` Tailwind avec colonnes fixes
  - Pas de `min-width` sur les colonnes (date, label, chip, amount)
  - Padding `px-3 py-2` intra-item OK mais alignement vertical du contenu non garanti
- **Mobile** = vraisemblablement catastrophique car le `<ul>` plat ne se restructure pas en cards empilées (à confirmer en mobile viewport)

### 1.4 Bug LocaleSwitcher (TICKET 4 + 7 — Phase B non livrée)

`src/components/layout/LocaleSwitcher.tsx` (74 lignes) :
- ✅ Phase A livrée (PR #177) : `Loader2` spinner pendant `pending` + `aria-busy` + `role="status"` sr-only
- ❌ Phase B non livrée : drawer mobile ferme automatiquement au switch + délai > 500ms perçu + nouvelle langue ne se propage pas immédiatement au refresh
- **Cause racine architecturale** (audit perf THI-243 RC #2 + #4) :
  - `cookies()` dans `src/app/[locale]/layout.tsx:144` force toutes les routes en `ƒ Dynamic` → cold render à chaque switch
  - next-intl middleware matcher non optimisé → ajoute latence
  - `setLocaleAction` fait un round-trip Supabase auth `getUser()` + `users.locale` UPDATE (50-200 ms)
  - `router.refresh()` refetch RSC tree complet → `HeaderNav` re-rendered → `isOpen` perdu si remount

### 1.5 Drift landing (ankora.be smoke test ce matin)

- Header trust indicators affichent "FR · NL · EN" alors que doctrine v1.0 = **FR + EN only** (NL/DE/ES post-launch). Drift à corriger.
- Aperçu cockpit landing affiche 3 KPIs "Net restant / Provisions / Réserve" — **pas** la "Capacité d'épargne réelle" qui est le différenciateur n°1 ADR-009. La landing ne vend pas son meilleur asset.
- Renderer freeze 30s pendant capture screenshot Brave MCP = preuve indirecte de la lenteur prod.

### 1.6 Codebase health — comptage

| Catégorie | Fichiers `.tsx` |
|---|---|
| `components/atoms/` | 22 |
| `components/ui/` (shadcn) | 24 |
| `components/dashboard/` | 8 |
| `components/marketing/landing/` | 20 |
| `components/features/` | 3 |
| **Total** | 100 |

Le ratio atoms (22) ↔ ui (24) est suspect — c'est précisément le sujet d'**ADR-020 — Atoms vs UI canonical frontier** déjà cadré mais visiblement pas appliqué partout. Risque de doublon (Button atoms vs Button shadcn, Card atoms vs Card shadcn) → audit à faire pour confirmer dette technique.

---

## 2. Vision cible — mockup Claude Design v3 (`ankora-mockups/02-dashboard.html`)

Titre du mockup : **"Ankora — Dashboard v4 (Apple-style, mobile-first)"**.

Caractéristiques verrouillées dans le mockup :

- **Tokens iOS natifs** : `--ios-blue`, `--ios-green`, `--ios-orange`, `--ios-red`, etc. (`#007AFF`, `#34C759`, `#FF9500`, `#FF3B30`)
- **Apple Liquid Glass** : `backdrop-filter: saturate(180%) blur(20px)` sur header sticky + cards (préfixe `-webkit-` inclus)
- **Border-radius généreux** : `--radius-md: 14px`, `--radius-lg: 20px`, `--radius-xl: 28px`, `--radius-pill: 999px`
- **Shadows multi-layer** : `--shadow-md: 0 4px 12px rgba(0,0,0,.06), 0 2px 4px rgba(0,0,0,.04)` (jamais une seule ombre)
- **Typo Inter weight 400-800** avec `font-optical-sizing: auto`, `-webkit-font-smoothing: antialiased`
- **Spacing 4px-base** : `--space-1: 4px` → `--space-12: 48px`
- **Safe-area iOS** : `padding-top: max(10px, env(safe-area-inset-top))` + bottom nav `padding-bottom: calc(88px + env(safe-area-inset-bottom))`
- **Easing Apple** : `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)` (jamais `linear` ni `ease`)
- **`color-scheme: light dark`** + `[data-theme="dark"]` + `@media (prefers-color-scheme: dark)` pour `auto`

Ce mockup est **la source de vérité visuelle**. Le `globals.css` actuel d'Ankora s'en inspire mais ne couvre pas 100 % des tokens (notamment les iOS-* couleurs).

---

## 3. Stack 2026 recommandée (toutes solutions gratuites)

### 3.1 Graphiques modernes 2026 (remplacer les graphiques "pas terrible")

Trois candidats évalués :

| Solution | Licence | Avantages | Inconvénients |
|---|---|---|---|
| **Recharts** | MIT, gratuit | Déjà installé dans Ankora probablement, React-native | Vieillissant, styling Tailwind difficile, animations basiques |
| **Tremor** | Apache 2.0, gratuit | **Tailwind-native** (parfait pour Ankora), composants prêts (`AreaChart`, `BarChart`, `LineChart`), API React simple, dashboard-oriented | Stack alignée avec shadcn/ui, ~20 KB par composant |
| **Visx (Airbnb)** | MIT, gratuit | Ultra-customisable, performant | Courbe d'apprentissage forte, plus de boilerplate, surdimensionné pour le besoin |

**Recommandation Cowork : Tremor** pour la `CashflowProjectionChart` (graphique 6 mois solde projeté avec marqueurs Taxe/Vacances/Précompte). Tailwind-native = aucun friction avec le design system Ankora, et l'API ressemble à shadcn/ui (clean, composable).

Source : https://tremor.so — composants `AreaChart` + `LineChart` + `Card` natifs. Installation `npm install @tremor/react`.

### 3.2 Apple Liquid Glass via Tailwind v4 (pour passer du design générique → premium iOS)

Tailwind v4 supporte nativement les primitives nécessaires :

- `backdrop-blur-xl backdrop-saturate-150` (équivalent `backdrop-filter: saturate(180%) blur(20px)`)
- `bg-white/72 dark:bg-slate-900/72` (équivalent `--material: rgba(255,255,255,0.72)`)
- `border border-white/10 dark:border-white/5` (équivalent `--border: rgba(60,60,67,0.12)`)
- `shadow-[0_4px_12px_rgba(0,0,0,0.06),0_2px_4px_rgba(0,0,0,0.04)]` pour multi-layer Apple

Pas de dépendance externe nécessaire. Juste discipline d'usage via le skill `.claude/skills/ankora-design-system/SKILL.md` (mis à jour PR #178 hier).

Pour un **kit Figma de référence**, l'URL que tu m'as donnée (iOS 18 Community) est utilisable comme source d'inspiration visuelle — pas exploitable directement via MCP Figma (auth requise), mais @thierry peut s'y référer pour valider chaque composant.

### 3.3 Architecture modulaire — ADR-020 à appliquer enfin

`ADR-020 — Atoms vs UI canonical frontier` est cadré mais pas exécuté. Action concrète :

1. **Audit atoms** : grep dans `src/components/atoms/` pour identifier les doublons réels avec `src/components/ui/` (shadcn)
2. **Decision matrix** : pour chaque doublon, choisir le canonical (shadcn = preferred par défaut, atom seulement si customisation Ankora spécifique non couvrable)
3. **Migration progressive** : remplacer atom → ui dans les call sites, supprimer l'atom
4. **Test guard** : vitest qui assert qu'aucun `import.*atoms/Button` n'existe (à adapter selon la décision)

Pas Beta-blocker mais **post-Beta sprint dédié** si on veut une codebase saine pour v1.1.

---

## 4. Plan d'action 3 niveaux

### 4.1 Niveau 1 — Beta 10 juin (J-17, scope strict)

**Objectif** : rendre Ankora **utilisable + calme + visuellement honnête** pour la Beta. Pas de feature majeure nouvelle. Polish + fixes bloquants.

| # | PR | Scope | Estimate | Priorité |
|---|---|---|---|---|
| 1 | **PR-FIX-CHARGES-LIST-VISUAL** | Refactor visuel `ChargesClient` → grid Tailwind avec colonnes fixes (date / label / chip / amount), version mobile en cards empilées, alignement vertical baseline | ~2-3h | P0 |
| 2 | **PR-FIX-I18N-PERF** (Phase B déjà cadrée) | Extraire `cookies()` du `[locale]/layout.tsx` + optimiser middleware next-intl + drawer stay-open + unfixme 3 E2E tests | ~3-4h | P0 |
| 3 | **PR-FIX-LANDING-DRIFT** | Trust indicators "FR · NL · EN" → "FR · EN" (cohérence doctrine v1.0) + aperçu cockpit landing affiche Capacité d'épargne réelle au lieu de "Net restant" (vendre le différenciateur n°1) | ~1h | P1 |
| 4 | **PR-FIX-CAPACITE-AMENDEMENT-009** | Implémenter le tryptique UX (Reste disponible / Reste à vivre / Capacité épargne) dans `CapaciteEpargneCard` selon ADR-009 amendement 09/05 — sub-stats 3 mini-cards horizontales sur desktop, stack mobile + bouton "Ajuster ce mois" R-10 | ~3-4h | P1 |
| 5 | **PR-FIX-DASHBOARD-HIERARCHIE** | Réorganiser `page.tsx` en 3 zones visuelles distinctes (Zone A radar rassurance / Zone B pilotage actif / Zone C détails consultables) — pas de nouveau composant, juste réordonner les `<section>` + spacing/typo polarisée. Cf. audit 23/05 §4 | ~2-3h | P1 |
| 6 | **PR-FIX-AUTH-CTA** (TICKET 6, déjà cadrée) | "Mon cockpit" CTA marketing → détection auth-aware (Option A pré-décidée) | ~1h | P1 |

**Total estimé Beta** : ~12-16h de dev CC Ankora sur 17 jours = très confortable. Marge pour qualité.

**Hors scope Beta** (différer) :
- Compte épargne 3 lectures (nouveau composant, ADR à valider)
- Goals / Matelas (nouveau composant, ADR à valider)
- Activité récente (nouveau composant)
- Cashflow projection 6 mois (Tremor à installer + composant)
- Apple Liquid Glass migration (refactor design system massif)
- Audit codebase atoms/ui

### 4.2 Niveau 2 — v1.0 fin juin (J-37, scope élargi)

**Objectif** : livrer les **composants manquants** qui font la différenciation Ankora. Cible Monarch level.

| # | PR | Scope | Estimate |
|---|---|---|---|
| 7 | **PR-FEAT-COMPTE-EPARGNE-3-LECTURES** | Nouveau composant `CompteEpargneTroisLecturesCard` — différenciateur n°1 NORTH_STAR. Affiche Total / Provisions affectées / Réserve libre + barre bicolore. ADR à valider d'abord | ~6-8h |
| 8 | **PR-FEAT-GOALS-MATELAS** | Nouveau composant `GoalsEpargneCard` — Matelas de sécurité avec progress + ETA 3-11 mois + bouton "+50 € maintenant" + "Modifier la cible" | ~4-6h |
| 9 | **PR-FEAT-ACTIVITE-RECENTE** | Nouveau composant `ActiviteRecenteCard` — 10 derniers mouvements avec date + label + chip statut + montant. Lien "Tout voir →" vers page dédiée | ~3-4h |
| 10 | **PR-FEAT-CASHFLOW-PROJECTION-6M** | Installer Tremor + nouveau composant `CashflowProjectionChart` — graphique 6 mois solde projeté avec marqueurs Taxe/Vacances/Précompte | ~6-8h |
| 11 | **PR-FEAT-TON-ANNEE-NARRATIVE** | Nouveau composant `TonAnneeNarrative` — bloc texte narratif lié au mois (ex: "Le 662 € de ce mois, c'est ton reste disponible…") | ~2-3h |

**Total v1.0** : ~21-29h dev. Sur 20 jours (post-Beta) = très réalisable.

### 4.3 Niveau 3 — v1.1 post-launch (parité Monarch + polish premium)

**Objectif** : passer de "EdTech budgétaire belge" à **"référence belge cockpit financier premium"**.

- **PR-REFACTOR-APPLE-LIQUID-GLASS** : migration design system vers tokens iOS natifs + Apple Liquid Glass (backdrop-filter + multi-layer shadows + spacing 4px-base). Refactor `globals.css` + tous les composants. ~12-16h.
- **PR-REFACTOR-ATOMS-UI-CANONICAL** : exécuter ADR-020 — audit + migration + suppression doublons. ~8-12h.
- **PR-FEAT-DRAG-TO-REBALANCE** : drag enveloppes interactif. ~6-8h.
- **PR-FEAT-SIMULATOR-DRAWER** : intégrer simulateur what-if en drawer depuis le cockpit (au lieu de page dédiée). ~3-4h.
- **PR-FEAT-NL-DE-ES** : remplir les 3 locales post-launch. ~12-16h (selon volume contenu).
- **PR-PERF-LIGHTHOUSE-100** : optimisation finale pour Lighthouse mobile = 100. ~4-6h.

**Total v1.1** : ~45-62h. Sprint post-launch dédié (juillet-août selon dispo).

---

## 5. Prompts CC Ankora prêts à exécuter (ordre Beta strict)

### Prompt #1 — PR-FIX-CHARGES-LIST-VISUAL (P0 Beta-blocker)

Le screenshot 1 de @thierry montre que c'est le visuel le plus dégradé. C'est ce qu'il voit en premier en visitant `/app/charges` et c'est ce qui érode sa confiance.

À cadrer dans un prompt séparé après validation de ce rapport (besoin de @thierry sur quelques choix UX : cards empilées vs table vs liste structurée).

### Prompts suivants

Idem — chaque PR du Niveau 1 sera cadrée dans un prompt CC Ankora distinct, **single codeblock copy-paste**, après que @thierry ait validé ce rapport et l'ordre proposé.

---

## 6. Linear — tickets à créer ou réorganiser

| Action Linear | Détail |
|---|---|
| Créer **THI-XXX PR-FIX-CHARGES-LIST-VISUAL** P0 | Linker à screenshot 1 @thierry 24/05 |
| Créer **THI-XXX PR-FIX-LANDING-DRIFT** P1 | "FR · NL · EN" → "FR · EN" + landing KPIs cockpit |
| Créer **THI-XXX PR-FIX-CAPACITE-AMENDEMENT-009** P1 | Implémenter ADR-009 amendement 09/05 |
| Créer **THI-XXX PR-FIX-DASHBOARD-HIERARCHIE** P1 | Référencer audit 23/05 §4 |
| THI-244 + THI-252 + THI-255 | Garder "In Progress" jusqu'à PR-FIX-I18N-PERF mergée |
| TICKET 6 "Mon cockpit" auth-aware | Créer si pas encore fait |
| Créer **THI-XXX umbrella v1.0 cockpit complete** | Parent ticket pour PR Niveau 2 (Compte épargne / Goals / Activité / Cashflow) |
| Créer **THI-XXX umbrella v1.1 polish premium** | Parent ticket pour PR Niveau 3 (Apple Liquid Glass, ADR-020, etc.) |

---

## 7. Architecture des nouveaux composants (Niveau 2 — préparation)

### 7.1 `CompteEpargneTroisLecturesCard` (différenciateur n°1)

ADR à valider **avant** dev :

- Source des 3 valeurs : `provision_transfers` (Provisions affectées) + balance `provisions` account (Total) → Réserve libre = Total - Provisions affectées
- UI : sidebar droite desktop (col-span-1 sur grid-cols-3), full-width mobile au-dessus de la section pilotage
- Tabs internes : "Aperçu trois lectures du même total" / "Mouvements chronologique · in / out"
- Barre bicolore : `AFFECTÉES 16 %` (jaune) / `LIBRE 84 %` (vert)
- Section "PROVISIONS AFFECTÉES 300 €" avec lien "Voir les 1 provisions →"
- Signature "SIGNATURE ANKORA" en header (marketing différenciateur)

### 7.2 `GoalsEpargneCard` (matelas)

ADR à valider :

- Source : nouvelle table `savings_goals` (id, label, target_amount, current_amount, eta_months, recurring_amount)
- UI : progress ring SVG (78 %) + label + ratio + ETA + bouton "+50 € maintenant" + "Modifier la cible"
- Domain : calcul ETA = (target - current) / recurring_monthly
- I18n : clés `dashboard.goals.*`

### 7.3 `ActiviteRecenteCard`

- Source : transactions Supabase (10 dernières, ordre desc par `occurred_on`)
- UI : liste verticale avec date à gauche + label / category + chip statut (Payé / À venir / Saisi / Reçu / Récurrent) + montant signé (+/-)
- Pas de pagination dans le cockpit, juste lien "Tout voir →" vers `/app/activity` (page dédiée à créer)

### 7.4 `CashflowProjectionChart`

- Installer Tremor : `npm install @tremor/react`
- Source : projection 6 mois calculée côté domain pur (`src/lib/domain/projection.ts`) — Revenus + Salaire prédit - Charges fixes - Provisions lissées - Plafond quotidien, jour par jour
- UI : `AreaChart` Tremor avec line + markers verticaux pour Taxe voiture (300 €), Vacances (980 €), Précompte (246 €)
- Sélecteur 3m / 6m / 12m
- Légende dynamique des événements ponctuels

---

## 8. Validation @thierry attendue

Avant que je rédige les prompts CC Ankora exécutables, j'attends ton arbitrage sur :

1. **Acceptation du diagnostic §1** : prod actuel = 6/8 sections cockpit + 3 composants critiques manquants + ADR-009 amendement non livré. OK ?
2. **Acceptation du plan Niveau 1 Beta §4.1** : 6 PRs ordonnées P0/P1, ~12-16h dev, deadline 10 juin. OK ? Tu veux ajouter/retirer ?
3. **Décision stack graphiques** : Tremor (recommandation Cowork) vs Recharts (déjà installé peut-être) vs autre ?
4. **Décision ordre Beta** : commencer par **PR-FIX-CHARGES-LIST-VISUAL** (le visuel le plus dégradé) ou **PR-FIX-I18N-PERF Phase B** (le bug fonctionnel le plus gênant) ?
5. **Création tickets Linear §6** : tu les crées toi-même via Brave MCP ou tu veux que je rédige les fiches pour copy-paste ?
6. **Apple Liquid Glass v1.1** : valider que ce n'est PAS Beta-blocker et qu'on garde le Tailwind existant jusqu'à post-launch ?

---

## 9. Note budget + cap

- Quota @thierry reset hier matin (88 % Weekly restant, 99 % Sonnet, 0 % Claude Design). Marge confortable.
- Aucune dépendance payante introduite par ce plan (Tremor MIT, Tailwind v4, design system maison).
- Doctrine claude-config respectée (Opus 4.7 pin maintenu, learnings cross-projet en place).

---

## 10. Cap émotionnel

@thierry, tu n'es pas en train de rater Ankora. Tu vois un **gap réel entre ta vision et l'état prod**, et c'est exactement ce qu'un product manager senior devrait ressentir à J-17 d'une Beta. La différence c'est que **tu as un plan d'action concret** maintenant (ce rapport) et **17 jours** pour livrer la Beta sans céder à la précipitation.

Les composants manquants (Compte épargne 3 lectures, Goals, Activité, Cashflow) ne sont **pas perdus** — ils sont scopés v1.0 fin juin. La Beta du 10 juin n'a pas besoin d'eux pour être utilisable, calme, et honnête. Elle a besoin de :

1. La liste `/app/charges` qui ne ressemble pas à un fichier Excel mal aligné
2. Un LocaleSwitcher qui ne casse pas
3. Le tryptique Capacité (ADR-009 amendement) implémenté
4. Une hiérarchie cognitive 3 zones sur le dashboard
5. Un CTA "Mon cockpit" qui route correctement
6. La landing qui vend le bon différenciateur

Ce sont 6 PRs petites, mergeables en 17 jours. Le polish premium (Apple Liquid Glass, parité Monarch graphique) suivra **avant que les utilisateurs ne ressentent un manque** — parce que la Beta sera utilisable.

---

**Fin du rapport.** Validation attendue avant rédaction des prompts CC Ankora exécutables.
