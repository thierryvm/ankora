import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-(--color-brand-600) focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-(--color-brand-700) text-white shadow-sm hover:bg-(--color-brand-800)',
        destructive: 'bg-(--color-danger) text-white shadow-sm hover:bg-(--color-danger)/90',
        outline:
          'border border-(--color-border) bg-(--color-card) text-(--color-foreground) hover:border-(--color-brand-500) hover:text-(--color-brand-700)',
        secondary: 'bg-(--color-brand-100) text-(--color-brand-900) hover:bg-(--color-brand-200)',
        ghost:
          'text-(--color-foreground) hover:bg-(--color-brand-100) hover:text-(--color-brand-900)',
        link: 'text-(--color-brand-700) underline-offset-4 hover:underline',
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
