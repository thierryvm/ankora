'use client';

import * as React from 'react';

/**
 * Atom 10 — ThemeToggle
 * Bouton SSR-safe pour basculer light/dark.
 *
 * Source: design_handoff_ankora_v1/atoms/10-ThemeToggle.jsx
 *
 * SSR-safe pattern :
 * - `'use client'` (utilise useState + useEffect pour DOM/cookie writes)
 * - Theme initial fourni via prop `initialTheme` (PR-B branchera la lecture
 *   cookie SSR via AppShell) — default `light` quand non fourni.
 * - Au toggle : écrit `document.cookie` (max-age 1 an, SameSite=Lax, path=/)
 *   et applique `document.documentElement.dataset.theme`. Aucune écriture
 *   au render — uniquement dans `useEffect` après vérification
 *   `typeof document !== 'undefined'`.
 * - Pas d'accès `localStorage` au render time (PR-B câble cookie SSR ; pas
 *   besoin de localStorage côté client pour la PR atomique).
 *
 * A11y :
 * - `aria-pressed` reflète l'état (true = dark, false = light)
 * - `aria-label` dynamique selon le thème courant
 * - SVG inline avec `aria-hidden="true"` (icône décorative)
 */

export type Theme = 'light' | 'dark';

export interface ThemeToggleProps {
  readonly initialTheme?: Theme;
  readonly cookieKey?: string;
  readonly onChange?: (theme: Theme) => void;
  readonly className?: string;
  readonly size?: 'sm' | 'md';
}

export function ThemeToggle({
  initialTheme = 'light',
  cookieKey = 'theme',
  onChange,
  className,
  size = 'md',
}: ThemeToggleProps): React.JSX.Element {
  const [theme, setTheme] = React.useState<Theme>(initialTheme);

  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.theme = theme;
    document.cookie = `${cookieKey}=${theme}; max-age=31536000; path=/; SameSite=Lax`;
  }, [theme, cookieKey]);

  const isDark = theme === 'dark';
  const toggle = React.useCallback(() => {
    const next: Theme = isDark ? 'light' : 'dark';
    setTheme(next);
    onChange?.(next);
  }, [isDark, onChange]);

  const classes = ['atm-theme-toggle', `atm-theme-toggle--${size}`, className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={classes}
      onClick={toggle}
      aria-pressed={isDark}
      aria-label={isDark ? 'Activer le thème clair' : 'Activer le thème sombre'}
      title={isDark ? 'Thème clair' : 'Thème sombre'}
    >
      {isDark ? (
        <svg
          data-testid="atm-theme-icon-moon"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        <svg
          data-testid="atm-theme-icon-sun"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="M4.93 4.93l1.41 1.41" />
          <path d="M17.66 17.66l1.41 1.41" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="M4.93 19.07l1.41-1.41" />
          <path d="M17.66 6.34l1.41-1.41" />
        </svg>
      )}
    </button>
  );
}
