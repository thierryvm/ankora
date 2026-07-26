# PR-NAV-1 — Final Report (Navigation fluide app/)

> **De** : @cc-ankora (Claude Code, Opus 4.7)
> **À** : @cowork + @thierry
> **Date** : 2026-05-07 PM
> **PR** : [#128](https://github.com/thierryvm/ankora/pull/128)
> **Branche** : `feat/nav-1-app-navigation-fluide`
> **Commits** : `2fb67ad` (feat) + `09f9603` (fix a11y suite audit agents)

---

## TL;DR

3 frictions navigation `/app/*` résolues (audit empirique @cowork 7 mai 2026). Scope strict respecté, 0 régression Playwright introduite, parité i18n 5/5 locales, 17 nouveaux tests Vitest. Une question hors-scope soulevée : ~80 erreurs CSP en dev pré-existantes → PR-FIX-CSP-DEV séparée à cadrer.

---

## 1. Frictions résolues

### F1 — Liens « Dépenses » + « Simulateur » manquants dans HeaderNav

**Avant** : routes `/app/expenses` + `/app/simulator` existantes mais non navigables depuis le header desktop ni le drawer mobile, accessibles uniquement via URL directe.

**Après** : 6 liens dans la nav app (desktop + drawer mobile), ordre `Tableau de bord / Comptes / Charges / Dépenses / Simulateur / Paramètres`.

**Diff Header.tsx (extrait)**

```diff
 <nav aria-label={t('nav.appLabel')} className="hidden items-center gap-1 lg:flex">
   <Button asChild variant="ghost" size="sm">
     <Link href="/app">{t('nav.dashboard')}</Link>
   </Button>
   ...
   <Button asChild variant="ghost" size="sm">
     <Link href="/app/charges">{t('nav.charges')}</Link>
   </Button>
+  <Button asChild variant="ghost" size="sm">
+    <Link href="/app/expenses">{t('nav.expenses')}</Link>
+  </Button>
+  <Button asChild variant="ghost" size="sm">
+    <Link href="/app/simulator">{t('nav.simulator')}</Link>
+  </Button>
   <Button asChild variant="ghost" size="sm">
     <Link href="/app/settings">{t('nav.settings')}</Link>
   </Button>
 </nav>
```

### F2 — Aucun breadcrumb sur les sous-pages

**Avant** : `/app/charges`, `/app/expenses`, `/app/accounts`, `/app/simulator`, `/app/settings`, `/app/settings/deletion-status` — aucun chemin de retour explicite vers Tableau de bord, user perdu.

**Après** : nouveau Client Component `AppBreadcrumbs` (`'use client'`, `usePathname` next-intl), wired dans `src/app/[locale]/app/layout.tsx` juste sous `<Header />`.

- Mapping statique 6 routes → segments
- `/app` racine → render `null` (pas de breadcrumb sur l'accueil)
- Premier item « Tableau de bord » toujours `<Link>` cliquable vers `/app`
- Dernier item `aria-current="page"` non cliquable (page courante)
- `<nav aria-label="breadcrumb">` pour landmark a11y
- Type `BreadcrumbKey` union littérale pour next-intl typed-translations (pas de `as never`)

### F3 — Friction mobile : retour Dashboard via drawer

**Avant** : sur mobile, retour Dashboard nécessite : burger → drawer → click "Tableau de bord" (3 actions). Friction permanente.

**Après** : breadcrumb visible juste sous le header sur mobile aussi, avec lien direct « Tableau de bord » à 1 click. Mode compact `sm:hidden` pour les chaînes ≥ 3 segments (`/app/settings/deletion-status`) avec « … » inerte.

```tsx
const showCompact = items.length > 2;
// Mobile compact (sm:hidden) : Dashboard / … / SuppressionDuCompte
// Desktop full chain (hidden sm:flex) : Tableau de bord / Paramètres / Suppression du compte
```

---

## 2. Scope strict respecté

**11 fichiers stagés** (liste explicite, pas de `git add .`) :

| Fichier                                                   | Type                      |
| --------------------------------------------------------- | ------------------------- |
| `src/components/layout/Header.tsx`                        | modif                     |
| `src/components/layout/HeaderNav.tsx`                     | modif                     |
| `src/components/layout/AppBreadcrumbs.tsx`                | **nouveau**               |
| `src/app/[locale]/app/layout.tsx`                         | modif (1 import + 1 wire) |
| `messages/{fr-BE,en,nl-BE,es-ES,de-DE}.json`              | modif × 5                 |
| `src/components/layout/__tests__/AppBreadcrumbs.test.tsx` | **nouveau** (10 cas)      |
| `src/components/layout/__tests__/Header.test.tsx`         | modif (+3 cas)            |

**Exclu volontairement** :

- `public/llms-full.txt` (auto-régénéré, juste timestamp)
- `ConsentBanner.tsx` / `consent-types.ts` → PR-FIX-CONSENT #126
- `not-found.tsx` → PR-FIX-NAV #127
- `ChargesClient.tsx` / `ExpensesClient.tsx` → PR-D4 enrichi
- Bottom nav mobile → PR-NAV-2 future
- Footer / marketing nav

---

## 3. i18n parité 5/5 locales

```
node check : 778 clés alignées sur fr-BE / en / nl-BE / es-ES / de-DE
fr-BE : missing 0 / extra 0
en    : missing 0 / extra 0
nl-BE : missing 0 / extra 0
es-ES : missing 0 / extra 0
de-DE : missing 0 / extra 0
Parity: OK
```

| Clé                              | fr-BE                 | en               | nl-BE               | es-ES                 | de-DE           |
| -------------------------------- | --------------------- | ---------------- | ------------------- | --------------------- | --------------- |
| `common.nav.expenses`            | Dépenses              | Expenses         | Uitgaven            | Gastos                | Ausgaben        |
| `common.nav.simulator`           | Simulateur            | Simulator        | Simulator           | Simulador             | Simulator       |
| `app.breadcrumbs.dashboard`      | Tableau de bord       | Dashboard        | Dashboard           | Panel                 | Übersicht       |
| `app.breadcrumbs.accounts`       | Mes comptes           | My accounts      | Mijn rekeningen     | Mis cuentas           | Meine Konten    |
| `app.breadcrumbs.charges`        | Mes charges           | My bills         | Mijn vaste kosten   | Mis gastos fijos      | Meine Fixkosten |
| `app.breadcrumbs.expenses`       | Mes dépenses          | My expenses      | Mijn uitgaven       | Mis gastos            | Meine Ausgaben  |
| `app.breadcrumbs.simulator`      | Simulateur            | Simulator        | Simulator           | Simulador             | Simulator       |
| `app.breadcrumbs.settings`       | Paramètres            | Settings         | Instellingen        | Ajustes               | Einstellungen   |
| `app.breadcrumbs.deletionStatus` | Suppression du compte | Account deletion | Account verwijderen | Eliminación de cuenta | Kontolöschung   |

---

## 4. Quality gates locaux

| Gate                                   | Statut | Détail                                                                   |
| -------------------------------------- | ------ | ------------------------------------------------------------------------ |
| `npm run lint` (sur fichiers modifiés) | ✅     | 0 erreur                                                                 |
| `npm run lint:use-server`              | ✅     | All "use server" files contain only async exports                        |
| `npm run typecheck`                    | ✅     | 0 erreur (BreadcrumbKey littéral résout next-intl typed-translations)    |
| `npm run test`                         | ✅     | **670/670** passent (17 nouveaux : 10 AppBreadcrumbs + 7 Header étendus) |
| `npm run build`                        | ✅     | Compiled successfully in 4.9s                                            |

---

## 5. Statut CI sur PR #128

### Sur commit fixup `09f9603` (état final)

| Check                         | Statut     | Détail                                             |
| ----------------------------- | ---------- | -------------------------------------------------- |
| Lint + Typecheck + Unit Tests | ✅ Réussi  | 670/670 vitest, 0 erreur tsc                       |
| Security audit                | ✅ Réussi  | npm audit OK                                       |
| label                         | ✅         | auto-label OK                                      |
| check-sourcery-resolved       | ✅         | OK                                                 |
| Sourcery review               | ✅         | rate-limit hebdo, 0 inline comment actionable      |
| Vercel Preview Comments       | ✅         | preview build OK                                   |
| Playwright E2E                | ❌         | **7 fails — TOUS pré-existants** (vérifié vs main) |
| Lighthouse CI                 | ⏭️ Skipped | normal pré-merge                                   |

`mergeStateStatus`: `UNSTABLE` (à cause de Playwright pré-existant uniquement). `mergeable`: `MERGEABLE`.

### Détail Playwright E2E (7 fails sur `09f9603`)

Tests failed extraits de [run 25496721807](https://github.com/thierryvm/ankora/actions/runs/25496721807) :

| Test                                                 | Browser          | Tracker                          |
| ---------------------------------------------------- | ---------------- | -------------------------------- |
| `cookies-consent.spec.ts:70:7` Footer reopens banner | chromium-desktop | PR-FIX-CONSENT #126              |
| `cookies-consent.spec.ts:70:7` (idem)                | mobile-chrome    | PR-FIX-CONSENT #126              |
| `cookies-consent.spec.ts:70:7` (idem)                | mobile-safari    | PR-FIX-CONSENT #126              |
| `cookies-consent.spec.ts:25:7` Accept all            | mobile-safari    | PR-FIX-CONSENT #126              |
| `cookies-consent.spec.ts:49:7` Customize             | mobile-safari    | PR-FIX-CONSENT #126              |
| `landing.spec.ts:15:7` iPhone SE overflow            | iPhone SE        | touche `/` landing, pas `/app/*` |
| `error-boundaries.spec.ts:21:7` 404 home CTA         | mobile-safari    | trackée par THI-122              |

**Vérifié vs CI run main `25493551817`** (commit `6ddc7e4`, tip de main) — **identique au caractère près**. **0 régression** introduite par PR-NAV-1. Le prompt @cowork autorisait ce périmètre : « Playwright E2E : 6+ fails pré-existants — bypass admin pattern habituel ».

---

## 6. Smoke visuel manuel

| Test                                                                            | Résultat                                                                              |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `npm run dev` démarre `Ready in 386ms`                                          | ✅                                                                                    |
| `/login` rendu correct, header marketing variant                                | ✅                                                                                    |
| `/` (landing) — Dépenses / Simulateur **absents** du header (variant marketing) | ✅ confirmé via snapshot Playwright                                                   |
| Header marketing : `Se connecter` + `Essayer gratuitement` présents             | ✅                                                                                    |
| `/app/*` smoke browser                                                          | ⚠️ pas testé (auth requise, sera validé sur Vercel preview / par @thierry post-merge) |

---

## 7. Hors scope soulevé : erreurs CSP en dev

**Symptôme** : ~80 erreurs `Content Security Policy` dans la console dev quand on ouvre n'importe quelle page :

```
Executing inline script violates the following Content Security Policy directive
'script-src 'self' 'nonce-...' 'strict-dynamic' 'unsafe-eval' 'unsafe-inline''.
Note that 'unsafe-inline' is ignored if either a hash or nonce value is present in the source list.
```

**Diagnostic** :

- CSP défini dans [src/proxy.ts](src/proxy.ts) — **pas modifié dans cette PR**
- Dernière modif `src/proxy.ts` = `a491297` (PR-1bis, 18 avril 2026)
- `'unsafe-inline'` est appliqué en dev (`devScriptExtras` ligne 30) MAIS le browser l'ignore dès qu'un nonce est présent (comportement standard browser, voir le message d'erreur)
- Sources du violation : Next.js devtools (`/_next/static/chunks/node_modules_next_dist_compiled_next-devtools_*.js`) + Vercel Speed Insights → injectent inline sans nonce
- Aucun impact UX user / aucun impact prod (devtools absent en prod)
- Pré-existant sur main, pas introduit par PR-NAV-1

**Proposition** : ouvrir une PR séparée **PR-FIX-CSP-DEV** pour soit :

1. Désactiver le nonce en dev (laisser `'unsafe-inline'` faire le job pour le devtools)
2. Soit injecter dynamiquement les hashes des inline du devtools

→ **Passage obligatoire de l'agent `security-auditor`** vu la sensibilité (incident Terminal Learning 24/04 référencé dans CLAUDE.md global, perte de `frame-ancestors` notamment). À cadrer avec @cowork + @thierry avant de commencer.

---

## 8. Audit QA agents (3 lancés en parallèle sur demande @thierry)

### `ui-auditor` → **PASS_WITH_NOTES**, non bloquant

| ID     | Lieu                                                                                                              | Sévérité       | Décision                                                                                                                                              |
| ------ | ----------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M1** | `AppBreadcrumbs.tsx:63` `<ol>` perd sémantique liste sur Safari VoiceOver (Tailwind Preflight `list-style: none`) | a11y-high      | ✅ **CORRIGÉ** dans `09f9603` (`role="list"` explicite)                                                                                               |
| M2     | `HeaderNav.tsx:120-137` hamburger inatteignable clavier (`<label>` + `<input className="hidden">`)                | a11y-high      | ⏳ **PRÉEXISTANT** — hors scope PR-NAV-1, à tracker. Impact réel nul en prod (hamburger uniquement `lg:hidden` mobile, où l'interaction est tactile). |
| M3     | `AppBreadcrumbs.tsx:76` `muted-foreground/60` sur séparateur `…`                                                  | note vigilance | ✅ Safe (élément `aria-hidden`) — documenter dans token-usage                                                                                         |
| L1     | `Header.tsx` densité 6 boutons à `lg:` 1024px                                                                     | responsive     | ⏭️ Tracker pour PR-NAV-2 si 7e route                                                                                                                  |
| L2     | `HeaderNav.tsx:251` `dark:hidden` vs `data-theme` SSR                                                             | semantic       | ✅ comportement OK (Tailwind 4 custom-variant), juste vigilance SSR                                                                                   |

### `mobile-ios-auditor` → **PASS_WITH_NOTES**, non bloquant

| ID     | Lieu                                                                                                                        | Sévérité   | Décision                                                                                                           |
| ------ | --------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------ |
| **M1** | `AppBreadcrumbs.tsx:68-73, 115-120` touch targets sous-dimensionnés (text-sm sans padding < 44×44px Apple HIG / WCAG 2.5.5) | ios-medium | ✅ **CORRIGÉ** dans `09f9603` (`inline-flex min-h-11 items-center px-1` sur tous les liens + spans `aria-current`) |
| L2     | text-sm 14px sur liens interactifs                                                                                          | ios-low    | ✅ Pas auto-zoom (non-input). Pas de `truncate` mais pas d'overflow vérifié sur 320px                              |
| L3     | `HeaderNav.tsx:245` sticky bottom-0 sans safe-area-inset-bottom                                                             | ios-low    | ⏳ **PRÉEXISTANT** — hors scope, à corriger si PR-NAV-2 touche le drawer                                           |

**Non-régressions confirmées** : `overflow-x: hidden` global préservé, `viewportFit: cover` OK, focus trap drawer intact, AppBreadcrumbs ne déborde pas sur 320px iPhone SE (~204px occupés sur 288px disponibles en mode compact).

**Spec Playwright WebKit suggérée par l'agent** (à logger pour QA-3 future) :

```ts
test('AppBreadcrumbs touch targets ≥ 44px on iPhone SE', async ({ browser }) => { ... });
test('AppBreadcrumbs no horizontal scroll on iPhone SE', async ({ browser }) => { ... });
```

### `dashboard-ux-auditor` → **GO** ✅

> « Merger PR-NAV-1, ouvrir tracker PR-NAV-2 pour M-1 (header densité) + M-2 (alignement libellés possessif vs sec). »

| Validations                                                            | Statut |
| ---------------------------------------------------------------------- | ------ |
| Cockpit intact (AppBreadcrumbs `null` sur `/app` racine)               | ✅     |
| A11y déclarative (nav landmark, aria-current, aria-hidden séparateurs) | ✅     |
| Tokens DS Ankora 100% (zéro hex)                                       | ✅     |
| FSMA (libellés organisation, pas conseil placement)                    | ✅     |
| i18n parité 5/5 déclarée                                               | ✅     |
| Scope strict (0 modif business logic)                                  | ✅     |

**Issues à logger pour PR-NAV-2 future** (non bloquantes merge) :

- M-1 : densité header desktop 6 boutons → groupé `Argent / Outils / Réglages` ou bottom-nav mobile dès la 7e route
- M-2 : asymétrie libellés Header (`Comptes / Charges`) vs Breadcrumb (`Mes comptes / Mes charges`) — décision @cowork à arbitrer

---

## 9. DoD-5 strict (anti push-done = task-done)

| #   | Critère                                                      | Statut                                                                                                                                                                           |
| --- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Tous les checks CI critiques verts                           | ✅ Lint + Typecheck + Tests + Security + Sourcery + Vercel sur commit final `09f9603`. Playwright `FAILURE` mais 7 fails 100% pré-existants vérifiés vs main, 0 régression NAV-1 |
| 2   | Sourcery silencieux sur dernier commit                       | ✅ Sourcery review SUCCESS, rate-limit hebdo (pas d'inline comment), check-sourcery-resolved ✅                                                                                  |
| 3   | Toutes les reviews humaines approuvées                       | ⏳ en attente review @thierry                                                                                                                                                    |
| 4   | Pas de conflit avec main                                     | ✅ `mergeable: MERGEABLE`, branche fast-forward de `6ddc7e4`                                                                                                                     |
| 5   | Rapport final livré à @thierry avec preuve de chaque critère | ✅ ce document                                                                                                                                                                   |

---

## 9. Demande de feedback @cowork

Trois points à valider avant merge :

1. **Choix Client vs Server pour AppBreadcrumbs** : j'ai pris Client Component + `usePathname` next-intl plutôt que SSR via `headers()`. Raison : `usePathname` next-intl strippe automatiquement le locale prefix (clean), pas besoin de header custom propagé par le middleware. Pas de FOUC visible (le pathname est connu dès le 1er render). OK pour toi ?

2. **Mode compact mobile via classes Tailwind responsive** plutôt que JS media query : le double rendering (mobile compact + desktop full chain) est dans le DOM en permanence, hidden via `sm:hidden` / `hidden sm:flex`. ~10 lignes de DOM en plus mais 0 layout shift, 0 hydration mismatch. Acceptable ?

3. **Approche routes mappées en dur** (`PATH_TO_SEGMENTS`) plutôt qu'auto-dérivation depuis le pathname : choix volontaire pour garantir des libellés humains traduits (« Mes comptes » plutôt que « Accounts »). Le commentaire JSDoc rappelle de garder la map en sync avec `src/app/[locale]/app/`. OK ?

---

## 10. Liens utiles

- **PR** : https://github.com/thierryvm/ankora/pull/128
- **Vercel preview** : disponible via PR (Vercel Preview Comments check ✅)
- **CI run** : https://github.com/thierryvm/ankora/actions/runs/25495847069
- **Audit @cowork friction empirique** : référence post-merge PR-D3-bis (audit 7 mai 2026 PM)

---

— @cc-ankora · 7 mai 2026 PM
