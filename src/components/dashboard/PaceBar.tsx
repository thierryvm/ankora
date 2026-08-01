/**
 * The spending-pace bar of the hero (`DECISIONS-ANKORA.md` §3.3).
 *
 * ## What it replaced, and why that matters
 *
 * Until ADR-035 the hero carried a progress bar measured against
 * `reste_a_vivre_default` — a 500 € constant nobody chose. It looked like a
 * measurement and was a factory setting.
 *
 * This bar has an honest denominator (« Budget du mois », derived) and an honest
 * fill (« Dépensé ce mois », recorded). Its tick sits at
 * `joursEcoules / joursDuMois`: fill to the LEFT of the tick means the month is
 * being spent slower than evenly, to the RIGHT means faster. **It asks the user
 * for nothing** — that is precisely what makes it better than an envelope, and
 * it is the borrowed idea from Copilot's dashed pace line.
 *
 * ## Deliberately a linear pace (open question R1)
 *
 * Real spending is not linear — groceries land on Saturdays, a tank of fuel
 * early in the month. A pace smoothed over the user's last three months would
 * be more accurate and is impossible to explain in one line, and useless for the
 * first three months. `DECISIONS-ANKORA.md` R1 keeps the linear default; this
 * component is where that decision lives if it is ever revisited.
 *
 * ## CSP
 *
 * Geometry travels through SVG ATTRIBUTES (`x`, `width`, `fill`), never an
 * inline `style` — `style-src 'self' 'nonce-…'` carries no `'unsafe-inline'`, so
 * a style attribute is dropped in production. Same construction as
 * `AllocationBar` and `progress.tsx`.
 *
 * Presentational and stateless, so it renders on the server.
 */

const BAR_HEIGHT = 7;

export type PaceBarProps = {
  /** « Budget du mois » — the denominator. */
  budgetDuMois: number;
  /** « Dépensé ce mois » — the fill. */
  depensesDuMois: number;
  joursEcoules: number;
  joursDuMois: number;
  /** Full sentence describing the bar for screen readers. */
  ariaLabel: string;
};

export function PaceBar({
  budgetDuMois,
  depensesDuMois,
  joursEcoules,
  joursDuMois,
  ariaLabel,
}: PaceBarProps) {
  // A non-positive budget has no meaningful proportion to show. Rendering a
  // full red bar would be a judgement; rendering an empty track states the
  // truth, and the hero above already carries the negative figure.
  const hasScale = budgetDuMois > 0;
  const spentRatio = hasScale ? Math.min(1, Math.max(0, depensesDuMois / budgetDuMois)) : 0;
  const paceRatio = joursDuMois > 0 ? Math.min(1, Math.max(0, joursEcoules / joursDuMois)) : 0;

  const overspent = hasScale && depensesDuMois > budgetDuMois;
  const aheadOfPace = hasScale && spentRatio > paceRatio;

  // `--color-danger` only once the budget is actually exceeded — one level of
  // alarm per screen, and it belongs to the hero going negative. Outpacing the
  // month is a fact, not an alarm, so it gets `--color-warning`.
  const fill = overspent
    ? 'var(--color-danger)'
    : aheadOfPace
      ? 'var(--color-warning)'
      : 'var(--color-brand-500)';

  return (
    <div
      className="bg-surface-muted block w-full overflow-hidden rounded-full"
      data-testid="pace-bar"
      data-overspent={overspent ? 'true' : 'false'}
      data-ahead-of-pace={aheadOfPace ? 'true' : 'false'}
    >
      {/* Height as an SVG attribute rather than a Tailwind chain: on Safari iOS
          < 17.4 a child `height:100%` resolved against a parent height built
          from a CSS custom property can collapse to 0 and make the bar
          invisible (same note as AllocationBar). */}
      <svg
        viewBox={`0 0 100 ${BAR_HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={ariaLabel}
        height={BAR_HEIGHT}
        className="block w-full"
      >
        <rect
          x={0}
          y={0}
          width={spentRatio * 100}
          height={BAR_HEIGHT}
          fill={fill}
          data-testid="pace-bar-spent"
        />
        {/*
          The pace tick. Drawn LAST so it stays visible on top of the fill —
          which is the only position where it can do its job, since the whole
          point is reading the fill against it.

          `fill-opacity` as an attribute (not a class) so it survives the CSP,
          and 0.55 rather than the spec's 0.35: measured against
          --color-foreground on --color-brand-500 at 7px tall, 0.35 fell under
          the 3:1 of WCAG 1.4.11 for a graphical object.
        */}
        <rect
          x={Math.min(99.2, paceRatio * 100)}
          y={0}
          width={0.8}
          height={BAR_HEIGHT}
          fill="var(--color-foreground)"
          fillOpacity={0.55}
          data-testid="pace-bar-tick"
        />
      </svg>
    </div>
  );
}
