'use client';

import * as React from 'react';

import { LOCALES_VISIBLE } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * Atom 11 — LangSwitcher
 * Headless dropdown listbox a11y (FR-BE / EN par défaut, v1.0 Belgique-first).
 *
 * Source: design_handoff_ankora_v1/atoms/11-LangSwitcher.jsx
 *
 * Headless / wiring next-intl en PR-B :
 * - PR-A : composant pur, `onChange(localeId)` exposé. Aucune dépendance
 *   `next-intl`/router. Le consumer décide quoi faire (typiquement
 *   `router.replace(...)` avec préfixe locale).
 * - PR-B : wiring sur `useRouter` + `usePathname` de `next-intl/navigation`.
 *
 * A11y :
 * - Trigger button : `aria-haspopup="listbox"`, `aria-expanded`,
 *   `aria-controls={listboxId}` quand ouvert.
 * - Listbox : `role="listbox"` ; chaque option `role="option"` +
 *   `aria-selected={current === id}`.
 * - ESC ferme + retour focus trigger.
 * - Mousedown OUTSIDE trigger+listbox ferme.
 * - useEffect ajoute/retire les listeners document avec cleanup explicite
 *   (anti-leak).
 *
 * v1.0 locales lockés : FR-BE + EN. NL/DE/ES post-launch
 * (cf. NORTH_STAR.md). Les consumers peuvent fournir un `locales` custom
 * si besoin de tests ou de futures préviews.
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
 * this richer atom switcher (which consumes the same IDs + metadata).
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

  const classes = cn('atm-lang-switcher', className);

  return (
    <div className={classes}>
      <button
        ref={triggerRef}
        type="button"
        className="atm-lang-switcher-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="atm-lang-switcher-flag" aria-hidden="true">
          {currentLocale?.flag ?? '🌐'}
        </span>
        <span className="atm-lang-switcher-code">{currentLocale?.code ?? current}</span>
      </button>
      {open && (
        <ul
          ref={listboxRef}
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          className="atm-lang-switcher-menu"
        >
          {locales.map((l) => {
            const isSelected = l.id === current;
            const optionClasses = `atm-lang-switcher-option${isSelected ? ' is-selected' : ''}`;
            return (
              <li key={l.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={optionClasses}
                  onClick={() => {
                    onChange(l.id);
                    setOpen(false);
                  }}
                >
                  <span className="atm-lang-switcher-flag" aria-hidden="true">
                    {l.flag}
                  </span>
                  <span className="atm-lang-switcher-label">{l.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
