'use client';

/* ============================================================================
   Atom 09 — Tabs (CD#3, PR-D4-PHASE2-A Task 11/18)

   Pattern extrait de 3 implémentations inline du handoff:
   - design_handoff_ankora_v1/surfaces/admin/AdminPanelV1.jsx:21-31
     (admin section tabs, variant pill)
   - design_handoff_ankora_v1/surfaces/admin/AdminTopbar.jsx:31-38
     (period selector compact, variant pill / size sm)
   - design_handoff_ankora_v1/surfaces/onboarding/step2.jsx:10-30
     (Voies A/B/C onboarding, variant underline)

   Spec ADDENDUM F:
     props: tabs[], activeId, onChange, variant: 'pill'|'underline',
            size: 'sm'|'md', ariaLabel?, className?
     a11y : role="tablist" sur root, role="tab" sur chaque bouton,
            aria-selected, roving tabIndex, ArrowLeft/Right (cyclique),
            Home/End, skip disabled.
   ============================================================================ */

import * as React from 'react';

export type TabsVariant = 'pill' | 'underline';
export type TabsSize = 'sm' | 'md';

export interface TabItem {
  readonly id: string;
  readonly label: string;
  readonly badge?: string | number;
  readonly disabled?: boolean;
}

export interface TabsProps {
  readonly tabs: readonly TabItem[];
  readonly activeId: string;
  readonly onChange: (id: string) => void;
  readonly variant?: TabsVariant;
  readonly size?: TabsSize;
  readonly ariaLabel?: string;
  readonly className?: string;
}

export function Tabs({
  tabs,
  activeId,
  onChange,
  variant = 'pill',
  size = 'md',
  ariaLabel,
  className,
}: TabsProps): React.JSX.Element {
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const currentIdx = tabs.findIndex((t) => t.id === activeId);
    if (currentIdx < 0) return;

    let nextIdx = currentIdx;
    switch (e.key) {
      case 'ArrowLeft':
        nextIdx = (currentIdx - 1 + tabs.length) % tabs.length;
        break;
      case 'ArrowRight':
        nextIdx = (currentIdx + 1) % tabs.length;
        break;
      case 'Home':
        nextIdx = 0;
        break;
      case 'End':
        nextIdx = tabs.length - 1;
        break;
      default:
        return;
    }

    // Skip disabled tabs by advancing forward in the list.
    let safety = tabs.length;
    while (tabs[nextIdx]?.disabled && nextIdx !== currentIdx && safety > 0) {
      nextIdx = (nextIdx + 1) % tabs.length;
      safety--;
    }

    e.preventDefault();
    const next = tabs[nextIdx];
    if (next && !next.disabled && next.id !== activeId) {
      onChange(next.id);
    }
  };

  const rootClasses = ['atm-tabs', `atm-tabs--${variant}`, `atm-tabs--${size}`, className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <div role="tablist" aria-label={ariaLabel} className={rootClasses} onKeyDown={onKeyDown}>
      {tabs.map((t) => {
        const isActive = t.id === activeId;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-disabled={t.disabled || undefined}
            tabIndex={isActive ? 0 : -1}
            disabled={t.disabled}
            className={['atm-tabs-tab', isActive ? 'is-active' : ''].filter(Boolean).join(' ')}
            onClick={() => {
              if (!t.disabled && t.id !== activeId) onChange(t.id);
            }}
          >
            <span className="atm-tabs-label">{t.label}</span>
            {t.badge !== undefined && <span className="atm-tabs-badge">{t.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}
