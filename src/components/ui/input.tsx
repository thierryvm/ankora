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
 * PR-UI-1 (THI-298, 2026-05-31) — "un signal pas deux". At rest the field
 * kept `border-border`, but on focus it stacked TWO signals: a coloured
 * `border-brand-500` AND a `ring-2`. @thierry read this as a "double border".
 * Fix: focus is now the RING ALONE — `border-transparent` + `ring-offset-0`,
 * so a single emerald halo signals focus. A subtle `hover:border-brand-500/40`
 * hints interactivity before focus. The rest border stays `border-border`
 * (full) — thinning it broke field affordance on the dark shell (border
 * `#1e293b` vs card `#111a2e` is already low-contrast). The `aria-invalid`
 * state is preserved across all three states: `border-danger` at rest AND on
 * focus (`aria-invalid:focus-visible:border-danger` re-asserts the danger
 * border so `border-transparent` cannot erase the error), plus `ring-danger`.
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
        // PR-UI-1 — focus is the RING ALONE: transparent border + F2 soft ring
        // (brand-500 at 30%, no offset). One signal, not two.
        'focus-visible:ring-brand-500/30 focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-offset-0 focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        // PR-UI-1 — preserve the invalid state across all three states. The
        // `aria-invalid:focus-visible:*` rules MUST come after the plain
        // `focus-visible:*` ones so source-order wins: otherwise
        // `border-transparent` would erase the danger border on a focused
        // invalid field. Same mechanism as the existing ring-danger override.
        'aria-invalid:border-danger aria-invalid:focus-visible:border-danger aria-invalid:focus-visible:ring-danger',
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
