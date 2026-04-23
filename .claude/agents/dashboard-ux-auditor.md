---
name: dashboard-ux-auditor
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

- **Mockup v3 alignment**: Only check when `F:\PROJECTS\Apps\ankora-user-dashboard-v3.html` is available (post-design).
- **Mobile-first**: Run Lighthouse audit separately if needed (via ui-auditor or lighthouse-auditor).
- **Figma specs**: Fetch from Cowork's Figma if tokens seem off-brand.
