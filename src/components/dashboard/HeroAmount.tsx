'use client';

import { useEffect, useRef, useState } from 'react';

import { formatCurrency } from '@/lib/i18n/formatters';
import { settleSpend, useOptimisticSpend } from '@/lib/expenses/optimistic-spend';
import type { Locale } from '@/i18n/routing';

/**
 * « Il te reste » — the hero figure, and the animation that makes it mean
 * something.
 *
 * ## The animation IS the feature
 *
 * `DECISIONS-ANKORA.md` §3.3 is explicit that this is not decoration: the whole
 * bet of the refonte is that recording a spend makes the big number come down,
 * *visibly*. A figure that silently reads 429,89 € where it read 448,39 € two
 * seconds ago proves nothing. One that travels from 448,39 to 429,89 in ~400 ms
 * is the feedback loop the audit found missing — the loop that turns bookkeeping
 * into a decision.
 *
 * The design system (§7, and ADR-010) settles the form: the number **ticks**,
 * it never cross-fades. So this interpolates the value and re-formats every
 * frame; it does not fade one string into another.
 *
 * ## Two sources, one figure
 *
 * `value` is server truth. `useOptimisticSpend()` carries a spend the ⊕ sheet
 * has just committed but which the server has not echoed back yet, so the
 * descent starts on the tap rather than on the round-trip (ADR-010's < 100 ms).
 * When fresh truth lands, the pending delta is dropped here — see
 * `optimistic-spend.ts` for why clearing it anywhere else produces a flicker.
 *
 * ## No layout shift, ever
 *
 * `tabular-nums` fixes every digit to the same advance width, so a figure
 * sweeping through 448 → 429 does not jitter the euro sign or reflow the line
 * beneath it. Without it the animation reads as a glitch rather than a movement.
 */

/** §3.3 — long enough to be read as motion, short enough not to be a wait. */
const DURATION_MS = 420;

/** `--ease-spring` from globals.css, in JS. Apple's sheet curve. */
function easeSpring(t: number): number {
  return cubicBezier(0.32, 0.72, 0, 1, t);
}

/**
 * Cubic-bézier evaluation by Newton's method on x, then y.
 *
 * Six iterations, because at 60 fps an error of 1e-5 on a 420 ms curve is far
 * below one frame — precision past that would be spent for nothing.
 */
function cubicBezier(x1: number, y1: number, x2: number, y2: number, x: number): number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  let t = x;
  for (let i = 0; i < 6; i++) {
    const xAt = ((ax * t + bx) * t + cx) * t - x;
    const slope = (3 * ax * t + 2 * bx) * t + cx;
    if (Math.abs(slope) < 1e-6) break;
    t -= xAt / slope;
  }
  t = Math.min(1, Math.max(0, t));
  return ((ay * t + by) * t + cy) * t;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export type HeroAmountProps = {
  /** Server truth for « Il te reste ». */
  value: number;
  locale: Locale;
  className?: string;
  testId?: string;
};

export function HeroAmount({ value, locale, className, testId }: HeroAmountProps) {
  const pendingSpend = useOptimisticSpend();
  const target = value - pendingSpend;

  // Seeded with the target so the first client render matches what the server
  // rendered — animating on mount would be a hydration mismatch AND would make
  // every page load count up from zero, which says nothing about spending.
  const [displayed, setDisplayed] = useState(target);
  const displayedRef = useRef(target);
  const lastServerValueRef = useRef(value);

  // Fresh server truth: the optimistic delta has done its job and must go, or
  // it would be subtracted a second time from a value that already includes it.
  useEffect(() => {
    if (value === lastServerValueRef.current) return;
    lastServerValueRef.current = value;
    settleSpend();
  }, [value]);

  useEffect(() => {
    const from = displayedRef.current;
    if (from === target) return;

    // Reduced motion collapses the DURATION rather than branching to a direct
    // assignment: one code path, and the first frame lands on the target. A
    // synchronous write here would also be a cascading render — the figure gets
    // to its value in one frame either way.
    const duration = prefersReducedMotion() ? 0 : DURATION_MS;
    let frame = 0;
    let start: number | null = null;

    const step = (now: number) => {
      if (start === null) start = now;
      const progress = duration === 0 ? 1 : Math.min(1, (now - start) / duration);
      const next = from + (target - from) * easeSpring(progress);
      displayedRef.current = progress === 1 ? target : next;
      setDisplayed(displayedRef.current);
      if (progress < 1) frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return (
    <p
      className={`tabular-nums ${className ?? ''}`}
      data-testid={testId}
      // The travelling figure is noise to a screen reader — it would announce
      // a dozen intermediate amounts. The settled value is announced once, via
      // aria-label, and the visible text is hidden from the a11y tree.
      aria-label={formatCurrency(target, locale)}
      // `polite` and not `assertive`: this number changes because the user just
      // recorded a spend, so it is a confirmation, never an interruption.
      aria-live="polite"
      aria-atomic="true"
    >
      <span aria-hidden="true">{formatCurrency(displayed, locale)}</span>
    </p>
  );
}
