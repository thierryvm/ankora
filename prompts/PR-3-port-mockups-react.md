# PR-3 — Port des mockups HTML vers React production

> **Contexte projet obligatoire** — avant d'exécuter cette PR, **lire** `docs/ROADMAP.md` (ordre des PR, contrainte budget 0 €, BYOK IA Phase 2, arbitrage Sentry vs capteur maison de PR-B1). Toute décision prise ici doit rester cohérente avec le ROADMAP.
>
> **Position dans la séquence** : PR-1 ✅ → PR-Q ✅ → PR-1bis ✅ → PR-2 ✅ → **PR-B1 doit être mergée AVANT cette PR** (capteur d'erreurs prêt pour la QA de PR-3) → **PR-3 (ici)** → PR-F → PR-B2.
>
> **Budget** : aucune librairie payante ni service monitoring tiers ajouté. Si le capteur de bugs de PR-B1 n'est pas encore en place, signaler dans le rapport final mais ne PAS ajouter Sentry / LogRocket / équivalents sans validation explicite de Thierry (voir arbitrage dans `docs/ROADMAP.md` §PR-B1).
>
> **Prérequis** : PR-1 + PR-1bis + PR-2 + PR-B1 mergées. Le socle i18n 5 locales tourne, toutes les strings sont traduites, les routes `[locale]/**` fonctionnent avec leurs messages namespacés, le capteur de bugs est opérationnel.
> **Objectif** : remplacer l'UI actuelle de la landing et du dashboard `/app` par le design validé dans les mockups HTML, en respectant au pixel près le visuel existant et en utilisant **shadcn/ui + Tailwind v4 + design tokens**.

---

## 0 · Sources de vérité visuelle (NE PAS RÉINVENTER)

Les 3 fichiers HTML sont la **source de vérité** — Claude Code doit s'y référer pour chaque composant, couleur, spacing, animation :

| Fichier          | Rôle                                   | Chemin                                               |
| ---------------- | -------------------------------------- | ---------------------------------------------------- |
| Landing publique | `/` `/faq` + sections marketing        | `F:\PROJECTS\Apps\ankora\design-mockup-landing.html` |
| Dashboard privé  | `/app` + sous-pages                    | `F:\PROJECTS\Apps\ankora\design-mockup-app.html`     |
| OpenGraph cards  | Images sociales (déjà traité par PR-Q) | `F:\PROJECTS\Apps\ankora\design-mockup-og.html`      |

**Règle absolue** : ne pas improviser un nouveau design. Si un détail manque dans les mockups, poser la question dans le rapport final, ne pas inventer. Les couleurs, spacing, animations, textes sont tous dans les mockups.

---

## 1 · Stack technique verrouillée (aucun écart toléré)

### 1.1 Déjà en place (ne pas toucher)

- Next.js 16.2+ (App Router, Turbopack)
- React 19.2+
- TypeScript strict (`"strict": true`, zéro `any`)
- Supabase SSR + Auth + RLS
- next-intl v4 (socle PR-1, contrats PR-1bis)
- `src/proxy.ts` middleware
- Vitest + Playwright
- GitHub Actions CI

### 1.2 À installer dans cette PR

**Tailwind v4** (déjà probablement en place — à vérifier `package.json`) :

```bash
npm install tailwindcss@next @tailwindcss/postcss@next
```

Si Tailwind v3 est encore installé, migrer vers v4 :

- Retirer `tailwind.config.ts`, tout passe dans CSS via `@theme`.
- Adapter `postcss.config.js` pour `@tailwindcss/postcss`.
- Importer `@import "tailwindcss"` dans `src/app/globals.css`.

**shadcn/ui** via CLI (canary Tailwind v4) :

```bash
npx shadcn@latest init --base-color neutral --css-variables true
```

Puis installer **uniquement** les primitives de la liste §3.3 (ne PAS installer tous les composants).

**Autres dépendances** :

```bash
npm install react-hook-form@7 @hookform/resolvers zod sonner lucide-react
```

Note : `sonner` pour les toasts (shadcn recommande sonner sur son toast legacy). `lucide-react` déjà utilisé partiellement — s'assurer version 0.400+.

### 1.3 Interdits explicites dans cette PR

- ❌ Tailwind v3
- ❌ CSS modules ou styled-components (tout passe par Tailwind)
- ❌ Material UI, Chakra, Ant Design, Mantine
- ❌ Radix primitives importées directement sans passer par shadcn
- ❌ Framer Motion ou GSAP pour les animations (CSS transitions suffisent pour MVP ; `motion/react` autorisé UNIQUEMENT si un composant du mockup en nécessite)
- ❌ Recharts, Victory, Nivo pour le donut (le mockup utilise un SVG pur `stroke-dasharray/stroke-dashoffset` → on recopie cette logique)
- ❌ Refactoriser le socle i18n ou les actions serveur (scope PR-1/1bis/2)

---

## 2 · Design tokens — extraction des mockups vers `@theme`

Les mockups définissent les tokens en CSS custom properties. Ils doivent être portés dans `src/app/globals.css` sous une directive `@theme` **unique**.

### 2.1 Extraire depuis `design-mockup-app.html` (lignes `:root { ... }`)

```css
/* src/app/globals.css */
@import 'tailwindcss';

@theme {
  /* === Brand palette === */
  --color-brand-50: #e6f4f6;
  --color-brand-100: #c2e3e9;
  --color-brand-300: #5fb6c8;
  --color-brand-400: #2d96ad;
  --color-brand-500: #1a7d95;
  --color-brand-600: #156779;
  --color-brand-700: #12556a;
  --color-brand-900: #0b3c49;

  /* === Accent === */
  --color-accent: #f59e0b;
  --color-accent-hover: #d97706;

  /* === Semantic === */
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-danger: #ef4444;

  /* === Surfaces (light) === */
  --color-background: #fafbfc;
  --color-foreground: #0f172a;
  --color-muted: #64748b;
  --color-muted-foreground: #475569;
  --color-card: #ffffff;
  --color-card-foreground: #0f172a;
  --color-border: #e2e8f0;
  --color-input: #e2e8f0;

  /* === Typo === */
  --font-sans: 'Inter', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;

  /* === Radii === */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-xl: 20px;

  /* === Shadows === */
  --shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.04);
  --shadow-md: 0 4px 12px rgba(15, 23, 42, 0.08);
  --shadow-lg: 0 12px 32px rgba(15, 23, 42, 0.12);
  --shadow-brand: 0 12px 28px rgba(26, 125, 149, 0.25);

  /* === Transitions === */
  --transition-fast: 150ms ease;
  --transition-base: 200ms ease;
  --transition-slow: 300ms ease;
}

/* Dark theme — via data-theme="dark" OU prefers-color-scheme */
:root[data-theme='dark'],
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    --color-background: #0a1523;
    --color-foreground: #f8fafc;
    --color-muted: #94a3b8;
    --color-muted-foreground: #cbd5e1;
    --color-card: #0f1e30;
    --color-card-foreground: #f8fafc;
    --color-border: rgba(203, 213, 225, 0.14);
    --color-input: rgba(203, 213, 225, 0.08);
  }
}
```

**IMPORTANT** : relis `design-mockup-app.html` section `:root` et `design-mockup-landing.html` même section pour récupérer TOUTES les valeurs exactes. Mes valeurs ci-dessus sont indicatives — la source de vérité reste le mockup.

### 2.2 Ajuster `components.json` de shadcn

Configuration attendue :

```json
{
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks",
    "utils": "@/lib/utils"
  },
  "iconLibrary": "lucide"
}
```

### 2.3 Dark mode switcher

Le mockup utilise `data-theme="light|dark"` sur `<html>`. Conserver ce pattern :

- Composant `src/components/layout/ThemeToggle.tsx` (client).
- Persister le choix dans `localStorage.theme` + cookie serveur pour SSR sans flash.
- Lire la préférence dans le layout racine via `cookies()` pour mettre `data-theme` avant le first paint.

---

## 3 · shadcn/ui primitives à installer (whitelist stricte)

```bash
npx shadcn@latest add button
npx shadcn@latest add input
npx shadcn@latest add label
npx shadcn@latest add textarea
npx shadcn@latest add select
npx shadcn@latest add checkbox
npx shadcn@latest add switch
npx shadcn@latest add radio-group
npx shadcn@latest add form          # Wrapper react-hook-form
npx shadcn@latest add dialog
npx shadcn@latest add sheet         # Drawer mobile
npx shadcn@latest add dropdown-menu
npx shadcn@latest add tabs
npx shadcn@latest add tooltip
npx shadcn@latest add skeleton
npx shadcn@latest add separator
npx shadcn@latest add badge
npx shadcn@latest add card
npx shadcn@latest add avatar
npx shadcn@latest add sonner        # Toasts
```

**Après installation**, adapter chaque primitive pour qu'elle consomme les tokens Ankora définis en §2.1 (pas les tokens par défaut de shadcn). Ex: `Button` variant `default` doit avoir `bg-brand-500 hover:bg-brand-600`.

**Ne PAS installer** : `command`, `popover` (custom si besoin), `navigation-menu`, `context-menu`, `breadcrumb`, `accordion`, `calendar`, `carousel`, `chart`, `data-table`, `date-picker`, `drawer` (doublon avec sheet), `hover-card`, `menubar`, `scroll-area` (CSS natif OK), `slider`, `toggle-group`. Si un besoin apparaît, le signaler dans le rapport final.

---

## 4 · Composants métier custom (au-dessus des primitives)

Créer dans `src/components/` selon l'arborescence :

```
src/components/
├── landing/
│   ├── Hero.tsx                     # Section hero landing
│   ├── FeatureGrid.tsx              # Grille des 6 features
│   ├── ChargeCalculator.tsx         # Calculateur interactif
│   ├── Testimonials.tsx             # Bloc témoignages
│   ├── PricingCta.tsx               # CTA pricing
│   └── FaqSection.tsx               # FAQ collapse
├── dashboard/
│   ├── Cockpit.tsx                  # Hero "Conseil du mois"
│   ├── DonutGauge.tsx               # Gauge SVG "72% du mois"
│   ├── KpiCard.tsx                  # Carte KPI générique
│   ├── KpiGrid.tsx                  # Grille 4 KPIs
│   ├── TransferPlan.tsx             # Plan du mois (3 virements)
│   ├── TransferRow.tsx              # Ligne virement avec flèche
│   └── HealthBadge.tsx              # Badge Sain/À surveiller/Critique
├── charges/
│   ├── ChargesList.tsx              # Liste des charges
│   ├── ChargeRow.tsx                # Ligne charge avec provision
│   └── AddChargeForm.tsx            # Formulaire création
├── accounts/
│   ├── AccountCard.tsx              # Carte compte (Principal/Vie/Épargne)
│   └── AccountsForm.tsx             # Formulaire soldes
├── expenses/
│   ├── ExpensesList.tsx
│   └── AddExpenseForm.tsx
├── settings/
│   ├── ProfileSection.tsx
│   ├── MfaSection.tsx
│   ├── DataExportSection.tsx
│   └── DangerZone.tsx
├── simulator/
│   └── Simulator.tsx                # What-if scenarios
├── layout/
│   ├── Header.tsx                   # Déjà existant, à refondre
│   ├── Footer.tsx                   # Déjà existant, à refondre
│   ├── MobileDrawer.tsx             # Drawer mobile (Sheet shadcn)
│   ├── ThemeToggle.tsx              # Déjà PR-1
│   ├── LocaleSwitcher.tsx           # Déjà PR-1
│   ├── ScrollToTop.tsx              # Déjà PR-1
│   └── AppSidebar.tsx               # Navigation dashboard
└── ui/                              # shadcn primitives (auto-générées)
    ├── button.tsx
    ├── input.tsx
    └── …
```

### 4.1 DonutGauge — logique à recopier du mockup

Le mockup utilise un SVG pur, pas une lib. Recopier cette logique :

```tsx
// C = 2·π·r avec r=42 → ≈ 263.89
// offset = C * (1 - percent / 100)
const radius = 42;
const circumference = 2 * Math.PI * radius;
const offset = circumference * (1 - percent / 100);
```

Le composant reçoit `percent: number`, `label?: string`, `size?: number` et gère reduced-motion via `useReducedMotion()` (ou `prefers-reduced-motion` CSS direct pour éviter l'import lib).

### 4.2 ChargeCalculator — math figée

Reprendre **intégralement** la logique JS du mockup landing (section `<script>` en bas). Modèle annuel total, formatters split int/dec, phrase dynamique selon `monthsBetween`. Ne pas réécrire la math — la valider par test unitaire d'abord, ensuite copier.

---

## 5 · Mapping mockup → routes React

| Mockup section                              | Route React               | Fichier                         |
| ------------------------------------------- | ------------------------- | ------------------------------- |
| Landing hero + features + calculateur + CTA | `/[locale]`               | `src/app/[locale]/page.tsx`     |
| FAQ                                         | `/[locale]/faq`           | `src/app/[locale]/faq/page.tsx` |
| Dashboard hero + KPIs + plan                | `/[locale]/app`           | `src/app/[locale]/app/page.tsx` |
| Mes charges                                 | `/[locale]/app/charges`   | idem (Client refactor)          |
| Mes comptes                                 | `/[locale]/app/accounts`  | idem                            |
| Mes dépenses                                | `/[locale]/app/expenses`  | idem                            |
| Simulateur                                  | `/[locale]/app/simulator` | idem                            |
| Paramètres                                  | `/[locale]/app/settings`  | idem                            |

**Règle** : les composants client existants créés en PR-1bis (ChargesClient, AccountsClient, etc.) sont **remplacés** par de nouveaux composants utilisant la nouvelle arborescence §4. Les actions serveur, les schemas Zod, le contrat `{ ok, errorCode }` restent inchangés.

---

## 6 · Data réelle Supabase (pas de mock)

Les mockups affichent des données d'exemple en dur. En prod, brancher sur Supabase via les queries existantes dans `src/lib/data/` :

- `getWorkspace(userId)` → monthly_income, nom
- `getChargesByWorkspace(workspaceId)` → liste charges + provisions calculées
- `getAccountsByWorkspace(workspaceId)` → 3 comptes avec soldes
- `getExpensesByWorkspace(workspaceId, month)` → dépenses du mois
- `getProvisionHealth(workspaceId)` → % du mois, statut

Si certaines queries n'existent pas encore, les créer dans `src/lib/data/` en respectant le pattern existant (RLS implicite via le client Supabase SSR, Zod sur les retours).

**Performance** : Server Components pour tout le rendu initial, Client Components uniquement pour l'interactivité (forms, drawer, theme toggle, calculateur). Les Server Actions restent le canal de mutation.

---

## 7 · Accessibilité — WCAG 2.1 AA obligatoire

Les mockups ont déjà été audités (tâche #23 complétée). Respecter les invariants :

- Contraste ≥ 4.5:1 pour tout texte (utiliser les tokens de §2.1, ils sont déjà conformes).
- Focus visible sur tous les éléments interactifs (`focus-visible:ring-2 ring-brand-500`).
- `aria-label` sur toutes les icônes-boutons (ex: close drawer, theme toggle).
- `prefers-reduced-motion: reduce` respecté sur toutes les animations (donut, scroll, calculateur).
- Navigation clavier complète (Tab, Shift+Tab, Enter, Escape pour dialogs).
- Hiérarchie de titres cohérente (un seul `h1` par page, `h2` pour sections).

Un test Playwright `tests/e2e/a11y.spec.ts` utilise `@axe-core/playwright` pour auditer la landing et le dashboard. Ajouter des rules custom si un composant shadcn génère un faux positif (rare).

---

## 8 · Tests obligatoires

### 8.1 Unit (Vitest)

- `tests/components/donut-gauge.test.tsx` — percent → stroke-dashoffset correct
- `tests/components/charge-calculator.test.tsx` — math annual total, 4 fréquences, edge cases (0, négatif, float)
- `tests/components/kpi-card.test.tsx` — rendu avec/sans tendance, états loading/error
- `tests/lib/theme.test.ts` — cookie + localStorage + hydration sans flash

### 8.2 E2E (Playwright)

- `tests/e2e/landing-visual.spec.ts` — visual regression avec `toHaveScreenshot()` sur hero + calculateur
- `tests/e2e/dashboard-visual.spec.ts` — idem sur /app
- `tests/e2e/calculator-interaction.spec.ts` — change montant + fréquence, vérifie la phrase dynamique
- `tests/e2e/dark-mode.spec.ts` — toggle thème, vérifie `data-theme`, pas de FOUC
- `tests/e2e/mobile-drawer.spec.ts` — viewport 360×640, ouvre drawer, ferme, navigation fonctionne
- `tests/e2e/a11y.spec.ts` — axe-core sur landing + /app

Les snapshots visuels sont commit sur une baseline. Toute modification volontaire = commit `chore(visual): update baseline …`.

---

## 9 · Contraintes de sécurité (inchangées)

- RLS Supabase intacte sur toutes les tables.
- Zéro PII dans les composants (pas de logs console.log, pas de localStorage de données sensibles).
- `<Link>` toujours depuis `@/i18n/navigation` (PR-1) — aucun import `next/link`.
- Les Server Actions PR-1bis continuent de retourner `errorCode` (contrat stable).
- Rate limiting multi-couches inchangé.
- CSP nonce inchangé (`src/proxy.ts`).
- Aucun script externe ajouté (pas de Google Analytics, Sentry, etc. — c'est hors scope).

---

## 10 · Quality gates bloquants

```
npm run typecheck    # 0 erreur
npm run lint         # 0 erreur
npm run test         # tous les tests passent
npm run test:e2e     # Playwright vert sur les 3 locales de référence (fr-BE, nl-BE, en)
npm run build        # build OK, bundle size landing < 200KB gzipped
```

Lighthouse cible (test manuel en fin de PR, rapporté) :

- Performance landing ≥ 95
- Accessibility landing ≥ 100
- Best Practices ≥ 95
- SEO landing ≥ 100

---

## 11 · Commits suggérés

1. `chore(tailwind): migrate to Tailwind v4 with @theme tokens`
2. `chore(shadcn): init shadcn/ui with Ankora tokens`
3. `feat(ui): add shadcn primitives (button, input, form, …)`
4. `feat(theme): add dark mode toggle with cookie persistence`
5. `feat(landing): port hero + features from mockup`
6. `feat(landing): port charge calculator with annual model math`
7. `feat(landing): port FAQ + pricing sections`
8. `feat(dashboard): port cockpit + KPI grid`
9. `feat(dashboard): port transfer plan + health badge`
10. `feat(charges): refactor list with new design tokens`
11. `feat(accounts): refactor form with shadcn primitives`
12. `feat(settings): port MFA + data export + danger zone`
13. `test(visual): add baseline screenshots for landing + dashboard`
14. `test(a11y): add axe-core audit tests`

Chaque commit **doit passer** les quality gates avant merge.

---

## 12 · Rapport final attendu

```
PR-3 — Port mockups HTML vers React production terminé

Quality gates
┌───────────────────────┬──────────────────────────────────────────┐
│         Gate          │                Résultat                  │
├───────────────────────┼──────────────────────────────────────────┤
│ npm run typecheck     │ …                                        │
│ npm run lint          │ …                                        │
│ npm run test          │ …                                        │
│ npm run test:e2e      │ …                                        │
│ npm run build         │ …                                        │
│ Lighthouse landing    │ Perf X · A11y X · BP X · SEO X           │
│ Bundle landing        │ X KB gzipped (cible < 200)               │
└───────────────────────┴──────────────────────────────────────────┘

Composants créés
- Landing : Hero, FeatureGrid, ChargeCalculator, Testimonials, PricingCta, FaqSection
- Dashboard : Cockpit, DonutGauge, KpiCard, KpiGrid, TransferPlan, HealthBadge
- Charges : ChargesList, ChargeRow, AddChargeForm
- Accounts, Expenses, Settings, Simulator : X composants
- Layout : MobileDrawer, ThemeToggle (refactor), AppSidebar

shadcn primitives installées (20)
button, input, label, textarea, select, checkbox, switch, radio-group, form, dialog, sheet, dropdown-menu, tabs, tooltip, skeleton, separator, badge, card, avatar, sonner

Tests ajoutés
- Unit : X tests
- E2E : X tests (incl. visual regression baseline)
- A11y : X violations = 0 sur landing + /app

Décisions ajustées
[ce que Claude Code a tranché en cours de route]

Snapshots visuels
Baseline commit sur : tests/e2e/__screenshots__/
```

---

## 13 · Ce qui SORT du scope PR-3

- ❌ Nouvelles features produit (tout ce qui n'est pas dans les mockups)
- ❌ Refactor du socle i18n, du middleware, des migrations, des Server Actions
- ❌ Traduction de nouvelles strings (scope PR-2)
- ❌ Ajout d'analytics, monitoring, Sentry
- ❌ Optimisations avancées (ISR dynamique, streaming, Suspense avancé) — on reste sur le pattern Server Component standard
- ❌ Écriture d'un Storybook (nice-to-have V1.1)

Si tu identifies un bug dans PR-1/1bis/2 pendant le port, signale-le dans le rapport final, **ne le fixe pas dans cette PR**. Tu ouvres une task à part.

---

**Autonomie** : trancher tous les choix d'implémentation intermédiaires. Les mockups sont la référence. Tailwind v4 + shadcn/ui + design tokens + contrats PR-1bis sont les rails. Tu as toutes les cartes en main.
