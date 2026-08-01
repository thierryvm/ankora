'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Light/dark toggle, SSR-safe.
 *
 * Ported from the deleted `atoms/ThemeToggle.tsx` (ADR-034). Behaviour is
 * unchanged — only the styling moved from `atoms.css` to Tailwind utilities.
 *
 * SSR-safe pattern:
 * - initial theme comes from the `theme` cookie, read server-side by the
 *   consumer and passed as `initialTheme` (no hydration flash);
 * - nothing is written during render — the cookie and the
 *   `document.documentElement.dataset.theme` mutation happen in `useEffect`.
 *
 * Touch target: `md` is the canonical 44×44 (Apple HIG minimum, GH #153).
 * `sm` keeps a denser 36×36 for compact surfaces.
 */

export type Theme = 'light' | 'dark';

export interface ThemeToggleProps {
  readonly initialTheme?: Theme;
  readonly cookieKey?: string;
  readonly onChange?: (theme: Theme) => void;
  readonly className?: string;
  readonly size?: 'sm' | 'md';
}

const SIZE_CLASS: Readonly<Record<'sm' | 'md', string>> = {
  sm: 'size-9',
  md: 'size-11',
};

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

  return (
    <button
      type="button"
      className={cn(
        'bg-surface-soft text-foreground border-border inline-flex cursor-pointer items-center justify-center rounded-full border',
        'hover:bg-surface-muted transition-colors',
        'focus-visible:outline-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2',
        SIZE_CLASS[size],
        className,
      )}
      onClick={toggle}
      aria-pressed={isDark}
      aria-label={isDark ? 'Activer le thème clair' : 'Activer le thème sombre'}
      title={isDark ? 'Thème clair' : 'Thème sombre'}
    >
      {isDark ? (
        <svg
          data-testid="theme-icon-moon"
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
          data-testid="theme-icon-sun"
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
