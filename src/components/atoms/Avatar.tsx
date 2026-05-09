/**
 * Atom 06 — Avatar / Icon tile
 *
 * Source: design_handoff_ankora_v1/atoms/06-Avatar.jsx (Claude Design Session #3)
 *
 * Tile carrée (radius-md) ou ronde (50%), avec emoji, icône SVG ou initiales.
 * Couleur teintée via color-mix sur la prop `color` (hex). Tailles xs(20)/sm(28)/
 * md(36)/lg(44)/xl(56). Server Component compatible (purement présentationnel).
 *
 * Priorité de contenu: emoji > icon > initials.
 * Accessibilité: role="img" + aria-label seulement si `label` fourni
 * (purement décoratif sinon — laissé au parent de gérer la sémantique).
 */

import * as React from 'react';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type AvatarShape = 'circle' | 'rounded';

export interface AvatarProps {
  readonly emoji?: string;
  readonly icon?: React.ReactNode;
  readonly initials?: string;
  readonly label?: string;
  readonly color?: string;
  readonly size?: AvatarSize;
  readonly shape?: AvatarShape;
}

const PX_BY_SIZE: Readonly<Record<AvatarSize, number>> = {
  xs: 20,
  sm: 28,
  md: 36,
  lg: 44,
  xl: 56,
};

export function Avatar({
  emoji,
  icon,
  initials,
  label,
  color = '#94a3b8',
  size = 'md',
  shape = 'rounded',
}: AvatarProps): React.JSX.Element {
  const px = PX_BY_SIZE[size];
  const fs = Math.round(px * 0.5);
  const radius = shape === 'circle' ? '50%' : 'var(--radius-md)';

  return (
    <span
      className="atm-avatar"
      role={label ? 'img' : undefined}
      aria-label={label}
      style={{
        width: px,
        height: px,
        borderRadius: radius,
        background: `color-mix(in oklab, ${color} 16%, transparent)`,
        color,
        border: `1px solid color-mix(in oklab, ${color} 28%, transparent)`,
        fontSize: fs,
      }}
    >
      {emoji ? (
        <span aria-hidden="true">{emoji}</span>
      ) : icon ? (
        icon
      ) : initials ? (
        <span className="atm-avatar-init" style={{ fontSize: Math.round(px * 0.4) }}>
          {initials}
        </span>
      ) : null}
    </span>
  );
}
