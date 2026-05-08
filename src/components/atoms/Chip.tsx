import * as React from 'react';

export type ChipSize = 's' | 'm' | 'l';

export interface ChipProps {
  readonly color?: string;
  readonly label?: string;
  readonly emoji?: string;
  readonly icon?: React.ReactNode;
  readonly size?: ChipSize;
  readonly removable?: boolean;
  readonly onRemove?: () => void;
}

const PADDING_BY_SIZE: Record<ChipSize, string> = {
  s: '2px 8px',
  m: '4px 10px',
  l: '6px 12px',
};
const FONT_SIZE_BY_SIZE: Record<ChipSize, string> = {
  s: '11px',
  m: '12px',
  l: '13px',
};

export function Chip({
  color = '#94a3b8',
  label,
  emoji,
  icon,
  size = 'm',
  removable,
  onRemove,
}: ChipProps): React.JSX.Element {
  return (
    <span
      className="atm-chip"
      style={{
        padding: PADDING_BY_SIZE[size],
        fontSize: FONT_SIZE_BY_SIZE[size],
        background: `color-mix(in oklab, ${color} 14%, transparent)`,
        color,
        border: `1px solid color-mix(in oklab, ${color} 28%, transparent)`,
      }}
    >
      {emoji && <span aria-hidden="true">{emoji}</span>}
      {icon && (
        <span aria-hidden="true" className="atm-chip-icon">
          {icon}
        </span>
      )}
      {label && <span>{label}</span>}
      {removable && (
        <button type="button" className="atm-chip-x" aria-label="Retirer" onClick={onRemove}>
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
    </span>
  );
}
