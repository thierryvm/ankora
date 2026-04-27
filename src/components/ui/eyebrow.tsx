import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Eyebrow — section-title overline.
 *
 * Wraps the `.eyebrow` class (`globals.css` ~line 302): 11px / 600 / uppercase /
 * tracking-micro / `--color-foreground`. Mirrors the cc-design `_shared/shell.css`
 * + `colors_and_type.css` definitions so JSX can compose section preheaders
 * without re-typing five class names.
 *
 * Tone:
 *   - `default` → `--color-foreground` (the cc-design default, AAA on navy)
 *   - `accent`  → `--color-brand-text-strong` (teal-300 dark / teal-800 light)
 *
 * The accent variant uses the dedicated `.eyebrow-accent` modifier in globals.css
 * so the `[data-accent="admin"]` flip remaps it to laiton automatically.
 */

export type EyebrowTone = 'default' | 'accent';

export type EyebrowProps = React.HTMLAttributes<HTMLParagraphElement> & {
  /** Visual tone. Defaults to 'default' (foreground colour). */
  tone?: EyebrowTone;
};

export const Eyebrow = React.forwardRef<HTMLParagraphElement, EyebrowProps>(
  ({ className, tone = 'default', children, ...props }, ref) => (
    <p
      ref={ref}
      className={cn('eyebrow', tone === 'accent' && 'eyebrow-accent', className)}
      {...props}
    >
      {children}
    </p>
  ),
);
Eyebrow.displayName = 'Eyebrow';
