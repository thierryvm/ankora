# Brief Claude Design — Ankora v1.0

Document à **coller intégralement** (ou par section selon la surface) dans la session Claude Design (claude.ai/design) lors de la création du projet "Ankora".

Langue du brief : **anglais** (Claude Design comprend les deux mais l'anglais donne de meilleurs résultats sur la recherche design).

---

## 0. Non-negotiable exclusions — READ FIRST

**À coller en TÊTE de toute session Claude Design Ankora, avant le prompt d'initialisation.** Ces exclusions sont le résultat de contraintes business/réglementaires non négociables (FSMA Belgique, scope v1.0 verrouillé, budget 0 €). Toute variante générée qui viole ces exclusions sera rejetée à l'extraction côté CC Ankora et doit être évitée à la source.

> **Source canonique réglementaire** : [ADR-001 No-PSD2](../adr/ADR-001-no-psd2.md) verrouille la décision FSMA.

```
HARD EXCLUSIONS — DO NOT EXPLORE, DO NOT GENERATE VARIANTS, DO NOT ARCHIVE IN scraps/

1. NO PSD2 / OPEN BANKING / IBAN IMPORT / BANK AGGREGATION
   Ankora is forbidden by Belgian FSMA regulation from acting as a PSD2 aggregator.
   The product is 100% manual data entry. Do NOT generate:
     - Any "Connect your bank" UI
     - Any "Import IBAN / sync transactions" flow
     - Any onboarding step that mentions bank connection, even as a "coming soon" tease
     - Any psd2-version.* archive in scraps/
   If a flow seems to need bank data, the answer is always: ask the user to enter it manually.

2. NO INVESTMENT ADVICE COPY (FSMA)
   Ankora is an education + organization tool, NOT a financial advisor.
   Forbidden formulations (FR + EN):
     - "Vous devriez placer / investir"
     - "Nous recommandons"
     - "Get rich quick", "Investment tips", "Financial advice"
     - Any nudge that suggests buying/selling assets
   Allowed: budgeting nudges, savings goals, provision health.

3. NO PAID DEPENDENCIES IN PHASE 1
   Phase 1 product is free forever for early adopters (grandfathered).
   Forbidden in any UI kit / component / variant:
     - Pricing tiers beyond "Free Phase 1" (no $/€ pricing tiers visible in v1.0 surfaces)
     - Premium-locked features ("Pro only" badges, paywalls)
     - Trial timers, upgrade modals
   Public landing /pricing may mention a future paid tier as a roadmap note only.

4. NO STOCK FINTECH CLICHÉS
   - No "phone-on-a-dashboard" hero illustrations
   - No emoji icons (Lucide stroke 1.5 only)
   - No dollar signs ($) — Ankora is European, € only
   - No bento grid of equal cards without hierarchy
   - No glassmorphism single-layer (Liquid Glass multi-layer only)
   - No linear easing on transitions (spring physics default)

5. LOCALE SCOPE v1.0 = FR + EN ONLY
   Do NOT generate NL / DE / ES variants in user-facing surfaces. They ship post-launch.
   Public /roadmap page may announce them as upcoming.

If a generated variant violates any of the above, archive it locally (your discretion) but do NOT include it in the export ZIP. CC Ankora's extraction filter excludes paths matching *psd2*, *open-banking*, *iban-import* automatically.
```

---

## 1. Project initialization prompt (à coller à la création du projet)

```
Project name: Ankora
Type: Web application + PWA (mobile-first)
Audience: Belgian + European individuals (FR + EN), aged 25-55, tech-literate but not financially expert

Goal: A personal cashflow cockpit that helps people master their month-to-month money through a predictive envelope model. NOT a bank, NOT an investment advisor, NOT a PSD2 aggregator. Pure education + organization.

Stack: Next.js 16, React 19, Tailwind CSS v4, PWA, Supabase backend.
Typography: Inter (UI) + Fraunces (editorial hero).
Color base: deep navy (#0b1120) + teal accent (#2dd4bf) + amber signature (#fbbf24) on dark-first UI.

Style direction: Apple-inspired "Liquid Glass" 2026 — multi-layer blur, edge highlights, spring physics micro-interactions, haptic feedback on mobile PWA. Premium but approachable. The kind of app users open daily not because they have to, but because they want to.

IMPORTANT — you have full creative freedom on the VISUAL layer. Do not feel bound by the existing mockups in the linked repo — they are functional specs, not visual constraints. Propose your own vision. What matters:
  - Coherence across all surfaces (user dashboard, admin dashboard, onboarding, landing)
  - Clear user journeys preserved (the flows defined in the functional specs MUST be respected)
  - Mobile-first with seamless desktop equivalence
  - WCAG 2.1 AA accessibility minimum

Links to context I'll provide:
  - Design system seed: `shared-tokens.css` (current production CSS variables)
  - Functional specs: 4 HTML mockups in `ankora-mockups/` (01-landing, 02-dashboard, 03-admin, 04-onboarding)
  - GitHub repository: github.com/thierryvm/ankora (link sub-paths `src/components/ui/` + `src/app/globals.css` only — not the full monorepo)

Competitors to BEAT (not copy):
  - Monarch Money (reference dashboard envelopes, iOS native)
  - Copilot Money (reference animations + hero narrative)
  - Mercury (reference premium fintech desktop)
  - YNAB / Goodbudget (envelope model but outdated UI)
  - Revolut, Qonto, Lunar (European fintech base)

Key differentiators to make visually obvious:
  1. Cashflow waterfall — salary flows into envelopes, then out to expenses (hero metaphor)
  2. Réserve libre vs Provisions affectées — distinction that no competitor makes
  3. Health score for provisions (gauge + nudges)
  4. Predictive 6-month timeline (not historic bar charts)
  5. What-if simulator inline in dashboard (not a separate tool)
  6. 7/14/30-day upcoming bills alert

Non-negotiable constraints:
  - No formulations suggesting investment advice (FSMA constraint)
  - All copy in French by default, English toggle available
  - Zero paid dependency in Phase 1
  - GDPR-compliant (EU hosting, cookie consent, export/delete flows visible)
```

---

## 2. Design System seed prompt (à coller APRÈS le prompt d'initialisation)

```
Below is the current Ankora design system extracted from production.
Use it as a BASELINE — you may propose evolutions (accent color signature, typography refinements, component primitives) but preserve:
  - The dark-first identity
  - The navy/teal/amber color grammar
  - The serif-for-numbers typography pairing principle

Tokens (CSS variables from `src/app/globals.css`):

--color-background: #0b1120          /* app background */
--color-card: #111a2e                /* card surface */
--color-subtle: #0f172a              /* subtle zones */
--color-border: #1e293b              /* default border */
--color-border-strong: #334155       /* strong border */
--color-text: #e2e8f0                /* primary text */
--color-text-muted: #94a3b8          /* secondary text */
--color-brand-text: #2dd4bf          /* teal accent (CTA, success) */
--color-brand-strong: #5eead4        /* teal hover/active */
--color-accent-text: #fbbf24         /* amber signature (highlights, provisions) */
--color-danger: #ef4444              /* errors, danger zone */
--color-warning: #f59e0b             /* warnings */

Typography:
  --font-sans: "Inter Variable", system-ui
  --font-display: "Fraunces Variable", serif  /* editorial hero only */
  --font-mono: "JetBrains Mono", monospace   /* numbers (tabular) */

Spacing: 4px baseline, preferred scale [4, 8, 12, 16, 20, 24, 32, 48, 64]
Radius: [6, 12, 16, 20, 24, 28, 32]  /* 24+ for premium cards */

Please generate a full UI kit from these tokens (buttons, cards, inputs, nav, modals, toasts, badges) and propose a coherent accent color choice between:
  (a) keep amber #fbbf24 as signature (current)
  (b) electric violet (e.g. #a855f7) for tech-forward differentiation
  (c) coral magenta (e.g. #f472b6) for disruptive brand

I'll validate before we design the surfaces.
```

---

## 3. Surface-specific prompts

**Ordre d'exécution verrouillé (2026-04-24 par @thierry)** :

0. **Design System — ÉTAPE FONDATRICE obligatoire** (section 2 + prompt §3.0 ci-dessous). À faire EN PREMIER, toujours. Claude Design construit l'UI kit complet (buttons, cards, inputs, nav, modals, toasts, badges, typography scale, spacing system), on valide, on publish — et TOUTES les surfaces suivantes héritent automatiquement.
1. **Landing** (`01-landing.html`) — PRIORITÉ 1 des surfaces, la surface qui fait ou défait le produit
2. **User Dashboard v3** (`02-dashboard.html`) — le cœur produit
3. **Onboarding** (`04-onboarding.html`) — le premier pas décisif
4. **Admin Dashboard** (`03-admin.html`) — interne, dernière priorité

Chaque surface est une session Claude Design distincte (ou un sub-project au sein du projet Ankora), avec son propre prompt ci-dessous. **Ne jamais prompter une surface si l'étape 0 Design System n'est pas publiée.**

### 3.0 Design System setup (ÉTAPE FONDATRICE)

```
Before any surface, I need you to build Ankora's UI kit from the tokens in section 2 above. This is a one-time foundation that all future surfaces will inherit.

Deliverables expected from this step:

1. Full color system
   - Document the CSS variable tokens I provided (navy/teal/amber on dark-first)
   - Generate semantic aliases (brand, accent, danger, warning, success, neutral)
   - Propose 3 accent color signature options for my validation (amber current / electric violet / coral magenta) — don't pick for me, show me all 3 side by side

2. Typography scale
   - Inter Variable UI scale (11 / 12 / 13 / 14 / 16 / 18 / 20 / 24 / 32 / 40 / 56)
   - Fraunces display scale (for hero/editorial only — 40 / 56 / 72 / 96)
   - JetBrains Mono tabular-nums for all numbers (amounts, percentages, dates)
   - Show weight ramp (400, 500, 600, 700) with real Ankora-style content

3. Spacing + radius system
   - 4px baseline grid [4, 8, 12, 16, 20, 24, 32, 48, 64]
   - Radius scale [6, 12, 16, 20, 24, 28, 32] — cards 24+ (premium feel)

4. Component primitives (all states: default, hover, active, disabled, loading, error, focus)
   - Buttons: primary, secondary, ghost, danger, icon-only (sm/md/lg)
   - Inputs: text, number (with € suffix), select, combobox, date, amount slider
   - Cards: base, interactive (hover), elevated, glass (Liquid Glass multi-layer)
   - Navigation: top-level, sidebar item, tab (pill + underline), breadcrumb
   - Feedback: toast (4 severities), inline alert, modal, drawer, sheet (mobile bottom)
   - Data display: badge (semantic: Paid / Scheduled / Action / Received / Manual), chip, tag, stat card, progress bar, gauge, sparkline
   - Misc: tooltip, popover, dropdown menu, command palette ⌘K, skeleton loaders

5. Liquid Glass layer
   - Multi-layer backdrop-filter blur + saturate + tint
   - Edge highlight (inset box-shadow top)
   - Fallback for prefers-reduced-transparency (opaque surface)
   - Mobile performance variant (lighter blur)
   Implement as reusable class / component, used on: floating tab bar (mobile), FAB, command palette, tooltips, modal backdrop.

6. Motion system
   - Spring physics defaults (stiffness 200-400, damping 25-35)
   - Easing curves: ease-out-cubic for enters, ease-in-cubic for exits, spring for interactive
   - Duration scale: 120ms (micro) / 200ms (default) / 320ms (structural)
   - Magnetic hover primitive for CTAs
   - Gradient follow for interactive cards
   - Number ticker transition

7. Iconography
   - Lucide icon set (stroke 1.5px default, 2px for emphasis)
   - Sizes: 14 / 16 / 18 / 20 / 24
   - Semantic mapping for finance (wallet, envelope, chart, timeline, shield, zap, gauge)
   - NO emoji, NO emoji-like icons

8. Accessibility baseline
   - All interactive components WCAG 2.1 AA contrast
   - Focus states visible on all surfaces (2px outline, offset 2px)
   - Keyboard navigation documented for each component
   - Screen reader labels defined

Once the UI kit is published, I'll validate via "Publish to organization" and we'll move to Surface #1 (Landing).

Deliver this step as a single comprehensive canvas with all sections above organized vertically. Keep it as a living reference — I want to come back and point at specific components during surface design.
```

---

### 3.1 Landing page (ankora.be) — PRIORITÉ 1

```
Surface: Public landing page — SEO critical, conversion-oriented. THIS IS THE MAKE-OR-BREAK SURFACE. If users don't get the "wow" in the first 5 seconds, they never come back.

Structure (top-to-bottom):
  1. Hero — strong headline + subheadline + CTA + hero visual (cashflow waterfall animation, loops smoothly)
  2. Differentiators strip — 5 bullets with icons: predictive envelopes / Réserve libre / Health score / GDPR EU / 0€
  3. "How it works" — 3 steps illustrated (onboard → track → predict)
  4. Social proof — user testimonials (placeholder for now, structure only)
  5. Pricing — free forever Phase 1, transparent roadmap to paid pro plan (post-v1)
  6. FAQ — 6-8 common questions, accessible expandable
  7. Footer — legal, privacy, social, language switcher

Tone: confident, not pushy. Trust > hype. Every claim backed by a mini-proof.
Typography: Fraunces for the hero headline (editorial, warm), Inter everywhere else.
Colors: dark-first (--color-background #0b1120), with hero using an amber-to-teal gradient accent.
Animations: hero visual animates on scroll, sections fade-in on enter viewport (no aggressive parallax).

What "wow" means concretely for this landing:
  - Hero visual = LIVE animated cashflow waterfall (not a static image or hero screenshot). Show money flowing from a salary deposit into envelopes, then draining into expenses — this is OUR metaphor, no one else does it on their landing.
  - Strong serif headline (Fraunces) with a micro-animation on first paint (letter reveal or subtle kinetic typography).
  - First-scroll "aha moment" = the Réserve libre vs Provisions affectées differentiator, with a VISUAL demonstration, not a bullet point.
  - Every CTA has magnetic hover (Apple.com-style) + spring physics click.

Differentiators to make VISUALLY obvious (not just list):
  1. "Pas d'agrégation bancaire, pas de PSD2, 100% en saisie manuelle" — a small icon animation showing a bank API being crossed out, replaced by an envelope filling up
  2. "Réserve libre séparée des Provisions affectées" — two stacked panels, one locked (calendar icon) + one free (fluid wave animation)
  3. "Simulateur what-if intégré au dashboard" — a mini inline simulator demo right in the landing (not a screenshot, an actual live mini-widget)
  4. "Health score en temps réel" — an animated gauge that fills based on scroll progress
  5. "GDPR Belgique stricte, 0 € la Phase 1" — trust badges with Belgian flag + EU hosting icon

SEO metadata to include:
  - Title: "Ankora — Maîtrisez votre cashflow en Belgique"
  - Description: "Cockpit d'enveloppes prédictif pour particuliers. Sans agrégation bancaire, sans conseil, 0 € la Phase 1."
  - Schema.org: SoftwareApplication + Organization + FAQPage + DefinedTerm (for glossary terms)

Forbidden: "Get rich quick", "Investment tips", "Financial advice" — FSMA constraint.
Forbidden: generic fintech hero illustrations (dashboard-on-a-phone), stock photos, emoji icons.
Forbidden: horizontal-scroll sections, auto-playing videos, pop-ups.

Comparables to outshine (not copy):
  - Mercury.com landing (density + premium vibe reference)
  - Linear.app landing (animation + typography reference)
  - Copilot Money landing (fintech storytelling reference)
  - Qonto.com landing (European fintech pro reference)

Language: French by default, English toggle in header. Generate FR version first, EN will follow.
```

### 3.2 User Dashboard v3 — "Cockpit Financier" — PRIORITÉ 2

> **Vision canonique réécrite 2026-05-03** suite au mockup AI Studio "IronBudget" partagé par @thierry. Ce mockup formalise la VRAIE vision Ankora — bien plus aboutie que la version 8-sections précédente. **Source de vérité unique** : `specs/dashboard-cockpit-vraie-vision-2026-05-03.md` dans le vault Athenaeum (700 lignes structurées).
>
> **ADRs verrouillés à lire avant la session** : ADR-002 (bucket-model), ADR-008 (account naming), ADR-009 (Capacité d'Épargne Réelle), ADR-010 (live decrement Quotidien), ADR-011 (plan rattrapage 3 mois), ADR-012 (Assistant Virements).

```
Surface: User Dashboard "Mon Cockpit Financier" — THE product core, 2-3 weekly opens per active user. The cockpit is where Ankora's 5 unique differentiators live. It must feel SOLID (financial gravitas) and ACTIVE (live updates without page reload).

The hero promise: "Garde le contrôle absolu sur ton budget, mois par mois."

────────────────────────────────────────────────────────────────────────
WHAT THIS DASHBOARD IS NOT
────────────────────────────────────────────────────────────────────────
- It is NOT a transaction feed (no "recent activity" list of bank movements — Ankora has no PSD2)
- It is NOT a budget app where users tag expenses (the user enters their charges + their daily expenses, the algo does the rest)
- It is NOT 8 equal-weight sections — it has a hierarchy: 3 typed accounts on top, 2 hero KPI radar cards, then a 2/3 charges list + 1/3 sidebar with 4 stacked cards
- It is NOT a clone of Monarch / YNAB — it has 5 unique calculations no competitor does

────────────────────────────────────────────────────────────────────────
LAYOUT — 4 BLOCS CLEARLY HIERARCHIZED
────────────────────────────────────────────────────────────────────────
Mobile-first vertical scroll. Desktop = 2-column from Bloc 3 onward.

Bloc 0 — HEADER (sticky)
  - Title "Mon Cockpit Financier" + tagline
  - Bell notifications (badge count = active alerts)
  - Month selector "< Mai 2026 >" (left/right chevrons + calendar icon, persistent in URL ?month=YYYY-MM)
    Allows browsing past months (closed/historical) AND future months (predictive)

Bloc 1 — 3 ACCOUNT CARDS (3 colonnes desktop / 1 colonne mobile)
  Each card = 1 account TYPE with a fixed semantic role + a USER-RENAMABLE display name:
  - "Compte Principal" (income_bills, blue Wallet icon) — input revenue editable, sub-label "Salaires & Factures"
  - "Compte Épargne" (provisions, emerald PiggyBank) — input savings balance editable, sub-label "Provisions Annuelles"
  - "Carte Quotidien" (daily_card, purple CreditCard) — input monthly daily-spending plafond editable, sub-label "Courses, Essence, Loisirs"

  CRITICAL: the card title is RENAMABLE inline (click → input → save). Thierry calls his "Belfius", "Compte Épargne Belfius", "Revolut Quotidien". The account_TYPE is fixed (semantic), but the display_name is free-text. Show a subtle pencil hint on hover.

Bloc 2 — 2 HERO RADAR CARDS (2 colonnes equal width)
  Card 2.1 — "Effort Financier Lissé"
    - Big number (4xl bold, white) of the total monthly smoothed effort
    - Sub-breakdown at bottom: "Charges fixes: X €" + "Provisions: +Y €"
    - ShieldCheck blue icon top-right
    - This is the "tax of being alive" — what your monthly money MUST cover before any room

  Card 2.2 — "Capacité d'Épargne Réelle" (THE HERO KPI — Ankora signature)
    - Big number (4xl bold) — emerald if ≥ 0, rose if < 0, with explicit + sign if positive
    - Below: contextual message
      - if ≥ 0: "C'est ton vrai reste à vivre chaque mois, sans surprise."
      - if < 0: "Attention, ton train de vie global dépasse tes revenus."
    - CheckCircle2 emerald or AlertCircle rose icon top-right
    - Glow decorative blob in the bottom-right corner (opacity 0.2, blur-3xl, color matching state)

    THIS IS THE NUMBER USERS COME BACK TO SEE EVERY DAY. Make it iconic. No competitor displays this calculation. The promise "without surprise" must be felt visually — solid, stable, gravitas.

Bloc 3 — 2/3 + 1/3 SPLIT (desktop) / vertical stack (mobile)

  Bloc 3-LEFT (2/3 width desktop) — "À PAYER EN {MOIS}"
    Header:
      - Title with TrendingDown icon
      - Sort toggle: "Trier par date" / "Ordre personnalisé" (drag & drop active when custom)
      - Buttons: "Catégories" (manage modal) + "+ Ajouter une charge" (add modal)

    Body — sub-sections by source account (CRITICAL UX clarity):

    Section 3-LEFT.A — "Depuis le Compte Principal (display_name)" — blue header
      List of monthly fixed charges due this month
      Sum displayed top-right

    Section 3-LEFT.B — "Depuis le Compte Épargne (Provisions)" — emerald header (visible only if periodic charges due this month)
      List of periodic charges (annual/quarterly) actually due THIS month
      Sum displayed top-right

    Each row (ChargeRow) — INTERACTIVE:
      - Toggle paye/non-payé (left side, 11x6 rounded pill, emerald if paid)
        When paid: charge name line-through + opacity 0.75 + bg emerald subtle
      - Charge name (font-medium)
      - Category badge (colored pill, 10px, mapping from categories table — 8 default colors)
      - Day of month chip ("Le 01")
      - Frequency tag ("MENSUELLE" / "ANNUELLE" / "TRIMESTRIELLE") in blue uppercase if periodic
      - Amount (right side, font-mono, lg)
      - Edit pencil button (visible at hover, opens inline popover with category/day/amount/save/cancel/delete)
      - In "Ordre personnalisé" mode: GripVertical drag handle (desktop) OR Up/Down arrows (mobile)

  Bloc 3-RIGHT (1/3 width desktop) — 4 STACKED CARDS (vertical)

    Card 3-R.1 — "DÉPENSES DU QUOTIDIEN" (purple ShoppingCart icon, current month badge)
      - Progress bar "Reste à dépenser X € / Y €" (X = plafond - sum dépenses, Y = plafond)
        Color logic: < 75% purple, 75-90% amber, ≥ 90% rose
      - Inline form: description input (placeholder "Ex: Courses Colruyt") + amount input + category select + "+" button
        LIVE DECREMENT: adding an expense updates the bar IMMEDIATELY (optimistic), Server Action persists in background
      - List of this month's expenses (description + category badge + day + amount + delete on hover)

    Card 3-R.2 — "ASSISTANT VIREMENTS" (gradient blue-to-emerald background, ArrowRightLeft icon — THE COCKPIT BRAIN)
      - "Provisions mensuelles: X €" (inline)
      - "Factures annuelles ce mois-ci: Y €" (inline)
      - SUB-CARD "Santé des Provisions" (emerald or amber depending on deficit)
        - "Cible théorique idéale: X €"
        - "Solde actuel: Y €"
        - If deficit: "Déficit détecté: -Z €" (amber)
        - If at goal: "Statut: À jour ✨" (emerald)
      - HERO MONTANT À VIRER:
        - If transfertAjusté > 0: "À virer vers l'Épargne: X €" (3xl bold blue) + sub-text explaining inclusion of catch-up if applicable
        - If transfertAjusté < 0: "À récupérer de l'Épargne: |X| €" (3xl bold emerald) + "Les factures annuelles de ce mois dépassent ta provision. Utilise ton épargne !"
        - If transfertAjusté = 0: "Aucun virement nécessaire ce mois-ci." (zinc message)
      - DETAIL PROVISIONS (item by item, expandable section): "Détail des X € de provisions:" with each charge listed (name + lissée provision)

      THIS IS THE UNIQUE SELLING POINT. No competitor calculates the smart "transfertRecommandé = provisions - factures du mois". Make this card feel like a financial co-pilot whispering wisdom. Subtle gradient, soft glow, gravitas. Magic.

    Card 3-R.3 — "PRÉVISIONS (6 mois)" (BarChart3 blue icon)
      - Custom bar chart, 6 columns (current month + 5 future months)
      - Bar height ∝ totalCharges of the month (normalized to max in window)
      - Bar color: blue if margePrevue ≥ 0, rose if margePrevue < 0
      - Hover tooltip: month name + total charges + margin
      - Current month label highlighted (white text + bold), others zinc
      - Pure SVG, no external chart lib (Chart.js / Recharts excluded — bundle weight)

    Card 3-R.4 — "SIMULATEUR D'ACTION" (gradient blue-to-purple, TrendingUp icon)
      - Step 1 select: "Choisir une dépense" (dropdown listing all charges with format "{nom} ({montant} € - {frequence})")
      - Step 2 input: "Nouveau prix espéré" (number input, € suffix indicating frequency)
      - Result panel (animates in when both inputs filled):
        - "Économie lissée: +X € / mois" (emerald if positive, rose if negative)
        - 1-line explanatory text
        - Button "Appliquer ce changement" (primary blue, persists modification + creates provider_negotiations record cf. ADR-013 future)

      Tone: empowering. The user is in control, can simulate "what if I switch internet provider to Orange at 89€" in real-time and see immediate impact. ⚠️ FSMA: do NOT use the word "investissement" or "placement" anywhere in this component.

────────────────────────────────────────────────────────────────────────
MODALS (overlay, backdrop-blur, Liquid Glass aesthetic)
────────────────────────────────────────────────────────────────────────
Modal A — "Nouvelle Charge"
  Fields: nom + montant + jour échéance + catégorie + fréquence
  If fréquence ≠ mensuelle: multi-select "Mois d'échéance" (dropdown with 12 months, ctrl-click multi)
  Helper: "Sélectionne les mois où cette charge doit être payée"
  Buttons: Annuler (ghost) + Ajouter (primary blue)

Modal B — "Gérer les Catégories"
  List of all categories (badges with colored background)
  Trash button per category (except "Autres" which is system-protected)
  Confirm modal: "Supprimer cette catégorie ? Les charges associées passeront dans 'Autres'."
  Add form: label input + color select (8 presets: blue/pink/rose/emerald/purple/amber/cyan/zinc)

────────────────────────────────────────────────────────────────────────
INTERACTIONS & MICRO-MOTIONS
────────────────────────────────────────────────────────────────────────
- Cards with subtle gradient follow on hover (desktop, ≤ 200ms ease-out)
- Number tickers on value changes (spring physics, used on the 2 hero radar cards + Quotidien progress bar)
- Toggle paye = pillow physics (5x bouncy spring)
- Modal entry = scale 0.95 → 1 + opacity, exit reverse, 240ms
- Notification dropdown = slide-in-from-top + fade, 200ms
- Drag & drop charges = lift (scale 1.02 + shadow + opacity 0.95) and dropzone hint (border accent on hover target)
- Pull-to-refresh on mobile with haptic feedback (PWA)
- Bell badge count: subtle pulse animation when new alert arrives (1x ping)

────────────────────────────────────────────────────────────────────────
9 DOMAIN CALCULATIONS — ARCHITECTURAL CONTEXT (read before designing)
────────────────────────────────────────────────────────────────────────
The dashboard surfaces 9 pure-domain calculations (full math in the canonical spec doc). You don't need to implement them — backend handles it — but understanding what they DO informs visual hierarchy:

1. effortFinancierLisse = totalMensuelFixe + provisionMensuelleTotale (Bloc 2.1)
2. capaciteEpargneReelle = revenus - effortFinancierLisse - plafondQuotidien (Bloc 2.2 — HERO)
3. transfertRecommande = provisionMensuelleTotale - totalPeriodiquesMois (Bloc 3-R.2 — UNIQUE)
4. santeProvisions = totalEpargneTheorique vs soldeActuel (Bloc 3-R.2 sub-card)
5. rattrapageMensuel = deficit / 3 (auto-included in Bloc 3-R.2 hero number)
6. resteBudgetVie = plafond - sum(depensesDuMois) (Bloc 3-R.1 progress bar)
7. notifications[] reactive (Bell badge in header)
8. previsions6mois (Bloc 3-R.3 bar chart)
9. economieMensuelleLissee (Bloc 3-R.4 simulateur output)

Display all amounts with French formatting: "1 942,00 €" (NBSP thousands, comma decimals, space then €).

────────────────────────────────────────────────────────────────────────
DIFFERENTIATORS TO MAKE VISUALLY OBVIOUS (vs Monarch/YNAB/Lunch Money)
────────────────────────────────────────────────────────────────────────
1. Capacité d'Épargne Réelle (Bloc 2.2) — give it visual GRAVITAS, top hierarchy with the Effort
2. Assistant Virements (Bloc 3-R.2) — the smart calculation transfertRecommandé. Show pedagogy via the detail-by-charge breakdown. This is the "wow" that makes users say "no other app does this".
3. Plan rattrapage 3 mois — when activated, surface it cleanly under the À virer hero number ("Inclut +X € pour rattraper sur 3 mois").
4. Live decrement Quotidien — the bar moves IMMEDIATELY when an expense is added. Sub-100ms perceived latency.
5. Simulateur d'Action (Bloc 3-R.4) — inline, on the dashboard, not buried in a separate page.

────────────────────────────────────────────────────────────────────────
FORBIDDEN
────────────────────────────────────────────────────────────────────────
- Bento grid of equal-weight cards (we have hierarchy: 3 accounts → 2 radar → 2/3+1/3)
- Emoji icons (Lucide stroke-1.5 only)
- Dollar signs ($) — ANKORA IS EUROPEAN, € only
- Historic bar charts as the main viz (we're predictive — Bloc 3-R.3 looks forward)
- Generic "transactions feed" (no PSD2, no transactions)
- The word "investissement" / "placement" / "rendement" in any UI string (FSMA hard exclusion)
- The 8-section v2 layout from previous brief — that vision is OBSOLETE

────────────────────────────────────────────────────────────────────────
LANGUAGE
────────────────────────────────────────────────────────────────────────
French primary, English alternative. All copy bilingual via i18n keys (cf. ADR docs).
First-person warm tone. Avoid jargon. When showing a number, ALWAYS explain its meaning in 1 line below.
```

> **Pour cette session Claude Design** : merci de produire des variations qui respectent strictement la hiérarchie 4 blocs ci-dessus. Si une exploration créative te tente sur un layout alternatif, archive-la dans `scraps/` mais ne l'envoie pas en variante principale. La cible est le mockup IronBudget visuellement repensé Ankora — pas une réinvention.

### 3.3 Onboarding (3 steps) — PRIORITÉ 3

```
Surface: Onboarding flow — 3 steps, mobile-first, premium feel.

Context: brand-new user has just signed up via Supabase Auth. Before they see the dashboard, they need to configure:
  Step 1 — "Welcome, how do you want to organize your money?"
    - 3-account model (default) : Principal (salary in) / Daily life / Savings (provisions + free reserve)
    - Single-account model : everything on one account
  Step 2 — "Let's add your first envelopes"
    - User picks 3-8 starter envelopes (groceries, fuel, going out, subscriptions, housing, transport, health, gifts)
    - For each: monthly budget amount + day of month they usually pay
  Step 3 — "Your first provisions"
    - User adds 1-3 annual bills they want to smooth (car insurance, local tax, annual vacation)
    - For each: amount, due date, already put aside?
    - Ankora computes monthly provision amount automatically

Tone: encouraging, never judging. Error states are warm ("Oops, let's try again" — NOT "Invalid input").
Animations: each step transitions with a horizontal slide + subtle parallax on the background.
Completion: confetti-free but satisfying (gauge fills, check pulses, haptic feedback on mobile).
Data: show a live preview of what the dashboard will look like after each step.
```

### 3.4 Admin Dashboard — PRIORITÉ 4

```
Surface: Admin dashboard — internal only, accessible by Thierry (and later support team). Protected by requireAdmin().

4 sections:
  1. Tech health — uptime, error rate, p95 latency, Supabase status, Upstash quotas, Vercel deploys
  2. Product health — DAU / WAU / MAU, cohort retention, feature adoption heatmap, churn
  3. Acquisition — signups/day, source breakdown (organic / referral / direct), Lighthouse trends
  4. Recommendations — rule-based nudges ("Envelope X is 3x over budget for 2 users", "10 users churned this week")

Visual distinction from user dashboard:
  - SAME typography, SAME spacing, SAME glass — but ACCENT COLOR = amber (user = teal)
  - Persistent "Admin" pill in header (amber)
  - Route: /admin/* (separate from /app/*)
  - Mobile: dedicated screen, NOT polluting the user tab bar (accessed via long-press on avatar or ⌘K search)

Navigation:
  - Desktop: sidebar with 4 sections + ⌘K unified palette with "scope:admin" prefix
  - Mobile: top-level tabs with horizontal scroll

Recommendations section should feel like a triage inbox, not a dashboard. Each recommendation is a card with:
  - Severity icon (info / warning / critical)
  - 1-sentence summary
  - "Why this matters" expandable
  - "Action" CTA (e.g. "Send email to affected users")
```

---

## 4. Iteration guidelines (à rappeler en cours de session si besoin)

- Tight spacing (8px baseline, densité mobile-first)
- Don't introduce new colors without explicit check
- Reuse design system components by name ("Use the Primary Button component")
- When unsure between 2 directions, generate BOTH as variations — let Thierry pick
- Preserve functional flows defined in `ankora-mockups/*.html` — we're polishing, not redesigning UX
- All copy in French by default, English alternative when requested

---

## 5. Export preferences

- **Format primary** : Handoff to Claude Code (for CC Ankora integration)
- **Format backup** : ZIP export (stored in `F:\PROJECTS\Apps\ankora-mockups\design-exports\<surface>/`)
- **Target stack** : React 19 + Tailwind v4 + TypeScript, Server Components where possible
- **CSS variables** : use the ones in `shared-tokens.css`, do NOT hardcode hex values in components
- **Accessibility** : all components must include ARIA, keyboard nav, focus states

---

## 6. Handoff quality gate (avant d'intégrer un export)

- [ ] All tokens match `shared-tokens.css`
- [ ] No hardcoded hex outside `globals.css`
- [ ] No emoji in UI, only Lucide icons
- [ ] All monetary values use € (never $)
- [ ] All copy in French or bilingual (not English-only)
- [ ] No `className="bg-[#...]"` arbitrary Tailwind — use tokens
- [ ] No new paid dependency added
- [ ] WCAG AA contrast verified on all text surfaces
- [ ] Spring physics / easing-out on transitions (no linear)
- [ ] Mobile-first media queries (min-width pattern, not max-width)
- [ ] **Token usage convention respected** — `bg-muted` interdit comme surface (cf. `docs/design/token-usage.md`), utiliser `bg-surface-muted` ou `bg-card`. `text-muted` réservé aux timestamps/captions/disabled uniquement.

---

## 7. Token usage documentation requirement (NEW — verrouillé 2026-04-26 post-incident PR T1)

Pour tout futur brief Claude Design (`claude-design-brief.md`), **exiger explicitement** que l'export ZIP livre :

1. **Les valeurs des tokens** dans `colors_and_type.css` (ou équivalent) — déjà en place ✅
2. **Une matrice d'usage par token** : pour chaque variable CSS, indiquer `text-only` / `bg-only` / `border-only` / `mixed-with-conditions`. Sans ça, un agent intégrateur peut utiliser un token de texte décoratif (`--color-muted`) comme surface et casser WCAG AA silencieusement.
3. **Les paires de contraste WCAG AA documentées** (avant-plan × arrière-plan) avec ratios calculés et verdict (AAA/AA/sub-AA-acceptable/FAIL).
4. **Les anti-patterns connus** : si une valeur de token est volontairement sub-AA (ex : `--color-muted` à 3.6:1 pour timestamps), l'expliquer en commentaire CSS visible **et** dans une doc séparée à intégrer dans le repo Ankora.

**Référence** : voir `docs/design/token-usage.md` pour le format final attendu côté Ankora repo. Le brief Claude Design doit demander à cc-design de produire l'équivalent au moment du handoff.

Sans ces 4 documents, l'intégration produit des bugs WCAG silencieux que personne ne détecte avant que axe-core (PR T1+) le signale en prod. Cf. registre §5 de `token-usage.md` pour l'historique.
