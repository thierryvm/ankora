import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Shared input primitive.
 *
 * PR-UI-2 fixes (2026-05-07) — three regressions surfaced by @thierry's
 * empirical validation on `ankora.be/app` post-PR-D3-bis:
 *
 * - **F2 — Focus ring softer**: replaced `ring-2 ring-offset-2 ring-brand-600`
 *   (full-opacity halo that read as a thick white outline on dark theme) by
 *   `ring-2 ring-brand-500/30` without offset. Same affordance, no harshness.
 * - **F3 — Scroll-on-number disabled**: when `type="number"`, the wheel used
 *   to bump the value silently — dangerous UX on amount inputs. We hide the
 *   webkit spin buttons and force `appearance: textfield`, conditionally,
 *   so checkbox / radio / color / range stay untouched.
 * - **F4 — Date icon visible in dark mode**: native `<input type="date">`
 *   defaults to `color-scheme: light` and renders the calendar SVG in
 *   black-on-black on the `[data-theme="dark"]` shell. `dark:[color-scheme:dark]`
 *   propagates the right scheme so the icon is rendered with light pixels.
 *
 * PR-UI-1 (THI-298, 2026-05-31) — "un signal pas deux". The focus signal is a
 * single thin coloured border, no ring halo. Earlier iterations stacked a
 * coloured border AND a 2px ring (read by @thierry as a thick "double border"
 * frame); the ring was dropped. At focus the border simply turns `brand-600`
 * (#0d9488) — an affirmed cousin of the hover hint, one clean line.
 *
 * Colour rationale: with no ring, the border is the SOLE focus indicator, so it
 * must clear WCAG 2.4.11 (Focus Appearance, AA 2.2) 3:1 on its own. `brand-600`
 * is ≥3:1 on card in BOTH themes (light ~3.9:1, dark ~3.8:1) — unlike
 * `brand-700` which dips to ~2.97:1 on the dark card.
 *
 * The rest border stays `border-border` (full) — thinning it broke field
 * affordance on the dark shell (border `#1e293b` vs card `#111a2e` is already
 * low-contrast). A subtle `hover:border-brand-500/40` hints interactivity
 * before focus. The `aria-invalid` state stays loud: `border-danger` at rest
 * AND on focus, plus a danger `ring-2` re-anchored on invalid+focus only (the
 * one place a ring remains) so an erroring field is unmistakable when active.
 * Select (`select.tsx`) mirrors this contract 1:1.
 */
const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        // PR-D5 mobile-iOS: `ankora-form-control-16` (declared in globals.css
        // outside `@layer`) enforces `font-size: 16px !important` so Safari
        // iOS does not auto-zoom on focus. Every other channel was attempted
        // and failed — see globals.css for the full triage.
        'ankora-form-control-16 border-border bg-card text-foreground flex h-10 w-full rounded-lg border px-3 py-2 shadow-sm transition-colors',
        'file:text-foreground file:border-0 file:bg-transparent file:text-sm file:font-medium',
        'placeholder:text-muted',
        // PR-UI-1 — subtle brand hint on hover, before focus engages.
        'hover:border-brand-500/40',
        // PR-UI-1 — focus = a single thin emerald edge, no detached outline,
        // no ring halo (@thierry: the 2px halo/outline read as a thick frame).
        // The ~2px thickness + the outline cancellation are applied CENTRALLY,
        // non-layered, in `globals.css` (`.ankora-form-control-16:focus-visible`)
        // because the global `*:focus-visible` outline is itself non-layered and
        // cannot be cancelled from a Tailwind utility. These two classes set the
        // border colour (cosmetic, matches the central rule) and are otherwise
        // superseded there — see globals.css for the full mechanism.
        'focus-visible:border-brand-600 focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        // PR-UI-1 — invalid stays loud: `border-danger` at rest AND on focus
        // (`aria-invalid:focus-visible:border-danger` comes after the plain
        // focus border so source-order wins). Since valid focus no longer
        // carries a ring, the danger ring is re-anchored HERE (with its own
        // `ring-2` width) so an invalid + focused field still gets an
        // unmistakable focus halo — the one place a ring remains.
        'aria-invalid:border-danger aria-invalid:focus-visible:border-danger aria-invalid:focus-visible:ring-danger aria-invalid:focus-visible:ring-2',
        // F4 — let native `<input type="date">` (and friends) pick the right
        // colour scheme so the calendar icon stays visible on dark theme.
        'dark:scheme-dark',
        // F3 — neutralise the wheel/scroll spin buttons on numeric inputs
        // exclusively, so non-numeric types keep their native UI.
        type === 'number' &&
          '[appearance:textfield] [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };
