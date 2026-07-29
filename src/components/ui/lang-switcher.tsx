'use client';

import * as React from 'react';

import { LOCALES_VISIBLE } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * Headless locale dropdown (a11y listbox).
 *
 * Ported from the deleted `atoms/LangSwitcher.tsx` (ADR-034). Behaviour is
 * unchanged — only the styling moved from `atoms.css` to Tailwind utilities.
 * The decorative pop-in keyframe of the original was not carried over.
 *
 * A11y contract:
 * - trigger: `aria-haspopup="listbox"`, `aria-expanded`, `aria-controls` when open;
 * - menu: `role="listbox"`, each option `role="option"` + `aria-selected`;
 * - `Escape` closes and returns focus to the trigger;
 * - mousedown outside trigger+listbox closes;
 * - listeners are added/removed with an explicit cleanup (anti-leak).
 *
 * The component is fully controlled: `current` drives the visible flag/label,
 * the consumer owns what `onChange` does (typically a locale-aware router
 * replace).
 */

export interface LangSwitcherLocale {
  readonly id: string;
  readonly code: string;
  readonly flag: string;
  readonly label: string;
}

export interface LangSwitcherProps {
  readonly current: string;
  readonly locales?: readonly LangSwitcherLocale[];
  readonly onChange: (localeId: string) => void;
  readonly className?: string;
  readonly ariaLabel?: string;
}

/**
 * Per-locale display metadata (short code, flag emoji, native label).
 *
 * Keyed by `LOCALES_VISIBLE` so TypeScript enforces metadata coverage: adding
 * a new locale to `LOCALES_VISIBLE` in `src/i18n/routing.ts` will fail
 * compilation here until its flag/label entry is added — the doctrine cannot
 * drift between the plain header `<select>` (which consumes the ID list) and
 * this richer switcher (which consumes the same IDs + metadata).
 */
const LOCALE_DISPLAY_METADATA: Record<
  (typeof LOCALES_VISIBLE)[number],
  Omit<LangSwitcherLocale, 'id'>
> = {
  'fr-BE': { code: 'FR', flag: '🇧🇪', label: 'Français (Belgique)' },
  en: { code: 'EN', flag: '🇬🇧', label: 'English' },
};

export const ANKORA_V1_LOCALES: readonly LangSwitcherLocale[] = LOCALES_VISIBLE.map((id) => ({
  id,
  ...LOCALE_DISPLAY_METADATA[id],
}));

export function LangSwitcher({
  current,
  locales = ANKORA_V1_LOCALES,
  onChange,
  className,
  ariaLabel = 'Changer de langue',
}: LangSwitcherProps): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const listboxRef = React.useRef<HTMLUListElement | null>(null);
  const listboxId = React.useId();

  const close = React.useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    const onMouseDown = (e: MouseEvent): void => {
      const t = e.target as Node | null;
      if (!t) return;
      if (triggerRef.current?.contains(t)) return;
      if (listboxRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [open, close]);

  const currentLocale = locales.find((l) => l.id === current);

  return (
    <div className={cn('relative inline-block', className)}>
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          'bg-surface-soft text-foreground border-border inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1',
          'text-xs font-medium',
          'hover:bg-surface-muted transition-colors',
          'focus-visible:outline-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2',
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-sm leading-none" aria-hidden="true">
          {currentLocale?.flag ?? '🌐'}
        </span>
        <span>{currentLocale?.code ?? current}</span>
      </button>
      {open && (
        <ul
          ref={listboxRef}
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          className="bg-card border-border absolute top-full right-0 z-30 mt-1 min-w-[180px] list-none rounded-md border p-1 shadow-md"
        >
          {locales.map((l) => {
            const isSelected = l.id === current;
            return (
              <li key={l.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={cn(
                    'text-foreground flex w-full cursor-pointer items-center gap-2 rounded-sm border-0 bg-transparent px-2 py-1.5 text-left text-sm',
                    'hover:bg-surface-soft transition-colors',
                    'focus-visible:outline-brand-600 focus-visible:outline-2 focus-visible:-outline-offset-2',
                    isSelected && 'bg-brand-surface text-brand-text',
                  )}
                  onClick={() => {
                    onChange(l.id);
                    setOpen(false);
                  }}
                >
                  <span className="text-sm leading-none" aria-hidden="true">
                    {l.flag}
                  </span>
                  <span>{l.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
