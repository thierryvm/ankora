import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { PaceBar } from '../PaceBar';

/**
 * The pace bar, held to the two things it claims: an honest denominator, and a
 * tick that positions the month rather than a target the user invented.
 *
 * It replaced a progress bar measured against `reste_a_vivre_default` — a 500 €
 * constant nobody chose, which looked like a measurement and was a factory
 * setting. So the assertions below are mostly about the arithmetic being visible
 * in the geometry, and about the CSP construction that keeps it renderable in
 * production at all.
 */

const base = {
  budgetDuMois: 1000,
  depensesDuMois: 250,
  joursEcoules: 10,
  joursDuMois: 31,
  ariaLabel: 'répartition',
};

const spentWidth = () => Number(screen.getByTestId('pace-bar-spent').getAttribute('width'));
const tickX = () => Number(screen.getByTestId('pace-bar-tick').getAttribute('x'));

describe('PaceBar — geometry follows the figures', () => {
  it('fills in proportion to spending over the budget', () => {
    render(<PaceBar {...base} />);
    expect(spentWidth()).toBeCloseTo(25, 5);
  });

  it('places the tick at the elapsed fraction of the month', () => {
    render(<PaceBar {...base} />);
    expect(tickX()).toBeCloseTo((10 / 31) * 100, 5);
  });

  it('caps the fill at 100 % when the budget is blown', () => {
    render(<PaceBar {...base} depensesDuMois={1500} />);
    expect(spentWidth()).toBe(100);
  });

  it('keeps the tick inside the track on the last day of the month', () => {
    render(<PaceBar {...base} joursEcoules={31} />);
    // A tick at x=100 with width 0.8 would be drawn off the end and vanish.
    expect(tickX()).toBeLessThanOrEqual(99.2);
    expect(screen.getByTestId('pace-bar-tick')).toBeInTheDocument();
  });

  it('draws the tick AFTER the fill, so it stays readable against it', () => {
    render(<PaceBar {...base} depensesDuMois={900} />);
    const rects = Array.from(screen.getByTestId('pace-bar').querySelectorAll('rect'));
    // Reading the fill against the tick is the entire job; a tick painted
    // underneath a 90 %-full bar does not do it.
    expect(rects[rects.length - 1]).toBe(screen.getByTestId('pace-bar-tick'));
  });
});

describe('PaceBar — the three states, and no fourth', () => {
  it('is neutral when spending tracks the month', () => {
    // 25 % spent on day 10 of 31 (32 %) — slower than even.
    render(<PaceBar {...base} />);
    const bar = screen.getByTestId('pace-bar');
    expect(bar).toHaveAttribute('data-ahead-of-pace', 'false');
    expect(bar).toHaveAttribute('data-overspent', 'false');
    expect(screen.getByTestId('pace-bar-spent')).toHaveAttribute('fill', 'var(--color-brand-500)');
  });

  it('warns — not alarms — when spending outpaces the month', () => {
    // 60 % spent on day 10 of 31.
    render(<PaceBar {...base} depensesDuMois={600} />);
    expect(screen.getByTestId('pace-bar')).toHaveAttribute('data-ahead-of-pace', 'true');
    expect(screen.getByTestId('pace-bar-spent')).toHaveAttribute('fill', 'var(--color-warning)');
  });

  it('reserves danger for a budget actually exceeded', () => {
    // One level of alarm per screen: red belongs to the hero going negative.
    render(<PaceBar {...base} depensesDuMois={1200} />);
    expect(screen.getByTestId('pace-bar')).toHaveAttribute('data-overspent', 'true');
    expect(screen.getByTestId('pace-bar-spent')).toHaveAttribute('fill', 'var(--color-danger)');
  });
});

describe('PaceBar — degenerate inputs state the truth instead of guessing', () => {
  it.each([0, -250])('shows an empty track when the budget is %s', (budgetDuMois) => {
    // A full red bar would be a judgement. The hero above already carries the
    // negative figure; the bar has no honest proportion to show.
    render(<PaceBar {...base} budgetDuMois={budgetDuMois} />);
    expect(spentWidth()).toBe(0);
    expect(screen.getByTestId('pace-bar')).toHaveAttribute('data-overspent', 'false');
  });

  it('survives a zero-day month rather than dividing by it', () => {
    render(<PaceBar {...base} joursDuMois={0} />);
    expect(tickX()).toBe(0);
  });

  it('does not go negative on a nonsensical spend', () => {
    render(<PaceBar {...base} depensesDuMois={-100} />);
    expect(spentWidth()).toBe(0);
  });
});

describe('PaceBar — CSP and accessibility', () => {
  it('carries no inline style attribute anywhere', () => {
    // `style-src 'self' 'nonce-…'` with no 'unsafe-inline' drops style
    // attributes in production. Geometry travels through SVG attributes.
    const { container } = render(<PaceBar {...base} />);
    expect(container.querySelectorAll('[style]')).toHaveLength(0);
  });

  it('names itself for a screen reader — the bar is supplementary, not the source', () => {
    render(<PaceBar {...base} ariaLabel="250 € dépensés sur 1 000 €" />);
    expect(screen.getByRole('img', { name: '250 € dépensés sur 1 000 €' })).toBeInTheDocument();
  });
});
