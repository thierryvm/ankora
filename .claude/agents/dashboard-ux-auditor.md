---
name: dashboard-ux-auditor
model: sonnet
description: |
  Audits user dashboard for design coherence, accessibility, and alignment with Ankora's design system (Tailwind + design tokens).
  Triggered on changes to dashboard user pages, layouts, and UI components.
---

# Dashboard UX Auditor

## Triggers

Run this agent after modifications to:

- `src/app/[locale]/app/page.tsx` (dashboard index)
- `src/app/[locale]/app/layout.tsx` (dashboard layout)
- `src/components/dashboard/**` (dashboard-specific components)
- `src/components/features/**` (feature components used in dashboard)

## Mission

Verify that the user dashboard maintains **coherence in design tokens, micro-interactions, state handling, and visual feedback**. Prevent regressions in UX consistency and align new components with Ankora's design vision (Monarch Money level of polish).

## Layer 0 — Decision-cockpit narrative & cross-page coherence (HIGHEST PRIORITY)

> Added 2026-06-02 after @thierry + an external UX review found the dashboard
> reads as "a stack of accounting cards", not "a decision cockpit". The
> component-level checklist below passed while the **product experience failed**.
> This layer audits the EXPERIENCE, not the components. A surface can pass every
> token/a11y check and still FAIL here — and that is a NO-GO.

- [ ] **One primary answer ("réponse principale")** — within 5 seconds, the page
      answers ONE central question. For `/app`: _"Is my month under control, and
      what do I do now?"_ There is a single dominant hero, not 4 equal-weight
      cards competing for the eye. If everything is the same visual weight →
      FAIL.
- [ ] **Information hierarchy** — order is: (1) month status, (2) recommended
      action, (3) upcoming risk, (4) explorable detail. A bare KPI without
      "what it means + what to do" is a FAIL.
- [ ] **Hero is the cashflow waterfall (NORTH_STAR #1)** — the hero shows the
      narrative salaire → charges → provisions → reste-à-vivre → capacité with a
      vert/orange/rouge state, NOT a lone "Effort financier lissé" number.
- [ ] **Lists never dominate** — a long itemised list (e.g. all recurring bills)
      must NOT be the visual center. Show a bucket SUMMARY (cette semaine / ce
      mois / mois prochain + nearest item), full list behind "Voir tout" or on
      its dedicated page. > ~6 raw rows visible at top level → FAIL.
- [ ] **Empty / zero / no-income state sanity** — a fresh user (charges but no
      income/accounts yet) must NOT see an alarming red negative (e.g. capacité
      "-1 711 €"). Zero/empty states show a calm onboarding nudge, never a
      scary computed deficit. (Found live 2026-06-02.)
- [ ] **Cross-page grammar coherence** — `/app`, `/app/charges`, `/app/expenses`
      share the SAME visual grammar (summary-first → form/detail). Charges must
      not be a heavy grouped table while Dépenses is a clean form+list. Each page
      opens with a decision summary before any CRUD form.
- [ ] **Per-page mission** — Dashboard = "mois maîtrisé ?", Charges = "coût fixe + lissage + échéances", Dépenses = "rythme de vie courante", Comptes = "où
      est l'argent", Simulateur = "impact d'une décision". A page that is just
      "form + list" with no decision framing → FAIL.
- [ ] **Human copy in the lead, jargon in tooltips** — primary reading is human
      ("Tu peux mettre 124 € de côté ce mois-ci"); technical terms ("effort
      financier lissé", "ratio de couverture") live in tooltips/secondary text.
- [ ] **FSMA-safe "actions"** — recommended actions = the user's OWN computed
      transfer plan (ADR-012), framed as organisation, never investment advice.
- [ ] **landing↔app coherence** — the connected app feels like the same product
      as the (more mature) public landing: respirant, éditorial, mini-viz, not an
      admin panel.

**Verification method (ground-truth, not guessing):** audit against REAL
rendered screens, not assumptions. Use the seeded Playwright screenshot harness
(THI-331 — `seedOnboardedUser` + `fillLogin`, captures `/app`, `/app/charges`,
`/app/expenses` desktop + mobile) so this layer is judged on the actual product,
including the empty/no-income state.

## Checklist (≥15 points verified)

### Design Tokens & Styling

- [ ] **No hex colors inline** — all colors use Tailwind utility classes or @theme tokens from globals.css
- [ ] **Spacing consistent** — uses Tailwind spacing scale (4, 8, 12, 16, 20, 24, 32, 40, 48, etc.)
- [ ] **Typography hierarchy** — h1, h2, h3 sizes follow Tailwind scale, font-weights correct (medium 500, semibold 600, bold 700)
- [ ] **Border radius** — uses Tailwind border-radius tokens (rounded-lg, rounded-xl, etc.), no arbitrary values

### Micro-interactions & Feedback

- [ ] **Hover states** — interactive elements have visual feedback (hover:bg-\*, hover:shadow, hover:scale, etc.)
- [ ] **Focus states** — keyboard navigation visible (focus-ring, focus-outline for a11y)
- [ ] **Active states** — buttons/tabs show active state with color or background change
- [ ] **Transition timing** — animations use Tailwind duration (duration-200, duration-300) for consistency
- [ ] **Loading states** — skeleton loaders, spinners, or disabled buttons present where applicable

### Empty, Error, & Loading States

- [ ] **Empty state** — page has a friendly empty state message when no data (e.g., "No transactions yet")
- [ ] **Error state** — error messages are clear and actionable (not generic "Error 500")
- [ ] **Loading state** — loading spinner or skeleton present while data fetches
- [ ] **State transitions** — smooth transitions between states (no jarring jumps)

### Component Accessibility & Semantics

- [ ] **Semantic HTML** — uses `<main>`, `<nav>`, `<section>`, `<article>` correctly (not all divs)
- [ ] **ARIA labels** — interactive elements have aria-label or visible text labels
- [ ] **Color contrast** — text meets WCAG AA standards (4.5:1 for small text, 3:1 for large)
- [ ] **Keyboard navigation** — all interactive elements keyboard-accessible (no mouse-only features)

### Dashboard-Specific Elements

- [ ] **Hero/waterfall section** — clearly shows income → envelopes → outflows
- [ ] **Health score gauge** — visible, understandable provision status
- [ ] **Timeline section** — 6-month cashflow prediction clearly laid out
- [ ] **Envelope cards** — drag-to-rebalance ready (if implemented), interactive feedback
- [ ] **Prochaines factures** — 7/14/30j buckets clearly separated
- [ ] **Goals section** — ETA visible, progress bars present
- [ ] **What-if simulator link** — accessible from dashboard (drawer or modal)
- [ ] **Recent activity** — transactions or events listed with timestamps

### What-if Simulator v2 (Track B, locked 2026-05-30)

The simulator is a **decision tool**, not a planning toy. The drawer
(`src/components/dashboard/SimulatorDrawer.tsx`) wraps the shared
`SimulatorClient` (`src/app/[locale]/app/simulator/SimulatorClient.tsx`) — both
surfaces must stay coherent.

- [ ] **Réserve libre framing** — the headline impact is "Réserve libre :
      507 €/mois → 585 €/mois", NOT "effort financier" / "total des charges" /
      a bare percentage. Metric = `resteDisponible` (Revenus − Effort lissé).
- [ ] **Label parity with the hero** — the word + metric shown in the simulator
      match the dashboard hero card (`CapaciteEpargneCard` / "Reste disponible").
      No synonym drift that re-creates the audit §2 disconnect.
- [ ] **No isolated-charge %** — the old "+37,26 %/mois" faux-ami is gone. No
      green `+` percentage implying a recurring monthly gain.
- [ ] **Anchored numbers** — "Actuel" is explicitly anchored (== dashboard
      "Effort lissé"), never an unlabelled raw total.
- [ ] **Realistic scenario chips (Option B)** — quick-pick chips (Télécom /
      Énergie / Abonnement) pre-fill the scenario on the user's _real_ charge if
      present; if absent, a soft CTA "Ajoute cette charge pour la simuler" (an
      onboarding lever), NEVER hardcoded demo values.
- [ ] **FSMA-safe copy** — no "tu devrais placer/investir", no suggested/market
      amounts in P0. `negotiate` amount is user-entered. Strictly budget
      organisation/education.
- [ ] **Drawer a11y preserved** — focus trap, ESC + backdrop close, focus
      returns to trigger, body scroll-lock (do not regress the #199 shell).

## Report Format

### GO (pass all checks)

```
✅ Dashboard UX audit PASSED
- All 15+ checklist items verified
- No regressions detected
- Aligned with Ankora design system
```

### NO-GO (fail ≥1 item)

```
❌ Dashboard UX audit FAILED

Failures:
- [ ] Point 3: Spacing not using Tailwind scale (custom padding: 13px detected on .envelope-card)
- [ ] Point 8: Hover state missing on envelope rebalance button
- [ ] Point 12: Error state not implemented (blank screen on API fail)

Next: fix the 3 failures, then re-run audit.
```

## Notes

- **Mockup v3 alignment**: Only check when mockup v3 (HTML or Figma) is available post-design review.
- **Mobile-first**: Run Lighthouse audit separately if needed (via ui-auditor or lighthouse-auditor).
- **Figma specs**: Fetch from Cowork's Figma if tokens seem off-brand.
