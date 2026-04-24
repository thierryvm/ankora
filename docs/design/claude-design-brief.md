# Brief Claude Design — Ankora v1.0

Document à **coller intégralement** (ou par section selon la surface) dans la session Claude Design (claude.ai/design) lors de la création du projet "Ankora".

Langue du brief : **anglais** (Claude Design comprend les deux mais l'anglais donne de meilleurs résultats sur la recherche design).

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
  - Monarch Money (reference dashboard enveloppes, iOS native)
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

### 3.2 User Dashboard v3 — PRIORITÉ 2

```
Surface: User dashboard — THE product core. This is what users open 2-3 times per week. If this is not joyful, the product fails.

Layout (mobile-first, 8 sections, mobile = vertical scroll, desktop = 2-column with sticky right sidebar):
  1. HERO — Cashflow waterfall animated (salary → envelopes → outflows) with live numbers
  2. Health score — gauge 0-100 with 3 contextual nudges below
  3. Timeline — predictive 6-month balance curve, hoverable for tooltips
  4. Envelopes — drag-to-rebalance cards, monthly % consumed, visual overflow warning
  5. Upcoming bills — 7/14/30d tabs, expandable list with provision status
  6. Goals — savings goals with ETA, progress ring, editable target
  7. Simulator — collapsed by default in a drawer, "What if I renegotiate X?" inline
  8. Recent activity — last 10 transactions with semantic badges (Paid / Scheduled / Action needed / Received / Manual)

Extra — Compte Épargne card: must show 3 distinct numbers:
  - Total savings
  - Affected provisions (locked until due date)
  - Free reserve (available anytime, with in/out history)
This is Ankora's key differentiator — make it VISUALLY obvious.

Interactions:
  - Cards with subtle gradient follow on hover (desktop)
  - Number tickers on value changes (spring physics)
  - Morph transitions from list item → detail view
  - Pull-to-refresh with haptic on mobile

Forbidden: bento grid of equal cards, emoji icons (use Lucide), dollar signs (always €), historic bar charts (we're predictive).
```

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
