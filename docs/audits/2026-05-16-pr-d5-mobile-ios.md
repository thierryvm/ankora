# PR-D5 — Audit mobile-iOS + cohérence UI/UX

**Date** : 2026-05-16
**Branche** : `feat/pr-d5-mobile-ios`
**Deadline cible Beta** : 10 juin 2026 (J-25 à l'audit)
**Auditeurs** : `mobile-ios-auditor`, `ui-auditor`, `dashboard-ux-auditor` (lancés en parallèle Phase 1)

---

## Summary

### Surfaces auditées (10 surfaces + layouts globaux)

1. Landing (`src/app/[locale]/(public)/page.tsx`)
2. Dashboard index (`src/app/[locale]/app/page.tsx`)
3. Accounts (`src/app/[locale]/app/accounts/page.tsx`)
4. Charges (`src/app/[locale]/app/charges/page.tsx`)
5. Expenses (`src/app/[locale]/app/expenses/page.tsx`)
6. Settings (`src/app/[locale]/app/settings/page.tsx`)
7. Simulator (`src/app/[locale]/app/simulator/page.tsx`)
8. Login (`src/app/[locale]/(auth)/login/page.tsx`)
9. Signup (`src/app/[locale]/(auth)/signup/page.tsx`)
10. Onboarding (`src/app/[locale]/onboarding/page.tsx`)
11. Layouts globaux + Header + HeaderNav + MktNav + MktFooter

### Counts findings par sévérité

| Auditeur                  | P0          | P1      | P2      | Total   |
| ------------------------- | ----------- | ------- | ------- | ------- |
| mobile-ios-auditor        | 3 (+ 3 PWA) | 5       | 3       | 14      |
| ui-auditor                | 3           | 9       | 5       | 17      |
| dashboard-ux-auditor      | 4           | 7       | 5       | 16      |
| **TOTAL bruts**           | **13**      | **21**  | **13**  | **47**  |
| Après dédup cross-cutting | **~7**      | **~15** | **~10** | **~32** |

### Verdict global

- **mobile-iOS** : PASS_WITH_NOTES — 3 P0 cross-cutting (Input/SelectTrigger 14px, min-h-screen, PWA manifest)
- **a11y/WCAG** : PASS_WITH_NOTES — 3 P0 (hamburger non-standard, LoginForm aria-describedby, tokens hors-système)
- **dashboard cohérence** : **NO-GO Monarch Money level** — 6/8 sections cible v3 manquantes/PARTIAL, atomes DS livrés non consommés

### Top 5 findings les plus impactants Beta

1. **[P0 mobile + a11y] `Input.tsx text-sm` = 14px** → Safari iOS auto-zoom sur 8 surfaces (Login, Signup, Accounts, Charges, Expenses, Settings MFA, Simulator, Onboarding). Fix unique 1 ligne dans [`src/components/ui/input.tsx:29`](../../src/components/ui/input.tsx#L29). **Effort XS.**
2. **[P0 mobile] Login CTA absent du drawer marketing mobile** → "Se connecter" inaccessible en ≤ 2 taps depuis landing iPhone (test `test.fixme` depuis PR-QA-1b, jamais résolu). Fix dans [`src/components/layout/HeaderNav.tsx`](../../src/components/layout/HeaderNav.tsx). **Effort XS.**
3. **[P0 mobile] PWA manifest cassé** → `apple-touch-icon` pointe SVG (rejeté iOS), `manifest.webmanifest` absent (404), `apple-mobile-web-app-capable` non déclaré → Add-to-Home-Screen brisé. Fix metadata + créer manifest. **Effort S.**
4. **[P0 a11y] Hamburger HeaderNav non-standard** → `<label>` + `<input hidden>` au lieu d'un `<button aria-expanded aria-controls>`. AT (VoiceOver, NVDA) ne l'annoncent pas correctement. Fix dans [`HeaderNav.tsx:120-136`](../../src/components/layout/HeaderNav.tsx#L120). **Effort S.**
5. **[P0 dashboard] 6/8 sections cible v3 absentes** → Health gauge, Timeline 6m, Bills 7/14/30j, Goals, Drag-to-rebalance, Drawer simulateur, Activité groupée. Cible "Monarch Money level" non atteinte. **Hors scope PR-D5 (≥ 3 PRs futures).**

---

## Findings par surface

### Landing — `src/app/[locale]/(public)/page.tsx`

- **[P0 mobile] Login inaccessible en ≤ 2 taps mobile** ([`HeaderNav.tsx:177-193`](../../src/components/layout/HeaderNav.tsx#L177))
  - Drawer variant marketing liste "Fonctionnalités" + "FAQ" sans lien `/login`. Boutons "Se connecter" / "Créer un compte" cachés `hidden sm:inline-flex` (≥ 640px).
  - **Fix** : ajouter `<Link href="/login">{t('login')}</Link>` dans le bloc `variant === 'marketing'` du drawer.
  - **Effort** : XS (~5 lignes)
  - Tests : lèvera les `test.fixme` BUG-iOS-003 dans `auth-flow.spec.ts:103` et `landing.spec.ts:107`.

- **[P1 mobile] Hero CTAs : seul `/signup`, pas de chemin `/login`** ([`Hero.tsx:83-88`](../../src/components/marketing/landing/sections/Hero.tsx#L83))
  - Lien secondaire "Déjà inscrit ? Se connecter" sous les CTAs. **Effort XS.**

- **[P1 a11y] Hiérarchie titres : Feature section `<h3>` parmi des `<h2>`** ([`Feature.tsx:93-99`](../../src/components/marketing/landing/sections/Feature.tsx#L93))
  - `<h3 id="feature-heading">` apparaît entre des `<h2>`. WCAG 1.3.1.
  - **Fix** : `<h3>` → `<h2>`. **Effort XS.**

- **[P1 a11y] `nav[aria-label]` dans MktFooter utilise le copyright comme label** ([`MktFooter.tsx:44`](../../src/components/marketing/landing/sections/MktFooter.tsx#L44))
  - `aria-label={t('copyright')}` → AT annonce "Navigation : Ankora · éditeur ancré à Bruxelles · 2026".
  - **Fix** : nouvelle clé `navAriaLabel` = "Navigation légale". **Effort XS** + i18n.

- **[P2 mobile] Hero mockup grid : `md:grid-cols-3` sans fallback mobile** ([`Hero.tsx:135`](../../src/components/marketing/landing/sections/Hero.tsx#L135))
  - Sur iPhone, 3 KPI cards en colonne → mockup très long. `grid-cols-2 md:grid-cols-3` plus compact. **Effort XS.**

- **[P2 a11y] `text-muted` sur textes potentiellement informatifs (Hero KPI sub-textes)** — vérifier si décoratif ou non.

- **[P2 a11y] `text-muted` + `cursor-not-allowed` sur disabled links sans annonce sr-only "bientôt disponible"** ([`MktNav.tsx:60`](../../src/components/marketing/landing/sections/MktNav.tsx#L60), `MktFooter.tsx:50`).

---

### Dashboard index — `src/app/[locale]/app/page.tsx`

- **[P0 dashboard] 6/8 sections cible v3 absentes ou stub** (cross-cutting CC1)
  - Health gauge MISSING (`page.tsx:111-120` commenté), Timeline 6m MISSING, Bills 7/14/30j MISSING, Goals MISSING, Drag-to-rebalance MISSING (PARTIAL), Drawer simulator MISSING (route séparée), Activité groupée PARTIAL.
  - **Recommandation** : split en PR-D5 (3 sections P0 Beta : Health gauge + Bills + Drawer simulator) + PR-D6/D7 (Timeline + Goals + Drag).

- **[P0 dashboard] Aucun atome DS consommé** (cross-cutting CC2)
  - `grep "from '@/components/atoms'" src/app/[locale]/app/` → 0 match. 11 atomes livrés en PR-D4-PHASE2-A non utilisés.
  - **Décision requise @cowork** : (A) atomes = source canonique → migration ; (B) atomes restent playground.

- **[P0 a11y] Tokens hors-système dans Bloc 1+2 cards** ([`EffortFinancierCard.tsx:39,44,50`](../../src/components/dashboard/EffortFinancierCard.tsx), [`CapaciteEpargneCard.tsx:52-65`](../../src/components/dashboard/CapaciteEpargneCard.tsx))
  - `ring-blue-500/15`, `text-emerald-500`, `text-rose-500`, `dark:text-emerald-400`, `dark:text-rose-400`. Hacks de classe contournant le `[data-theme="dark"]` custom-variant.
  - **Fix** : utiliser `text-success` / `text-danger` (tokens existants `globals.css:103-106`). Créer tokens ring si besoin.
  - **Effort** : S

- **[P1 a11y] `section[aria-label]` duplique le `<h1>`** ([`page.tsx:84-86`](../../src/app/[locale]/app/page.tsx#L84))
  - AT annonce 2× même texte. **Fix** : `aria-labelledby` sur heading interne. **Effort XS.**

- **[P1 dashboard] CTA bottom row duplique nav header** ([`page.tsx:310-320`](../../src/app/[locale]/app/page.tsx#L310))
  - 3 boutons "Mes charges/Mes dépenses/Simuler" déjà dans Header.
  - **Fix** : remplacer par CTAs contextuels cockpit v3 (Goals/Rattrapage/Simuler what-if). **Effort XS.**

- **[P1 dashboard] Plan du mois : pattern `text-success/danger` dupliqué** ([`page.tsx:230-247`](../../src/app/[locale]/app/page.tsx#L230))
  - Extraire `<KpiCard accent value icon label/>`. **Effort S.**

- **[P2 a11y] Hover-only affordance lien daily_card** ([`page.tsx:134-138`](../../src/app/[locale]/app/page.tsx#L134))
  - `hover:text-brand-700 hover:underline` invisible sur iOS touch.
  - **Fix** : `underline` permanent. **Effort XS.**

- **[P2 a11y] Couleur seule positif/négatif** ([`page.tsx:229-243`](../../src/app/[locale]/app/page.tsx#L229))
  - WCAG 1.4.1. Ajouter icône TrendingUp/Down ou préfixe `+`/`−`. **Effort S.**

- **[P2 dashboard] Pas de `loading.tsx`** (cross-cutting CC3)
  - `src/app/[locale]/app/loading.tsx` absent. Blank screen pendant `getWorkspaceSnapshot()`.
  - **Fix** : skeleton aligné Bloc 1+2. **Effort S.**

---

### Accounts — `src/app/[locale]/app/accounts/AccountsClient.tsx`

- **[P0 mobile] Inputs `text-sm` = 14px → auto-zoom Safari** (cross-cutting CC-Mobile-1)
- **[P1 a11y] Erreurs balance via toast, pas `aria-describedby`** ([`AccountsClient.tsx:208-219`](../../src/app/[locale]/app/accounts/AccountsClient.tsx#L208))
  - WCAG 3.3.1. **Fix** : `<p id="balance-{kind}-error" role="alert">` + `aria-describedby`. **Effort M.**
- **[P1 dashboard] 3 sections sans hiérarchie typo commune** — ajouter `<h2>` "Paramètres" chapeau. **Effort XS.**
- **[P1 dashboard] Sauvegarde inline 3× duplicate** — extraire hook `useMoneyForm()`. **Effort S.**

---

### Charges — `src/app/[locale]/app/charges/ChargesClient.tsx`

- **[P0 mobile] Inputs + SelectTrigger 14px** (cross-cutting)
- **[P0 dashboard + i18n] Metadata title hardcodé FR** ([`charges/page.tsx:6`](../../src/app/[locale]/app/charges/page.tsx#L6))
  - `title: 'Mes charges'` → casse SEO/i18n en EN/NL/DE/ES.
  - **Fix** : `generateMetadata` async avec `getTranslations`. Pattern déjà appliqué dans `accounts/page.tsx:7-10` et `settings/page.tsx:13-16`. **Effort XS.**
- **[P1 mobile] Trash2 `size="icon"` = 40×40 px** ([`ChargesClient.tsx:185-191`](../../src/app/[locale]/app/charges/ChargesClient.tsx#L185))
  - Apple HIG 44×44.
  - **Fix** : redéfinir variant `icon` en `h-11 w-11` dans `button.tsx`. **Effort XS, impact global.**
- **[P1 dashboard] Pas de scroll-to-new + animation post-création** — `scrollIntoView` + `animate-in fade-in`. **Effort S.**
- **[P2 dashboard] Pas de tri/filtre/groupement par fréquence** — atome `Tabs` disponible. **Effort M.**

---

### Expenses — `src/app/[locale]/app/expenses/ExpensesClient.tsx`

- **[P0 mobile] Inputs + date input `text-sm` 14px**
- **[P0 dashboard] Metadata title hardcodé FR** ([`expenses/page.tsx:6`](../../src/app/[locale]/app/expenses/page.tsx#L6))
- **[P1 mobile] Trash2 40×40 px** (même fix que Charges)
- **[P1 dashboard] Date affichée ISO brute** ([`ExpensesClient.tsx:140`](../../src/app/[locale]/app/expenses/ExpensesClient.tsx#L140))
  - `{e.occurredOn}` → "2026-05-12". Incohérent avec `formatDate(occurredOn, locale, 'short')` dans dashboard.
  - **Fix** : appliquer `formatDate`. **Effort XS.**
- **[P1 dashboard] Pas de groupement par jour/semaine/mois** — entêtes sticky "aujourd'hui / hier / cette semaine". **Effort M.**

---

### Settings — `src/app/[locale]/app/settings/SettingsClient.tsx`

- **[P0 mobile] MFA input 14px + autres inputs 14px**
- **[P1 a11y] `CookiesPreferencesSection` : double labelling checkboxes** ([`CookiesPreferencesSection.tsx:121-150`](../../src/app/[locale]/app/settings/CookiesPreferencesSection.tsx#L121))
  - `aria-label` + `<label htmlFor>` simultanés → AT lit le `aria-label` ignorant le label visible.
  - **Fix** : supprimer `aria-label` redondants. **Effort XS.**
- **[P2 mobile] `<summary>` focus ring inconsistant sur WebKit** ([`SettingsClient.tsx:208-213`](../../src/app/[locale]/app/settings/SettingsClient.tsx#L208))
- **[P1 dashboard] `rounded-md` inline vs `rounded-xl` Card** — incohérence radii à documenter.
- **[P2 dashboard] 3 div consent rows quasi identiques** — extraire `<ConsentToggleRow>`. **Effort S.**

---

### Simulator — `src/app/[locale]/app/simulator/SimulatorClient.tsx`

- **[P0 mobile] Inputs + Selects 14px** (cross-cutting)
- **[P0 dashboard] Metadata title hardcodé FR** ([`simulator/page.tsx:6`](../../src/app/[locale]/app/simulator/page.tsx#L6))
- **[P1 dashboard] Vit en route séparée au lieu de Drawer** ([`SimulatorClient.tsx`](../../src/app/[locale]/app/simulator/SimulatorClient.tsx))
  - Cible v3 #7 = "Drawer what-if". `EditDrawer` atom existe.
  - **Fix** : wrap dans `EditDrawer`, CTA "Simuler une action" depuis dashboard. Garder route fallback. **Effort M.**
- **[P1 a11y] Boutons mode (cancel/negotiate/add) sans `aria-pressed`** ([`SimulatorClient.tsx:119-129`](../../src/app/[locale]/app/simulator/SimulatorClient.tsx#L119))
  - **Fix** : 1 attribut par bouton. **Effort XS.**
- **[P1 dashboard] Pas d'empty state si `charges = []`** — message + lien `/app/charges`. **Effort XS.**
- **[P2 dashboard] `text-xl` KPIs vs `text-2xl` dashboard** — utiliser `.num-lg` partout. **Effort XS.**
- **[P2 a11y] Couleur seule pour annualDelta positif/négatif** — préfixe `+`/`−`. **Effort XS.**
- **[P2 mobile] Grid 2 cols pour fréquence+mois — étroit iPhone SE** — non-bloquant.

---

### Login — `src/app/[locale]/(auth)/login/page.tsx` + `LoginForm.tsx`

- **[P0 mobile] Inputs email + password `text-sm` 14px**
- **[P0 a11y] Erreurs sans `aria-describedby`** ([`LoginForm.tsx:41-49`](<../../src/app/[locale]/(auth)/login/LoginForm.tsx#L41>) et `:55-62`)
  - `<p>` d'erreur sans `id`. `aria-invalid` présent mais sans `aria-describedby` → AT n'annonce pas l'erreur. **SignupForm le fait correctement** → incohérence.
  - **Fix** : ajouter `id="login-email-error"` + `aria-describedby` conditionnel. **Effort XS.**
- **[P1 mobile] Lien "Mot de passe oublié" hover-only** ([`login/page.tsx:48`](<../../src/app/[locale]/(auth)/login/page.tsx#L48>))
  - **Fix** : `underline underline-offset-2` permanent. **Effort XS.**
- **[P1 mobile] Lien "Pas encore inscrit ?" `hover:underline`** ([`login/page.tsx:53`](<../../src/app/[locale]/(auth)/login/page.tsx#L53>)) — même fix.

---

### Signup — `src/app/[locale]/(auth)/signup/SignupForm.tsx`

- **[P0 mobile] Inputs 14px**
- **[P1 mobile] Checkboxes `h-4 w-4` = 16×16 px touch target catastrophique** ([`SignupForm.tsx:98-103,113-118`](<../../src/app/[locale]/(auth)/signup/SignupForm.tsx#L98>))
  - CGU + Privacy (légaux critiques). 2.75× sous Apple HIG.
  - **Fix** : wrapper label `min-h-11 min-w-11 flex items-center gap-2 py-2`. **Effort S.**
- **[P1 a11y] `passwordConfirmError` sans `id`/`aria-describedby`** ([`SignupForm.tsx:90-94`](<../../src/app/[locale]/(auth)/signup/SignupForm.tsx#L90>)) — incohérent avec `emailError` qui le fait. **Effort XS.**
- **[P1 a11y] Checkboxes CGU/Privacy : erreurs `acceptTosError`/`acceptPrivacyError` non liées** — ajouter `id` + `aria-invalid` + `aria-describedby`. **Effort S.**

---

### Onboarding — `src/app/[locale]/onboarding/OnboardingWizard.tsx`

- **[P0 mobile] `min-h-screen` sur page wrapper** ([`onboarding/page.tsx:23`](../../src/app/[locale]/onboarding/page.tsx#L23))
  - 100vh WebKit → layout jump au collapse URL bar.
  - **Fix** : `min-h-screen` → `min-h-dvh`. **Effort XS.**
- **[P0 mobile] `autoFocus` sur inputs steps 1 et 2** ([`OnboardingWizard.tsx:126,142`](../../src/app/[locale]/onboarding/OnboardingWizard.tsx#L126))
  - Avec `text-sm` 14px → zoom auto à l'ouverture page avant même tap user.
  - **Fix** : retirer `autoFocus` OU fix Input.tsx (complémentaire).
- **[P0 a11y] Indicateur progression purement visuel** ([`OnboardingWizard.tsx:98-105`](../../src/app/[locale]/onboarding/OnboardingWizard.tsx#L98))
  - 3 barres `aria-hidden`, aucun "Étape 2 sur 3" sr-only.
  - **Fix** : `<span className="sr-only">{t('stepOf', {step, total: 3})}</span>`. **Effort XS** + i18n.
- **[P1 a11y] Erreurs steps non liées via `aria-describedby`** ([`OnboardingWizard.tsx:56-68`](../../src/app/[locale]/onboarding/OnboardingWizard.tsx#L56))
  - **Fix** : conditionnels `aria-invalid` + `aria-describedby` selon step. **Effort S.**
- **[P2 a11y] Checkbox "passer cette étape" sans `id`** ([`OnboardingWizard.tsx:215-223`](../../src/app/[locale]/onboarding/OnboardingWizard.tsx#L215)).

---

### Layouts globaux

- **[P0 mobile] `ScrollToTop bottom-4` sans safe-area** ([`ScrollToTop.tsx:34`](../../src/components/layout/ScrollToTop.tsx#L34))
  - Sur iPhone post-X, collision home indicator (~34px).
  - **Fix** : `bottom-[max(1rem,env(safe-area-inset-bottom))]`. **Effort XS.**
- **[P0 a11y] Hamburger HeaderNav pattern non-standard** ([`HeaderNav.tsx:120-136`](../../src/components/layout/HeaderNav.tsx#L120))
  - `<label>` + `<input hidden>` avec `aria-expanded` sur input caché. AT cassé.
  - **Fix** : `<button aria-expanded={isOpen} aria-controls="mobile-nav">`. **Effort S.**
- **[P1 mobile] Header sticky sans `safe-area-inset-top`** ([`Header.tsx:23`](../../src/components/layout/Header.tsx#L23), [`MktNav.tsx:44`](../../src/components/marketing/landing/sections/MktNav.tsx#L44))
  - PWA standalone iPhone notch chevauche.
  - **Fix** : `[padding-top:env(safe-area-inset-top)]`. **Effort XS par header.**
- **[P1 a11y] Skip-link AuthLayout** — vérifier que `#main` du parent cible bien `<main id="main">` AuthLayout. **Effort XS verif.**
- **[P2 mobile] `(auth)/layout.tsx min-h-screen`** ([`(auth)/layout.tsx:6`](<../../src/app/[locale]/(auth)/layout.tsx#L6>)) — fix `min-h-dvh`.
- **[P2 mobile] error.tsx + global-error.tsx `min-h-screen`** — non-critique.
- **[P2 a11y] Skip-link `focus:bg-primary` token non-déclaré** ([`layout.tsx:162`](../../src/app/[locale]/layout.tsx#L162)) — utiliser `focus:bg-brand-700`. **Effort XS.**

---

### PWA iOS (cross-cutting layout)

- **[P0 mobile] `apple-mobile-web-app-capable` absent** — Add-to-Home-Screen ouvre Safari au lieu de standalone.
  - **Fix** : `appleWebApp: { capable: true, statusBarStyle: 'black-translucent' }` dans `generateMetadata` de [`src/app/[locale]/layout.tsx`](../../src/app/[locale]/layout.tsx). **Effort XS.**
- **[P0 mobile] `apple-touch-icon` SVG invalide** ([`layout.tsx:90`](../../src/app/[locale]/layout.tsx#L90))
  - iOS n'accepte que PNG. Le PNG existe (`public/icons/apple-touch-icon.png`) mais pas référencé.
  - **Fix** : `apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }]`. **Effort XS.**
- **[P0 mobile] `manifest.webmanifest` absent** — 404. `layout.tsx:92` déclare le lien mais fichier inexistant.
  - **Fix** : créer `public/manifest.webmanifest` avec `display: "standalone"`, `start_url`, `theme_color`, `background_color`, `icons` (192 et 512 existent). **Effort S.**

---

## Cross-cutting findings

### CC-Mobile-1 [P0] `Input.tsx text-sm` = 14px → auto-zoom Safari (8 surfaces)

[`src/components/ui/input.tsx:29`](../../src/components/ui/input.tsx#L29)

Fix unique 1 ligne : `text-sm` → `text-base`. Affecte Login, Signup, Accounts, Charges, Expenses, Settings, Simulator, Onboarding.

### CC-Mobile-2 [P0] `SelectTrigger text-sm` = 14px (5 surfaces)

[`src/components/ui/select.tsx:20`](../../src/components/ui/select.tsx#L20)

Fix unique 1 ligne.

### CC-Mobile-3 [P0] `min-h-screen` sans fallback `dvh` (4 occurrences)

- [`(auth)/layout.tsx:6`](<../../src/app/[locale]/(auth)/layout.tsx#L6>)
- [`onboarding/page.tsx:23`](../../src/app/[locale]/onboarding/page.tsx#L23)
- [`error.tsx:34`](../../src/app/[locale]/error.tsx#L34)
- [`global-error.tsx:55`](../../src/app/global-error.tsx#L55)

Fix : `min-h-screen` → `min-h-dvh`.

### CC-Mobile-4 [P0] PWA stack cassé

3 fixes complémentaires : metadata `appleWebApp` + path apple-touch-icon PNG + créer `manifest.webmanifest`.

### CC-Mobile-5 [P1] Hover-only affordances liens critiques (3 occurrences)

Login forgot-password, Login signup-link, Dashboard daily_card link. Sur iOS touch, états `hover:` invisibles → liens semblent désactivés.

### CC-Mobile-6 [P1] Touch targets < 44 px

- Button atom `size="icon"` = 40×40 px → utilisé Charges + Expenses Trash2.
- Signup checkboxes 16×16 px (CGU/Privacy).

### CC-A11y-1 [P0] Tokens hors-système (`blue-500`, `dark:*`)

`EffortFinancierCard.tsx`, `CapaciteEpargneCard.tsx`, `AccountCard.tsx`. Hacks `dark:` contournent `[data-theme="dark"]` custom-variant Tailwind 4.

### CC-A11y-2 [P0] Hamburger non-standard

`HeaderNav.tsx:120-136` — `<label>` + `<input hidden>` au lieu de `<button>`.

### CC-A11y-3 [P0] LoginForm aria-describedby incohérent

LoginForm `aria-invalid` sans `aria-describedby` ; SignupForm le fait. Pattern à harmoniser.

### CC-Dashboard-1 [P0] 6/8 sections cible v3 manquantes — HORS SCOPE PR-D5

Health gauge, Timeline 6m, Bills 7/14/30j, Goals, Drag-to-rebalance, Activité groupée. Split PR-D5 / PR-D6 / PR-D7.

### CC-Dashboard-2 [P0] Atomes DS non consommés — DÉCISION @cowork REQUISE

`grep "from '@/components/atoms'" src/app/[locale]/app/` → 0. 11 atomes orphelins.

### CC-Dashboard-3 [P0] 3 metadata FR hardcodés

`charges/page.tsx:6`, `expenses/page.tsx:6`, `simulator/page.tsx:6`. Casse SEO/i18n.

### CC-Dashboard-4 [P1] Pas de `loading.tsx`/`error.tsx` `/app`

Aucun skeleton ni recovery contextuel pour `/app/**`.

### CC-Dashboard-5 [P1] Couleurs raw Tailwind (`blue/emerald/rose/purple-500`) dans cards

Cross-section avec CC-A11y-1.

---

## Tests Playwright mobile existants — coverage gaps

### Tests `test.fixme` à lever après fix

| Test                                                            | BUG-ID      | Fix qui lève                        |
| --------------------------------------------------------------- | ----------- | ----------------------------------- |
| `e2e/mobile-ios/auth-flow.spec.ts:20` (signup font-size)        | BUG-iOS-001 | CC-Mobile-1 (`Input.tsx text-base`) |
| `e2e/mobile-ios/auth-flow.spec.ts:43` (login font-size)         | BUG-iOS-002 | CC-Mobile-1                         |
| `e2e/mobile-ios/auth-flow.spec.ts:100` (login 2 taps)           | BUG-iOS-003 | Drawer marketing fix                |
| `e2e/mobile-ios/landing.spec.ts:107` (login CTA)                | BUG-iOS-003 | Drawer marketing fix                |
| `e2e/mobile-ios/pwa-install.spec.ts:44` (apple-touch-icon)      | BUG-iOS-007 | CC-Mobile-4                         |
| `e2e/mobile-ios/pwa-install.spec.ts:93` (apple-web-app-capable) | BUG-iOS-008 | CC-Mobile-4                         |

### Nouveaux tests recommandés

**`e2e/mobile-ios/forms.spec.ts`** (nouveau fichier) :

- `select trigger: font-size ≥ 16px on /app/charges` (CC-Mobile-2)
- `checkboxes signup: tap area ≥ 44px via boundingBox label parent`
- `scroll-to-top: bottom respects safe-area-inset-bottom`

**`e2e/admin-security-headers.spec.ts`** déjà mergé (PR-SEC-ADMIN) — référence pour le pattern test.

---

## Recommandation @cc-ankora pour @cowork (triage Phase 2)

### Scope MINIMAL PR-D5 mobile-iOS (≤ 50 lignes diff, garanti ≤ 400)

Fixes mécaniques cross-cutting, zéro refonte composant :

| #   | Fix                                                          | Fichier                                                                                | Lignes |
| --- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ------ |
| 1   | `text-sm` → `text-base` Input                                | `src/components/ui/input.tsx:29`                                                       | 1      |
| 2   | `text-sm` → `text-base` SelectTrigger                        | `src/components/ui/select.tsx:20`                                                      | 1      |
| 3   | `min-h-screen` → `min-h-dvh` (4 fichiers)                    | `(auth)/layout.tsx:6`, `onboarding/page.tsx:23`, `error.tsx:34`, `global-error.tsx:55` | 4      |
| 4   | `ScrollToTop bottom-4` → safe-area                           | `ScrollToTop.tsx:34`                                                                   | 1      |
| 5   | Header sticky safe-area-top (2 headers)                      | `Header.tsx:23`, `MktNav.tsx:44`                                                       | 2      |
| 6   | Drawer marketing : lien "Se connecter"                       | `HeaderNav.tsx`                                                                        | ~5     |
| 7   | `apple-touch-icon` SVG → PNG                                 | `layout.tsx:90`                                                                        | 1      |
| 8   | Ajouter `appleWebApp` meta                                   | `layout.tsx`                                                                           | ~3     |
| 9   | Créer `manifest.webmanifest`                                 | nouveau `public/manifest.webmanifest`                                                  | ~20    |
| 10  | `size="icon"` 40→44 px                                       | `button.tsx` icon variant                                                              | 1      |
| 11  | `autoFocus` retrait onboarding (si bug persiste après fix 1) | `OnboardingWizard.tsx:126,142`                                                         | 2      |

**Total estimé : ~40 lignes prod + 20 lignes manifest** ≈ 60 lignes total. Très en-deçà des 400.

### Scope ÉTENDU PR-D5 mobile+a11y (≤ 200 lignes diff)

Ajout des P0 a11y simples :

| #   | Fix                                                     | Fichier                                                                 | Lignes        |
| --- | ------------------------------------------------------- | ----------------------------------------------------------------------- | ------------- |
| 12  | Hamburger `<button aria-expanded>`                      | `HeaderNav.tsx:120-136`                                                 | ~30           |
| 13  | LoginForm `aria-describedby` + `id` errors              | `LoginForm.tsx:41-62`                                                   | ~6            |
| 14  | Onboarding step counter sr-only                         | `OnboardingWizard.tsx:98-105`                                           | ~3 + i18n key |
| 15  | Hover-only affordances → underline permanent            | `login/page.tsx:48,53` + dashboard                                      | ~3            |
| 16  | 3 metadata FR → `generateMetadata` async                | `charges/page.tsx:6`, `expenses/page.tsx:6`, `simulator/page.tsx:6`     | ~15           |
| 17  | Tokens `blue-500/dark:*` → `text-success`/`text-danger` | `EffortFinancierCard.tsx`, `CapaciteEpargneCard.tsx`, `AccountCard.tsx` | ~20           |
| 18  | i18n key `MktFooter` nav aria-label                     | `MktFooter.tsx:44` + 5 messages                                         | ~10           |
| 19  | `aria-pressed` boutons mode Simulator                   | `SimulatorClient.tsx:119-129`                                           | ~3            |
| 20  | Cookies `aria-label` redondants retrait                 | `CookiesPreferencesSection.tsx`                                         | ~4            |
| 21  | Feature `<h3>` → `<h2>`                                 | `Feature.tsx:93-99`                                                     | 1             |

**Total : ~95 lignes prod + ~15 lignes i18n.** Reste dans la cible 400.

### HORS SCOPE PR-D5 → tickets Linear

**Sections dashboard v3 (P0 dashboard-ux mais nécessitent ≥ 1 PR chacune)** :

- Health score provisions jauge → ticket "PR-D6 Health gauge"
- Timeline 6 mois prédictive → ticket "PR-D6 Timeline"
- Bills 7/14/30j → ticket "PR-D6 Bills bucket"
- Goals épargne ETA → ticket "PR-D7 Goals"
- Drag-to-rebalance enveloppes → ticket "PR-D7 Drag"
- Simulator en Drawer (Drawer atom wrap) → ticket "PR-D6 Drawer simulator" (peut entrer PR-D5 si scope étendu validé)
- Activité récente groupée → ticket "PR-D5b ou D6"

**Décision atomes DS** : ticket bloquant Linear "Décision : atomes/_ vs ui/_ canonical".

**P2 polish** : ~10 tickets à créer si @cowork valide en bulk.

### Tests Playwright

- Lever les 6 `test.fixme` après fix.
- Créer `e2e/mobile-ios/forms.spec.ts` avec 3 tests.

---

## Notes hors-scope

- `npm run security:audit` script orphelin (`scripts/security-audit.ts` n'existe pas) — à nettoyer dans une PR hygiène future.
- Warnings YAML extension VS Code sur `.github/workflows/ci.yml` (`secrets.E2E_*` Hint) — pattern valide, à silence éventuellement.
- Aucune violation FSMA détectée dans les messages — bonne hygiène cross-locale.

---

## Status : Phase 1 audit complète — STOP en attente triage @cowork

---

## Phase 5 — Linear tracking (2026-05-17)

Projet Linear **Ankora** créé : <https://linear.app/thierryvm/project/ankora-7dd28cb2e3a1>
(team Thierryvm, lead Thierry, priority High, target 2026-06-30).

### Table de correspondance — 17 tickets

| #   | ID Linear                                             | Catégorie     | Priorité | Titre                                                                                  |
| --- | ----------------------------------------------------- | ------------- | -------- | -------------------------------------------------------------------------------------- |
| 1   | [THI-189](https://linear.app/thierryvm/issue/THI-189) | Architectural | Medium   | Canonical decision: atoms/\* vs ui/\* — migration plan + ADR                           |
| 2   | [THI-190](https://linear.app/thierryvm/issue/THI-190) | PR-D6/D7      | Medium   | Health score provisions gauge (dashboard cockpit v3 #2) — **Beta essentielle**         |
| 3   | [THI-191](https://linear.app/thierryvm/issue/THI-191) | PR-D6/D7      | Low      | Timeline cashflow 6 mois prédictive (dashboard cockpit v3 #3) — V1.0                   |
| 4   | [THI-192](https://linear.app/thierryvm/issue/THI-192) | PR-D6/D7      | Medium   | Prochaines factures J-7/14/30 (dashboard cockpit v3 #5) — **Beta essentielle**         |
| 5   | [THI-193](https://linear.app/thierryvm/issue/THI-193) | PR-D6/D7      | Low      | Goals épargne avec ETA (dashboard cockpit v3 #6) — V1.0                                |
| 6   | [THI-194](https://linear.app/thierryvm/issue/THI-194) | PR-D6/D7      | Low      | Enveloppes drag-to-rebalance (dashboard cockpit v3 #4) — V1.0                          |
| 7   | [THI-195](https://linear.app/thierryvm/issue/THI-195) | PR-D6/D7      | Medium   | Simulateur what-if drawer integration (dashboard cockpit v3 #7) — **Beta essentielle** |
| 8   | [THI-196](https://linear.app/thierryvm/issue/THI-196) | P2 polish     | Low      | Hero KPI mockup grid: fallback responsive grid-cols-2 mobile                           |
| 9   | [THI-197](https://linear.app/thierryvm/issue/THI-197) | P2 polish     | Low      | Landing hero overflow horizontal pré-existant (BUG-iOS-HERO-OVERFLOW)                  |
| 10  | [THI-198](https://linear.app/thierryvm/issue/THI-198) | P2 polish     | Low      | PWA decode WebKit emulator workaround (BUG-iOS-007-emulator)                           |
| 11  | [THI-199](https://linear.app/thierryvm/issue/THI-199) | P2 polish     | Low      | Dashboard /app: ajouter loading.tsx skeleton aligné Bloc 1+2                           |
| 12  | [THI-200](https://linear.app/thierryvm/issue/THI-200) | P2 polish     | Low      | Charges: tri/filtre/groupement par fréquence (atome Tabs)                              |
| 13  | [THI-201](https://linear.app/thierryvm/issue/THI-201) | P2 polish     | Low      | Expenses: groupement par jour/semaine/mois + dates formatées via formatDate            |
| 14  | [THI-202](https://linear.app/thierryvm/issue/THI-202) | P2 polish     | Low      | Dashboard cards: couleur seule positif/négatif (WCAG 1.4.1) → préfixe +/− ou icône     |
| 15  | [THI-203](https://linear.app/thierryvm/issue/THI-203) | P2 polish     | Low      | Settings: extraire ConsentToggleRow + harmoniser rounded-md vs rounded-xl              |
| 16  | [THI-204](https://linear.app/thierryvm/issue/THI-204) | P2 polish     | Low      | AccountCard: tokeniser purple-500 raw → token sémantique                               |
| 17  | [THI-205](https://linear.app/thierryvm/issue/THI-205) | P2 polish     | Low      | Simulator: text-xl KPIs → .num-lg cohérence dashboard                                  |

### Récap

- **1** architectural (ADR atoms vs ui)
- **6** PR-D6/D7 candidates dont **3 Beta essentielles** (Health gauge, Bills, Drawer Simulator)
- **10** P2 polish (issues mineures + 2 BUG-IDs liés aux fixmes Playwright)

Tous les labels disponibles dans Linear ont été utilisés (Tech Debt, Feature, Mobile, UX, Accessibility, Bug, Improvement). Labels `adr` et `frontend` mentionnés par @cowork dans le prompt n'existent pas dans le workspace Linear — substitut `Tech Debt + Improvement + UX` pour le ticket architectural (note explicite "ADR à produire" dans la description).
