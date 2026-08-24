import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

import { HeroAmount } from '../HeroAmount';
import { announceOptimisticSpend, settleSpend } from '@/lib/expenses/optimistic-spend';

/**
 * The store now publishes a COUPLE — « Il te reste » and « Dépensé ce mois »,
 * so the curve of the month moves with this figure instead of freezing beside
 * it. These cases are about the descent of the hero, so they only care about
 * the first member; the second is set to something inert.
 *
 * Note that the finite guard applies to BOTH members, which is why an inert
 * value is a real number here and not a placeholder like `NaN`.
 */
const annonce = (ilTeReste: number) => announceOptimisticSpend({ ilTeReste, depensesDuMois: 0 });

/**
 * The descent, asserted frame by frame.
 *
 * This is the one behaviour a screenshot cannot prove — a still frame of a
 * moving number looks exactly like a static one. And the movement IS the
 * feature: `DECISIONS-ANKORA.md` §3.3 is explicit that the bet of the whole
 * refonte is that recording a spend makes the big figure come down *visibly*.
 *
 * `requestAnimationFrame` is driven by hand so "it interpolates" can be checked
 * rather than assumed. The store is reset between cases because it is
 * module-level state by design (the writer and the reader share no ancestor).
 */

let frameCallbacks: FrameRequestCallback[] = [];

/** Run one frame at `now` milliseconds. */
function advanceFrame(now: number) {
  const pending = frameCallbacks;
  frameCallbacks = [];
  act(() => {
    for (const cb of pending) cb(now);
  });
}

beforeEach(() => {
  settleSpend();
  frameCallbacks = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frameCallbacks.push(cb);
    return frameCallbacks.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  settleSpend();
});

const digits = () => screen.getByTestId('hero').textContent ?? '';
/** Strip the currency chrome and the non-breaking spaces fr-BE inserts. */
const numeric = () =>
  Number(
    digits()
      .replace(/[^\d,]/g, '')
      .replace(',', '.'),
  );

describe('HeroAmount — on mount', () => {
  it('renders the settled value immediately, with no count-up', () => {
    // Animating on mount would be a hydration mismatch AND would make every
    // page load count from zero, which says nothing about spending.
    render(<HeroAmount value={448.39} locale="fr-BE" testId="hero" />);
    expect(numeric()).toBeCloseTo(448.39, 2);
  });

  it('formats as fr-BE currency', () => {
    render(<HeroAmount value={448.39} locale="fr-BE" testId="hero" />);
    expect(digits()).toContain('448,39');
    expect(digits()).toContain('€');
  });

  it('keeps digits monospaced so a travelling figure cannot reflow the line', () => {
    render(<HeroAmount value={448.39} locale="fr-BE" testId="hero" />);
    expect(screen.getByTestId('hero').className).toContain('tabular-nums');
  });
});

describe('HeroAmount — the descent', () => {
  it('ticks through intermediate values instead of jumping', () => {
    const { rerender } = render(<HeroAmount value={448.39} locale="fr-BE" testId="hero" />);

    rerender(<HeroAmount value={429.89} locale="fr-BE" testId="hero" />);
    advanceFrame(0); // establishes the start timestamp

    advanceFrame(100);
    const midway = numeric();
    // Strictly between the two — this is what "ticks" means, and what a
    // cross-fade or a direct assignment would fail.
    expect(midway).toBeLessThan(448.39);
    expect(midway).toBeGreaterThan(429.89);
  });

  it('lands exactly on the target, never a rounding artefact', () => {
    const { rerender } = render(<HeroAmount value={448.39} locale="fr-BE" testId="hero" />);

    rerender(<HeroAmount value={429.89} locale="fr-BE" testId="hero" />);
    advanceFrame(0);
    advanceFrame(1000); // well past the ~420 ms duration

    expect(numeric()).toBeCloseTo(429.89, 2);
  });

  it('moves upward too — a deleted expense gives money back', () => {
    const { rerender } = render(<HeroAmount value={200} locale="fr-BE" testId="hero" />);

    rerender(<HeroAmount value={260} locale="fr-BE" testId="hero" />);
    advanceFrame(0);
    advanceFrame(100);

    expect(numeric()).toBeGreaterThan(200);
    expect(numeric()).toBeLessThan(260);
  });

  it('does not animate when the value is unchanged', () => {
    const { rerender } = render(<HeroAmount value={448.39} locale="fr-BE" testId="hero" />);
    frameCallbacks = [];

    rerender(<HeroAmount value={448.39} locale="fr-BE" testId="hero" />);

    expect(frameCallbacks).toHaveLength(0);
  });
});

describe('HeroAmount — the optimistic figure (ADR-010)', () => {
  it('starts coming down on the announcement, before the server answers', () => {
    render(<HeroAmount value={448.39} locale="fr-BE" testId="hero" />);

    act(() => annonce(429.89));
    advanceFrame(0);
    advanceFrame(1000);

    expect(numeric()).toBeCloseTo(429.89, 2);
  });

  /**
   * THE FRAME-ACCURATE BUG THIS DESIGN EXISTS TO KILL.
   *
   * The first version published a DELTA and the hero computed `value − pending`.
   * When the revalidated server value landed it already included the spend, so
   * for one committed render the hero showed 429,89 − 18,50 = 411,39: an 18 €
   * dip below the truth, on the one figure the product is built around, followed
   * by a climb back. Publishing the resulting figure makes the update idempotent,
   * so no ordering between the action resolving and the RSC payload arriving can
   * produce a wrong frame.
   *
   * This case is what caught it. It is deliberately checked at EVERY frame, not
   * just at the end — the end state was already correct, which is why the bug
   * survived the first version of this test.
   */
  it('never shows a wrong frame when the server value catches up', () => {
    const { rerender } = render(<HeroAmount value={448.39} locale="fr-BE" testId="hero" />);

    act(() => annonce(429.89));
    advanceFrame(0);
    advanceFrame(1000);
    expect(numeric()).toBeCloseTo(429.89, 2);

    // Fresh server truth, already including the spend.
    rerender(<HeroAmount value={429.89} locale="fr-BE" testId="hero" />);
    for (const t of [1001, 1100, 1200, 1400, 2000]) {
      advanceFrame(t);
      expect(numeric(), `dipped at frame ${t}`).toBeCloseTo(429.89, 2);
    }
  });

  it('goes back up when the sheet reverts a rejected insert', () => {
    render(<HeroAmount value={448.39} locale="fr-BE" testId="hero" />);

    act(() => annonce(403.39));
    advanceFrame(0);
    advanceFrame(1000);
    expect(numeric()).toBeCloseTo(403.39, 2);

    act(() => settleSpend());
    advanceFrame(1001);
    advanceFrame(2000);

    expect(numeric()).toBeCloseTo(448.39, 2);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY])(
    'ignores a non-finite announcement of %s',
    (next) => {
      render(<HeroAmount value={448.39} locale="fr-BE" testId="hero" />);

      act(() => annonce(next));
      advanceFrame(0);
      advanceFrame(1000);

      // A NaN reaching the hero would render « NaN € » on the one figure the
      // product is built around.
      expect(numeric()).toBeCloseTo(448.39, 2);
      expect(digits()).not.toContain('NaN');
    },
  );

  it('reads « Il te reste » from the couple, never the other member', () => {
    // The store carries two figures that are deliberately different numbers.
    // Wiring this component to the wrong one would still animate, still format
    // correctly, and be wrong by exactly the month's spending — the kind of
    // defect that looks like a working feature.
    render(<HeroAmount value={448.39} locale="fr-BE" testId="hero" />);
    act(() => announceOptimisticSpend({ ilTeReste: 429.89, depensesDuMois: 118.5 }));
    advanceFrame(0);
    advanceFrame(1000);
    expect(numeric()).toBeCloseTo(429.89, 2);
  });

  it('shows a negative optimistic figure — going under is a real outcome', () => {
    render(<HeroAmount value={20} locale="fr-BE" testId="hero" />);

    act(() => annonce(-25));
    advanceFrame(0);
    advanceFrame(1000);

    expect(digits()).toContain('25');
    expect(digits()).toMatch(/[-−]/);
  });
});

describe('HeroAmount — accessibility', () => {
  it('announces the settled value once, not the twelve frames in between', () => {
    render(<HeroAmount value={448.39} locale="fr-BE" testId="hero" />);
    const node = screen.getByTestId('hero');

    // The visible text is hidden from the a11y tree; `aria-label` carries the
    // target. Otherwise a screen reader would read every interpolated amount.
    expect(node).toHaveAttribute('aria-label', expect.stringContaining('448,39'));
    expect(node.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('is polite — the figure changes because the user acted', () => {
    render(<HeroAmount value={448.39} locale="fr-BE" testId="hero" />);
    expect(screen.getByTestId('hero')).toHaveAttribute('aria-live', 'polite');
  });

  it('labels the target, not the intermediate frame', () => {
    const { rerender } = render(<HeroAmount value={448.39} locale="fr-BE" testId="hero" />);
    rerender(<HeroAmount value={429.89} locale="fr-BE" testId="hero" />);
    advanceFrame(0);
    advanceFrame(100);

    expect(screen.getByTestId('hero').getAttribute('aria-label')).toContain('429,89');
  });
});
