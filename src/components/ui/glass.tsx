import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Glass surface — Liquid Glass primitive (multi-layer).
 *
 * Wraps the `.glass` class defined in `src/app/globals.css` (lines ~225-244)
 * which combines `color-mix` background, backdrop blur, inset edge highlights,
 * and an opaque fallback under `prefers-reduced-transparency`.
 *
 * The class is intentionally non-restylable per the design system charter
 * (cf. SKILL.md §6 — single-layer backdrop-filter is rejected). This component
 * exists so JSX can compose Glass surfaces without re-typing the className
 * across landing/onboarding/cockpit kits.
 */

export type GlassPadding = 'none' | 'sm' | 'md' | 'lg';

const PADDING_MAP: Readonly<Record<GlassPadding, string>> = {
  none: '',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-8',
};

export type GlassProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Internal padding shorthand. Defaults to 'md' (20px). */
  padding?: GlassPadding;
};

export const Glass = React.forwardRef<HTMLDivElement, GlassProps>(
  ({ className, padding = 'md', ...props }, ref) => (
    <div ref={ref} className={cn('glass rounded-xl', PADDING_MAP[padding], className)} {...props} />
  ),
);
Glass.displayName = 'Glass';
