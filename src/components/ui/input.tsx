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
 */
const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'border-border bg-card text-foreground flex h-10 w-full rounded-lg border px-3 py-2 text-sm shadow-sm transition-colors',
        'file:text-foreground file:border-0 file:bg-transparent file:text-sm file:font-medium',
        'placeholder:text-muted',
        // F2 — softer focus ring (no offset, brand-500 at 30% opacity)
        'focus-visible:border-brand-500 focus-visible:ring-brand-500/30 focus-visible:ring-2 focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-danger aria-invalid:focus-visible:ring-danger',
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
