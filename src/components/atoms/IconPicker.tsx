'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

import { ANKORA_ICON_LIB, type AnkoraIconDef, type AnkoraIconName } from './icons';

export interface IconPickerProps {
  readonly value: AnkoraIconName | undefined;
  readonly options?: readonly AnkoraIconDef[];
  readonly onChange: (name: AnkoraIconName) => void;
  readonly columns?: number;
  readonly maxHeight?: number;
  readonly className?: string;
  readonly ariaLabel?: string;
}

/**
 * Atom 08 — IconPicker
 *
 * Radiogroup grille de tiles avec icônes Lucide (Ankora curated registry).
 * Pas de free input — on reste sur un set curé pour cohérence design system.
 * Roving tabIndex (active = 0, inactive = -1).
 *
 * Le `value=undefined` est valide à l'init (pas de sélection par défaut) :
 * dans ce cas aucune tile n'est `aria-checked` et `tabIndex=-1` partout.
 */
export function IconPicker({
  value,
  options = ANKORA_ICON_LIB,
  onChange,
  columns = 6,
  maxHeight,
  className,
  ariaLabel = 'Choisir une icône',
}: IconPickerProps): React.JSX.Element {
  const classes = cn('atm-ipick', className);

  const style: React.CSSProperties = {
    gridTemplateColumns: `repeat(${columns}, 1fr)`,
  };
  if (maxHeight !== undefined) {
    style.maxHeight = maxHeight;
    style.overflowY = 'auto';
  }

  return (
    <div className={classes} role="radiogroup" aria-label={ariaLabel} style={style}>
      {options.map((def) => {
        const isActive = def.name === value;
        const tileClass = 'atm-ipick-tile' + (isActive ? ' is-active' : '');
        const { Component } = def;
        return (
          <button
            key={def.name}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={def.label}
            title={def.label}
            tabIndex={isActive ? 0 : -1}
            onClick={() => {
              onChange(def.name);
            }}
            className={tileClass}
          >
            <Component size={18} />
          </button>
        );
      })}
    </div>
  );
}
