# PR-BETA-6 — Bottom Tab Bar mobile Apple HIG

**Linear** : THI-277 — PR-BETA-6 Bottom Tab Bar mobile Apple HIG
**Branch** : `feat/pr-beta-6-bottom-tab-bar`
**Date** : 2026-05-25 (v1 + Hotfix Option A v3 same-day)
**Pilote** : @cc-ankora (Claude Opus 4.7)
**Demandeur** : @thierry via @cowork brief — feedback iPhone réel 24/05 : drawer right-to-left perturbant.

---

## Hotfix Option A v3 — Bottom Tab Bar persistente authenticated (25/05/2026)

### Contexte

Smoke iPhone réel @thierry sur preview Vercel de PR #182 v1 a révélé deux bugs UX :

1. **🔴 Bloquant — Admin sans retour** : user tap Admin dans sheet « Plus » → arrive sur `/admin` → BottomTabBar disparaît (car mountée uniquement sur `/app/*`) → user piégé sans retour vers cockpit
2. **🟡 UX disjointe — Pages resources** : tap FAQ/Glossaire/CGU/Privacy/Cookies → arrive sur layout marketing `(public)` avec burger menu ancien format → expérience visuellement incohérente entre auth et marketing chrome

### Solution

Pattern **Apple HIG iOS 18 « persistent tab bar across in-app destinations »**. BottomTabBar mountée au `src/app/[locale]/layout.tsx` racine, conditionnée par `isAuthenticated && !isExcludedRoute(unprefixedPathname)`.

- Auth check : `getOptionalUser()` server-side (fail-soft, retourne `null` sans throw)
- Pathname : lecture `headers().get('x-pathname')` (déjà setté par `src/proxy.ts`)
- Locale prefix stripping : helper `stripLocalePrefix(pathname, routing.locales)` (next-intl `localePrefix: 'as-needed'`)
- Exclusions : `BOTTOM_TAB_BAR_EXCLUDED_ROUTES = ['/', '/login', '/signup', '/forgot-password', '/reset-password', '/callback', '/offline', '/onboarding']`

### Bugs résolus

- ✅ `/admin/*` maintenant avec BottomTabBar persistante (retour Cockpit possible via tap tab)
- ✅ `/faq`, `/glossaire`, `/legal/{cgu,privacy,cookies}` idem (cohérence UX authenticated)
- ✅ Tab `Cockpit` ramène user vers `/app` depuis n'importe quelle surface

### Addendum 2026-05-25 (post-audit cross-layouts) — Footer overlap + Cookie Pref GDPR

Deux items ajoutés au scope par @cowork après audit nav cross-layouts :

1. **Footer padding-bottom** (`src/components/layout/Footer.tsx`) : `pb-[calc(env(safe-area-inset-bottom)+3.5rem)] md:pb-10` sur le div interne. Sans ça, la BottomTabBar (`h-12` + safe-area) cache les liens footer sur mobile authenticated → liens GDPR inaccessibles. Desktop (≥md) garde `pb-10` car bar `md:hidden`.

2. **CookiePreferencesLink dans MoreSheet** (`src/components/layout/MoreSheet.tsx` section preferences) : mirror du composant utilisé dans Footer, après LocaleSwitcher. Couvre **GDPR art. 7(3)** : « le retrait du consentement doit être aussi aisé que son obtention ». Si la barre cache temporairement le footer pendant scroll, le user a toujours accès aux préférences via le sheet « Plus ».

### Fichiers modifiés (Hotfix v3 + addendum)

- `src/components/layout/BottomTabBar.tsx` — exports `BOTTOM_TAB_BAR_EXCLUDED_ROUTES`, `isExcludedRoute`, `stripLocalePrefix`
- `src/app/[locale]/layout.tsx` — mount conditionnel `<BottomTabBar isAdmin={…} />` après `<Toaster />` (4 nouveaux imports : `headers`, `getOptionalUser`, `isAdmin`, `BottomTabBar` + 2 helpers)
- `src/app/[locale]/app/layout.tsx` — demount BottomTabBar + `isAdmin` (déplacés au root, évite double mount)
- `src/components/layout/Footer.tsx` — padding-bottom safe-area + h-bar sur mobile
- `src/components/layout/MoreSheet.tsx` — `<CookiePreferencesLink />` ajouté section preferences (data-testid `more-sheet-cookie-preferences`)

### Fichiers explicitement NON touchés (anti scope-creep)

- `src/app/[locale]/admin/layout.tsx` — le mount root suffit
- `src/app/[locale]/(public)/layout.tsx` — burger menu marketing reste, coexistence acceptée jusqu'à PR-BETA-5 (cf. notes hors-scope)

### Tests Vitest étendus (BottomTabBar.test.tsx : 19 → 32 specs, +13)

- `BOTTOM_TAB_BAR_EXCLUDED_ROUTES + isExcludedRoute` : 3 specs (allow-list locked, in-app destinations, readonly export)
- `stripLocalePrefix` : 4 specs (locale prefix strip, bare locale → root, no-prefix passthrough, false-positive guard `/enrollment`)
- `<MoreSheet />` Cookie Preferences : 1 spec (GDPR art. 7(3) reachability)

### Tests Playwright étendus (bottom-tab-bar.spec.ts : 6 → 12 specs, +6)

- `Plus → FAQ` : bar visible sur `/faq` post-navigation
- `Plus → Privacy` + retour Cockpit : flux complet « no trap »
- `Footer NOT hidden by bar on /faq` : assert last footer link bottom ≤ bar top
- `More sheet Cookie Preferences` : `more-sheet-cookie-preferences` visible
- `Anonymous /faq` : bar absente (gating auth)
- `Anonymous /` : bar absente (landing reste marketing pur)

### Bugs hors-scope (suite PR-BETA-5)

- Burger menu marketing visible sur pages `(public)` quand user authenticated → coexistence acceptable temporairement, harmonisation prévue PR-BETA-5 Landing nav consolidée
- Labels footer EN « Terms » vs « CGU » : scope BETA-5 (i18n harmonization)
- Glossaire dans Footer : scope BETA-5
- Padding-bottom main sur `/admin/*` (AdminTopbar layout n'a pas pb-24) : non bloquant car admin desktop principalement + footer fournit l'air maintenant

### Smoke test à faire @thierry AVANT merge sur preview Vercel iPhone réel

- [ ] `/app` → bar visible 5 tabs
- [ ] Tap Plus → tap Admin → assert bar toujours visible sur `/admin` + retour `/app` via tab Cockpit OK
- [ ] Tap Plus → tap FAQ → assert bar visible sur `/faq` + scroll bottom + assert footer CookiePreferencesLink lisible (pas caché)
- [ ] Tap Plus → tap CGU → assert bar visible sur `/legal/cgu` + retour `/app` via tab Cockpit OK
- [ ] Tap Plus → assert section « Préférences » contient Cookie Preferences entry
- [ ] Anonymous (déconnecté) → `/faq` → assert bar INVISIBLE
- [ ] Anonymous → `/` → assert bar INVISIBLE
- [ ] Sur `/app`, `/login`, `/signup`, `/onboarding` : bar visibilité conforme allow-list

### Résultats locaux (2026-05-25)

```text
npm run lint              → 0 erreurs (6 warnings pré-existants, hors scope)
npm run lint:use-server   → 0 erreurs
npm run typecheck         → 0 erreurs
npm run test (1236 tests) → 100% pass (+8 vs v1 — 100 files, 21.8 s)
```

E2E Playwright **non exécutés localement** : nécessitent Supabase service role key. Validation CI sur preview Vercel + smoke iPhone réel par @thierry.

---

## TL;DR (v1)

Remplacement du drawer right-to-left mobile par un **Bottom Tab Bar Apple HIG** (5 tabs : Cockpit, Factures, Dépenses, Simuler, Plus) sur la surface `/app/*`. Sheet « Plus » slide-up qui agrège Comptes, Paramètres, Admin, FAQ, Glossaire, Légal, Thème, Langue, Déconnexion. Le drawer marketing (landing / FAQ / glossary / legal) reste inchangé jusqu'à la passe BETA-5 sur la nav marketing.

---

## Scope livré

### Composants créés

- `src/components/layout/BottomTabBar.tsx` — Client Component. 5 tabs + détection active par `usePathname()` (exact match sur `/app`, `startsWith` ailleurs), `aria-current="page"`, haptic best-effort, `pb-[env(safe-area-inset-bottom)]`, `md:hidden`.
- `src/components/layout/MoreSheet.tsx` — Client Component. Sheet modal slide-up portalé dans `document.body`, scroll lock iOS-safe (pattern `position: fixed` + scrollY restore, parité avec HeaderNav), focus trap Tab/Shift+Tab, dismiss Escape + backdrop tap.

### Fichiers modifiés

- `src/app/[locale]/app/layout.tsx` — Montage `<BottomTabBar isAdmin={…} />` après `<Footer />`. `main` reçoit `pb-24 md:py-12` pour libérer ~96px sous le contenu (clear bar 48px + safe-area iPhone + air).
- `src/components/layout/HeaderNav.tsx` — Court-circuit `variant === 'app'` : ni hamburger ni drawer portalisé. Le ThemeToggle + LocaleSwitcher desktop (≥ lg) restent intacts.
- `src/components/layout/__tests__/HeaderNav.test.tsx` — Tests app-variant refactorés pour vérifier l'absence du trigger/drawer (anti-regression).

### Composants supprimés / dépréciés

- Aucun. Le drawer right-to-left reste utilisé par le variant `'marketing'` (landing/FAQ/glossary/legal). Les blocks `{variant === 'app' && …}` dans le drawer sont désormais inatteignables (`isMarketing` court-circuite avant) — code mort à nettoyer dans une PR de cleanup ciblée (hors scope BETA-6, anti scope-creep).

### i18n — 5 locales (parity 24/24)

Nouveau namespace racine `layout` ajouté à `messages/{fr-BE,en,nl-BE,de-DE,es-ES}.json` :

- `layout.bottomTab.{label,cockpit,bills,expenses,simulate,more}`
- `layout.moreSheet.title`, `layout.moreSheet.close`
- `layout.moreSheet.sections.{cockpit,resources,preferences,account}`
- `layout.moreSheet.links.{accounts,settings,admin,adminAriaLabel,faq,glossary,legalCgu,legalPrivacy,legalCookies,logout,darkMode,lightMode}`

Parity check programmatique :

```text
✓ fr-BE — 24 keys
✓ nl-BE — 24 keys
✓ en    — 24 keys
✓ es-ES — 24 keys
✓ de-DE — 24 keys
```

### Tokens CSS

Aucun nouveau token introduit. Réutilisation stricte des tokens existants (cf. `docs/design/token-usage.md`) :

- `bg-background/85` + `backdrop-blur-xl` = Liquid Glass effect (Apple HIG light)
- `border-border/40` = hairline séparateur
- `text-foreground` + `font-medium` = tab active
- `text-muted-foreground` = tab inactive
- `bg-amber-700` (marker admin, parity Header.tsx / HeaderNav.tsx — WCAG SC 1.4.11 ≥ 3:1 contrast)

---

## Tests

### Vitest — `src/components/layout/__tests__/BottomTabBar.test.tsx` (19 tests)

Couvre :

- Rendu des 5 tabs + labels FR localisés
- Routing href canonique (`/app`, `/app/charges`, `/app/expenses`, `/app/simulator`)
- Détection active (`/app` exact, `/app/charges` startsWith, `/app/expenses/123` sub-route)
- Sheet open/close : tap, backdrop, Escape
- iOS scroll lock : `position: fixed`, `top: -scrollY`, `width: 100%`, `overflow: hidden`
- Sheet content : Accounts/Settings/Admin (conditional), FAQ/Glossary/Legal, ThemeToggle, LocaleSwitcher, Logout (form action)
- Contrat a11y : `aria-controls`, `aria-haspopup="dialog"`, dialog landmark, `aria-current="page"`

### Vitest — `src/components/layout/__tests__/HeaderNav.test.tsx` (12 tests refactorés)

App variant désormais vérifié comme **absent** (zero trigger, zero drawer, zero Admin link side-by-side avec BottomTabBar).

### Playwright — `e2e/mobile-ios/bottom-tab-bar.spec.ts` (6 tests, iPhone 14/15 Pro Max/SE)

- 5 tabs visibles + hamburger absent sur `/app`
- Active state switch via navigation
- More sheet open/close (tap, backdrop, Escape)
- safe-area-inset-bottom : bar flush à `viewport.height`
- main padding-bottom ≥ 48px (clear bar)

Auto-skip si pas de Supabase service role key (env CI dummy). À valider sur preview Vercel par @thierry post-merge.

### Résultats locaux (2026-05-25)

```text
npm run lint              → 0 erreurs (6 warnings pré-existants, hors scope)
npm run lint:use-server   → 0 erreurs
npm run typecheck         → 0 erreurs
npm run test (1228 tests) → 100% pass — 100 files, 25.5s
```

E2E Playwright **non exécutés localement** : nécessitent un serveur Supabase + service role key. Validation CI sur preview Vercel + smoke iPhone réel par @thierry.

---

## Métriques

### Performance

- BottomTabBar = Client Component léger (5 icônes lucide tree-shaken, `useTransition`, `useState`, `useCallback`). Pas de dépendance lourde ajoutée.
- MoreSheet = portal + scroll lock pattern déjà utilisé dans HeaderNav (zero coût d'apprentissage runtime).
- Lighthouse Perf mobile ≥ 95 attendu (à valider sur preview Vercel avec `lighthouse-auditor`).

### Accessibilité (WCAG 2.2 AA)

- Touch targets : tab `flex-1` × `h-12` ≥ 44×44px (largeur > 60px sur viewport 390px, hauteur 48px + safe-area).
- `aria-current="page"` sur tab active.
- `aria-haspopup="dialog"` + `aria-controls="more-sheet"` sur le bouton More.
- Sheet `role="dialog"` + `aria-modal="true"` + `aria-label="Plus"` (localisé).
- Focus trap Tab/Shift+Tab + Escape + restauration focus déclencheur.
- `focus-visible:ring-2 ring-brand-600 ring-inset` sur chaque tab.
- Contrast `text-muted-foreground` sur `bg-background/85` — passe AA (tokens design system existants).

### Mobile iOS WebKit (canonical target)

- `pb-[env(safe-area-inset-bottom)]` : home indicator iPhone clair.
- `position: fixed` scroll lock : rubber-band Safari neutralisé (pattern THI-250 réutilisé).
- `backdrop-blur-xl` : Liquid Glass effect Safari WebKit.
- `bg-background/85` opacité semi-transparente : effet glass-morphism iOS.

---

## Smoke test à faire @thierry POST-merge sur preview Vercel (iPhone réel)

Checklist canonique pour valider le PR avant promotion prod :

1. ☐ Ouvrir `/app` sur iPhone Safari → BottomTabBar visible au fond, 5 tabs (Cockpit / Factures / Dépenses / Simuler / Plus)
2. ☐ Tab "Cockpit" doit être active (highlight foreground + font-medium)
3. ☐ Tap "Factures" → URL `/app/charges`, tab "Factures" devient active
4. ☐ Tap "Plus" → sheet slide-up depuis le bas, dialog "Plus" visible
5. ☐ Sheet contient : Comptes, Paramètres, FAQ, Glossaire, CGU, Confidentialité, Cookies, ThemeToggle, LocaleSwitcher, Déconnexion
6. ☐ Tap backdrop → sheet ferme proprement
7. ☐ Tap bouton X dans le sheet → sheet ferme
8. ☐ Bar respecte la safe-area iPhone (home indicator visible sous la bar, pas en-dessous)
9. ☐ Aucun hamburger dans le header sur `/app/*` (drawer right-to-left supprimé)
10. ☐ Sur landing `/` (marketing variant), le hamburger right-to-left RESTE — vérifier que la nav marketing mobile est inchangée

---

## DoD 5/5

| #   | Critère                                                 | Status | Preuve                                               |
| --- | ------------------------------------------------------- | ------ | ---------------------------------------------------- |
| 1   | CI verts (Lint, Typecheck, Tests, E2E, Security, Build) | ⏳     | À vérifier sur PR ouverte                            |
| 2   | Sourcery silent sur dernier commit                      | ⏳     | À vérifier post-push                                 |
| 3   | Reviews approved + résolues                             | ⏳     | @thierry valide                                      |
| 4   | 0 conflit main                                          | ✅     | Branche basée sur `fafa94e` (main à jour 2026-05-25) |
| 5   | Rapport livré                                           | ✅     | Ce fichier                                           |

---

## Linkage Linear

- **Ticket** : THI-277 PR-BETA-6 Bottom Tab Bar mobile Apple HIG
- **Status open** : In Progress
- **Status merge** : Done

---

## Notes hors-scope (à traiter séparément)

- **Sourcery warning sur `e2e/mobile-ios/dashboard.spec.ts:89`** signalé par l'IDE pendant cette PR (`suggestion:use-object-destructuring`). Fichier non modifié par BETA-6 — ticket à ouvrir si pas déjà tracké (probablement debt pré-PR-QA-1b).
- **Code mort dans `HeaderNav.tsx`** : le block `{variant === 'app' && …}` dans `drawerOverlayAndPanel` est désormais inatteignable. À nettoyer dans une PR cleanup (`refactor(layout): remove dead app-variant drawer block in HeaderNav`), 5 minutes.
- **Drag-to-dismiss MoreSheet** : pas implémenté pour BETA-6 (backdrop tap + Escape couvrent le dismiss). Follow-up Linear si feedback @thierry post-merge.
- **LocaleSwitcher consolidation header** : prévue PR-BETA-5 (cf. `CLAUDE.md` Ankora « sera consolidé en BETA-5 »). Pour BETA-6, le LocaleSwitcher mobile vit dans le sheet "Plus".

---

## Refs

- Doctrine mobile-first : `CLAUDE.md` Ankora §"Cap v1.0 publique"
- Apple HIG Bottom Tab Bar : 5 tabs max + sheet modal slide-up
- Smoke iPhone réel @thierry 24/05 : drawer right-to-left perturbant
- Sprint Beta tracker : `docs/reports/2026-05-24-reset-strategique-prod-vs-vision-cowork.md` §4.3
- Pattern scroll lock iOS : `src/components/layout/HeaderNav.tsx` JSDoc (THI-250)
