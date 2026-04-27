import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * Premium pattern (Apple / Linear feel) per cc-design `_shared/shell.css`:
 *   - Default rest: clean fill + subtle elevation shadow.
 *   - Hover: `translateY(-1px)` + magnetic shadow strengthens.
 *   - Active: `scale(0.98)` (press-down feel).
 *   - Focus-visible: soft brand-tinted ring (no browser default outline).
 *   - Disabled: opacity 0.5, all hover/focus effects suppressed.
 *
 * The motion is wrapped in `motion-safe:` so users with `prefers-reduced-motion`
 * still get a flat button (no translate / scale) — matches the global rule
 * declared in `globals.css` ~line 361.
 *
 * `link` is intentionally NOT enriched with translate/scale (no surface to
 * elevate); same rule applies to `icon` size which keeps the elevation but
 * skips the shadow (icon buttons sit on existing surfaces).
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-[transform,background-color,box-shadow,color] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-brand-700 text-white shadow-sm motion-safe:hover:-translate-y-px hover:bg-brand-600 hover:shadow-md motion-safe:active:scale-[0.98] active:shadow-sm',
        destructive:
          'bg-danger text-white shadow-sm motion-safe:hover:-translate-y-px hover:bg-danger/90 hover:shadow-md motion-safe:active:scale-[0.98]',
        outline:
          'border border-border bg-card text-foreground hover:border-brand-500 hover:text-brand-700 motion-safe:hover:-translate-y-px hover:shadow-sm motion-safe:active:scale-[0.98]',
        secondary:
          'bg-brand-100 text-brand-900 hover:bg-brand-200 motion-safe:hover:-translate-y-px hover:shadow-sm motion-safe:active:scale-[0.98]',
        ghost:
          'text-foreground hover:bg-brand-100 hover:text-brand-900 motion-safe:hover:-translate-y-px motion-safe:active:scale-[0.98]',
        link: 'text-brand-700 underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-12 rounded-lg px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
