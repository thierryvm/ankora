/**
 * AllocationBar — barre d'allocation fine du Hero « Situation du mois » (Phase 0).
 *
 * CSP-safe par construction : la géométrie passe par des ATTRIBUTS SVG
 * (`x`, `width`, `fill`), jamais par un `style={{…}}` inline (bloqué par la CSP
 * stricte `style-src 'self' 'nonce-…'`, cf. THI-322 + SimulatorProjection.tsx).
 *
 * Présentationnel pur (zéro état, zéro hydration) — Server Component compatible.
 * Supplémentaire : la même répartition est donnée en texte par le flow vertical
 * du Hero, donc la barre est une ancre visuelle (WCAG 1.4.11 graphique ≥ 3:1),
 * pas la seule source d'info.
 */

export type AllocationSegment = Readonly<{
  /** Clé stable (sert aussi au data-testid). */
  key: string;
  /** Portion du tout, 0..1 (le caller normalise sur les revenus). */
  ratio: number;
  /** Couleur de remplissage — token sémantique via var(), ex `var(--color-info)`. */
  fill: string;
}>;

type Props = {
  segments: readonly AllocationSegment[];
  /** Description accessible de la répartition complète (role=img). */
  ariaLabel: string;
};

type Rect = Readonly<{ key: string; x: number; width: number; fill: string }>;

export function AllocationBar({ segments, ariaLabel }: Props) {
  // Cumulative layout without mutating a render-captured variable
  // (react-hooks/immutability). `used` is the width consumed so far; each
  // segment is clamped so the running total never exceeds 100. n ≤ 4.
  const { rects } = segments.reduce<{ rects: readonly Rect[]; used: number }>(
    (acc, s) => {
      const width = Math.max(0, Math.min(100 - acc.used, s.ratio * 100));
      return {
        rects: [...acc.rects, { key: s.key, x: acc.used, width, fill: s.fill }],
        used: acc.used + width,
      };
    },
    { rects: [], used: 0 },
  );

  return (
    <div
      className="bg-surface-muted h-1.5 w-full overflow-hidden rounded-full"
      data-testid="allocation-bar"
    >
      <svg
        viewBox="0 0 100 6"
        preserveAspectRatio="none"
        role="img"
        aria-label={ariaLabel}
        className="block h-full w-full"
      >
        {rects.map((r) => (
          <rect
            key={r.key}
            x={r.x}
            y={0}
            width={r.width}
            height={6}
            fill={r.fill}
            data-testid={`allocation-segment-${r.key}`}
          />
        ))}
      </svg>
    </div>
  );
}
